const config = require('../config');
const { runSQLQuerySqlServer } = require('./access');
const { createHttpError } = require('../utils');

const cache = new Map();
const TTL_MS = 10 * 60 * 1000;

function now() {
  return Date.now();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function getCached(email) {
  const key = normalizeEmail(email);
  const item = cache.get(key);
  if (!item) return null;
  if (item.expiresAt <= now()) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

function setCached(email, value) {
  cache.set(normalizeEmail(email), {
    expiresAt: now() + TTL_MS,
    value,
  });
}

async function getUserPersonNumberByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw createHttpError(401, 'Missing user identity.');
  }

  const cached = getCached(normalized);
  if (cached !== null) return cached;

  const sql = `
    SELECT TOP 1 [ma_PersNR] AS personNumber
    FROM [dbo].[tblMitarbeiter]
    WHERE LOWER(LTRIM(RTRIM(COALESCE([ma_eMail], '')))) = ?
  `;
  const rows = await runSQLQuerySqlServer(config.sql.database, sql, [normalized]);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  const personNumber = row ? (row.personNumber ?? row.ma_PersNR ?? null) : null;
  if (personNumber === null || personNumber === undefined || personNumber === '') {
    throw createHttpError(403, `User not found in BMS Mitarbeiter: ${normalized}`);
  }

  const numeric = Number(personNumber);
  if (!Number.isFinite(numeric)) {
    throw createHttpError(500, `Invalid person number for user: ${normalized}`);
  }

  setCached(normalized, numeric);
  return numeric;
}

module.exports = { getUserPersonNumberByEmail };
