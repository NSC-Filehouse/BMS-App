const config = require('../config');
const logger = require('../logger');
const { runSQLQuerySqlServer } = require('./access');
const { appTableSql } = require('./app-tables');
const {
  getDatabaseConnectionForIdentityById,
  getMandantsForIdentity,
} = require('./databases');
const { getUserIdentityByShortCode } = require('./users');
const { loadCurrentVl } = require('./vl-completion-mail');
const { sendOrderMail, validateOrderMailConfig } = require('../mail/order-mail');
const { formatDailyVlMailBody } = require('../mail/vl-completion-mail');

const DAILY_VL_OUTBOX_TABLE = appTableSql('dailyVlMailOutbox');
const TEST_MANDANT_ID = 0;
const MAX_SEND_COUNT = 25;
const TIME_ZONE = 'Europe/Berlin';

let workerTimer = null;
let workerRunning = false;
let lastDiscoveryDate = '';
let lastExpirationDate = '';
let schemaWarningLogged = false;

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function isEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(asText(value));
}

function getDailyVlRecipients(companyId) {
  return Number(companyId) === config.dailyVlMail.westpolyCompanyId
    ? [...config.dailyVlMail.westpolyRecipients]
    : [config.dailyVlMail.recipient];
}

function getBerlinDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    weekday: values.weekday,
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function isWeekdayAfterSeven(dateParts) {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(dateParts.weekday)
    && dateParts.hour >= 7;
}

function isMissingObjectError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('invalid object name')
    || message.includes('ungültiger objektname')
    || message.includes('ungueltiger objektname');
}

function isExcludedMandant(companyId) {
  const numericId = Number(companyId);
  return !Number.isSafeInteger(numericId)
    || numericId === TEST_MANDANT_ID
    || config.dailyVlMail.excludedMandantIds.includes(numericId);
}

async function hasDailyVlMail(runDate, companyId) {
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT TOP 1 [vld_ID] AS id
    FROM ${DAILY_VL_OUTBOX_TABLE}
    WHERE [vld_RunDate] = ? AND [vld_CompanyID] = ?
  `, [runDate, Number(companyId)]);
  return Array.isArray(rows) && rows.length > 0;
}

async function queueDailyVlMail(runDate, identity, mandant) {
  const companyId = Number(mandant.firmaId);
  if (isExcludedMandant(companyId)) return { status: 'excluded' };
  if (await hasDailyVlMail(runDate, companyId)) return { status: 'already_queued' };

  const recipients = getDailyVlRecipients(companyId);
  if (!recipients.length || recipients.some((address) => !isEmailAddress(address))) {
    throw new Error(`Ungültige Tages-VL-Empfänger für Mandant ${companyId}.`);
  }

  const database = await getDatabaseConnectionForIdentityById(identity, companyId);
  const vlItems = await loadCurrentVl(database);
  const body = formatDailyVlMailBody({
    vlItems,
    mandantName: database.name,
    mandantShortName: database.shortName,
  });
  const subjectName = asText(database.name || mandant.name);
  if (!subjectName) throw new Error(`Mandant ${companyId} hat keinen Namen für den Betreff.`);

  const rows = await runSQLQuerySqlServer(config.sql.database, `
    INSERT INTO ${DAILY_VL_OUTBOX_TABLE} (
      [vld_RunDate], [vld_CompanyID], [vld_CompanyName], [vld_CompanyShortName],
      [vld_RecipientsJson], [vld_Subject], [vld_Body], [vld_Status], [vld_AttemptCount]
    )
    OUTPUT INSERTED.[vld_ID] AS id
    SELECT ?, ?, ?, ?, ?, ?, ?, N'pending', 0
    WHERE NOT EXISTS (
      SELECT 1
      FROM ${DAILY_VL_OUTBOX_TABLE} WITH (UPDLOCK, HOLDLOCK)
      WHERE [vld_RunDate] = ? AND [vld_CompanyID] = ?
    )
  `, [
    runDate,
    companyId,
    database.name,
    database.shortName,
    JSON.stringify(recipients),
    `VL_${subjectName}`,
    body,
    runDate,
    companyId,
  ]);
  return { status: rows?.length ? 'queued' : 'already_queued' };
}

async function queueTodayVlMails(runDate) {
  const identity = await getUserIdentityByShortCode('NSC');
  if (!identity) throw new Error('NSC konnte für die Mandantenermittlung nicht aufgelöst werden.');

  const mandants = await getMandantsForIdentity(identity);
  if (!Array.isArray(mandants) || !mandants.length) {
    throw new Error('Die Mandantenliste für NSC ist leer; der Tageslauf wird erneut versucht.');
  }
  let failed = false;
  let queued = 0;
  for (const mandant of (Array.isArray(mandants) ? mandants : [])) {
    const companyId = Number(mandant?.firmaId);
    if (isExcludedMandant(companyId)) continue;
    try {
      const result = await queueDailyVlMail(runDate, identity, mandant);
      if (result.status === 'queued') queued += 1;
    } catch (error) {
      failed = true;
      logger.error(`Tages-VL für Mandant ${companyId} konnte nicht vorbereitet werden.`, error);
    }
  }
  return { failed, queued, mandantCount: mandants.length };
}

async function expireOlderVlMails(today) {
  await runSQLQuerySqlServer(config.sql.database, `
    UPDATE ${DAILY_VL_OUTBOX_TABLE}
    SET [vld_Status] = N'skipped',
        [vld_NextAttemptAt] = NULL,
        [vld_LockedAt] = NULL,
        [vld_LastError] = N'Tagesversand veraltet; keine rückwirkende VL versendet.',
        [vld_LastModifiedDate] = SYSUTCDATETIME()
    WHERE [vld_RunDate] < ?
      AND [vld_Status] IN (N'pending', N'failed', N'sending')
  `, [today]);
}

async function claimDailyVlMail(outboxId, today) {
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    UPDATE ${DAILY_VL_OUTBOX_TABLE} WITH (ROWLOCK, UPDLOCK, READPAST)
    SET [vld_Status] = N'sending',
        [vld_AttemptCount] = [vld_AttemptCount] + 1,
        [vld_LockedAt] = SYSUTCDATETIME(),
        [vld_LastModifiedDate] = SYSUTCDATETIME()
    OUTPUT
      INSERTED.[vld_ID] AS id,
      INSERTED.[vld_RunDate] AS runDate,
      INSERTED.[vld_CompanyID] AS companyId,
      INSERTED.[vld_CompanyName] AS companyName,
      INSERTED.[vld_RecipientsJson] AS recipientsJson,
      INSERTED.[vld_Subject] AS subject,
      INSERTED.[vld_Body] AS body,
      INSERTED.[vld_AttemptCount] AS attemptCount
    WHERE [vld_ID] = ?
      AND [vld_RunDate] = ?
      AND [vld_AttemptCount] < ?
      AND (
        [vld_Status] IN (N'pending', N'failed')
        OR ([vld_Status] = N'sending' AND [vld_LockedAt] < DATEADD(MINUTE, -10, SYSUTCDATETIME()))
      )
      AND ([vld_NextAttemptAt] IS NULL OR [vld_NextAttemptAt] <= SYSUTCDATETIME())
  `, [outboxId, today, config.orderMail.maxAttempts]);
  if (!Array.isArray(rows) || !rows.length) return null;
  const row = rows[0];
  let recipients = [];
  try {
    const parsed = JSON.parse(String(row.recipientsJson || '[]'));
    if (Array.isArray(parsed)) recipients = parsed.map((address) => asText(address).toLowerCase()).filter(Boolean);
  } catch {
    recipients = [];
  }
  return {
    id: Number(row.id),
    runDate: asText(row.runDate).slice(0, 10),
    companyId: Number(row.companyId),
    companyName: asText(row.companyName),
    recipients,
    subject: asText(row.subject),
    body: String(row.body || ''),
    attemptCount: Number(row.attemptCount || 0),
  };
}

async function findNextDailyVlMail(today) {
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT TOP 1 [vld_ID] AS id
    FROM ${DAILY_VL_OUTBOX_TABLE} WITH (READPAST)
    WHERE [vld_RunDate] = ?
      AND [vld_AttemptCount] < ?
      AND (
        [vld_Status] IN (N'pending', N'failed')
        OR ([vld_Status] = N'sending' AND [vld_LockedAt] < DATEADD(MINUTE, -10, SYSUTCDATETIME()))
      )
      AND ([vld_NextAttemptAt] IS NULL OR [vld_NextAttemptAt] <= SYSUTCDATETIME())
    ORDER BY COALESCE([vld_NextAttemptAt], [vld_CreateDate]) ASC, [vld_ID] ASC
  `, [today, config.orderMail.maxAttempts]);
  return Array.isArray(rows) && rows.length ? Number(rows[0].id) : null;
}

function nextRetryDate(attemptCount) {
  const minutes = Math.min(60, Math.max(1, 2 ** Math.max(0, attemptCount - 1)));
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

async function processDailyVlMail(outboxId, today) {
  const item = await claimDailyVlMail(outboxId, today);
  if (!item) return { status: 'not_claimed' };

  try {
    const delivery = await sendOrderMail({
      orderMailConfig: config.orderMail,
      mailServiceConfig: config.mailService,
      recipients: item.recipients,
      subject: item.subject,
      body: item.body,
      clientMessageId: `bms-app:daily-vl:${item.runDate}:${item.companyId}`,
      isBodyHtml: true,
    });
    await runSQLQuerySqlServer(config.sql.database, `
      UPDATE ${DAILY_VL_OUTBOX_TABLE}
      SET [vld_Status] = N'sent',
          [vld_SentAt] = SYSUTCDATETIME(),
          [vld_NextAttemptAt] = NULL,
          [vld_LockedAt] = NULL,
          [vld_LastError] = NULL,
          [vld_LastModifiedDate] = SYSUTCDATETIME()
      WHERE [vld_ID] = ?
    `, [item.id]);
    logger.info(`Tages-VL für ${item.companyName} (${item.companyId}) über ${delivery.transport} an ${item.recipients.join(', ')} angenommen.`);
    return { status: 'sent', companyId: item.companyId };
  } catch (error) {
    const message = asText(error?.message || error).slice(0, 2000) || 'Unbekannter Mail-Fehler';
    const exhausted = item.attemptCount >= config.orderMail.maxAttempts;
    await runSQLQuerySqlServer(config.sql.database, `
      UPDATE ${DAILY_VL_OUTBOX_TABLE}
      SET [vld_Status] = N'failed',
          [vld_NextAttemptAt] = ?,
          [vld_LockedAt] = NULL,
          [vld_LastError] = ?,
          [vld_LastModifiedDate] = SYSUTCDATETIME()
      WHERE [vld_ID] = ?
    `, [exhausted ? null : nextRetryDate(item.attemptCount), message, item.id]);
    logger.error(`Tages-VL für ${item.companyName} (${item.companyId}) an ${item.recipients.join(', ')} fehlgeschlagen.`, error);
    return { status: 'failed', companyId: item.companyId, exhausted };
  }
}

async function processPendingDailyVlMails(today) {
  let processed = 0;
  for (let index = 0; index < MAX_SEND_COUNT; index += 1) {
    const outboxId = await findNextDailyVlMail(today);
    if (!outboxId) break;
    await processDailyVlMail(outboxId, today);
    processed += 1;
  }
  return processed;
}

async function runDailyVlMailTick() {
  if (workerRunning) return;
  workerRunning = true;
  try {
    const dateParts = getBerlinDateParts();
    if (lastExpirationDate !== dateParts.dateKey) {
      await expireOlderVlMails(dateParts.dateKey);
      lastExpirationDate = dateParts.dateKey;
    }

    if (!isWeekdayAfterSeven(dateParts)) return;

    if (lastDiscoveryDate !== dateParts.dateKey) {
      const result = await queueTodayVlMails(dateParts.dateKey);
      if (!result.failed) lastDiscoveryDate = dateParts.dateKey;
    }

    await processPendingDailyVlMails(dateParts.dateKey);
    schemaWarningLogged = false;
  } catch (error) {
    if (isMissingObjectError(error)) {
      if (!schemaWarningLogged) {
        logger.warn('Tages-VL-Versand wartet auf die Migration add_daily_vl_mail.sql.');
        schemaWarningLogged = true;
      }
    } else {
      logger.error('Tages-VL-Versand konnte nicht ausgeführt werden.', error);
    }
  } finally {
    workerRunning = false;
  }
}

function startDailyVlMailWorker() {
  if (workerTimer || !config.dailyVlMail.enabled || !config.orderMail.enabled) return;
  const allRecipients = [config.dailyVlMail.recipient, ...config.dailyVlMail.westpolyRecipients];
  if (!config.dailyVlMail.westpolyRecipients.length || allRecipients.some((address) => !isEmailAddress(address))) {
    logger.warn('Tages-VL-Versand nicht gestartet: eine konfigurierte Empfängeradresse ist ungültig.');
    return;
  }
  const validation = validateOrderMailConfig(config.orderMail, config.mailService);
  if (!validation.ok) {
    logger.warn(`Tages-VL-Versand nicht gestartet: ${validation.reason}.`);
    return;
  }

  const intervalMs = Math.max(10, config.dailyVlMail.intervalSeconds) * 1000;
  void runDailyVlMailTick();
  workerTimer = setInterval(() => void runDailyVlMailTick(), intervalMs);
  if (typeof workerTimer.unref === 'function') workerTimer.unref();
  logger.info(`Tages-VL-Worker gestartet (werktags 07:00 ${TIME_ZONE}, Intervall ${Math.round(intervalMs / 1000)}s).`);
}

module.exports = {
  getBerlinDateParts,
  getDailyVlRecipients,
  isExcludedMandant,
  isWeekdayAfterSeven,
  processDailyVlMail,
  queueTodayVlMails,
  runDailyVlMailTick,
  startDailyVlMailWorker,
};
