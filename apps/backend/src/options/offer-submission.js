const { randomUUID } = require('node:crypto');
const { runSQLQueryAccess } = require('../db/access');
const { createHttpError } = require('../utils');
const { incotermCode } = require('../incoterm');
const { loadOptionOfferCustomers, loadOfferContacts } = require('./customer-offers');
const { singleEmail } = require('./offer-documents');

const text = value => String(value ?? '').trim();
const customerKey = value => text(value).toUpperCase();
const invalid = (message, code = 'OPTION_OFFER_INVALID') => createHttpError(422, message, { code });

function decimal(value, places) {
  if (!['string', 'number'].includes(typeof value) || !text(value)) return null;
  const number = Number(value);
  const factor = 10 ** places;
  const rounded = Math.round(number * factor);
  return Number.isSafeInteger(rounded) && Math.abs(number * factor - rounded) < 0.00001 ? rounded / factor : null;
}

function buildOfferSubmissions(req, option, position) {
  return buildCustomerOfferSubmissions(req, {
    ...position, validUntil: position.validUntil || option.validUntil,
  }, () => loadOptionOfferCustomers(req.database, req.userIdentity, option, position, req.query?.articleIndex));
}

async function buildCustomerOfferSubmissions(req, position, loadAudience) {
  const rows = req.body?.customers;
  if (!Array.isArray(rows) || !rows.length || rows.length > 500
    || rows.some(row => !row || !text(row.customerId) || text(row.customerId).length > 10)) {
    throw invalid('Bitte gültige Kunden für das Angebot auswählen.');
  }
  const customerIds = rows.map(row => customerKey(row.customerId));
  if (new Set(customerIds).size !== rows.length) throw invalid('Ein Kunde ist mehrfach ausgewählt.');
  const sender = req.userIdentity;
  const senderEmail = singleEmail(sender?.email);
  const senderName = text(sender?.fullName);
  const senderCode = text(sender?.shortCode);
  if (!senderEmail || !senderName || senderName.length > 200 || !senderCode || senderCode.length > 3) {
    throw invalid('Für Ihren Außendienst-Zugang fehlen gültige Absenderdaten.');
  }
  const eligible = await loadAudience();
  const buyers = new Map(eligible.customers.map(customer => [customerKey(customer.id), customer]));
  if (!eligible.article || customerIds.some(id => !buyers.has(id))) {
    throw invalid('Mindestens ein Kunde ist für dieses Angebot nicht verfügbar.', 'OPTION_OFFER_CUSTOMER_UNAVAILABLE');
  }
  const termIds = rows.map(row => Number(row.incotermId));
  if (termIds.some(id => !Number.isInteger(id) || id < 1 || id > 2147483647)) throw invalid('Bitte einen Incoterm auswählen.');
  const [contacts, terms] = await Promise.all([
    loadOfferContacts(req.database, customerIds.map(id => buyers.get(id).id)),
    runSQLQueryAccess(req.database, `
      SELECT lib_ID AS id, lib_Lieferbedingung AS text FROM dbo.tblLieferbedingungen
      WHERE lib_ID IN (SELECT id FROM OPENJSON(?) WITH (id INT '$'))
    `, [JSON.stringify([...new Set(termIds)])]),
  ]);
  const contactsById = new Map(contacts.map(contact => [`${customerKey(contact.customerId)}:${contact.id}`, contact]));
  const termsById = new Map(terms.map(term => [Number(term.id), text(term.text)]));
  const availableQuantityKg = position.remainingKg;
  return rows.map((row, index) => {
    const customer = buyers.get(customerIds[index]);
    const incotermId = termIds[index];
    const incotermText = termsById.get(incotermId);
    const code = incotermCode(incotermText);
    const pickup = code === 'FCA' ? text(row.pickup) : '';
    const quantityKg = decimal(row.quantityKg, 3);
    const salePrice = decimal(row.salePrice, 4);
    const contact = contactsById.get(`${customerIds[index]}:${Number(row.contactId)}`);
    const recipientEmail = singleEmail(contact?.email);
    if (customer.sent || customer.queued) throw invalid(`Für ${customer.name} besteht bereits ein Versandvorgang.`);
    if (!contact || contact.name.length > 200 || !recipientEmail) {
      throw invalid(`Bitte für ${customer.name} einen Ansprechpartner mit Mailadresse auswählen.`);
    }
    if (!code || (code === 'FCA' && (!pickup || pickup.length > 1000))) throw invalid(`Bitte Incoterm und bei FCA den Abholort für ${customer.name} prüfen.`);
    if (quantityKg === null || quantityKg <= 0 || (availableQuantityKg != null && quantityKg > availableQuantityKg)) {
      throw invalid(`Bitte die Angebotsmenge für ${customer.name} prüfen.`);
    }
    if (salePrice === null || salePrice < 0) throw invalid(`Bitte den Verkaufspreis für ${customer.name} eingeben.`);
    return {
      messageKey: randomUUID(), companyId: Number(req.database.firmaId), positionId: position.id, ...(position.stockPositionKey && {
        stockPositionKey: position.stockPositionKey,
        stockOrderPosition: position.stockOrderPosition,
        stockStorageId: position.stockStorageId,
      }),
      articleIndex: eligible.article.index, article: eligible.article.name, batch: text(position.batchNo),
      validUntil: position.validUntil, availableQuantityKg, quantityKg, salePrice, currency: 'EUR', nonBinding: true,
      packagingId: Number(position.packagingTypeId) || null,
      costPrice: position.priceNeedsReview || (position.currency && position.currency !== 'EUR') ? null : decimal(position.pricePerTonne, 4),
      incotermId, incotermText, incotermCode: code, pickup,
      customerId: customer.id, customerName: customer.name, contactId: contact.id, contactName: contact.name, recipientEmail,
      language: contact.language === 'de' || contact.language === 'en' ? contact.language : (req.get('x-lang') === 'en' ? 'en' : 'de'),
      senderCode, senderName, senderEmail,
    };
  });
}

module.exports = { buildOfferSubmissions, buildCustomerOfferSubmissions };
