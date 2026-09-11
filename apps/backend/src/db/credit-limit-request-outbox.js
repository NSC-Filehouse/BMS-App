const config = require('../config');
const logger = require('../logger');
const { runSQLQuerySqlServer } = require('./access');
const { appTableSql } = require('./app-tables');
const {
  formatBankDetailsReminderBody,
  formatCreditLimitRequestBody,
  hasBankDetails,
  isEmailAddress,
  isWithinCooldown,
  roundCreditLimit,
  uniqueCaseInsensitive,
} = require('../credit-limit');
const { sendOrderMail, validateOrderMailConfig } = require('../mail/order-mail');

const STATE_TABLE = appTableSql('creditLimitRequestState');
const OUTBOX_TABLE = appTableSql('creditLimitMailOutbox');
const CREDIT_LIMIT_TYPE = 'credit_limit_request';
const BANK_DETAILS_TYPE = 'bank_details_reminder';
let workerTimer = null;
let workerRunning = false;

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function toAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function parseRecipientJson(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return uniqueCaseInsensitive(parsed);
  } catch {
    return [];
  }
}

function stablePart(value) {
  return asText(value).replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60) || 'unknown';
}

function missingBankFields(customer) {
  const missing = [];
  if (!asText(customer?.iban)) missing.push('IBAN');
  if (!asText(customer?.swift)) missing.push('BIC/SWIFT');
  if (!asText(customer?.bankName) || !asText(customer?.accountNumber)) missing.push('Bank/Kontonummer');
  return missing;
}

function mapStateRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    lastRequestedAt: row.lastRequestedAt || null,
    lastRequestedLimit: row.lastRequestedLimit === null || row.lastRequestedLimit === undefined
      ? null
      : Number(row.lastRequestedLimit),
    lastExposureAmount: row.lastExposureAmount === null || row.lastExposureAmount === undefined
      ? null
      : Number(row.lastExposureAmount),
    lastCreditMailStatus: asText(row.lastCreditMailStatus),
    lastBankReminderAt: row.lastBankReminderAt || null,
    lastBankReminderStatus: asText(row.lastBankReminderStatus),
  };
}

function mapOutboxRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    companyId: Number(row.companyId),
    customerId: asText(row.customerId),
    orderId: row.orderId === null || row.orderId === undefined ? null : Number(row.orderId),
    type: asText(row.type),
    toRecipients: parseRecipientJson(row.toRecipients),
    ccRecipients: parseRecipientJson(row.ccRecipients),
    bccRecipients: parseRecipientJson(row.bccRecipients),
    subject: asText(row.subject),
    body: String(row.body || ''),
    clientMessageId: asText(row.clientMessageId),
    status: asText(row.status),
    attemptCount: Number(row.attemptCount || 0),
  };
}

async function loadStateForUpdate(query, companyId, customerId) {
  const result = await query(`
    SELECT TOP 1
      [clrs_ID] AS id,
      [clrs_LastRequestedAt] AS lastRequestedAt,
      [clrs_LastRequestedLimit] AS lastRequestedLimit,
      [clrs_LastExposureAmount] AS lastExposureAmount,
      [clrs_LastCreditMailStatus] AS lastCreditMailStatus,
      [clrs_LastBankReminderAt] AS lastBankReminderAt,
      [clrs_LastBankReminderStatus] AS lastBankReminderStatus
    FROM ${STATE_TABLE} WITH (UPDLOCK, HOLDLOCK)
    WHERE [clrs_CompanyID] = ? AND [clrs_CustomerID] = ?
  `, [companyId, customerId]);
  return mapStateRow(result.rows?.[0] || null);
}

async function ensureState(query, companyId, customerId) {
  const result = await query(`
    INSERT INTO ${STATE_TABLE} ([clrs_CompanyID], [clrs_CustomerID])
    OUTPUT INSERTED.[clrs_ID] AS id
    VALUES (?, ?)
  `, [companyId, customerId]);
  return Number(result.rows?.[0]?.id || 0);
}

async function insertOutbox(query, {
  companyId,
  customerId,
  orderId,
  type,
  toRecipients,
  ccRecipients,
  bccRecipients,
  subject,
  body,
  clientMessageId,
  nowIso,
}) {
  const result = await query(`
    INSERT INTO ${OUTBOX_TABLE} (
      [clm_CompanyID], [clm_CustomerID], [clm_OrderID], [clm_Type],
      [clm_ToRecipients], [clm_CcRecipients], [clm_BccRecipients],
      [clm_Subject], [clm_Body], [clm_ClientMessageID],
      [clm_Status], [clm_AttemptCount], [clm_NextAttemptAt],
      [clm_CreateDate], [clm_LastModifiedDate]
    )
    OUTPUT INSERTED.[clm_ID] AS id
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, N'pending', 0, ?, ?, ?)
  `, [
    companyId,
    customerId,
    orderId,
    type,
    JSON.stringify(toRecipients || []),
    JSON.stringify(ccRecipients || []),
    JSON.stringify(bccRecipients || []),
    subject,
    body,
    clientMessageId,
    nowIso,
    nowIso,
    nowIso,
  ]);
  const id = Number(result.rows?.[0]?.id || 0);
  if (!id) throw new Error(`Credit limit mail outbox insert failed for ${type}.`);
  return id;
}

async function loadOpenTempOrderRows(query, { tableSql, positionTableSql, companyId, customerId, excludeOrderId }) {
  const result = await query(`
    SELECT
      [o].[ta_id] AS orderId,
      COALESCE(SUM(
        COALESCE([p].[tap_amount_in_kg], 0) * COALESCE([p].[tap_price], 0) / 1000.0
      ), 0) AS amount
    FROM ${tableSql} [o]
    INNER JOIN ${positionTableSql} [p]
      ON [p].[tap_ta_id] = [o].[ta_id]
    WHERE [o].[ta_company_id] = ?
      AND COALESCE([o].[ta_ClientReferenceId], '') = ?
      AND COALESCE([o].[ta_Status], 0) IN (1, 2)
      AND [o].[ta_id] <> ?
    GROUP BY [o].[ta_id]
    ORDER BY [o].[ta_id] ASC
  `, [companyId, customerId, excludeOrderId]);
  return (result.rows || []).map((row) => ({
    orderId: Number(row.orderId),
    amount: toAmount(row.amount),
  })).filter((row) => Number.isFinite(row.orderId) && row.orderId > 0);
}

async function queueCreditLimitMails({
  query,
  companyId,
  customerId,
  orderId,
  currentOrderAmount,
  openTempOrders,
  creditContext,
  primaryAdEmail,
  mandantName,
  mandantShortName,
  nowIso,
  creditTo,
  creditCc,
  testRecipient,
}) {
  const result = {
    outboxIds: [],
    creditRequest: { status: 'not_applicable' },
    bankReminder: { status: 'not_applicable' },
  };
  if (!config.creditLimitMail.enabled || !creditContext?.credit || creditContext.credit.amount !== 0) {
    return result;
  }

  const state = await loadStateForUpdate(query, companyId, customerId);
  const now = new Date(nowIso);
  const cooldownMonths = config.creditLimitMail.cooldownMonths;
  const creditRequestDue = !isWithinCooldown(state?.lastRequestedAt, now, cooldownMonths);
  const bankReminderDue = !isWithinCooldown(state?.lastBankReminderAt, now, cooldownMonths);
  const configuredTestRecipient = asText(testRecipient);
  const effectiveCreditTo = configuredTestRecipient && isEmailAddress(configuredTestRecipient)
    ? [configuredTestRecipient]
    : uniqueCaseInsensitive(creditTo);
  const effectiveCreditCc = configuredTestRecipient && isEmailAddress(configuredTestRecipient)
    ? []
    : uniqueCaseInsensitive((creditCc || []).filter((address) => !effectiveCreditTo.some((to) => to.toLowerCase() === String(address).trim().toLowerCase())));

  if (!creditRequestDue) {
    result.creditRequest = {
      status: 'suppressed_cooldown',
      lastRequestedAt: state?.lastRequestedAt || null,
      lastRequestedLimit: state?.lastRequestedLimit ?? null,
    };
  }

  let stateId = state?.id || 0;
  if ((creditRequestDue || (!hasBankDetails(creditContext.customer) && bankReminderDue && isEmailAddress(primaryAdEmail))) && !stateId) {
    stateId = await ensureState(query, companyId, customerId);
  }

  if (creditRequestDue) {
    const tempTotal = (openTempOrders || []).reduce((sum, item) => sum + toAmount(item.amount), 0);
    const erpTotal = (creditContext.openOrders || []).reduce((sum, item) => sum + toAmount(item.amount), 0);
    const exposureAmount = toAmount(currentOrderAmount) + tempTotal + erpTotal;
    const requestedLimit = roundCreditLimit(exposureAmount);
    const clientMessageId = `bms-app:credit-limit:${stablePart(companyId)}:${stablePart(customerId)}:${stablePart(orderId)}`;
    const body = formatCreditLimitRequestBody({
      mandantName,
      mandantShortName,
      companyId,
      orderId,
      customer: creditContext.customer,
      currentOrderAmount,
      openTempOrders,
      openOrders: creditContext.openOrders,
      unpaidInvoicesAmount: creditContext.credit.unpaidInvoicesAmount,
      requestedLimit,
      previousRequestedLimit: state?.lastRequestedLimit ?? null,
      requestedAt: nowIso,
    });
    const outboxId = await insertOutbox(query, {
      companyId,
      customerId,
      orderId,
      type: CREDIT_LIMIT_TYPE,
      toRecipients: effectiveCreditTo,
      ccRecipients: effectiveCreditCc,
      bccRecipients: [],
      subject: config.creditLimitMail.subject,
      body,
      clientMessageId,
      nowIso,
    });
    await query(`
      UPDATE ${STATE_TABLE}
      SET [clrs_LastRequestedAt] = ?,
          [clrs_LastRequestedLimit] = ?,
          [clrs_LastExposureAmount] = ?,
          [clrs_LastCreditMailStatus] = N'pending',
          [clrs_LastCreditMailOutboxID] = ?,
          [clrs_LastCreditClientMessageID] = ?,
          [clrs_LastModifiedDate] = ?
      WHERE [clrs_ID] = ?
    `, [nowIso, requestedLimit, exposureAmount, outboxId, clientMessageId, nowIso, stateId]);
    result.outboxIds.push(outboxId);
    result.creditRequest = {
      status: 'queued',
      requestedLimit,
      exposureAmount,
      outboxId,
      clientMessageId,
    };
  }

  if (!hasBankDetails(creditContext.customer)) {
    if (!isEmailAddress(primaryAdEmail)) {
      result.bankReminder = { status: 'skipped_missing_primary_ad_email' };
    } else if (!bankReminderDue) {
      result.bankReminder = {
        status: 'suppressed_cooldown',
        lastReminderAt: state?.lastBankReminderAt || null,
      };
    } else {
      const clientMessageId = `bms-app:bank-details:${stablePart(companyId)}:${stablePart(customerId)}:${stablePart(orderId)}`;
      const body = formatBankDetailsReminderBody({
        mandantName,
        customer: creditContext.customer,
        orderId,
        missingFields: missingBankFields(creditContext.customer),
      });
      const effectiveBankTo = configuredTestRecipient && isEmailAddress(configuredTestRecipient)
        ? [configuredTestRecipient]
        : [primaryAdEmail];
      const outboxId = await insertOutbox(query, {
        companyId,
        customerId,
        orderId,
        type: BANK_DETAILS_TYPE,
        toRecipients: effectiveBankTo,
        ccRecipients: [],
        bccRecipients: [],
        subject: config.creditLimitMail.bankDetailsSubject,
        body,
        clientMessageId,
        nowIso,
      });
      await query(`
        UPDATE ${STATE_TABLE}
        SET [clrs_LastBankReminderAt] = ?,
            [clrs_LastBankReminderStatus] = N'pending',
            [clrs_LastBankReminderOutboxID] = ?,
            [clrs_LastModifiedDate] = ?
        WHERE [clrs_ID] = ?
      `, [nowIso, outboxId, nowIso, stateId]);
      result.outboxIds.push(outboxId);
      result.bankReminder = { status: 'queued', outboxId, clientMessageId, recipient: effectiveBankTo[0] };
    }
  }

  return result;
}

async function claimSpecificOutboxItem(outboxId) {
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    UPDATE ${OUTBOX_TABLE} WITH (ROWLOCK, UPDLOCK, READPAST)
    SET [clm_Status] = N'sending',
        [clm_AttemptCount] = [clm_AttemptCount] + 1,
        [clm_LockedAt] = SYSUTCDATETIME(),
        [clm_LastModifiedDate] = SYSUTCDATETIME()
    OUTPUT
      INSERTED.[clm_ID] AS id,
      INSERTED.[clm_CompanyID] AS companyId,
      INSERTED.[clm_CustomerID] AS customerId,
      INSERTED.[clm_OrderID] AS orderId,
      INSERTED.[clm_Type] AS type,
      INSERTED.[clm_ToRecipients] AS toRecipients,
      INSERTED.[clm_CcRecipients] AS ccRecipients,
      INSERTED.[clm_BccRecipients] AS bccRecipients,
      INSERTED.[clm_Subject] AS subject,
      INSERTED.[clm_Body] AS body,
      INSERTED.[clm_ClientMessageID] AS clientMessageId,
      INSERTED.[clm_Status] AS status,
      INSERTED.[clm_AttemptCount] AS attemptCount
    WHERE [clm_ID] = ?
      AND [clm_AttemptCount] < ?
      AND (
        [clm_Status] IN (N'pending', N'failed')
        OR ([clm_Status] = N'sending' AND [clm_LockedAt] < DATEADD(MINUTE, -10, SYSUTCDATETIME()))
      )
      AND ([clm_NextAttemptAt] IS NULL OR [clm_NextAttemptAt] <= SYSUTCDATETIME())
  `, [outboxId, config.creditLimitMail.maxAttempts]);
  return mapOutboxRow(Array.isArray(rows) && rows.length ? rows[0] : null);
}

async function findNextOutboxId() {
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT TOP 1 [clm_ID] AS id
    FROM ${OUTBOX_TABLE} WITH (READPAST)
    WHERE [clm_AttemptCount] < ?
      AND (
        [clm_Status] IN (N'pending', N'failed')
        OR ([clm_Status] = N'sending' AND [clm_LockedAt] < DATEADD(MINUTE, -10, SYSUTCDATETIME()))
      )
      AND ([clm_NextAttemptAt] IS NULL OR [clm_NextAttemptAt] <= SYSUTCDATETIME())
    ORDER BY COALESCE([clm_NextAttemptAt], [clm_CreateDate]) ASC, [clm_ID] ASC
  `, [config.creditLimitMail.maxAttempts]);
  return Array.isArray(rows) && rows.length ? Number(rows[0].id) : null;
}

function nextRetryDate(attemptCount) {
  const minutes = Math.min(60, Math.max(1, 2 ** Math.max(0, attemptCount - 1)));
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

async function updateStateMailStatus(item, status) {
  const field = item.type === CREDIT_LIMIT_TYPE
    ? '[clrs_LastCreditMailStatus]'
    : '[clrs_LastBankReminderStatus]';
  await runSQLQuerySqlServer(config.sql.database, `
    UPDATE ${STATE_TABLE}
    SET ${field} = ?, [clrs_LastModifiedDate] = SYSUTCDATETIME()
    WHERE [clrs_CompanyID] = ? AND [clrs_CustomerID] = ?
  `, [status, item.companyId, item.customerId]);
}

async function processCreditLimitMailOutboxById(outboxId) {
  const item = await claimSpecificOutboxItem(outboxId);
  if (!item) return { processed: false, status: 'not_claimed' };

  try {
    const delivery = await sendOrderMail({
      orderMailConfig: config.orderMail,
      mailServiceConfig: config.mailService,
      recipients: item.toRecipients,
      ccRecipients: item.ccRecipients,
      bccRecipients: item.bccRecipients,
      subject: item.subject,
      body: item.body,
      clientMessageId: item.clientMessageId,
      isBodyHtml: false,
    });
    await runSQLQuerySqlServer(config.sql.database, `
      UPDATE ${OUTBOX_TABLE}
      SET [clm_Status] = N'sent',
          [clm_SentAt] = SYSUTCDATETIME(),
          [clm_NextAttemptAt] = NULL,
          [clm_LockedAt] = NULL,
          [clm_LastError] = NULL,
          [clm_LastModifiedDate] = SYSUTCDATETIME()
      WHERE [clm_ID] = ?
    `, [item.id]);
    await updateStateMailStatus(item, 'sent');
    logger.info(`Kreditlimit-Mail ${item.id} fuer Kunde ${item.customerId} ueber ${delivery.transport} angenommen.`);
    return { processed: true, status: 'sent', transport: delivery.transport, type: item.type };
  } catch (error) {
    const message = asText(error?.message || error).slice(0, 2000) || 'Unbekannter Mailfehler';
    const exhausted = item.attemptCount >= config.creditLimitMail.maxAttempts;
    await runSQLQuerySqlServer(config.sql.database, `
      UPDATE ${OUTBOX_TABLE}
      SET [clm_Status] = N'failed',
          [clm_NextAttemptAt] = ?,
          [clm_LockedAt] = NULL,
          [clm_LastError] = ?,
          [clm_LastModifiedDate] = SYSUTCDATETIME()
      WHERE [clm_ID] = ?
    `, [exhausted ? null : nextRetryDate(item.attemptCount), message, item.id]);
    await updateStateMailStatus(item, 'failed');
    logger.error(`Kreditlimit-Mail ${item.id} fuer Kunde ${item.customerId} fehlgeschlagen`, error);
    return { processed: true, status: 'failed', exhausted, type: item.type };
  }
}

async function processPendingCreditLimitMails(limit = 5) {
  if (workerRunning) return;
  if (!validateOrderMailConfig(config.orderMail, config.mailService).ok) return;
  workerRunning = true;
  try {
    for (let i = 0; i < limit; i += 1) {
      const id = await findNextOutboxId();
      if (!id) break;
      await processCreditLimitMailOutboxById(id);
    }
  } catch (error) {
    logger.error('Kreditlimit-Mail-Outbox konnte nicht verarbeitet werden', error);
  } finally {
    workerRunning = false;
  }
}

function startCreditLimitMailOutboxWorker() {
  if (workerTimer || !config.orderMail.enabled || !config.creditLimitMail.enabled) return;
  const validation = validateOrderMailConfig(config.orderMail, config.mailService);
  if (!validation.ok) {
    logger.warning(`Kreditlimit-Mail-Outbox nicht gestartet: ${validation.reason}.`);
    return;
  }
  const intervalMs = Math.max(10, config.creditLimitMail.retryIntervalSeconds) * 1000;
  void processPendingCreditLimitMails();
  workerTimer = setInterval(() => void processPendingCreditLimitMails(), intervalMs);
  if (typeof workerTimer.unref === 'function') workerTimer.unref();
  logger.info(`Kreditlimit-Mail-Outbox gestartet (Intervall ${Math.round(intervalMs / 1000)}s).`);
}

module.exports = {
  BANK_DETAILS_TYPE,
  CREDIT_LIMIT_TYPE,
  loadOpenTempOrderRows,
  processCreditLimitMailOutboxById,
  processPendingCreditLimitMails,
  queueCreditLimitMails,
  startCreditLimitMailOutboxWorker,
};
