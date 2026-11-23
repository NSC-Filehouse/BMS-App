const { MailServiceClient } = require('@filehouse/mailservice-client');
const config = require('../config');
const logger = require('../logger');
const { runSQLQuerySqlServer, withSqlTransaction } = require('./access');
const { berlinDate } = require('../options/read');
const { readBmsOfferDocument, assembleOfferMail } = require('../options/offer-documents');
const { createHttpError } = require('../utils');

const outbox = 'BMSApp.OptionOfferMailOutbox';
const documents = 'BMSApp.OptionOfferDocument';
const activities = 'BMSApp.tbl_Temp_Aktivitaet';
const run = (query, params) => runSQLQuerySqlServer(config.sql.database, query, params);

function optionOfferMailEnabled() {
  return Boolean(config.optionOfferMail.enabled && config.mailService.enabled && config.mailService.baseAddress && config.mailService.apiKey);
}

async function queueOptionOffers(offers) {
  return withSqlTransaction(config.sql.database, async ({ query }) => {
    for (const offer of [...offers].sort((left, right) => left.customerId.localeCompare(right.customerId))) {
      const idQuery = await query(`
        SELECT Id AS id, Status AS status FROM ${outbox} WITH (UPDLOCK, HOLDLOCK)
        WHERE CompanyId = ? AND OptionPositionId = ? AND CustomerNumber = ?
      `, [offer.companyId, offer.positionId, offer.customerId]);
      const existing = idQuery.rows[0];
      const fields = [offer.articleIndex, offer.contactId, offer.contactName, offer.recipientEmail,
        offer.senderCode, offer.senderName, offer.senderEmail, offer.salePrice, offer.incotermId, offer.incotermText];
      if (existing && existing.status !== 'failed') {
        throw createHttpError(409, `Für ${offer.customerName} besteht bereits ein Versandvorgang.`, { code: 'OPTION_OFFER_ALREADY_QUEUED' });
      }
      if (existing) {
        await query(`
          UPDATE ${outbox} SET ArticleIndex = ?, ContactId = ?, ContactName = ?, RecipientEmail = ?,
            SenderCode = ?, SenderName = ?, SenderEmail = ?, SalePricePerTonne = CAST(? AS decimal(19,4)),
            Currency = N'EUR', IncotermId = ?, IncotermText = ?, Status = N'pending', MailServiceId = NULL,
            SentAt = NULL, AttemptCount = 0, NextAttemptAt = NULL, LockedAt = NULL, LastError = NULL,
            UpdatedAt = SYSUTCDATETIME() WHERE Id = ?
        `, [...fields, existing.id]);
        await query(`DELETE FROM ${documents} WHERE OptionOfferMailId = ?`, [existing.id]);
      }
      const id = existing?.id ?? (await query(`
        INSERT INTO ${outbox}
          (CompanyId, OptionPositionId, CustomerNumber, ArticleIndex, ContactId, ContactName, RecipientEmail,
           SenderCode, SenderName, SenderEmail, SalePricePerTonne, Currency, IncotermId, IncotermText)
        OUTPUT inserted.Id AS id
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS decimal(19,4)), N'EUR', ?, ?)
      `, [offer.companyId, offer.positionId, offer.customerId, ...fields])).rows[0].id;
      await query(`INSERT INTO ${documents} (OptionOfferMailId, OfferJson) VALUES (?, ?)`, [id, JSON.stringify(offer)]);
    }
  });
}

async function claimOffer() {
  const [row] = await run(`
    ;WITH nextMail AS (
      SELECT TOP (1) o.Id
      FROM ${outbox} o WITH (UPDLOCK, READPAST, READCOMMITTEDLOCK)
      JOIN ${documents} d ON d.OptionOfferMailId = o.Id
      WHERE (o.NextAttemptAt IS NULL OR o.NextAttemptAt <= SYSUTCDATETIME())
        AND (o.Status = N'submitted' OR (o.Status = N'unknown' AND o.MailServiceId IS NOT NULL)
          OR (o.Status IN (N'pending', N'sending') AND
            (d.BmsDocumentJson IS NOT NULL OR JSON_VALUE(d.OfferJson, '$.validUntil') < ?)))
      ORDER BY COALESCE(o.NextAttemptAt, o.CreatedAt), o.Id
    )
    UPDATE o SET Status = CASE WHEN o.Status IN (N'submitted', N'unknown') THEN N'submitted' ELSE N'sending' END,
      AttemptCount = o.AttemptCount + 1, LockedAt = SYSUTCDATETIME(),
      NextAttemptAt = DATEADD(MINUTE, 5, SYSUTCDATETIME()), UpdatedAt = SYSUTCDATETIME()
    OUTPUT inserted.Id AS id, inserted.Status AS status, inserted.MailServiceId AS mailServiceId,
      inserted.AttemptCount AS attempt, d.OfferJson AS offerJson, d.BmsDocumentJson AS documentJson
    FROM ${outbox} o JOIN nextMail n ON n.Id = o.Id JOIN ${documents} d ON d.OptionOfferMailId = o.Id
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

async function confirmSent(row, offer, reference, mailServiceId, sentAt) {
  const price = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 4 }).format(offer.salePrice);
  const description = `Option ${offer.article} per E-Mail an ${offer.contactName} angeboten (${reference}). VK ${price}/t, Incoterm ${offer.incotermCode}.`;
  const sentDate = new Date(sentAt);
  const date = typeof sentAt === 'string' && Number.isFinite(sentDate.getTime()) ? sentDate.toISOString().slice(0, -1) : null;
  await withSqlTransaction(config.sql.database, async ({ query }) => {
    const { rows } = await query(`
      UPDATE ${outbox} SET Status = N'sent', MailServiceId = ?, SentAt = COALESCE(CAST(? AS datetime2(7)), SYSUTCDATETIME()),
        LastError = NULL, LockedAt = NULL, NextAttemptAt = NULL, UpdatedAt = SYSUTCDATETIME()
      OUTPUT inserted.Id
      WHERE Id = ? AND AttemptCount = ? AND Status IN (N'sending', N'submitted')
    `, [mailServiceId, date, row.id, row.attempt]);
    if (rows.length) {
      await query(`
        INSERT INTO ${activities} (OptionOfferMailId, CompanyId, CustomerNumber, ActivityDate, EmployeeCode, Description)
        SELECT Id, CompanyId, CustomerNumber, SentAt, SenderCode, ? FROM ${outbox} WHERE Id = ?
      `, [description, row.id]);
    }
  });
}

function classifyServiceStatus(result) {
  const value = String(result?.status ?? result?.Status ?? '').trim().toLowerCase();
  if (value === 'sent') return 'sent';
  if (['rejected', 'cancelled', 'canceled'].includes(value)) return 'failed';
  if (value === 'failed') return 'unknown';
  return 'submitted';
}

async function deliverOffer(client, row) {
  let offer, document, request;
  try {
    offer = JSON.parse(row.offerJson);
    if (row.status === 'sending' && offer.validUntil && offer.validUntil < berlinDate()) {
      await updateOffer(row, row.attempt === 1 ? 'failed' : 'unknown', 'Die Option ist abgelaufen.');
      return;
    }
    document = readBmsOfferDocument(row.documentJson, offer.messageKey);
    if (row.status !== 'submitted') request = assembleOfferMail(offer, document);
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
  if (status === 'sent') await confirmSent(row, offer, document.number, id, response.sentAt ?? response.SentAt);
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

module.exports = { optionOfferMailEnabled, queueOptionOffers, startOptionOfferMailWorker, classifyServiceStatus, deliverOffer };
