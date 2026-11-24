const { randomUUID } = require('node:crypto');
const { runSQLQueryAccess, runSQLQuerySqlServer } = require('../db/access');
const { appTableDisplayName } = require('../db/app-tables');
const { loadPackagingTypes } = require('../db/packaging-types');
const config = require('../config');
const { createHttpError } = require('../utils');
const { loadOfferContacts } = require('../options/customer-offers');
const { singleEmail } = require('../options/offer-documents');
const { H, P, headerFields, positionFields, insert } = require('./storage');
const { incotermCode } = require('../incoterm');

const text = value => String(value ?? '').trim();
const key = value => text(value).toUpperCase();

function offerMailSender(identity) {
  const senderEmail = singleEmail(identity?.email);
  const senderName = text(identity?.fullName);
  const senderCode = text(identity?.shortCode);
  if (!senderEmail || !senderName || senderName.length > 200 || !senderCode || senderCode.length > 3) {
    throw createHttpError(422, 'Für Ihren Vertrieb fehlen gültige Absenderdaten.', { code: 'OFFER_MAIL_INVALID_SENDER' });
  }
  return { senderEmail, senderName, senderCode };
}

async function manualOfferMail(req, offer, language) {
  const contacts = await loadOfferContacts(req.database, [offer.customerId]);
  const contact = contacts.find(row => Number(row.id) === Number(offer.contactId) && key(row.customerId) === key(offer.customerId));
  const recipientEmail = singleEmail(contact?.email);
  if (!recipientEmail || contact.name.length > 200) {
    throw createHttpError(422, 'Bitte einen Ansprechpartner mit gültiger Mailadresse im Angebot auswählen.', {
      code: 'OFFER_MAIL_RECIPIENT_REQUIRED',
    });
  }
  return {
    kind: 'app', messageKey: randomUUID(), companyId: Number(req.database.firmaId),
    customerId: offer.customerId, customerName: offer.customerName,
    contactId: contact.id, contactName: contact.name, recipientEmail,
    contactSalutation: contact.salutation, contactLastName: contact.lastName,
    language: ['de', 'en'].includes(contact.language) ? contact.language : language,
    incotermId: offer.deliveryTermsId, incotermText: offer.deliveryTerms,
    incotermCode: incotermCode(offer.deliveryTerms), ...offerMailSender(req.userIdentity),
  };
}

async function loadGeneratedOfferHeaders(database, offers) {
  const stockOrderPosition = offers[0].stockOrderPosition;
  const [customers, packagingTypes, stockPackaging] = await Promise.all([
    runSQLQueryAccess(database, `
      SELECT kd_KdNR AS id, kd_Strasse AS street, kd_PLZ AS postalCode,
        kd_Ort AS city, kd_LK AS country, kd_Zahltext AS paymentId
      FROM dbo.tblKunden WHERE kd_KdNR IN (SELECT [value] FROM OPENJSON(?))
    `, [JSON.stringify(offers.map(offer => offer.customerId))]),
    loadPackagingTypes(),
    stockOrderPosition ? runSQLQueryAccess(database, `
      SELECT b.be_Verpackung AS packaging FROM dbo.tblBest_Position p
      JOIN dbo.tblBestellung b ON b.be_Bestellindex=p.beP_BestellIndex
      WHERE p.beP_BEposID=?
    `, [stockOrderPosition]) : [],
  ]);
  const packaging = packagingTypes.find(type => type.id === Number(offers[0].packagingId)
    || (stockPackaging[0]?.packaging && type.aliases.some(alias => key(alias) === key(stockPackaging[0].packaging))));
  const byId = new Map(customers.map(customer => [key(customer.id), customer]));
  const payments = await runSQLQuerySqlServer(config.sql.database, `
    SELECT zaS_ID AS id, LOWER(zaS_SprachID) AS language, zaS_Zahl_Text AS text
    FROM dbo.tblZahltext_Sprachen
    WHERE zaS_ID IN (SELECT [value] FROM OPENJSON(?)) AND zaS_SprachID IN (N'de',N'en')
  `, [JSON.stringify([...new Set(customers.map(customer => Number(customer.paymentId)).filter(id => id > 0))])]);
  const paymentTexts = new Map(payments.map(payment => [`${payment.id}:${payment.language}`, text(payment.text)]));
  return new Map(offers.map(offer => {
    const customer = byId.get(key(offer.customerId));
    if (!customer) {
      throw createHttpError(422, 'Mindestens ein Kunde ist im Zielmandanten nicht vorhanden.', { code: 'OFFER_CUSTOMER_NOT_FOUND' });
    }
    const paymentId = Number(customer.paymentId) || null;
    const pickup = offer.incotermCode === 'FCA' ? offer.pickup : '';
    return [offer.customerId, {
      customerId: offer.customerId,
      customerName: text(offer.customerName).slice(0, 255),
      customerAddress: [customer.street, [customer.postalCode, customer.city].map(text).filter(Boolean).join(' '), customer.country]
        .map(text).filter(Boolean).join('\n'),
      contactId: offer.contactId, contact: offer.contactName.slice(0, 50),
      paymentId, paymentText: paymentTexts.get(`${paymentId}:${offer.language}`) ?? paymentTexts.get(`${paymentId}:de`) ?? null,
      specialPaymentCondition: false,
      deliveryTermsId: offer.incotermId, deliveryTerms: offer.incotermText,
      packagingId: packaging?.id ?? null, packaging: packaging?.text ?? null,
      deliveryAddress: pickup || null, deliveryAddressManual: Boolean(pickup),
    }];
  }));
}

async function createGeneratedTempOffer(query, offer, header) {
  const result = await insert(query, H, headerFields, header, {
    tag_company_id: offer.companyId, tag_created_by: offer.senderCode, tag_modified_by: offer.senderCode,
    tag_client_request_id: offer.messageKey, tag_status: 1, tag_released_at: new Date().toISOString(),
    tag_language: offer.language, tag_currency: 'EUR', tag_valid_until: offer.validUntil || null,
  });
  const id = result.rows[0].tag_id;
  const optionPositionId = offer.stockPositionKey ? null : Number(offer.positionId) || null;
  const sourceSchema = optionPositionId ? (await query(`
    SELECT CASE WHEN COL_LENGTH(?, 'tagp_option_position_id') IS NOT NULL THEN 1 ELSE 0 END AS ready
  `, [appTableDisplayName('tempOfferPosition')])).rows[0] : null;
  await insert(query, P, positionFields, {
    lineNo: 1, lineKey: randomUUID(), articleIndex: offer.articleIndex, article: offer.article.slice(0, 75),
    masterArticle: offer.article.slice(0, 75), quantity: offer.quantityKg, unit: 'KG', price: offer.salePrice,
    priceBasis: 1000, costPrice: offer.costPrice || 0, wpzOriginal: true, wpzComment: 'Original verwenden', reserve: false,
  }, {
    tagp_offer_id: id, tagp_description: offer.batch ? `Charge ${offer.batch}` : null,
    ...(Number(sourceSchema?.ready) === 1 ? { tagp_option_position_id: optionPositionId } : {}),
  });
  return id;
}

module.exports = { offerMailSender, manualOfferMail, loadGeneratedOfferHeaders, createGeneratedTempOffer };
