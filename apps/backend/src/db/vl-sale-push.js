const config = require('../config');
const { runSQLQuerySqlServer, withSqlTransaction } = require('./access');
const { appTableSql } = require('./app-tables');
const { sendPushNotificationsForTimelineEntries } = require('./push');

const VL_SALE_PUSH_STATE_TABLE = appTableSql('vlSalePushState');
const MAX_ATTEMPTS = 10;
const STALE_LOCK_SECONDS = 10 * 60;

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeEmail(email) {
  return asText(email).toLowerCase();
}

function isLockActive(lockedAt, now) {
  const lockedMs = lockedAt ? new Date(lockedAt).getTime() : 0;
  return Number.isFinite(lockedMs) && lockedMs > now.getTime() - STALE_LOCK_SECONDS * 1000;
}

function isMissingVlSalePushStateError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('vlsalepushstate') && (
    message.includes('invalid object name')
    || message.includes('ungültiger objektname')
    || message.includes('ungueltiger objektname')
  );
}

function nextRetryDate(attemptCount) {
  const minutes = Math.min(60, Math.max(1, 2 ** Math.max(0, attemptCount - 1)));
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function buildSaleTimelineEntries({ order, positions, database, salesRepresentative, userEmail, nowIso }) {
  const timestamp = nowIso || new Date().toISOString();
  const shortCode = asText(salesRepresentative);
  return (Array.isArray(positions) ? positions : []).map((position) => ({
    createdAt: timestamp,
    mandant: database?.name,
    mandantShortName: database?.shortName || null,
    companyId: Number(order?.companyId),
    userEmail: normalizeEmail(userEmail) || null,
    userShortCode: shortCode,
    type: 'order',
    product: asText(position?.article) || asText(position?.beNumber),
    productId: asText(position?.article) || asText(position?.beNumber),
    beNumber: asText(position?.beNumber),
    amountKg: asNumber(position?.amountInKg),
    unit: asText(position?.unit) || 'kg',
    referenceId: String(order?.id),
    payloadJson: {
      tempOrderId: Number(order?.id),
      erpOrderIndex: asText(order?.orderIndex) || null,
      salesRepresentativeShortCode: shortCode || null,
    },
  }));
}

async function claimVlSalePush({ order, salesRepresentative, now = new Date() }) {
  const orderId = Number(order?.id);
  const companyId = Number(order?.companyId);
  if (!Number.isFinite(orderId) || !Number.isFinite(companyId)) return null;

  const orderIndex = asText(order?.orderIndex) || null;
  const shortCode = asText(salesRepresentative) || null;
  const nowIso = now.toISOString();

  return withSqlTransaction(config.sql.database, async ({ query }) => {
    const stateRows = await query(`
      SELECT TOP 1
        [vps_ID] AS id,
        [vps_Status] AS status,
        [vps_AttemptCount] AS attemptCount,
        [vps_NextAttemptAt] AS nextAttemptAt,
        [vps_LockedAt] AS lockedAt
      FROM ${VL_SALE_PUSH_STATE_TABLE} WITH (UPDLOCK, HOLDLOCK)
      WHERE [vps_OrderID] = ?
    `, [orderId]);
    const state = stateRows.rows?.[0] || null;

    if (state) {
      const status = asText(state.status).toLowerCase();
      if (status === 'sent' || status === 'skipped') return null;
      if (isLockActive(state.lockedAt, now)) return null;
      if (state.nextAttemptAt && new Date(state.nextAttemptAt).getTime() > now.getTime()) return null;
      if (Number(state.attemptCount || 0) >= MAX_ATTEMPTS) {
        await query(`
          UPDATE ${VL_SALE_PUSH_STATE_TABLE}
          SET [vps_Status] = N'skipped',
              [vps_LockedAt] = NULL,
              [vps_LastError] = ?,
              [vps_UpdatedAt] = ?
          WHERE [vps_ID] = ?
        `, ['Maximale Push-Versuche erreicht.', nowIso, Number(state.id)]);
        return null;
      }

      const attemptCount = Number(state.attemptCount || 0) + 1;
      await query(`
        UPDATE ${VL_SALE_PUSH_STATE_TABLE}
        SET [vps_CompanyID] = ?,
            [vps_OrderIndex] = ?,
            [vps_SalesRepresentative] = ?,
            [vps_Status] = N'sending',
            [vps_AttemptCount] = ?,
            [vps_NextAttemptAt] = NULL,
            [vps_LockedAt] = ?,
            [vps_LastError] = NULL,
            [vps_UpdatedAt] = ?
        WHERE [vps_ID] = ?
      `, [companyId, orderIndex, shortCode, attemptCount, nowIso, nowIso, Number(state.id)]);
      return { stateId: Number(state.id), attemptCount };
    }

    const insertedRows = await query(`
      INSERT INTO ${VL_SALE_PUSH_STATE_TABLE} (
        [vps_OrderID], [vps_CompanyID], [vps_OrderIndex], [vps_SalesRepresentative],
        [vps_Status], [vps_AttemptCount], [vps_LockedAt], [vps_UpdatedAt]
      )
      OUTPUT INSERTED.[vps_ID] AS id
      VALUES (?, ?, ?, ?, N'sending', 1, ?, ?)
    `, [orderId, companyId, orderIndex, shortCode, nowIso, nowIso]);
    return { stateId: Number(insertedRows.rows?.[0]?.id || 0), attemptCount: 1 };
  });
}

async function completeVlSalePush(stateId, attemptCount, pushResult) {
  const delivered = Number(pushResult?.delivered || 0);
  const subscriptions = Number(pushResult?.subscriptions || 0);
  const failed = Number(pushResult?.failed || 0);
  const reason = asText(pushResult?.reason) || 'unbekannter_push_fehler';
  const nowIso = new Date().toISOString();

  if (delivered > 0) {
    await runSQLQuerySqlServer(config.sql.database, `
      UPDATE ${VL_SALE_PUSH_STATE_TABLE}
      SET [vps_Status] = N'sent',
          [vps_NextAttemptAt] = NULL,
          [vps_LockedAt] = NULL,
          [vps_LastError] = NULL,
          [vps_SentAt] = ?,
          [vps_UpdatedAt] = ?
      WHERE [vps_ID] = ?
    `, [nowIso, nowIso, Number(stateId)]);
    return;
  }

  if (reason === 'no_active_subscription' || reason === 'no_entries') {
    await runSQLQuerySqlServer(config.sql.database, `
      UPDATE ${VL_SALE_PUSH_STATE_TABLE}
      SET [vps_Status] = N'skipped',
          [vps_NextAttemptAt] = NULL,
          [vps_LockedAt] = NULL,
          [vps_LastError] = ?,
          [vps_UpdatedAt] = ?
      WHERE [vps_ID] = ?
    `, ['Kein aktives Push-Abonnement.', nowIso, Number(stateId)]);
    return;
  }

  const exhausted = Number(attemptCount || 0) >= MAX_ATTEMPTS;
  await runSQLQuerySqlServer(config.sql.database, `
    UPDATE ${VL_SALE_PUSH_STATE_TABLE}
    SET [vps_Status] = ?,
        [vps_NextAttemptAt] = ?,
        [vps_LockedAt] = NULL,
        [vps_LastError] = ?,
        [vps_UpdatedAt] = ?
    WHERE [vps_ID] = ?
  `, [
    exhausted ? 'skipped' : 'failed',
    exhausted ? null : nextRetryDate(Number(attemptCount || 0)),
    `${reason}${failed ? ` (${failed} fehlgeschlagen)` : ''}`.slice(0, 2000),
    nowIso,
    Number(stateId),
  ]);
}

async function skipVlSalePush(stateId, reason) {
  await runSQLQuerySqlServer(config.sql.database, `
    UPDATE ${VL_SALE_PUSH_STATE_TABLE}
    SET [vps_Status] = N'skipped',
        [vps_NextAttemptAt] = NULL,
        [vps_LockedAt] = NULL,
        [vps_LastError] = ?,
        [vps_UpdatedAt] = SYSUTCDATETIME()
    WHERE [vps_ID] = ?
  `, [asText(reason) || 'Auftrag nicht mehr im Status 2.', Number(stateId)]);
}

async function loadPendingVlSalePushes(limit = 10) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 100));
  return runSQLQuerySqlServer(config.sql.database, `
    SELECT TOP ${safeLimit}
      [vps_ID] AS stateId,
      [vps_OrderID] AS orderId
    FROM ${VL_SALE_PUSH_STATE_TABLE} WITH (READPAST)
    WHERE [vps_AttemptCount] <= ?
      AND (
        [vps_Status] IN (N'pending', N'failed')
        OR ([vps_Status] = N'sending' AND [vps_LockedAt] < DATEADD(MINUTE, -10, SYSUTCDATETIME()))
      )
      AND ([vps_NextAttemptAt] IS NULL OR [vps_NextAttemptAt] <= SYSUTCDATETIME())
    ORDER BY COALESCE([vps_NextAttemptAt], [vps_CreatedAt]) ASC, [vps_ID] ASC
  `, [MAX_ATTEMPTS]);
}

module.exports = {
  buildSaleTimelineEntries,
  claimVlSalePush,
  completeVlSalePush,
  isMissingVlSalePushStateError,
  loadPendingVlSalePushes,
  skipVlSalePush,
};
