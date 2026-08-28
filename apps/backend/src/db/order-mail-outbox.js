const config = require('../config');
const logger = require('../logger');
const { runSQLQuerySqlServer } = require('./access');
const { appTableSql } = require('./app-tables');
const { sendOrderMail, validateEwsConfig } = require('../mail/order-mail');

const OUTBOX_TABLE = appTableSql('orderMailOutbox');
const TEMP_ORDER_TABLE = appTableSql('tempOrder');
let workerTimer = null;
let workerRunning = false;

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function mapOutboxRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    orderId: Number(row.orderId),
    recipient: asText(row.recipient),
    recipientSource: asText(row.recipientSource),
    subject: asText(row.subject),
    body: String(row.body || ''),
    status: asText(row.status),
    attemptCount: Number(row.attemptCount || 0),
  };
}

async function claimSpecificOutboxItem(outboxId) {
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    UPDATE ${OUTBOX_TABLE} WITH (ROWLOCK, UPDLOCK, READPAST)
    SET [om_Status] = N'sending',
        [om_AttemptCount] = [om_AttemptCount] + 1,
        [om_LockedAt] = SYSUTCDATETIME(),
        [om_LastModifiedDate] = SYSUTCDATETIME()
    OUTPUT
      INSERTED.[om_ID] AS id,
      INSERTED.[om_OrderID] AS orderId,
      INSERTED.[om_Recipient] AS recipient,
      INSERTED.[om_RecipientSource] AS recipientSource,
      INSERTED.[om_Subject] AS subject,
      INSERTED.[om_Body] AS body,
      INSERTED.[om_Status] AS status,
      INSERTED.[om_AttemptCount] AS attemptCount
    WHERE [om_ID] = ?
      AND [om_AttemptCount] < ?
      AND (
        [om_Status] IN (N'pending', N'failed')
        OR ([om_Status] = N'sending' AND [om_LockedAt] < DATEADD(MINUTE, -10, SYSUTCDATETIME()))
      )
      AND ([om_NextAttemptAt] IS NULL OR [om_NextAttemptAt] <= SYSUTCDATETIME())
  `, [outboxId, config.orderMail.maxAttempts]);
  return mapOutboxRow(Array.isArray(rows) && rows.length ? rows[0] : null);
}

async function findNextOutboxId() {
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT TOP 1 [om_ID] AS id
    FROM ${OUTBOX_TABLE} WITH (READPAST)
    WHERE [om_AttemptCount] < ?
      AND (
        [om_Status] IN (N'pending', N'failed')
        OR ([om_Status] = N'sending' AND [om_LockedAt] < DATEADD(MINUTE, -10, SYSUTCDATETIME()))
      )
      AND ([om_NextAttemptAt] IS NULL OR [om_NextAttemptAt] <= SYSUTCDATETIME())
    ORDER BY COALESCE([om_NextAttemptAt], [om_CreateDate]) ASC, [om_ID] ASC
  `, [config.orderMail.maxAttempts]);
  return Array.isArray(rows) && rows.length ? Number(rows[0].id) : null;
}

async function loadAttachment(orderId) {
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT TOP 1
      [ta_Attachment] AS buffer,
      [ta_AttachmentFileName] AS fileName,
      [ta_AttachmentMimeType] AS mimeType
    FROM ${TEMP_ORDER_TABLE}
    WHERE [ta_id] = ?
  `, [orderId]);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row?.buffer || !row?.fileName) return null;
  return { buffer: row.buffer, fileName: row.fileName, mimeType: row.mimeType };
}

function nextRetryDate(attemptCount) {
  const minutes = Math.min(60, Math.max(1, 2 ** Math.max(0, attemptCount - 1)));
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

async function processOrderMailOutboxById(outboxId) {
  const item = await claimSpecificOutboxItem(outboxId);
  if (!item) return { processed: false, status: 'not_claimed' };
  const effectiveRecipient = asText(config.orderMail.testRecipient).toLowerCase() || item.recipient;

  try {
    await sendOrderMail({
      orderMailConfig: config.orderMail,
      recipient: effectiveRecipient,
      subject: item.subject,
      body: item.body,
      attachment: await loadAttachment(item.orderId),
    });
    await runSQLQuerySqlServer(config.sql.database, `
      UPDATE ${OUTBOX_TABLE}
      SET [om_Status] = N'sent',
          [om_SentAt] = SYSUTCDATETIME(),
          [om_NextAttemptAt] = NULL,
          [om_LockedAt] = NULL,
          [om_LastError] = NULL,
          [om_LastModifiedDate] = SYSUTCDATETIME()
      WHERE [om_ID] = ?
    `, [item.id]);
    logger.info(`Auftragsmail ${item.id} fuer Auftrag ${item.orderId} versendet an ${effectiveRecipient}.`);
    return { processed: true, status: 'sent', recipient: effectiveRecipient };
  } catch (error) {
    const message = asText(error?.message || error).slice(0, 2000) || 'Unbekannter EWS-Fehler';
    const exhausted = item.attemptCount >= config.orderMail.maxAttempts;
    await runSQLQuerySqlServer(config.sql.database, `
      UPDATE ${OUTBOX_TABLE}
      SET [om_Status] = N'failed',
          [om_NextAttemptAt] = ?,
          [om_LockedAt] = NULL,
          [om_LastError] = ?,
          [om_LastModifiedDate] = SYSUTCDATETIME()
      WHERE [om_ID] = ?
    `, [exhausted ? null : nextRetryDate(item.attemptCount), message, item.id]);
    logger.error(`Auftragsmail ${item.id} fuer Auftrag ${item.orderId} fehlgeschlagen`, error);
    return { processed: true, status: 'failed', recipient: effectiveRecipient, exhausted };
  }
}

async function processPendingOrderMails(limit = 5) {
  if (workerRunning) return;
  if (!validateEwsConfig(config.orderMail).ok) return;
  workerRunning = true;
  try {
    for (let i = 0; i < limit; i += 1) {
      const id = await findNextOutboxId();
      if (!id) break;
      await processOrderMailOutboxById(id);
    }
  } catch (error) {
    logger.error('Auftragsmail-Outbox konnte nicht verarbeitet werden', error);
  } finally {
    workerRunning = false;
  }
}

function startOrderMailOutboxWorker() {
  if (workerTimer || !config.orderMail.enabled) return;
  const validation = validateEwsConfig(config.orderMail);
  if (!validation.ok) {
    logger.warning(`Auftragsmail-Outbox nicht gestartet: ${validation.reason}.`);
    return;
  }
  const intervalMs = Math.max(10, config.orderMail.retryIntervalSeconds) * 1000;
  void processPendingOrderMails();
  workerTimer = setInterval(() => void processPendingOrderMails(), intervalMs);
  if (typeof workerTimer.unref === 'function') workerTimer.unref();
  logger.info(`Auftragsmail-Outbox gestartet (Intervall ${Math.round(intervalMs / 1000)}s).`);
}

module.exports = {
  processOrderMailOutboxById,
  processPendingOrderMails,
  startOrderMailOutboxWorker,
};
