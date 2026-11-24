const config = require('../config');
const logger = require('../logger');
const { runSQLQuerySqlServer, withSqlTransaction } = require('./access');
const { pilotFeaturesForIdentity } = require('../pilot-features');
const { procurementSchemaReady } = require('./linked-procurement');
const { appTableDisplayName, appTableSql } = require('./app-tables');
const { getUserIdentitiesByShortCodes, getUserIdentityByEmail } = require('./users');
const { sendDirectPushNotificationToUser } = require('./push');
const {
  UNFINALIZED_ORDER_REMINDER_SUBJECT,
  formatUnfinalizedOrderReminderBody,
  sendOrderMail,
  validateOrderMailConfig,
} = require('../mail/order-mail');

const TEMP_ORDER_TABLE = appTableSql('tempOrder');
const REMINDER_STATE_TABLE = appTableSql('orderReminderState');
const ORDER_POSITIONS = appTableSql('tempOrderPosition');
const PURCHASES = appTableSql('tempPurchaseOrder');
const PURCHASE_POSITIONS = appTableSql('tempPurchaseOrderPosition');

async function hasOrderLinks() {
  const [row] = await runSQLQuerySqlServer(config.sql.database, `
    SELECT CASE WHEN COL_LENGTH(?, 'tap_offer_position_id') IS NOT NULL
       AND COL_LENGTH(?, 'tap_purchase_position_id') IS NOT NULL THEN 1 ELSE 0 END AS ready
  `, [appTableDisplayName('tempOrderPosition'), appTableDisplayName('tempOrderPosition')]);
  return Number(row?.ready) === 1;
}

function excludeLinkedOrders(tableName, excludeLinks) {
  return excludeLinks ? `AND NOT EXISTS (
    SELECT 1 FROM ${ORDER_POSITIONS} p WHERE p.tap_ta_id=${tableName}.ta_id
      AND (p.tap_purchase_position_id IS NOT NULL OR p.tap_offer_position_id IS NOT NULL)
  )` : '';
}

function standalonePurchaseCountsSql() {
  return `SELECT LOWER(LTRIM(RTRIM(tb_created_by))) AS userShortCode,COUNT_BIG(*) AS openPurchaseCount
    FROM ${PURCHASES} b
    WHERE tb_status=0 AND LOWER(LTRIM(RTRIM(tb_created_by)))='nsc'
      AND NOT EXISTS (SELECT 1 FROM ${PURCHASE_POSITIONS} p WHERE p.tbp_tb_id=b.tb_id AND p.tbp_order_position_id IS NOT NULL)
    GROUP BY LOWER(LTRIM(RTRIM(tb_created_by)))`;
}
const STALE_LOCK_MINUTES = 10;
const DEFAULT_RETRY_DELAY_MINUTES = 10;

let workerTimer = null;
let workerRunning = false;

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeEmail(email) {
  return asText(email).toLowerCase();
}

function isEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(asText(value));
}

function normalizeReminderConfig(reminderConfig = config.unfinalizedOrderReminder) {
  const intervalMinutes = Number(reminderConfig?.intervalMinutes);
  const userEmail = normalizeEmail(reminderConfig?.userEmail);
  const hasConfiguredUser = Boolean(userEmail);
  return {
    intervalMinutes: Number.isInteger(intervalMinutes) && intervalMinutes > 0 ? intervalMinutes : null,
    userEmail,
    hasConfiguredUser,
    enabled: Number.isInteger(intervalMinutes)
      && intervalMinutes > 0
      && (!hasConfiguredUser || isEmailAddress(userEmail)),
  };
}

function buildOpenOrderCountSql(tableName = TEMP_ORDER_TABLE, excludeLinks = true) {
  return `
    SELECT COUNT_BIG(*) AS openCount
    FROM ${tableName}
    WHERE LOWER(LTRIM(RTRIM(COALESCE([ta_CreatedBy], '')))) = ?
      AND COALESCE([ta_Status], 0) IN (0, 3)
      ${excludeLinkedOrders(tableName, excludeLinks)}
  `;
}

function buildOpenOrderCountsByOwnerSql(tableName = TEMP_ORDER_TABLE, excludeLinks = true) {
  return `
    SELECT
      LOWER(LTRIM(RTRIM(COALESCE([ta_CreatedBy], '')))) AS userShortCode,
      COUNT_BIG(*) AS openOrderCount
    FROM ${tableName}
    WHERE COALESCE([ta_Status], 0) IN (0, 3)
      AND LOWER(LTRIM(RTRIM(COALESCE([ta_CreatedBy], '')))) <> ''
    ${excludeLinkedOrders(tableName, excludeLinks)}
    GROUP BY LOWER(LTRIM(RTRIM(COALESCE([ta_CreatedBy], ''))))
  `;
}

function formatReminderPushTitle(language = 'de') {
  return String(language).toLowerCase() === 'en'
    ? 'BMS App - open orders'
    : 'BMS-App - offene Aufträge';
}

function formatReminderPushBody(count, language = 'de') {
  const numericCount = Number(count);
  const countText = Number.isFinite(numericCount)
    ? numericCount.toLocaleString(String(language).toLowerCase() === 'en' ? 'en-GB' : 'de-DE')
    : '-';
  if (String(language).toLowerCase() === 'en') {
    return `You still have ${countText} own order${numericCount === 1 ? '' : 's'} that have not been finally sent to BMS.`;
  }
  return `Du hast noch ${numericCount === 1 ? `${countText} eigenen Auftrag, der` : `${countText} eigene Aufträge, die`} noch nicht final an BMS übertragen wurde${numericCount === 1 ? '' : 'n'}.`;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + Math.max(1, Number(minutes) || 1) * 60 * 1000).toISOString();
}

async function loadOpenOrderCount(shortCode) {
  const rows = await runSQLQuerySqlServer(
    config.sql.database,
    buildOpenOrderCountSql(TEMP_ORDER_TABLE, await hasOrderLinks()),
    [asText(shortCode).toLowerCase()],
  );
  const value = rows?.[0]?.openCount;
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;
}

async function loadOpenOrderCountsByOwner() {
  const rows = await runSQLQuerySqlServer(
    config.sql.database,
    buildOpenOrderCountsByOwnerSql(TEMP_ORDER_TABLE, await hasOrderLinks()),
    [],
  );
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      userShortCode: asText(row.userShortCode).toLowerCase(),
      openOrderCount: Number(row.openOrderCount),
    }))
    .filter((row) => row.userShortCode && Number.isFinite(row.openOrderCount) && row.openOrderCount > 0)
    .map((row) => ({ ...row, openOrderCount: Math.trunc(row.openOrderCount) }));
}

async function claimReminderState({ userEmail, userShortCode, openOrderCount, now = new Date() }) {
  const normalizedEmail = normalizeEmail(userEmail);
  const nowIso = now.toISOString();
  const staleBeforeIso = new Date(now.getTime() - STALE_LOCK_MINUTES * 60 * 1000).toISOString();

  return withSqlTransaction(config.sql.database, async ({ query }) => {
    const existingRows = await query(`
      SELECT TOP 1
        [ors_ID] AS id,
        [ors_LockedAt] AS lockedAt,
        [ors_NextCheckAt] AS nextCheckAt
      FROM ${REMINDER_STATE_TABLE} WITH (UPDLOCK, HOLDLOCK)
      WHERE LOWER(LTRIM(RTRIM([ors_UserEmail]))) = ?
    `, [normalizedEmail]);
    const existing = existingRows.rows?.[0] || null;

    if (existing) {
      const lockedAt = existing.lockedAt ? new Date(existing.lockedAt).getTime() : 0;
      const nextCheckAt = existing.nextCheckAt ? new Date(existing.nextCheckAt).getTime() : 0;
      const isLocked = lockedAt > 0 && lockedAt > new Date(staleBeforeIso).getTime();
      const isNotDue = nextCheckAt > now.getTime();
      if (isLocked || isNotDue) return null;

      await query(`
        UPDATE ${REMINDER_STATE_TABLE}
        SET [ors_UserShortCode] = ?,
            [ors_LastCheckedAt] = ?,
            [ors_LastOpenOrderCount] = ?,
            [ors_LockedAt] = ?,
            [ors_LastError] = NULL,
            [ors_UpdatedAt] = ?
        WHERE [ors_ID] = ?
      `, [
        asText(userShortCode),
        nowIso,
        openOrderCount,
        nowIso,
        nowIso,
        Number(existing.id),
      ]);
      return Number(existing.id);
    }

    const insertedRows = await query(`
      INSERT INTO ${REMINDER_STATE_TABLE} (
        [ors_UserEmail], [ors_UserShortCode], [ors_LastCheckedAt],
        [ors_LastOpenOrderCount], [ors_LockedAt], [ors_UpdatedAt]
      )
      OUTPUT INSERTED.[ors_ID] AS id
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      normalizedEmail,
      asText(userShortCode),
      nowIso,
      openOrderCount,
      nowIso,
      nowIso,
    ]);
    return Number(insertedRows.rows?.[0]?.id || 0) || null;
  });
}

async function completeReminderState(stateId, { openOrderCount, channel, intervalMinutes }) {
  const now = new Date();
  const nowIso = now.toISOString();
  const intervalMs = intervalMinutes * 60_000;
  const nextCheckAt = new Date((Math.floor(now.getTime() / intervalMs) + 1) * intervalMs).toISOString();
  await runSQLQuerySqlServer(config.sql.database, `
    UPDATE ${REMINDER_STATE_TABLE}
    SET [ors_LastOpenOrderCount] = ?,
        [ors_LastChannel] = ?,
        [ors_LastNotifiedAt] = CASE WHEN ? IS NULL THEN [ors_LastNotifiedAt] ELSE ? END,
        [ors_NextCheckAt] = ?,
        [ors_LockedAt] = NULL,
        [ors_LastError] = NULL,
        [ors_UpdatedAt] = ?
    WHERE [ors_ID] = ?
  `, [
    openOrderCount,
    channel || null,
    channel || null,
    nowIso,
    nextCheckAt,
    nowIso,
    Number(stateId),
  ]);
}

async function failReminderState(stateId, errorMessage, intervalMinutes) {
  const now = new Date();
  const nowIso = now.toISOString();
  const retryMinutes = Math.min(
    Math.max(1, Number(intervalMinutes) || DEFAULT_RETRY_DELAY_MINUTES),
    DEFAULT_RETRY_DELAY_MINUTES,
  );
  await runSQLQuerySqlServer(config.sql.database, `
    UPDATE ${REMINDER_STATE_TABLE}
    SET [ors_NextCheckAt] = ?,
        [ors_LockedAt] = NULL,
        [ors_LastError] = ?,
        [ors_UpdatedAt] = ?
    WHERE [ors_ID] = ?
  `, [
    addMinutes(now, retryMinutes),
    asText(errorMessage).slice(0, 2000) || 'Unbekannter Fehler',
    nowIso,
    Number(stateId),
  ]);
}

function mapReminderUser(identity) {
  const email = normalizeEmail(identity?.email);
  const shortCode = asText(identity?.shortCode);
  if (!shortCode) {
    throw new Error(`Mitarbeiterkuerzel fuer Reminder-Benutzer fehlt: ${email || '-'}`);
  }
  if (!isEmailAddress(email)) {
    throw new Error(`Keine gueltige E-Mail-Adresse fuer Reminder-Benutzer: ${email || '-'}`);
  }
  return { email, shortCode, canRemindPurchases: pilotFeaturesForIdentity(identity).linkedProcurement };
}

async function resolveConfiguredReminderUser(settings) {
  const identity = await getUserIdentityByEmail(settings.userEmail);
  return mapReminderUser({
    ...identity,
    email: normalizeEmail(identity?.email) || settings.userEmail,
  });
}

function buildReminderClientMessageId(email, intervalMinutes, now = new Date()) {
  const intervalMs = Math.max(1, Number(intervalMinutes) || 1) * 60 * 1000;
  const slot = Math.floor(now.getTime() / intervalMs);
  return `bms-app:open-order-reminder:${normalizeEmail(email)}:${slot}`;
}

function reminderMessage(openOrderCount, openPurchaseCount, lang) {
  const parts = [];
  if (openOrderCount) parts.push(formatReminderPushBody(openOrderCount, lang));
  if (openPurchaseCount) parts.push(lang === 'en'
    ? `You still have ${openPurchaseCount} open purchase ${openPurchaseCount === 1 ? 'draft' : 'drafts'}.`
    : `Du hast noch ${openPurchaseCount} offene ${openPurchaseCount === 1 ? 'Bestellung' : 'Bestellungen'}.`);
  return parts.join(' ');
}

async function deliverReminder({ email, openOrderCount, openPurchaseCount, intervalMinutes }) {
  const purchaseOnly = !openOrderCount && openPurchaseCount > 0;
  let pushResult;
  try {
    pushResult = await sendDirectPushNotificationToUser({
      email,
      titleByLanguage: (language) => openPurchaseCount
        ? (language === 'en' ? 'BMS App - open drafts' : 'BMS-App - offene Entwürfe')
        : formatReminderPushTitle(language),
      bodyByLanguage: (language) => reminderMessage(openOrderCount, openPurchaseCount, language),
      tag: `unfinalized-order-reminder-${email}`,
      data: { path: purchaseOnly ? 'temp-purchase-orders?status=draft&ownerScope=mine' : 'temp-orders?status=draft&ownerScope=mine' },
    });
  } catch (error) {
    logger.warn(`Push fuer Auftrags-Reminder fehlgeschlagen: ${error?.message || error}`);
    pushResult = { delivered: 0, reason: 'push_error' };
  }

  if (Number(pushResult?.delivered || 0) > 0) {
    return { channel: 'push', pushResult };
  }

  const mailValidation = validateOrderMailConfig(config.orderMail, config.mailService);
  if (!mailValidation.ok) {
    const reason = mailValidation.missing?.length
      ? `E-Mail-Konfiguration fehlt: ${mailValidation.missing.join(', ')}`
      : 'Auftragsmail-Versand ist deaktiviert.';
    throw new Error(`Kein Push verfuegbar und E-Mail-Fallback nicht moeglich: ${reason}`);
  }

  const delivery = await sendOrderMail({
    orderMailConfig: config.orderMail,
    mailServiceConfig: config.mailService,
    recipient: email,
    subject: openPurchaseCount ? 'BMS-App: offene Entwürfe' : UNFINALIZED_ORDER_REMINDER_SUBJECT,
    body: openPurchaseCount
      ? reminderMessage(openOrderCount, openPurchaseCount, 'de')
      : formatUnfinalizedOrderReminderBody({ count: openOrderCount }),
    clientMessageId: buildReminderClientMessageId(email, intervalMinutes),
  });
  return { channel: 'email', transport: delivery.transport, pushResult };
}

async function processReminderForUser({ user, openOrderCount, openPurchaseCount = 0, intervalMinutes }) {
  let stateId = null;
  try {
    stateId = await claimReminderState({
      userEmail: user.email,
      userShortCode: user.shortCode,
      openOrderCount,
    });
    if (!stateId) {
      return { status: 'not_due', email: user.email, openOrderCount };
    }

    if (openOrderCount === 0 && openPurchaseCount === 0) {
      await completeReminderState(stateId, {
        openOrderCount,
        channel: null,
        intervalMinutes,
      });
      logger.info(`Auftrags-Reminder: keine offenen eigenen Auftraege fuer ${user.email}.`);
      return { status: 'nothing_to_notify', email: user.email, openOrderCount };
    }

    const delivery = await deliverReminder({
      email: user.email,
      openOrderCount,
      openPurchaseCount,
      intervalMinutes,
    });
    await completeReminderState(stateId, {
      openOrderCount,
      channel: delivery.channel,
      intervalMinutes,
    });
    logger.info(`Auftrags-Reminder fuer ${user.email}: ${openOrderCount} offene Auftraege per ${delivery.channel}${delivery.transport ? ` ueber ${delivery.transport}` : ''} gemeldet.`);
    return {
      status: 'notified',
      email: user.email,
      openOrderCount,
      channel: delivery.channel,
    };
  } catch (error) {
    if (stateId) {
      try {
        await failReminderState(stateId, error?.message || error, intervalMinutes);
      } catch (stateError) {
        logger.error('Auftrags-Reminder-State konnte nicht freigegeben werden', stateError);
      }
    }
    logger.error(`Auftrags-Reminder fuer ${user.email} konnte nicht verarbeitet werden`, error);
    return {
      status: 'failed',
      email: user.email,
      openOrderCount,
      error: asText(error?.message || error),
    };
  }
}

async function runUnfinalizedOrderReminder() {
  const settings = normalizeReminderConfig();
  if (!settings.enabled) {
    return { enabled: false, status: 'disabled' };
  }
  if (workerRunning) {
    return { enabled: true, status: 'already_running' };
  }

  workerRunning = true;
  try {
    const purchaseCounts = await procurementSchemaReady()
      ? await runSQLQuerySqlServer(config.sql.database, standalonePurchaseCountsSql(), [])
      : [];
    const purchasesByOwner = new Map(purchaseCounts.map((row) => [row.userShortCode, Number(row.openPurchaseCount)]));
    if (settings.hasConfiguredUser) {
      const user = await resolveConfiguredReminderUser(settings);
      const openOrderCount = await loadOpenOrderCount(user.shortCode);
      const result = await processReminderForUser({
        user,
        openOrderCount,
        openPurchaseCount: user.canRemindPurchases ? purchasesByOwner.get(user.shortCode.toLowerCase()) || 0 : 0,
        intervalMinutes: settings.intervalMinutes,
      });
      return { enabled: true, mode: 'test-user', ...result };
    }

    const ownerCounts = await loadOpenOrderCountsByOwner();
    for (const userShortCode of purchasesByOwner.keys()) {
      if (!ownerCounts.some((owner) => owner.userShortCode === userShortCode)) ownerCounts.push({ userShortCode, openOrderCount: 0 });
    }
    const identitiesByShortCode = await getUserIdentitiesByShortCodes(
      ownerCounts.map((row) => row.userShortCode),
    );
    const results = [];

    for (const owner of ownerCounts) {
      const identity = identitiesByShortCode.get(owner.userShortCode);
      if (!identity) {
        logger.warning(`Auftrags-Reminder: kein BMS-FX-Benutzer fuer Mitarbeiterkuerzel ${owner.userShortCode} gefunden.`);
        results.push({
          status: 'user_not_found',
          userShortCode: owner.userShortCode,
          openOrderCount: owner.openOrderCount,
        });
        continue;
      }

      let user;
      try {
        user = mapReminderUser(identity);
      } catch (error) {
        logger.warning(`Auftrags-Reminder: Benutzer ${owner.userShortCode} wird uebersprungen: ${error.message}`);
        results.push({
          status: 'invalid_user',
          userShortCode: owner.userShortCode,
          openOrderCount: owner.openOrderCount,
          error: error.message,
        });
        continue;
      }

      results.push(await processReminderForUser({
        user,
        openOrderCount: owner.openOrderCount,
        openPurchaseCount: user.canRemindPurchases ? purchasesByOwner.get(owner.userShortCode) || 0 : 0,
        intervalMinutes: settings.intervalMinutes,
      }));
    }

    return {
      enabled: true,
      mode: 'all-users',
      status: 'processed',
      users: results,
    };
  } catch (error) {
    logger.error('Auftrags-Reminder konnte nicht verarbeitet werden', error);
    return { enabled: true, status: 'failed', error: asText(error?.message || error) };
  } finally {
    workerRunning = false;
  }
}

function startUnfinalizedOrderReminderWorker() {
  if (workerTimer) return;

  const settings = normalizeReminderConfig();
  if (!settings.intervalMinutes) {
    logger.info('Auftrags-Reminder deaktiviert: BMS_UNFINALIZED_ORDER_REMINDER_INTERVAL_MINUTES fehlt oder ist ungueltig.');
    return;
  }
  if (settings.hasConfiguredUser && !isEmailAddress(settings.userEmail)) {
    logger.warning('Auftrags-Reminder nicht gestartet: BMS_UNFINALIZED_ORDER_REMINDER_USER_EMAIL fehlt oder ist ungueltig.');
    return;
  }

  const intervalMs = settings.intervalMinutes * 60 * 1000;
  workerTimer = setInterval(() => void runUnfinalizedOrderReminder(), intervalMs);
  if (typeof workerTimer.unref === 'function') workerTimer.unref();
  void runUnfinalizedOrderReminder();
  logger.info(`Auftrags-Reminder gestartet (Intervall ${settings.intervalMinutes}min, ${settings.hasConfiguredUser
    ? `Test-Benutzer ${settings.userEmail}`
    : 'automatische Benutzerauflösung ueber BMS FX'}).`);
}

module.exports = {
  standalonePurchaseCountsSql,
  buildOpenOrderCountSql,
  buildOpenOrderCountsByOwnerSql,
  buildReminderClientMessageId,
  formatReminderPushBody,
  formatReminderPushTitle,
  normalizeReminderConfig,
  runUnfinalizedOrderReminder,
  startUnfinalizedOrderReminderWorker,
};
