const config = require('../config');
const { runSQLQueryFx } = require('./access');
const { createHttpError } = require('../utils');

const identityByEmailCache = new Map();
const identityByPersonNumberCache = new Map();
const TTL_MS = 10 * 60 * 1000;

function now() {
  return Date.now();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function getCachedByEmail(email) {
  const key = normalizeEmail(email);
  const item = identityByEmailCache.get(key);
  if (!item) return null;
  if (item.expiresAt <= now()) {
    identityByEmailCache.delete(key);
    return null;
  }
  return item.value;
}

function getCachedByPersonNumber(personNumber) {
  const key = String(personNumber || '').trim();
  const item = identityByPersonNumberCache.get(key);
  if (!item) return null;
  if (item.expiresAt <= now()) {
    identityByPersonNumberCache.delete(key);
    return null;
  }
  return item.value;
}

function setCached(identity) {
  const emailKey = normalizeEmail(identity.email);
  const personKey = String(identity.personNumber || '').trim();
  const item = {
    expiresAt: now() + TTL_MS,
    value: identity,
  };

  if (emailKey) {
    identityByEmailCache.set(emailKey, item);
  }
  if (personKey) {
    identityByPersonNumberCache.set(personKey, item);
  }
}

function mapIdentityRow(row) {
  if (!row || typeof row !== 'object') {
    return null;
  }

  const personNumber = row.personNumber ?? row.ma_PersNR ?? null;
  const numeric = Number(personNumber);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const given = String(row.givenName || row.ma_Vorname || '').trim();
  const sur = String(row.surname || row.ma_Nachname || '').trim();
  const fullName = `${given} ${sur}`.trim() || null;
  const email = String(row.email || row.ma_eMail || '').trim() || null;
  const shortCode = String(row.shortCode || row['ma_K\u00FCrzel'] || '').trim() || null;

  return {
    personNumber: numeric,
    shortCode,
    fullName,
    email,
  };
}

function buildIdentitySelectSql(whereClause) {
  return `
    SELECT TOP 1
      [ma_PersNR] AS personNumber,
      [ma_eMail] AS email,
      [ma_Vorname] AS givenName,
      [ma_Nachname] AS surname,
      [ma_K\u00FCrzel] AS shortCode
    FROM [dbo].[${config.fxSql.views.mitarbeiter}]
    ${whereClause}
  `;
}

async function getUserIdentityByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw createHttpError(401, 'Missing user identity.', { code: 'AUTH_MISSING_IDENTITY' });
  }

  const cached = getCachedByEmail(normalized);
  if (cached) return cached;

  const exactSql = buildIdentitySelectSql(`
    WHERE LOWER(LTRIM(RTRIM(COALESCE([ma_eMail], '')))) = ?
  `);
  let rows = await runSQLQueryFx(config.fxSql.databases.mlPlastics, exactSql, [normalized]);
  let row = Array.isArray(rows) && rows.length ? rows[0] : null;

  if (!row) {
    const localPart = normalized.split('@')[0] || '';
    if (localPart) {
      const fallbackSql = buildIdentitySelectSql(`
        WHERE LOWER(LEFT(COALESCE([ma_eMail], ''), CHARINDEX('@', COALESCE([ma_eMail], '') + '@') - 1)) = ?
      `);
      rows = await runSQLQueryFx(config.fxSql.databases.mlPlastics, fallbackSql, [localPart]);
      row = Array.isArray(rows) && rows.length ? rows[0] : null;
    }
  }

  const identity = mapIdentityRow(row);
  if (!identity) {
    throw createHttpError(403, `User not found in FX Mitarbeiter view: ${normalized}`, {
      code: 'USER_NOT_FOUND_IN_FX',
      email: normalized,
    });
  }

  setCached(identity);
  return identity;
}

async function getUserPersonNumberByEmail(email) {
  const identity = await getUserIdentityByEmail(email);
  return identity.personNumber;
}

async function getUserDisplayNameByPersonNumber(personNumber) {
  const key = String(personNumber || '').trim();
  if (!key) return null;

  const cached = getCachedByPersonNumber(key);
  if (cached) {
    return cached.fullName || cached.email || null;
  }

  const sql = buildIdentitySelectSql('WHERE [ma_PersNR] = ?');
  const rows = await runSQLQueryFx(config.fxSql.databases.mlPlastics, sql, [personNumber]);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  const identity = mapIdentityRow(row);
  if (!identity) return null;

  setCached(identity);
  return identity.fullName || identity.email || null;
}

async function getUserShortCodeByPersonNumber(personNumber) {
  const key = String(personNumber || '').trim();
  if (!key) return null;

  const cached = getCachedByPersonNumber(key);
  if (cached) {
    return cached.shortCode || null;
  }

  const sql = buildIdentitySelectSql('WHERE [ma_PersNR] = ?');
  const rows = await runSQLQueryFx(config.fxSql.databases.mlPlastics, sql, [personNumber]);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  const identity = mapIdentityRow(row);
  if (!identity) return null;

  setCached(identity);
  return identity.shortCode || null;
}

module.exports = {
  getUserIdentityByEmail,
  getUserPersonNumberByEmail,
  getUserDisplayNameByPersonNumber,
  getUserShortCodeByPersonNumber,
};
