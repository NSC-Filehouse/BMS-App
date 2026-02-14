const config = require('../config');
const { runSQLQuerySqlServer } = require('./access');
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
  const personNumber = row ? (row.personNumber ?? row.ma_PersNR ?? null) : null;
  const numeric = Number(personNumber);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const given = String(row.givenName || row.ma_Vorname || '').trim();
  const sur = String(row.surname || row.ma_Nachname || '').trim();
  const fullName = `${given} ${sur}`.trim() || null;
  const email = String(row.email || row.ma_eMail || '').trim() || null;
  const shortCode = String(row.shortCode || '').trim() || null;

  return {
    personNumber: numeric,
    shortCode,
    fullName,
    email,
  };
}

async function getUserIdentityByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw createHttpError(401, 'Missing user identity.');
  }

  const cached = getCachedByEmail(normalized);
  if (cached) return cached;

  const sql = `
    SELECT TOP 1
      [ma_PersNR] AS personNumber,
      [ma_eMail] AS email,
      [ma_Vorname] AS givenName,
      [ma_Nachname] AS surname,
      [ma_Kürzel] AS shortCode
    FROM [dbo].[tblMitarbeiter]
    WHERE LOWER(LTRIM(RTRIM(COALESCE([ma_eMail], '')))) = ?
  `;
  const rows = await runSQLQuerySqlServer(config.sql.database, sql, [normalized]);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  const identity = mapIdentityRow(row);
  if (!identity) {
    throw createHttpError(403, `User not found in BMS Mitarbeiter: ${normalized}`);
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

  const sql = `
    SELECT TOP 1
      [ma_PersNR] AS personNumber,
      [ma_eMail] AS email,
      [ma_Vorname] AS givenName,
      [ma_Nachname] AS surname,
      [ma_Kürzel] AS shortCode
    FROM [dbo].[tblMitarbeiter]
    WHERE [ma_PersNR] = ?
  `;
  const rows = await runSQLQuerySqlServer(config.sql.database, sql, [personNumber]);
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

  const sql = `
    SELECT TOP 1
      [ma_PersNR] AS personNumber,
      [ma_eMail] AS email,
      [ma_Vorname] AS givenName,
      [ma_Nachname] AS surname,
      [ma_Kürzel] AS shortCode
    FROM [dbo].[tblMitarbeiter]
    WHERE [ma_PersNR] = ?
  `;
  const rows = await runSQLQuerySqlServer(config.sql.database, sql, [personNumber]);
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
