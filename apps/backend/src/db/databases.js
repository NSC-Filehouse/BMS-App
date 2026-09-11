const config = require('../config');
const logger = require('../logger');
const { createHttpError } = require('../utils');
const { canConnectToDatabase, runSQLQueryFx, runSQLQuerySqlServer } = require('./access');
const { getUserIdentityByEmail } = require('./users');

const mandantsCache = new Map();
const dbAvailabilityCache = new Map();
let sqlContextLoggedAt = 0;

function normalizeComparisonText(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function isAkiIdentity(identity) {
  return normalizeComparisonText(identity?.shortCode) === 'AKI'
    && normalizeComparisonText(identity?.fullName) === 'ALEXANDER KIMAZ';
}

function getDefaultMandantForIdentity(identity, mandants) {
  const candidates = Array.isArray(mandants) ? mandants : [];

  if (isAkiIdentity(identity)) {
    return candidates.find((mandant) => (
      normalizeComparisonText(mandant?.shortName) === 'FRU'
      || normalizeComparisonText(mandant?.name) === 'FRUPACK'
    )) || null;
  }

  const mainCompanyId = Number(identity?.mainCompanyId);
  if (!Number.isFinite(mainCompanyId)) return null;

  return candidates.find((mandant) => Number(mandant?.firmaId) === mainCompanyId) || null;
}

function now() {
  return Date.now();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isFilehouseEmail(email) {
  const value = normalizeEmail(email);
  return value.endsWith('filehouse') || value.endsWith('@filehouse') || value.includes('@filehouse.');
}

function buildTenantDatabaseName(shortName) {
  const normalized = String(shortName || '').trim().toUpperCase();
  return normalized ? `BMS.${normalized}` : '';
}

function escIdentifier(value) {
  const text = String(value || '').trim();
  if (!text || /[^A-Za-z0-9_]/.test(text)) {
    throw new Error(`Invalid SQL identifier: ${value}`);
  }
  return `[${text}]`;
}

function isObjectNameError(error) {
  const msg = String(error && error.message ? error.message : '').toLowerCase();
  if (msg.includes('invalid object name') || msg.includes('ungültiger objektname') || msg.includes('ungueltiger objektname')) {
    return true;
  }

  const details = error && Array.isArray(error.odbcErrors) ? error.odbcErrors : [];
  return details.some((item) => String(item && item.state ? item.state : '').toLowerCase() === '42s02');
}

async function queryMandantsWithTable(tableName) {
  const colFirmaId = escIdentifier(config.sql.columns.firmaId);
  const colFirma = escIdentifier(config.sql.columns.firma);
  const colFirmaKurz = escIdentifier(config.sql.columns.firmaKurz);
  const sql = `SELECT ${colFirmaId} AS firmaId, ${colFirma} AS firma, ${colFirmaKurz} AS firmaKurz FROM [dbo].${escIdentifier(tableName)}`;
  return runSQLQuerySqlServer(config.sql.database, sql, []);
}

async function logSqlContextForDiagnostics() {
  const nowTs = Date.now();
  // avoid spamming logs on repeated API calls
  if (nowTs - sqlContextLoggedAt < 30 * 1000) return;
  sqlContextLoggedAt = nowTs;

  try {
    const ctxRows = await runSQLQuerySqlServer(
      config.sql.database,
      "SELECT DB_NAME() AS dbName, @@SERVERNAME AS serverName, SUSER_SNAME() AS loginName",
      []
    );
    const ctx = Array.isArray(ctxRows) && ctxRows.length ? ctxRows[0] : null;
    logger.debug(
      `SQL context: server=${ctx?.serverName || '?'} db=${ctx?.dbName || '?'} login=${ctx?.loginName || '?'}`
    );
  } catch (error) {
    logger.debug(`SQL context query failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const tableRows = await runSQLQuerySqlServer(
      config.sql.database,
      "SELECT TOP 20 [name] FROM sys.tables WHERE [name] LIKE '%Mandant%' ORDER BY [name] ASC",
      []
    );
    const names = (tableRows || []).map((r) => r.name || r.NAME).filter(Boolean);
    logger.debug(`SQL tables matching '%Mandant%': ${names.join(', ') || '(none)'}`);
  } catch (error) {
    logger.debug(`SQL table discovery failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function queryMandantsForFilehouse() {
  const preferred = config.sql.tables.mandant;
  const candidates = [preferred, 'tblMandanten'].filter((v, i, arr) => v && arr.indexOf(v) === i);
  let lastError = null;
  for (const tableName of candidates) {
    try {
      return await queryMandantsWithTable(tableName);
    } catch (error) {
      lastError = error;
      if (!isObjectNameError(error)) throw error;
      await logSqlContextForDiagnostics();
    }
  }
  throw lastError || new Error('Failed to query mandants table.');
}

async function queryMandantsForIdentity(identity) {
  const tMandant = escIdentifier(config.sql.tables.mandant);
  const fxViewMitarbeiterMandant = escIdentifier(config.fxSql.views.mitarbeiterMandant);

  const colMapPersNr = escIdentifier(config.sql.columns.mapPersNr);
  const colMapFirmaId = escIdentifier(config.sql.columns.mapFirmaId);
  const colFirmaId = escIdentifier(config.sql.columns.firmaId);
  const colFirma = escIdentifier(config.sql.columns.firma);
  const colFirmaKurz = escIdentifier(config.sql.columns.firmaKurz);

  const personNumber = Number(identity.personNumber);
  if (!Number.isFinite(personNumber)) return [];

  const mappingSql = `
    SELECT DISTINCT ${colMapFirmaId} AS firmaId
    FROM [dbo].${fxViewMitarbeiterMandant}
    WHERE ${colMapPersNr} = ?
  `;
  const mappingRows = await runSQLQueryFx(config.fxSql.databases.mandantManager, mappingSql, [personNumber]);
  const firmaIds = (Array.isArray(mappingRows) ? mappingRows : [])
    .map((row) => Number(row.firmaId ?? null))
    .filter((value) => Number.isFinite(value));
  if (!firmaIds.length) return [];

  const placeholders = firmaIds.map(() => '?').join(', ');
  const sql = `SELECT DISTINCT ${colFirmaId} AS firmaId, ${colFirma} AS firma, ${colFirmaKurz} AS firmaKurz
    FROM [dbo].${tMandant}
    WHERE ${colFirmaId} IN (${placeholders})`;

  return runSQLQuerySqlServer(config.sql.database, sql, firmaIds);
}

function getCachedMandants(key) {
  const item = mandantsCache.get(key);
  if (!item) return null;
  if (item.expiresAt <= now()) {
    mandantsCache.delete(key);
    return null;
  }
  return item.data;
}

function setCachedMandants(key, data) {
  mandantsCache.set(key, {
    expiresAt: now() + config.cache.mandantsTtlMs,
    data,
  });
}

function getDbAvailabilityFromCache(databaseName) {
  const key = String(databaseName || '').trim();
  const item = dbAvailabilityCache.get(key);
  if (!item) return null;
  if (item.expiresAt <= now()) {
    dbAvailabilityCache.delete(key);
    return null;
  }
  return item.available;
}

function setDbAvailabilityCache(databaseName, available) {
  dbAvailabilityCache.set(String(databaseName || '').trim(), {
    expiresAt: now() + config.cache.dbAvailabilityTtlMs,
    available: Boolean(available),
  });
}

async function isDatabaseAvailable(databaseName) {
  const cached = getDbAvailabilityFromCache(databaseName);
  if (cached !== null) return cached;

  const available = await canConnectToDatabase(databaseName);
  setDbAvailabilityCache(databaseName, available);
  return available;
}

async function getMandantsForUser(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw createHttpError(401, 'Missing user identity.', { code: 'AUTH_MISSING_IDENTITY' });
  }

  const cached = getCachedMandants(normalizedEmail);
  if (cached) return cached;

  const identity = await getUserIdentityByEmail(normalizedEmail);
  const loaded = await loadMandantsForIdentity(identity);
  setCachedMandants(normalizedEmail, loaded);
  return loaded;
}

function getIdentityMandantsCacheKey(identity) {
  const personNumber = String(identity?.personNumber || '').trim();
  if (personNumber) return `person:${personNumber}`;

  const userId = String(identity?.userId || '').trim().toLowerCase();
  if (userId) return `user:${userId}`;

  return `email:${normalizeEmail(identity?.email)}`;
}

async function loadMandantsForIdentity(identity) {
  if (!identity) return [];

  const normalizedEmail = normalizeEmail(identity.email);
  const rows = isFilehouseEmail(normalizedEmail)
    ? await queryMandantsForFilehouse()
    : await queryMandantsForIdentity(identity);

  const normalized = (rows || [])
    .map((row) => ({
      firmaId: row.firmaId ?? row.md_FirmaID ?? null,
      name: String(row.firma || row.md_Firma || '').trim(),
      shortName: String(row.firmaKurz || row.md_FirmaKurz || '').trim().toUpperCase(),
    }))
    .filter((m) => m.name && m.shortName)
    .map((m) => ({
      ...m,
      databaseName: buildTenantDatabaseName(m.shortName),
    }));

  const uniqueByName = new Map();
  normalized.forEach((m) => {
    const key = m.name.toLowerCase();
    if (!uniqueByName.has(key)) uniqueByName.set(key, m);
  });

  const candidates = Array.from(uniqueByName.values());
  if (!config.featureFlags.filterUnavailableMandants) {
    candidates.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return candidates;
  }

  const checks = await Promise.all(
    candidates.map(async (m) => ({
      ...m,
      available: await isDatabaseAvailable(m.databaseName),
    }))
  );

  const availableMandants = checks.filter((m) => m.available);
  const unavailableCount = checks.length - availableMandants.length;
  if (unavailableCount > 0) {
    logger.warn(`Filtered ${unavailableCount} unavailable tenant databases for ${normalizedEmail || identity.userId || identity.personNumber}.`);
  }

  availableMandants.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return availableMandants;
}

async function getMandantsForIdentity(identity) {
  if (!identity) return [];

  const cacheKey = getIdentityMandantsCacheKey(identity);
  const cached = getCachedMandants(cacheKey);
  if (cached) return cached;

  const loaded = await loadMandantsForIdentity(identity);
  setCachedMandants(cacheKey, loaded);
  return loaded;
}

async function listMandantsForUser(email) {
  const mandants = await getMandantsForUser(email);
  return mandants.map((m) => ({
    id: m.firmaId,
    name: m.name,
  }));
}

async function getDatabaseConnectionForUser(email, mandantName) {
  const selected = String(mandantName || '').trim().toLowerCase();
  if (!selected) {
    throw createHttpError(400, 'Missing required header: x-mandant', { code: 'MANDANT_HEADER_REQUIRED' });
  }

  const mandants = await getMandantsForUser(email);
  const match = mandants.find((m) => m.name.toLowerCase() === selected);
  return getDatabaseConnectionForMandantMatch(match, mandantName);
}

async function getDatabaseConnectionForIdentity(identity, mandantName) {
  const selected = String(mandantName || '').trim().toLowerCase();
  if (!selected) {
    throw createHttpError(400, 'Missing required header: x-mandant', { code: 'MANDANT_HEADER_REQUIRED' });
  }

  const mandants = await getMandantsForIdentity(identity);
  const match = mandants.find((m) => m.name.toLowerCase() === selected);
  return getDatabaseConnectionForMandantMatch(match, mandantName);
}

async function getDatabaseConnectionForMandantMatch(match, requestedMandant) {
  if (!match) {
    throw createHttpError(403, `No permission for mandant: ${requestedMandant}`, {
      code: 'MANDANT_FORBIDDEN',
      mandant: requestedMandant,
    });
  }

  const available = await isDatabaseAvailable(match.databaseName);
  if (!available) {
    throw createHttpError(503, 'Diese DB ist noch nicht verfuegbar.', {
      code: 'DB_NOT_AVAILABLE',
      mandant: match.name,
      databaseName: match.databaseName,
    });
  }

  return {
    provider: 'sqlserver',
    databaseName: match.databaseName,
    name: match.name,
    shortName: match.shortName,
    firmaId: match.firmaId,
  };
}

async function getDatabaseConnectionForUserById(email, firmaId) {
  const identity = await getUserIdentityByEmail(email);
  return getDatabaseConnectionForIdentityById(identity, firmaId);
}

async function getDatabaseConnectionForIdentityById(identity, firmaId) {
  const selectedId = Number(firmaId);
  if (!Number.isSafeInteger(selectedId) || selectedId < 0) {
    throw createHttpError(400, `Invalid mandant id: ${firmaId}`, { code: 'MANDANT_ID_INVALID' });
  }

  const mandants = await getMandantsForIdentity(identity);
  const match = mandants.find((m) => Number(m.firmaId) === selectedId);
  return getDatabaseConnectionForMandantMatch(match, selectedId);
}

async function getDatabaseConnectionForCompanyId(firmaId) {
  const selectedId = Number(firmaId);
  if (!Number.isSafeInteger(selectedId) || selectedId < 0) {
    throw createHttpError(400, `Invalid mandant id: ${firmaId}`, { code: 'MANDANT_ID_INVALID' });
  }

  const mandants = await queryMandantsForFilehouse();
  const normalized = (mandants || [])
    .map((row) => ({
      firmaId: row.firmaId ?? row.md_FirmaID ?? null,
      name: String(row.firma || row.md_Firma || '').trim(),
      shortName: String(row.firmaKurz || row.md_FirmaKurz || '').trim().toUpperCase(),
    }))
    .filter((item) => item.name && item.shortName)
    .map((item) => ({ ...item, databaseName: buildTenantDatabaseName(item.shortName) }));
  const match = normalized.find((item) => Number(item.firmaId) === selectedId);
  return getDatabaseConnectionForMandantMatch(match, selectedId);
}

module.exports = {
  getMandantsForUser,
  getMandantsForIdentity,
  getDefaultMandantForIdentity,
  listMandantsForUser,
  getDatabaseConnectionForUser,
  getDatabaseConnectionForIdentity,
  getDatabaseConnectionForUserById,
  getDatabaseConnectionForIdentityById,
  getDatabaseConnectionForCompanyId,
};
