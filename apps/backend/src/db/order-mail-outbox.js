const config = require('../config');
const logger = require('../logger');
const { runSQLQueryAccess, runSQLQuerySqlServer } = require('./access');
const { appTableSql } = require('./app-tables');
const { getDatabaseConnectionForCompanyId } = require('./databases');
const { getUserIdentityByShortCode } = require('./users');
const {
  sendOrderMail,
  resolveOrderMailRecipient,
  validateOrderMailConfig,
} = require('../mail/order-mail');

const OUTBOX_TABLE = appTableSql('orderMailOutbox');
const TEMP_ORDER_TABLE = appTableSql('tempOrder');
const TEMP_ORDER_POSITION_TABLE = appTableSql('tempOrderPosition');
const RESERVATION_TABLE = '[dbo].[tblBest_Pos_Reserviert]';
let workerTimer = null;
let workerRunning = false;

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function isEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(asText(value));
}

function mapOutboxRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    orderId: Number(row.orderId),
    companyId: Number(row.companyId),
    recipient: asText(row.recipient),
    recipientSource: asText(row.recipientSource),
    fromAddress: asText(row.fromAddress) || null,
    fromDisplayName: asText(row.fromDisplayName) || null,
    onBehalfOfAddress: asText(row.onBehalfOfAddress) || null,
    onBehalfOfDisplayName: asText(row.onBehalfOfDisplayName) || null,
    subject: asText(row.subject),
    body: String(row.body || ''),
    status: asText(row.status),
    attemptCount: Number(row.attemptCount || 0),
  };
}

async function resolveMissingOrderMailSender(item) {
  const sender = {
    fromAddress: item.fromAddress,
    fromDisplayName: item.fromDisplayName,
    onBehalfOfAddress: item.onBehalfOfAddress,
    onBehalfOfDisplayName: item.onBehalfOfDisplayName,
  };
  if (sender.onBehalfOfAddress) return sender;

  try {
    const rows = await runSQLQuerySqlServer(config.sql.database, `
      SELECT TOP 1 [ta_CreatedBy] AS createdBy
      FROM ${TEMP_ORDER_TABLE}
      WHERE [ta_id] = ? AND [ta_company_id] = ?
    `, [item.orderId, item.companyId]);
    const createdBy = asText(rows?.[0]?.createdBy);
    if (!createdBy) return sender;

    const identity = await getUserIdentityByShortCode(createdBy, item.companyId);
    const email = asText(identity?.email).toLowerCase();
    if (!isEmailAddress(email)) return sender;

    return {
      ...sender,
      onBehalfOfAddress: email,
      onBehalfOfDisplayName: asText(identity?.fullName)
        || [identity?.givenName, identity?.surname].filter(Boolean).join(' ')
        || null,
    };
  } catch (error) {
    logger.warn(`Auftrags-AD fuer bestehende Auftragsmail ${item.id} konnte nicht aufgeloest werden; Standardabsender wird verwendet.`);
    return sender;
  }
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
      INSERTED.[om_CompanyID] AS companyId,
      INSERTED.[om_Recipient] AS recipient,
      INSERTED.[om_RecipientSource] AS recipientSource,
      INSERTED.[om_FromAddress] AS fromAddress,
      INSERTED.[om_FromDisplayName] AS fromDisplayName,
      INSERTED.[om_OnBehalfOfAddress] AS onBehalfOfAddress,
      INSERTED.[om_OnBehalfOfDisplayName] AS onBehalfOfDisplayName,
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

function buildReservationReleaseKeys(rows) {
  const keys = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const beNumber = asText(row?.beNumber);
    const warehouseId = asText(row?.warehouseId);
    const reservationInKg = Number(row?.reservationInKg);
    if (!beNumber || !warehouseId || !Number.isFinite(reservationInKg) || reservationInKg <= 0) continue;
    keys.set(`${beNumber}\u001f${warehouseId}`, { beNumber, warehouseId });
  }
  return [...keys.values()];
}

async function releaseReservationsForOrder(orderId, companyId) {
  const positionRows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT
      [tap_be_number] AS beNumber,
      [tap_warehouse] AS warehouseId,
      [tap_reservation_in_kg] AS reservationInKg
    FROM ${TEMP_ORDER_POSITION_TABLE}
    WHERE [tap_ta_id] = ?
  `, [orderId]);
  const keys = buildReservationReleaseKeys(positionRows);
  if (!keys.length) return { released: 0, positions: 0 };

  const sourceDatabase = await getDatabaseConnectionForCompanyId(companyId);
  for (const { beNumber, warehouseId } of keys) {
    await runSQLQueryAccess(sourceDatabase, `
      DELETE FROM ${RESERVATION_TABLE}
      WHERE [bePR_BEposID] = ? AND [bePR_LagerID] = ?
    `, [beNumber, warehouseId]);
  }

  // The marker makes the cleanup idempotent and lets the worker retry the
  // release if a source database was temporarily unavailable after sending.
  await runSQLQuerySqlServer(config.sql.database, `
    UPDATE ${TEMP_ORDER_POSITION_TABLE}
    SET [tap_reservation_in_kg] = NULL,
        [tap_reservation_date] = NULL
    WHERE [tap_ta_id] = ?
      AND [tap_reservation_in_kg] > 0
  `, [orderId]);

  logger.info(`Reservierungen fuer finalisierten Auftrag ${orderId} aufgehoben (${keys.length} Positionen).`);
  return { released: keys.length, positions: positionRows.length };
}

async function releaseReservationsForSentOrders(limit = 25) {
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT DISTINCT TOP ${Math.max(1, Math.min(Number(limit) || 25, 100))}
      o.[ta_id] AS orderId,
      o.[ta_company_id] AS companyId
    FROM ${TEMP_ORDER_TABLE} AS o
    INNER JOIN ${TEMP_ORDER_POSITION_TABLE} AS p
      ON p.[tap_ta_id] = o.[ta_id]
    INNER JOIN ${OUTBOX_TABLE} AS m
      ON m.[om_OrderID] = o.[ta_id]
     AND m.[om_Status] = N'sent'
    WHERE o.[ta_Status] IN (1, 2)
      AND p.[tap_reservation_in_kg] > 0
    ORDER BY o.[ta_id] ASC
  `);
  for (const row of Array.isArray(rows) ? rows : []) {
    try {
      await releaseReservationsForOrder(row.orderId, row.companyId);
    } catch (error) {
      logger.error(`Reservierungsaufhebung fuer finalisierten Auftrag ${row.orderId} fehlgeschlagen`, error);
    }
  }
}

async function processOrderMailOutboxById(outboxId) {
  const item = await claimSpecificOutboxItem(outboxId);
  if (!item) return { processed: false, status: 'not_claimed' };
  const configuredRecipient = resolveOrderMailRecipient(item.companyId, config.orderMail);
  const effectiveRecipient = configuredRecipient.ok ? configuredRecipient.address : item.recipient;

  try {
    const sender = await resolveMissingOrderMailSender(item);
    const delivery = await sendOrderMail({
      orderMailConfig: config.orderMail,
      mailServiceConfig: config.mailService,
      fromAddress: sender.fromAddress,
      fromDisplayName: sender.fromDisplayName,
      onBehalfOfAddress: sender.onBehalfOfAddress,
      onBehalfOfDisplayName: sender.onBehalfOfDisplayName,
      recipient: effectiveRecipient,
      subject: item.subject,
      body: item.body,
      attachment: await loadAttachment(item.orderId),
      clientMessageId: `bms-app:order:${item.orderId}`,
      isBodyHtml: true,
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
    try {
      await releaseReservationsForOrder(item.orderId, item.companyId);
    } catch (error) {
      // The mail is already sent. Keep the outbox item sent and let the
      // reconciliation pass retry the reservation release later.
      logger.error(`Reservierungsaufhebung nach Versand fuer Auftrag ${item.orderId} fehlgeschlagen`, error);
    }
    logger.info(`Auftragsmail ${item.id} fuer Auftrag ${item.orderId} ueber ${delivery.transport} angenommen an ${effectiveRecipient}.`);
    return { processed: true, status: 'sent', recipient: effectiveRecipient, transport: delivery.transport };
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
  if (!validateOrderMailConfig(config.orderMail, config.mailService).ok) return;
  workerRunning = true;
  try {
    await releaseReservationsForSentOrders();
    for (let i = 0; i < limit; i += 1) {
      const id = await findNextOutboxId();
      if (!id) break;
      await processOrderMailOutboxById(id);
    }
    await releaseReservationsForSentOrders();
  } catch (error) {
    logger.error('Auftragsmail-Outbox konnte nicht verarbeitet werden', error);
  } finally {
    workerRunning = false;
  }
}

function startOrderMailOutboxWorker() {
  if (workerTimer || !config.orderMail.enabled) return;
  const validation = validateOrderMailConfig(config.orderMail, config.mailService);
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
  buildReservationReleaseKeys,
  processOrderMailOutboxById,
  processPendingOrderMails,
  startOrderMailOutboxWorker,
};
