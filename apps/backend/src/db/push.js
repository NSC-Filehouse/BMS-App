const webpush = require('web-push');
const config = require('../config');
const logger = require('../logger');
const { runSQLQuerySqlServer } = require('./access');
const { getMandantsForUser } = require('./databases');
const { getUserIdentityByEmail } = require('./users');

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function asBoolBit(value) {
  return value ? 1 : 0;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function asCompanyId(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function isFilehouseEmail(email) {
  const value = normalizeEmail(email);
  return value.endsWith('filehouse') || value.endsWith('@filehouse') || value.includes('@filehouse.');
}

async function getPushEligibleMandantsForUser(email) {
  const normalizedEmail = normalizeEmail(email);
  const [mandants, identity] = await Promise.all([
    getMandantsForUser(normalizedEmail),
    getUserIdentityByEmail(normalizedEmail).catch(() => null),
  ]);

  const mainCompanyId = asCompanyId(identity?.mainCompanyId);
  if (!mainCompanyId) {
    return mandants;
  }

  const primaryMandants = mandants.filter((item) => asCompanyId(item.firmaId) === mainCompanyId);
  return primaryMandants.length ? primaryMandants : mandants;
}

async function canUserReceivePushForCompany(email, companyId) {
  const normalizedEmail = normalizeEmail(email);
  const targetCompanyId = asCompanyId(companyId);
  if (!normalizedEmail || !targetCompanyId) return false;

  const identity = await getUserIdentityByEmail(normalizedEmail).catch(() => null);
  const mainCompanyId = asCompanyId(identity?.mainCompanyId);
  if (!mainCompanyId) {
    return true;
  }

  return mainCompanyId === targetCompanyId;
}

function ensureVapidConfigured() {
  if (!config.push.vapidPublicKey || !config.push.vapidPrivateKey || !config.push.vapidSubject) {
    throw new Error('Web Push VAPID configuration is missing.');
  }

  webpush.setVapidDetails(
    config.push.vapidSubject,
    config.push.vapidPublicKey,
    config.push.vapidPrivateKey,
  );
}

function isMissingPushTableError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (msg.includes('tblbmsapp_pushsubscription') || msg.includes('tblbmsapp_pushmandantsetting')) && (
    msg.includes('invalid object name')
    || msg.includes('ungÃ¼ltiger objektname')
    || msg.includes('ungueltiger objektname')
  );
}

function buildPushBody(entry, lang) {
  const safeLang = String(lang || 'de').toLowerCase() === 'en' ? 'en' : 'de';
  const user = asText(entry.userShortCode) || '-';
  const product = asText(entry.product) || asText(entry.beNumber) || '-';
  const amount = Number(entry.amountKg);
  const amountText = Number.isFinite(amount)
    ? amount.toLocaleString(safeLang === 'en' ? 'en-GB' : 'de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
    : '-';

  if (asText(entry.type) === 'reservation') {
    return safeLang === 'en'
      ? `${user} reserved article ${product}.`
      : `${user} hat Artikel ${product} reserviert.`;
  }

  return safeLang === 'en'
    ? `${user} ordered ${amountText} KG of article ${product}.`
    : `${user} hat ${amountText} KG von Artikel ${product} beauftragt.`;
}

async function upsertPushSubscription({ email, subscription, userAgent, language }) {
  const normalizedEmail = normalizeEmail(email);
  const endpoint = asText(subscription?.endpoint);
  const p256dh = asText(subscription?.keys?.p256dh);
  const auth = asText(subscription?.keys?.auth);
  const lang = asText(language || 'de').slice(0, 10) || 'de';

  if (!normalizedEmail || !endpoint || !p256dh || !auth) {
    throw new Error('Invalid push subscription payload.');
  }

  const existingRows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT TOP 1 [ps_ID] AS id
    FROM [dbo].[tblBMSApp_PushSubscription]
    WHERE [ps_Endpoint] = ?
  `, [endpoint]);
  const existing = Array.isArray(existingRows) && existingRows.length ? existingRows[0] : null;
  const nowIso = new Date().toISOString();

  if (existing?.id) {
    await runSQLQuerySqlServer(config.sql.database, `
      UPDATE [dbo].[tblBMSApp_PushSubscription]
      SET [ps_UserEmail] = ?,
          [ps_P256DH] = ?,
          [ps_Auth] = ?,
          [ps_UserAgent] = ?,
          [ps_Language] = ?,
          [ps_IsActive] = 1,
          [ps_LastSeenAt] = ?,
          [ps_UpdatedAt] = ?
      WHERE [ps_ID] = ?
    `, [normalizedEmail, p256dh, auth, asText(userAgent) || null, lang, nowIso, nowIso, Number(existing.id)]);
    return;
  }

  await runSQLQuerySqlServer(config.sql.database, `
    INSERT INTO [dbo].[tblBMSApp_PushSubscription] (
      [ps_UserEmail],
      [ps_Endpoint],
      [ps_P256DH],
      [ps_Auth],
      [ps_UserAgent],
      [ps_Language],
      [ps_IsActive],
      [ps_CreatedAt],
      [ps_UpdatedAt],
      [ps_LastSeenAt]
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    normalizedEmail,
    endpoint,
    p256dh,
    auth,
    asText(userAgent) || null,
    lang,
    1,
    nowIso,
    nowIso,
    nowIso,
  ]);
}

async function deactivatePushSubscription(endpoint) {
  const value = asText(endpoint);
  if (!value) return;

  await runSQLQuerySqlServer(config.sql.database, `
    UPDATE [dbo].[tblBMSApp_PushSubscription]
    SET [ps_IsActive] = 0,
        [ps_UpdatedAt] = ?
    WHERE [ps_Endpoint] = ?
  `, [new Date().toISOString(), value]);
}

async function getPushSettingsForUser(email) {
  const normalizedEmail = normalizeEmail(email);
  const mandants = await getPushEligibleMandantsForUser(normalizedEmail);
  const companyIds = mandants
    .map((item) => asCompanyId(item.firmaId))
    .filter(Boolean);

  const rows = companyIds.length
    ? await runSQLQuerySqlServer(config.sql.database, `
      SELECT [pms_CompanyId] AS companyId, [pms_Enabled] AS enabled
      FROM [dbo].[tblBMSApp_PushMandantSetting]
      WHERE LOWER(COALESCE([pms_UserEmail], '')) = ?
        AND [pms_CompanyId] IN (${companyIds.map(() => '?').join(', ')})
    `, [normalizedEmail, ...companyIds])
    : [];

  const settingsMap = new Map();
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const companyId = Number(row.companyId);
    if (Number.isFinite(companyId)) settingsMap.set(companyId, Boolean(row.enabled));
  }

  const subscriptionRows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT COUNT(*) AS total
    FROM [dbo].[tblBMSApp_PushSubscription]
    WHERE LOWER(COALESCE([ps_UserEmail], '')) = ?
      AND [ps_IsActive] = 1
  `, [normalizedEmail]);
  const subscriptionCount = Number(subscriptionRows?.[0]?.total || 0);

  return {
    vapidPublicKey: config.push.vapidPublicKey,
    subscribed: subscriptionCount > 0,
    mandants: mandants.map((item) => ({
      companyId: Number(item.firmaId),
      name: asText(item.name),
      shortName: asText(item.shortName),
      enabled: settingsMap.get(Number(item.firmaId)) || false,
    })),
  };
}

async function savePushSettingsForUser(email, settings) {
  const normalizedEmail = normalizeEmail(email);
  const mandants = await getPushEligibleMandantsForUser(normalizedEmail);
  const allowedByCompanyId = new Map(
    mandants
      .map((item) => ({
        companyId: asCompanyId(item.firmaId),
        name: asText(item.name),
      }))
      .filter((item) => item.companyId)
      .map((item) => [item.companyId, item]),
  );

  const list = Array.isArray(settings) ? settings : [];
  const nowIso = new Date().toISOString();

  for (const row of list) {
    const companyId = Number(row?.companyId);
    if (!Number.isFinite(companyId) || !allowedByCompanyId.has(companyId)) continue;
    const mandant = allowedByCompanyId.get(companyId);
    const enabled = Boolean(row?.enabled);

    const existingRows = await runSQLQuerySqlServer(config.sql.database, `
      SELECT TOP 1 [pms_ID] AS id
      FROM [dbo].[tblBMSApp_PushMandantSetting]
      WHERE LOWER(COALESCE([pms_UserEmail], '')) = ?
        AND [pms_CompanyId] = ?
    `, [normalizedEmail, companyId]);
    const existing = Array.isArray(existingRows) && existingRows.length ? existingRows[0] : null;

    if (existing?.id) {
      await runSQLQuerySqlServer(config.sql.database, `
        UPDATE [dbo].[tblBMSApp_PushMandantSetting]
        SET [pms_Mandant] = ?,
            [pms_Enabled] = ?,
            [pms_UpdatedAt] = ?
        WHERE [pms_ID] = ?
      `, [mandant.name, asBoolBit(enabled), nowIso, Number(existing.id)]);
      continue;
    }

    await runSQLQuerySqlServer(config.sql.database, `
      INSERT INTO [dbo].[tblBMSApp_PushMandantSetting] (
        [pms_UserEmail],
        [pms_CompanyId],
        [pms_Mandant],
        [pms_Enabled],
        [pms_CreatedAt],
        [pms_UpdatedAt]
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `, [normalizedEmail, companyId, mandant.name, asBoolBit(enabled), nowIso, nowIso]);
  }

  return getPushSettingsForUser(normalizedEmail);
}

async function sendPushNotificationsForTimelineEntries(entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) return;

  try {
    ensureVapidConfigured();
  } catch (error) {
    logger.warn(`Push skipped: ${error.message}`);
    return;
  }

  for (const entry of list) {
    try {
      const companyId = Number(entry.companyId);
      if (!Number.isFinite(companyId)) continue;

      const targetRows = await runSQLQuerySqlServer(config.sql.database, `
        SELECT
          [s].[ps_Endpoint] AS endpoint,
          [s].[ps_P256DH] AS p256dh,
          [s].[ps_Auth] AS auth,
          [s].[ps_Language] AS language,
          [s].[ps_UserEmail] AS userEmail
        FROM [dbo].[tblBMSApp_PushSubscription] s
        INNER JOIN [dbo].[tblBMSApp_PushMandantSetting] m
          ON LOWER(COALESCE([m].[pms_UserEmail], '')) = LOWER(COALESCE([s].[ps_UserEmail], ''))
        WHERE [s].[ps_IsActive] = 1
          AND [m].[pms_Enabled] = 1
          AND [m].[pms_CompanyId] = ?
      `, [companyId]);

      for (const row of (Array.isArray(targetRows) ? targetRows : [])) {
        const targetEmail = normalizeEmail(row.userEmail);
        const sourceEmail = normalizeEmail(entry.userEmail);
        if (!(await canUserReceivePushForCompany(targetEmail, companyId))) {
          continue;
        }
        if (targetEmail && sourceEmail && targetEmail === sourceEmail && !isFilehouseEmail(sourceEmail)) {
          continue;
        }

        const payload = JSON.stringify({
          title: 'BMS App',
          body: buildPushBody(entry, row.language),
          tag: `timeline-${companyId}-${asText(entry.referenceId) || asText(entry.id) || Date.now()}`,
        });

        try {
          await webpush.sendNotification({
            endpoint: asText(row.endpoint),
            keys: {
              p256dh: asText(row.p256dh),
              auth: asText(row.auth),
            },
          }, payload);
        } catch (error) {
          const statusCode = Number(error?.statusCode);
          if (statusCode === 404 || statusCode === 410) {
            await deactivatePushSubscription(row.endpoint);
            continue;
          }
          logger.warn(`Push send failed: ${error?.message || error}`);
        }
      }
    } catch (error) {
      if (isMissingPushTableError(error)) {
        logger.warn('Push tables are missing. Push notification skipped.');
        return;
      }
      logger.warn(`Push dispatch failed: ${error?.message || error}`);
    }
  }
}

module.exports = {
  deactivatePushSubscription,
  getPushSettingsForUser,
  savePushSettingsForUser,
  sendPushNotificationsForTimelineEntries,
  upsertPushSubscription,
};
