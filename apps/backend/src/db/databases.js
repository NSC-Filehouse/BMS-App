const config = require('../config');
const logger = require('../logger');
const { createHttpError } = require('../utils');
const { canConnectToDatabase, runSQLQuerySqlServer } = require('./access');

const mandantsCache = new Map();
const dbAvailabilityCache = new Map();

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
  return normalized ? `BMS_${normalized}` : '';
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
  return msg.includes('invalid object name') || msg.includes('42s02');
}

async function queryMandantsWithTable(tableName) {
  const colFirmaId = escIdentifier(config.sql.columns.firmaId);
  const colFirma = escIdentifier(config.sql.columns.firma);
  const colFirmaKurz = escIdentifier(config.sql.columns.firmaKurz);
  const sql = `SELECT ${colFirmaId} AS firmaId, ${colFirma} AS firma, ${colFirmaKurz} AS firmaKurz FROM [dbo].${escIdentifier(tableName)}`;
  return runSQLQuerySqlServer(config.sql.database, sql, []);
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
    }
  }
  throw lastError || new Error('Failed to query mandants table.');
}

async function queryMandantsForUser(normalizedEmail) {
  const tMitarbeiter = escIdentifier(config.sql.tables.mitarbeiter);
  const tMap = escIdentifier(config.sql.tables.mitarbeiterMandant);
  const tMandant = escIdentifier(config.sql.tables.mandant);

  const colPersNr = escIdentifier(config.sql.columns.persNr);
  const colEmail = escIdentifier(config.sql.columns.email);
  const colMapPersNr = escIdentifier(config.sql.columns.mapPersNr);
  const colMapFirmaId = escIdentifier(config.sql.columns.mapFirmaId);
  const colFirmaId = escIdentifier(config.sql.columns.firmaId);
  const colFirma = escIdentifier(config.sql.columns.firma);
  const colFirmaKurz = escIdentifier(config.sql.columns.firmaKurz);

  const sql = `SELECT DISTINCT m.${colFirmaId} AS firmaId, m.${colFirma} AS firma, m.${colFirmaKurz} AS firmaKurz
    FROM [dbo].${tMitarbeiter} AS ma
    INNER JOIN [dbo].${tMap} AS mm ON mm.${colMapPersNr} = ma.${colPersNr}
    INNER JOIN [dbo].${tMandant} AS m ON m.${colFirmaId} = mm.${colMapFirmaId}
    WHERE LOWER(LTRIM(RTRIM(COALESCE(ma.${colEmail}, '')))) = ?`;

  return runSQLQuerySqlServer(config.sql.database, sql, [normalizedEmail]);
}

function getCachedMandants(email) {
  const key = normalizeEmail(email);
  const item = mandantsCache.get(key);
  if (!item) return null;
  if (item.expiresAt <= now()) {
    mandantsCache.delete(key);
    return null;
  }
  return item.data;
}

function setCachedMandants(email, data) {
  mandantsCache.set(normalizeEmail(email), {
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

async function loadMandantsForEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return [];

  let rows = [];
  if (isFilehouseEmail(normalizedEmail)) {
    rows = await queryMandantsForFilehouse();
  } else {
    rows = await queryMandantsForUser(normalizedEmail);
  }

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
    logger.warn(`Filtered ${unavailableCount} unavailable tenant databases for ${normalizedEmail}.`);
  }

  availableMandants.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return availableMandants;
}

async function getMandantsForUser(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw createHttpError(401, 'Missing user identity.');
  }

  const cached = getCachedMandants(normalizedEmail);
  if (cached) return cached;

  const loaded = await loadMandantsForEmail(normalizedEmail);
  setCachedMandants(normalizedEmail, loaded);
  return loaded;
}

async function listMandantsForUser(email) {
  const mandants = await getMandantsForUser(email);
  return mandants.map((m) => m.name);
}

async function getDatabaseConnectionForUser(email, mandantName) {
  const selected = String(mandantName || '').trim().toLowerCase();
  if (!selected) {
    throw createHttpError(400, 'Missing required header: x-mandant');
  }

  const mandants = await getMandantsForUser(email);
  const match = mandants.find((m) => m.name.toLowerCase() === selected);
  if (!match) {
    throw createHttpError(403, `No permission for mandant: ${mandantName}`, { code: 'MANDANT_FORBIDDEN' });
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

module.exports = {
  listMandantsForUser,
  getDatabaseConnectionForUser,
};
