const { MailServiceClient } = require('@filehouse/mailservice-client');
const config = require('../config');
const logger = require('../logger');
const { runSQLQuerySqlServer, withSqlTransaction } = require('./access');
const { berlinDate } = require('../options/read');
const { readTempOfferDocument, assembleOfferMail, singleEmail } = require('../options/offer-documents');
const { loadGeneratedOfferHeaders, createGeneratedTempOffer } = require('../offers/erp-mail');
const { H, P, positionFields, select } = require('../offers/storage');
const { getUserIdentityByShortCode } = require('./users');
const { createHttpError } = require('../utils');

const outbox = 'BMSApp.OptionOfferMailOutbox';
const documents = 'BMSApp.OptionOfferDocument';
const run = (query, params) => runSQLQuerySqlServer(config.sql.database, query, params);

function optionOfferMailEnabled() {
  return Boolean(config.optionOfferMail.enabled && config.mailService.enabled && config.mailService.baseAddress && config.mailService.apiKey);
}

const readySql = `
  SELECT CASE WHEN COL_LENGTH(N'BMSApp.OptionOfferMailOutbox', N'TempOfferId') IS NOT NULL
    AND COL_LENGTH(N'BMSApp.OptionOfferMailOutbox', N'StockPositionKey') IS NOT NULL
    AND COL_LENGTH(?, N'tag_offer_pdf') IS NOT NULL
    AND OBJECT_ID(N'BMSApp.OptionOfferDocument', N'U') IS NOT NULL THEN 1 ELSE 0 END AS ready
`;
const readyParams = [H];

async function offerMailSchemaReady() {
  const [row] = await run(readySql, readyParams);
  return Number(row?.ready) === 1;
}

async function requireOfferMailSchema(query) {
  if (Number((await query(readySql, readyParams)).rows[0]?.ready) !== 1) {
    throw createHttpError(503, 'Das Datenbankschema für den Angebotsversand muss aktualisiert werden.', { code: 'OFFER_MAIL_SCHEMA_MISSING' });
  }
}

async function offerMailSendEnabled() {
  return optionOfferMailEnabled() && await offerMailSchemaReady();
}

async function stockOfferMailEnabled() {
  return config.optionOfferMail.stockEnabled && await offerMailSendEnabled();
}

async function writeOfferMail(query, offer, tempOfferId, existing) {
  const fields = [offer.articleIndex || '', offer.contactId, offer.contactName, offer.recipientEmail,
    offer.senderCode, offer.senderName, offer.senderEmail, offer.salePrice ?? 0, offer.incotermId, offer.incotermText];
  if (existing) {
    await query(`
      UPDATE ${outbox} SET ArticleIndex=?, ContactId=?, ContactName=?, RecipientEmail=?,
        SenderCode=?, SenderName=?, SenderEmail=?, SalePricePerTonne=CAST(? AS decimal(19,4)),
        Currency=N'EUR', IncotermId=?, IncotermText=?, TempOfferId=?, Status=N'pending', MailServiceId=NULL,
        SentAt=NULL, AttemptCount=0, NextAttemptAt=NULL, LockedAt=NULL, LastError=NULL,
        UpdatedAt=SYSUTCDATETIME() WHERE Id=?
    `, [...fields, tempOfferId, existing.id]);
    await query(`DELETE FROM ${documents} WHERE OptionOfferMailId=?`, [existing.id]);
  }
  const id = existing?.id ?? (await query(`
    INSERT INTO ${outbox}
      (CompanyId, OptionPositionId, StockPositionKey, TempOfferId, CustomerNumber, ArticleIndex,
       ContactId, ContactName, RecipientEmail, SenderCode, SenderName, SenderEmail, SalePricePerTonne, Currency, IncotermId, IncotermText)
    OUTPUT inserted.Id AS id
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS decimal(19,4)), N'EUR', ?, ?)
  `, [offer.companyId, offer.positionId ?? null, offer.stockPositionKey ?? null, tempOfferId, offer.customerId, ...fields])).rows[0].id;
  await query(`INSERT INTO ${documents} (OptionOfferMailId, OfferJson) VALUES (?, ?)`, [id, JSON.stringify(offer)]);
}

function assertOfferMailReplaceable(existing, offer) {
  if (existing && existing.status !== 'failed'
    && !(offer.kind === 'app' && existing.status === 'pending' && Number(existing.attempt) === 0)) {
    throw createHttpError(409, `Für ${offer.customerName} besteht bereits ein Versandvorgang.`, { code: 'OPTION_OFFER_ALREADY_QUEUED' });
  }
}

async function queueManualOffer(query, offer, id) {
  await requireOfferMailSchema(query);
  const existing = (await query(`
    SELECT Id AS id, Status AS status, AttemptCount AS attempt, OptionPositionId AS optionId, StockPositionKey AS stockKey
    FROM ${outbox} WITH (UPDLOCK,HOLDLOCK) WHERE TempOfferId=?
  `, [id])).rows[0];
  if (existing?.optionId || existing?.stockKey) {
    throw createHttpError(409, 'Bitte das Angebot erneut aus der Option oder der VL einreichen.', { code: 'OFFER_RETRY_AT_SOURCE' });
  }
  assertOfferMailReplaceable(existing, offer);
  await writeOfferMail(query, offer, id, existing);
}

async function discardManualOfferMail(query, id) {
  if (Number((await query(readySql, readyParams)).rows[0]?.ready) !== 1) return;
  const existing = (await query(`
    SELECT Id AS id, Status AS status, AttemptCount AS attempt, OptionPositionId AS optionId, StockPositionKey AS stockKey
    FROM ${outbox} WITH (UPDLOCK,HOLDLOCK)
    WHERE TempOfferId=?
  `, [id])).rows[0];
  if (!existing) return;
  if (existing.optionId || existing.stockKey) {
    throw createHttpError(409, 'Das Angebot ist mit einem Versandvorgang aus der Option oder der VL verknüpft.', { code: 'OFFER_RETRY_AT_SOURCE' });
  }
  assertOfferMailReplaceable(existing, { kind: 'app', customerName: 'den Kunden' });
  await query(`DELETE FROM ${documents} WHERE OptionOfferMailId=?`, [existing.id]);
  await query(`DELETE FROM ${outbox} WHERE Id=?`, [existing.id]);
}

async function queueOptionOffers(database, offers) {
  const headers = await loadGeneratedOfferHeaders(database, offers);
  return withSqlTransaction(config.sql.database, async ({ query }) => {
    await requireOfferMailSchema(query);
    for (const offer of [...offers].sort((left, right) => left.customerId.localeCompare(right.customerId))) {
      const sourceColumn = offer.stockPositionKey ? 'StockPositionKey' : 'OptionPositionId';
      const sourceId = offer.stockPositionKey ?? offer.positionId;
      const idQuery = await query(`
        SELECT Id AS id, Status AS status FROM ${outbox} WITH (UPDLOCK, HOLDLOCK)
        WHERE CompanyId = ? AND ${sourceColumn} = ? AND CustomerNumber = ?
          ${offer.stockPositionKey ? 'AND OptionPositionId IS NULL' : ''}
      `, [offer.companyId, sourceId, offer.customerId]);
      const existing = idQuery.rows[0];
      assertOfferMailReplaceable(existing, offer);
      const id = await createGeneratedTempOffer(query, offer, headers.get(offer.customerId));
      await writeOfferMail(query, offer, id, existing);
    }
  });
}

async function claimOffer() {
  const [row] = await run(`
    ;WITH nextMail AS (
      SELECT TOP (1) o.Id
      FROM ${outbox} o WITH (UPDLOCK, READPAST, READCOMMITTEDLOCK)
      JOIN ${documents} d ON d.OptionOfferMailId = o.Id
      LEFT JOIN ${H} h ON h.tag_id=o.TempOfferId AND h.tag_company_id=o.CompanyId
      WHERE (o.NextAttemptAt IS NULL OR o.NextAttemptAt <= SYSUTCDATETIME())
        AND (o.Status = N'submitted' OR (o.Status = N'unknown' AND o.MailServiceId IS NOT NULL)
          OR (o.Status IN (N'pending', N'sending') AND h.tag_id IS NOT NULL AND
            ((${readyPdfSql}) OR h.tag_status=3 OR JSON_VALUE(d.OfferJson, '$.validUntil') < ?))
          OR (o.TempOfferId IS NULL AND o.Status=N'pending' AND o.AttemptCount=0 AND o.MailServiceId IS NULL))
      ORDER BY COALESCE(o.NextAttemptAt, o.CreatedAt), o.Id
    )
    UPDATE o SET Status = CASE WHEN o.Status IN (N'submitted', N'unknown') THEN N'submitted' ELSE N'sending' END,
      AttemptCount = o.AttemptCount + 1, LockedAt = SYSUTCDATETIME(),
      NextAttemptAt = DATEADD(MINUTE, 5, SYSUTCDATETIME()), UpdatedAt = SYSUTCDATETIME()
    OUTPUT inserted.Id AS id, inserted.Status AS status, inserted.MailServiceId AS mailServiceId,
      inserted.AttemptCount AS attempt, inserted.TempOfferId AS tempOfferId,
      d.OfferJson AS offerJson,
      h.tag_created_by AS createdBy, h.tag_status AS erpStatus, h.tag_bms_offer_number AS offerNumber, h.tag_offer_pdf AS pdf
    FROM ${outbox} o JOIN nextMail n ON n.Id = o.Id JOIN ${documents} d ON d.OptionOfferMailId = o.Id
    LEFT JOIN ${H} h ON h.tag_id=o.TempOfferId AND h.tag_company_id=o.CompanyId
  `, [berlinDate()]);
  return row;
}

async function updateOffer(row, status, message = null, mailServiceId = null) {
  await run(`
    UPDATE ${outbox} SET Status = ?, MailServiceId = COALESCE(?, MailServiceId), LastError = ?,
      NextAttemptAt = DATEADD(MINUTE, 2, SYSUTCDATETIME()), LockedAt = NULL, UpdatedAt = SYSUTCDATETIME()
    WHERE Id = ? AND AttemptCount = ? AND Status IN (N'sending', N'submitted')
  `, [status, mailServiceId, message, row.id, row.attempt]);
}

async function confirmSent(row, mailServiceId, sentAt) {
  const sentDate = new Date(sentAt);
  const date = typeof sentAt === 'string' && Number.isFinite(sentDate.getTime()) ? sentDate.toISOString().slice(0, -1) : null;
  await run(`
      UPDATE ${outbox} SET Status = N'sent', MailServiceId = ?, SentAt = COALESCE(CAST(? AS datetime2(7)), SYSUTCDATETIME()),
        LastError = NULL, LockedAt = NULL, NextAttemptAt = NULL, UpdatedAt = SYSUTCDATETIME()
      WHERE Id = ? AND AttemptCount = ? AND Status IN (N'sending', N'submitted')
  `, [mailServiceId, date, row.id, row.attempt]);
}

function classifyServiceStatus(result) {
  const value = String(result?.status ?? result?.Status ?? '').trim().toLowerCase();
  if (value === 'sent' || value === '2') return 'sent';
  if (['rejected', 'cancelled', 'canceled'].includes(value)) return 'failed';
  if (value === 'failed') return 'unknown';
  return 'submitted';
}

async function deliverOffer(client, row) {
  let request;
  try {
    const offer = JSON.parse(row.offerJson);
    if (row.status === 'sending' && offer.validUntil && offer.validUntil < berlinDate()) {
      await updateOffer(row, row.attempt === 1 ? 'failed' : 'unknown', 'Die Option ist abgelaufen.');
      return;
    }
    if (row.status === 'sending' && (!row.tempOfferId || Number(row.erpStatus) === 3)) {
      const reason = row.tempOfferId ? 'BMS hat das Angebot zur Nacharbeit zurückgegeben.' : 'Das Angebot muss erneut an BMS übergeben werden.';
      await updateOffer(row, row.attempt === 1 ? 'failed' : 'unknown', reason);
      return;
    }
    if (row.status !== 'submitted') {
      const document = readTempOfferDocument(row, offer);
      if (offer.kind === 'app') {
        offer.positions = await run(`
          SELECT ${select(positionFields, 'p.')}
          FROM ${P} p JOIN ${H} h ON h.tag_id=p.tagp_offer_id
          WHERE h.tag_id=? AND h.tag_company_id=? AND h.tag_status=2
          ORDER BY p.tagp_line_no
        `, [row.tempOfferId, offer.companyId]);
      }
      let recipient;
      const creatorCode = String(row.createdBy ?? '').trim().toUpperCase();
      if (creatorCode) {
        const senderCode = String(offer.senderCode ?? '').trim().toUpperCase();
        recipient = creatorCode === senderCode
          ? singleEmail(offer.senderEmail)
          : singleEmail((await getUserIdentityByShortCode(creatorCode, offer.companyId))?.email);
      }
      if (!recipient) {
        await updateOffer(row, row.attempt === 1 ? 'failed' : 'unknown', 'Für den Angebotsersteller fehlt eine gültige Mailadresse.');
        return;
      }
      request = assembleOfferMail(offer, document, {
        clientMessageId: `bms-app:offer-preview:${offer.messageKey}`,
        to: [{ address: recipient }],
      });
    }
  } catch {
    // A local problem cannot turn a previously accepted or uncertain mail into a retryable send.
    await updateOffer(row, row.status === 'submitted' || row.attempt > 1 ? 'unknown' : 'failed', 'BMS-Angebotsausgabe fehlt oder ist ungültig.');
    return;
  }

  let response;
  try {
    response = row.status === 'submitted' ? await client.getMail(row.mailServiceId) : await client.submitMail(request);
  } catch (error) {
    const rejected = row.status === 'sending' && row.attempt === 1 && [400, 401, 403, 422].includes(error.statusCode);
    const state = row.status === 'submitted' ? 'submitted' : rejected ? 'failed' : row.attempt >= 5 ? 'unknown' : 'sending';
    await updateOffer(row, state, rejected ? 'MailService hat das Angebot abgelehnt.' : 'MailService-Status konnte nicht bestätigt werden.');
    return;
  }
  const id = String(row.mailServiceId || response?.id || response?.Id || '').trim();
  const status = classifyServiceStatus(response);
  if (!id || id.length > 100) {
    await updateOffer(row, 'unknown', 'MailService hat keine gültige Versand-ID geliefert.');
    return;
  }
  if (status === 'sent') await confirmSent(row, id, response.sentAt ?? response.SentAt);
  else await updateOffer(row, status, ['failed', 'unknown'].includes(status) ? 'MailService meldet einen Versandfehler.' : null, id);
}

function startOptionOfferMailWorker() {
  if (!optionOfferMailEnabled()) return;
  const client = new MailServiceClient(config.mailService);
  let busy = false;
  const process = async () => {
    if (busy) return;
    busy = true;
    try {
      if (!await offerMailSchemaReady()) return;
      for (let count = 0; count < 10; count++) {
        const row = await claimOffer();
        if (!row) break;
        await deliverOffer(client, row);
      }
    } catch (error) {
      logger.error('Optionsangebotsversand konnte nicht verarbeitet werden.', error);
    } finally {
      busy = false;
    }
  };
  setInterval(() => void process(), 30000).unref();
  void process();
}

const readyPdfSql = `h.tag_status=2 AND NULLIF(LTRIM(RTRIM(h.tag_bms_offer_number)), N'') IS NOT NULL
  AND DATALENGTH(h.tag_offer_pdf)>5 AND SUBSTRING(h.tag_offer_pdf,1,5)=0x255044462D`;

module.exports = {
  offerMailSendEnabled, stockOfferMailEnabled, queueOptionOffers, queueManualOffer, discardManualOfferMail,
  startOptionOfferMailWorker, classifyServiceStatus, deliverOffer, claimOffer, readyPdfSql, offerMailSchemaReady,
};
