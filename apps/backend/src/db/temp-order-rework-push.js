const config = require('../config');
const logger = require('../logger');
const { runSQLQuerySqlServer, withSqlTransaction } = require('./access');
const { appTableSql } = require('./app-tables');
const { getUserIdentityByShortCode } = require('./users');
const { sendDirectPushNotificationToUser } = require('./push');

const TEMP_ORDER_TABLE = appTableSql('tempOrder');
const REWORK_PUSH_STATE_TABLE = appTableSql('tempOrderReworkPushState');
const NEEDS_REWORK_STATUS = 3;
const MAX_SCAN_COUNT = 1000;
const STALE_LOCK_SECONDS = 10 * 60;

let workerTimer = null;
let workerRunning = false;
let schemaWarningLogged = false;

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeEmail(email) {
  return asText(email).toLowerCase();
}

function normalizeStatus(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : 0;
}

function normalizeComment(value) {
  const comment = asText(value);
  return comment || null;
}

function normalizeReworkPushConfig(reworkConfig = config.tempOrderReworkPush) {
  const intervalSeconds = Number(reworkConfig?.intervalSeconds);
  return {
    intervalSeconds: Number.isInteger(intervalSeconds) && intervalSeconds > 0 ? intervalSeconds : null,
    enabled: Number.isInteger(intervalSeconds) && intervalSeconds > 0,
  };
}

function buildReworkOrderScanSql(tableName = TEMP_ORDER_TABLE) {
  return `
    SELECT TOP ${MAX_SCAN_COUNT}
      [ta_id] AS orderId,
      [ta_company_id] AS companyId,
      COALESCE([ta_Status], 0) AS orderStatus,
      [ta_LastModifiedDate] AS lastModifiedDate,
      [ta_return_comment] AS returnComment,
      [ta_CreatedBy] AS createdBy
    FROM ${tableName}
    WHERE COALESCE([ta_Status], 0) IN (0, 1, 2, 3)
    ORDER BY COALESCE([ta_LastModifiedDate], CONVERT(datetime2, '19000101')) ASC, [ta_id] ASC
  `;
}

function buildReworkPushTitle(language = 'de') {
  return String(language).toLowerCase() === 'en'
    ? 'BMS App - order returned'
    : 'BMS-App - Auftrag zur Nachbearbeitung';
}

function buildReworkPushBody({ returnComment } = {}, language = 'de') {
  const safeLanguage = String(language).toLowerCase() === 'en' ? 'en' : 'de';
  const comment = asText(returnComment).slice(0, 1500);
  if (safeLanguage === 'en') {
    return `Order returned for rework: ${comment || 'No reason was provided.'}`;
  }
  return `Auftrag zur Nachbearbeitung zur\u00FCck erhalten: ${comment || 'Kein R\u00FCckgabegrund angegeben.'}`;
}

function isMissingReworkSchemaError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('invalid object name') && message.includes('temporderreworkpushstate')
  ) || message.includes('invalid column name') && message.includes('ta_return_comment');
}

function isLockActive(lockedAt, now, staleSeconds = STALE_LOCK_SECONDS) {
  const lockedMs = lockedAt ? new Date(lockedAt).getTime() : 0;
  return Number.isFinite(lockedMs) && lockedMs > 0
    && lockedMs > now.getTime() - Math.max(1, staleSeconds) * 1000;
}

function sameComment(left, right) {
  return normalizeComment(left) === normalizeComment(right);
}

function shouldNotifyRework({
  previousStatus,
  previousReturnComment,
  lastNotifiedAt,
  currentStatus,
  currentReturnComment,
} = {}) {
  if (normalizeStatus(currentStatus) !== NEEDS_REWORK_STATUS) return false;
  return normalizeStatus(previousStatus) !== NEEDS_REWORK_STATUS
    || !sameComment(previousReturnComment, currentReturnComment)
    || !lastNotifiedAt;
}

async function claimReworkNotification(order, now = new Date()) {
  const orderId = Number(order?.orderId);
  if (!Number.isFinite(orderId)) return null;

  const companyId = Number(order?.companyId);
  const currentStatus = normalizeStatus(order?.orderStatus);
  const returnComment = normalizeComment(order?.returnComment);
  const nowIso = now.toISOString();

  return withSqlTransaction(config.sql.database, async ({ query }) => {
    const stateRows = await query(`
      SELECT TOP 1
        [torps_ID] AS id,
        [torps_LastStatus] AS lastStatus,
        [torps_LastReturnComment] AS lastReturnComment,
        [torps_LastNotifiedAt] AS lastNotifiedAt,
        [torps_LockedAt] AS lockedAt
      FROM ${REWORK_PUSH_STATE_TABLE} WITH (UPDLOCK, HOLDLOCK)
      WHERE [torps_OrderID] = ?
    `, [orderId]);
    const state = stateRows.rows?.[0] || null;

    if (state && isLockActive(state.lockedAt, now)) {
      return null;
    }

    if (!state) {
      const insertedRows = await query(`
        INSERT INTO ${REWORK_PUSH_STATE_TABLE} (
          [torps_OrderID], [torps_CompanyID], [torps_LastStatus],
          [torps_LastModifiedDate], [torps_LastReturnComment], [torps_LockedAt],
          [torps_LastCheckedAt], [torps_UpdatedAt]
        )
        OUTPUT INSERTED.[torps_ID] AS id
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        orderId,
        Number.isFinite(companyId) ? companyId : null,
        currentStatus,
        order?.lastModifiedDate || null,
        returnComment,
        currentStatus === NEEDS_REWORK_STATUS ? nowIso : null,
        nowIso,
        nowIso,
      ]);

      if (currentStatus !== NEEDS_REWORK_STATUS) return null;
      return {
        stateId: Number(insertedRows.rows?.[0]?.id || 0),
        orderId,
        companyId,
        returnComment,
      };
    }

    const previousStatus = normalizeStatus(state.lastStatus);
    if (currentStatus !== NEEDS_REWORK_STATUS) {
      await query(`
        UPDATE ${REWORK_PUSH_STATE_TABLE}
        SET [torps_CompanyID] = ?,
            [torps_LastStatus] = ?,
            [torps_LastModifiedDate] = ?,
            [torps_LastReturnComment] = ?,
            [torps_LastNotifiedComment] = NULL,
            [torps_LastNotifiedAt] = NULL,
            [torps_LockedAt] = NULL,
            [torps_LastCheckedAt] = ?,
            [torps_LastError] = NULL,
            [torps_UpdatedAt] = ?
        WHERE [torps_ID] = ?
      `, [
        Number.isFinite(companyId) ? companyId : null,
        currentStatus,
        order?.lastModifiedDate || null,
        returnComment,
        nowIso,
        nowIso,
        Number(state.id),
      ]);
      return null;
    }

    const needsNotification = shouldNotifyRework({
      previousStatus,
      previousReturnComment: state.lastReturnComment,
      lastNotifiedAt: state.lastNotifiedAt,
      currentStatus,
      currentReturnComment: returnComment,
    });

    await query(`
      UPDATE ${REWORK_PUSH_STATE_TABLE}
      SET [torps_CompanyID] = ?,
          [torps_LastStatus] = ?,
          [torps_LastModifiedDate] = ?,
          [torps_LastReturnComment] = ?,
          [torps_LockedAt] = ?,
          [torps_LastCheckedAt] = ?,
          [torps_LastError] = NULL,
          [torps_UpdatedAt] = ?
      WHERE [torps_ID] = ?
    `, [
      Number.isFinite(companyId) ? companyId : null,
      currentStatus,
      order?.lastModifiedDate || null,
      returnComment,
      needsNotification ? nowIso : null,
      nowIso,
      nowIso,
      Number(state.id),
    ]);

    if (!needsNotification) return null;
    return {
      stateId: Number(state.id),
      orderId,
      companyId,
      returnComment,
    };
  });
}

async function completeReworkNotification(stateId, event, pushResult) {
  const delivered = Number(pushResult?.delivered || 0);
  const nowIso = new Date().toISOString();
  if (delivered > 0) {
    await runSQLQuerySqlServer(config.sql.database, `
      UPDATE ${REWORK_PUSH_STATE_TABLE}
      SET [torps_LastNotifiedComment] = ?,
          [torps_LastNotifiedAt] = ?,
          [torps_LockedAt] = NULL,
          [torps_LastError] = NULL,
          [torps_UpdatedAt] = ?
      WHERE [torps_ID] = ?
    `, [normalizeComment(event?.returnComment), nowIso, nowIso, Number(stateId)]);
    return;
  }

  await runSQLQuerySqlServer(config.sql.database, `
    UPDATE ${REWORK_PUSH_STATE_TABLE}
    SET [torps_LockedAt] = NULL,
        [torps_LastError] = ?,
        [torps_UpdatedAt] = ?
    WHERE [torps_ID] = ?
  `, [asText(pushResult?.reason) || 'Kein aktives Push-Abonnement.', nowIso, Number(stateId)]);
}

async function loadReworkCandidates() {
  return runSQLQuerySqlServer(config.sql.database, buildReworkOrderScanSql(), []);
}

async function processReworkCandidate(order, identityCache) {
  const event = await claimReworkNotification(order);
  if (!event) return { status: 'not_due' };

  try {
    const cacheKey = `${Number(order?.companyId) || 0}:${asText(order?.createdBy).toLowerCase()}`;
    let identity = identityCache.get(cacheKey);
    if (identity === undefined) {
      identity = await getUserIdentityByShortCode(order?.createdBy, order?.companyId);
      identityCache.set(cacheKey, identity || null);
    }

    const email = normalizeEmail(identity?.email);
    if (!email) {
      throw new Error(`Kein Benutzerkonto fuer Auftrag ${event.orderId} gefunden.`);
    }

    const pushResult = await sendDirectPushNotificationToUser({
      email,
      titleByLanguage: (language) => buildReworkPushTitle(language),
      bodyByLanguage: (language) => buildReworkPushBody({ returnComment: event.returnComment }, language),
      tag: `temp-order-rework-${event.companyId}-${event.orderId}`,
      data: { path: `temp-orders/${encodeURIComponent(String(event.orderId))}` },
    });
    await completeReworkNotification(event.stateId, event, pushResult);

    if (Number(pushResult?.delivered || 0) > 0) {
      logger.info(`Nachbearbeitungs-Push fuer Auftrag ${event.orderId} an ${email} gesendet.`);
      return { status: 'notified', orderId: event.orderId, email, pushResult };
    }
    return { status: 'not_delivered', orderId: event.orderId, email, pushResult };
  } catch (error) {
    try {
      await completeReworkNotification(event.stateId, event, {
        delivered: 0,
        reason: asText(error?.message || error) || 'Unbekannter Fehler',
      });
    } catch (stateError) {
      logger.error(`Nachbearbeitungs-Push-State fuer Auftrag ${event.orderId} konnte nicht aktualisiert werden`, stateError);
    }
    logger.warn(`Nachbearbeitungs-Push fuer Auftrag ${event.orderId} fehlgeschlagen: ${error?.message || error}`);
    return { status: 'failed', orderId: event.orderId, error: asText(error?.message || error) };
  }
}

async function runTempOrderReworkPush() {
  const settings = normalizeReworkPushConfig();
  if (!settings.enabled) return { enabled: false, status: 'disabled' };
  if (workerRunning) return { enabled: true, status: 'already_running' };

  workerRunning = true;
  try {
    const candidates = await loadReworkCandidates();
    const identityCache = new Map();
    const results = [];
    for (const candidate of (Array.isArray(candidates) ? candidates : [])) {
      results.push(await processReworkCandidate(candidate, identityCache));
    }
    return {
      enabled: true,
      status: 'processed',
      scanned: Array.isArray(candidates) ? candidates.length : 0,
      notified: results.filter((item) => item.status === 'notified').length,
      results,
    };
  } catch (error) {
    if (isMissingReworkSchemaError(error)) {
      if (!schemaWarningLogged) {
        logger.warn('Temp-Order-Rueckgabe-Push ist deaktiviert: Migration add_temp_order_return_comment_and_push_state.sql fehlt.');
        schemaWarningLogged = true;
      }
      return { enabled: true, status: 'schema_missing' };
    }
    logger.error('Temp-Order-Rueckgabe-Push konnte nicht verarbeitet werden', error);
    return { enabled: true, status: 'failed', error: asText(error?.message || error) };
  } finally {
    workerRunning = false;
  }
}

function startTempOrderReworkPushWorker() {
  if (workerTimer) return;

  const settings = normalizeReworkPushConfig();
  if (!settings.enabled) {
    logger.info('Temp-Order-Rueckgabe-Push deaktiviert: Intervall fehlt oder ist ungueltig.');
    return;
  }

  const intervalMs = settings.intervalSeconds * 1000;
  workerTimer = setInterval(() => void runTempOrderReworkPush(), intervalMs);
  if (typeof workerTimer.unref === 'function') workerTimer.unref();
  void runTempOrderReworkPush();
  logger.info(`Temp-Order-Rueckgabe-Push gestartet (Intervall ${settings.intervalSeconds}s).`);
}

module.exports = {
  buildReworkOrderScanSql,
  buildReworkPushBody,
  buildReworkPushTitle,
  normalizeReworkPushConfig,
  shouldNotifyRework,
  runTempOrderReworkPush,
  startTempOrderReworkPushWorker,
};
