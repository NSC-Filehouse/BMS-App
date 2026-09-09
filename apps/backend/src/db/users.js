const config = require('../config');
const { runSQLQueryFx } = require('./access');
const { createHttpError } = require('../utils');

const identityByEmailCache = new Map();
const identityByPersonNumberCache = new Map();
const identityByUserIdCache = new Map();
const TTL_MS = 10 * 60 * 1000;

function now() {
  return Date.now();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeUserId(userId) {
  return String(userId || '').trim().toLowerCase();
}

function normalizeActiveFlag(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    return !['0', 'false', 'no', 'nein'].includes(value.trim().toLowerCase());
  }
  return Boolean(value);
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+$/.test(String(value || '').trim());
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

function getCachedByUserId(userId) {
  const key = normalizeUserId(userId);
  const item = identityByUserIdCache.get(key);
  if (!item) return null;
  if (item.expiresAt <= now()) {
    identityByUserIdCache.delete(key);
    return null;
  }
  return item.value;
}

function setCached(identity) {
  const emailKey = normalizeEmail(identity.email);
  const personKey = String(identity.personNumber || '').trim();
  const userIdKey = normalizeUserId(identity.userId);
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
  if (userIdKey) {
    identityByUserIdCache.set(userIdKey, item);
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
  const phone = String(row.phone || row.ma_Telefon || row.mobile || row.ma_Handy || row.extension || row.ma_Durchwahl || '').trim() || null;
  const userId = String(row.userId || row.ma_UserID || '').trim() || null;
  const shortCode = String(row.shortCode || row['ma_K\u00FCrzel'] || '').trim() || null;
  const mainCompanyIdRaw = row.mainCompanyId ?? row.ma_FirmaID ?? null;
  const mainCompanyId = Number(mainCompanyIdRaw);
  const active = normalizeActiveFlag(row.active ?? row.ma_Aktiv);

  return {
    personNumber: numeric,
    userId,
    shortCode,
    givenName: given || null,
    surname: sur || null,
    fullName,
    email,
    phone,
    mainCompanyId: Number.isFinite(mainCompanyId) ? mainCompanyId : null,
    active,
  };
}

function buildIdentitySelectSql(whereClause, { top = true } = {}) {
  const topClause = top ? 'TOP 1 ' : '';
  return `
    SELECT ${topClause}
      [ma_PersNR] AS personNumber,
      [ma_eMail] AS email,
      [ma_UserID] AS userId,
      [ma_Vorname] AS givenName,
      [ma_Nachname] AS surname,
      [ma_Telefon] AS phone,
      [ma_Handy] AS mobile,
      [ma_Durchwahl] AS extension,
      [ma_FirmaID] AS mainCompanyId,
      [ma_K\u00FCrzel] AS shortCode,
      [ma_Aktiv] AS active
    FROM [dbo].[${config.fxSql.views.mitarbeiter}]
    ${whereClause}
  `;
}

function getIdentityPersonKey(identity) {
  return String(identity?.personNumber ?? '').trim();
}

function getIdentityRowsByPerson(rows) {
  const byPerson = new Map();
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const identity = mapIdentityRow(row);
    const personKey = getIdentityPersonKey(identity);
    if (!identity || !personKey || byPerson.has(personKey)) continue;
    byPerson.set(personKey, identity);
  }
  return byPerson;
}

function createIdentityConflictError(sources, personNumbers = []) {
  return createHttpError(403, 'Conflicting user identity headers.', {
    code: 'AUTH_IDENTITY_CONFLICT',
    sources,
    personNumbers,
  });
}

function createUserNotFoundError(identifier) {
  const normalized = String(identifier || '').trim().toLowerCase();
  return createHttpError(403, `User not found in FX Mitarbeiter view: ${normalized}`, {
    code: 'USER_NOT_FOUND_IN_FX',
    identifier: normalized,
  });
}

function createSamAccountRequiredError() {
  return createHttpError(401, 'Missing SSO SAM account name.', {
    code: 'AUTH_SAM_ACCOUNT_REQUIRED',
  });
}

function createSamAccountAmbiguousError(userId, personNumbers) {
  return createHttpError(403, `SSO SAM account name is not unique in FX Mitarbeiter view: ${userId}`, {
    code: 'AUTH_SAM_ACCOUNT_AMBIGUOUS',
    userId,
    personNumbers,
  });
}

function resolveIdentityFromRows(rows, context = {}) {
  const userId = normalizeUserId(context.samAccountName);
  if (!userId) throw createSamAccountRequiredError();

  const identities = [...getIdentityRowsByPerson(rows).values()]
    .filter((identity) => normalizeUserId(identity.userId) === userId);
  if (!identities.length) throw createUserNotFoundError(userId);
  if (identities.length > 1) {
    throw createSamAccountAmbiguousError(
      userId,
      identities.map(getIdentityPersonKey),
    );
  }

  // Mail and principal name are deliberately not compared here. The proxy's
  // SAM account name is the canonical identity; the other headers are useful
  // diagnostics only because aliases and historic mail addresses can differ.
  return identities[0];
}

async function getUserIdentityFromRequestContext(context = {}) {
  return getUserIdentityByUserId(context.samAccountName);
}

async function getUserIdentityByUserId(userId) {
  const normalized = normalizeUserId(userId);
  if (!normalized) throw createSamAccountRequiredError();

  const cached = getCachedByUserId(normalized);
  if (cached?.active === true) return cached;

  const sql = buildIdentitySelectSql(`
    WHERE COALESCE([ma_Aktiv], 0) = 1
      AND LOWER(LTRIM(RTRIM(COALESCE([ma_UserID], '')))) = ?
  `, { top: false });
  const rows = await runSQLQueryFx(config.fxSql.databases.mlPlastics, sql, [normalized]);
  const identity = resolveIdentityFromRows(rows, { samAccountName: normalized });

  setCached(identity);
  return identity;
}

async function getUserIdentityByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw createHttpError(401, 'Missing user identity.', { code: 'AUTH_MISSING_IDENTITY' });
  }

  const cached = getCachedByEmail(normalized)
    || (!looksLikeEmail(normalized) ? getCachedByUserId(normalized) : null);
  if (cached) return cached;

  const exactSql = buildIdentitySelectSql(`
    WHERE LOWER(LTRIM(RTRIM(COALESCE([ma_eMail], '')))) = ?
  `, { top: false });
  let rows = await runSQLQueryFx(config.fxSql.databases.mlPlastics, exactSql, [normalized]);
  let identities = getIdentityRowsByPerson(rows);
  let identity = identities.size === 1 ? [...identities.values()][0] : null;
  if (identities.size > 1) {
    throw createIdentityConflictError(['email'], [...identities.keys()]);
  }

  if (!identity) {
    const localPart = normalized.split('@')[0] || '';
    if (localPart) {
      const fallbackSql = buildIdentitySelectSql(`
        WHERE LOWER(LEFT(COALESCE([ma_eMail], ''), CHARINDEX('@', COALESCE([ma_eMail], '') + '@') - 1)) = ?
      `, { top: false });
      rows = await runSQLQueryFx(config.fxSql.databases.mlPlastics, fallbackSql, [localPart]);
      identities = getIdentityRowsByPerson(rows);
      identity = identities.size === 1 ? [...identities.values()][0] : null;
      if (identities.size > 1) {
        throw createIdentityConflictError(['email-local-part'], [...identities.keys()]);
      }
    }
  }

  if (!identity) {
    const localPart = normalized.split('@')[0] || normalized;
    const userIdSql = buildIdentitySelectSql(`
      WHERE LOWER(LTRIM(RTRIM(COALESCE([ma_UserID], '')))) = ?
    `, { top: false });
    rows = await runSQLQueryFx(config.fxSql.databases.mlPlastics, userIdSql, [localPart]);
    identities = getIdentityRowsByPerson(rows);
    identity = identities.size === 1 ? [...identities.values()][0] : null;
    if (identities.size > 1) {
      throw createIdentityConflictError(['email-local-part', 'ma_UserID'], [...identities.keys()]);
    }
  }

  if (!identity) throw createUserNotFoundError(normalized);

  setCached(identity);
  return identity;
}

async function getUserIdentitiesByShortCodes(shortCodes) {
  const values = [...new Set(
    (Array.isArray(shortCodes) ? shortCodes : [])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean),
  )];
  if (!values.length) return new Map();

  const rows = await runSQLQueryFx(config.fxSql.databases.mlPlastics, `
    SELECT
      [ma_PersNR] AS personNumber,
      [ma_eMail] AS email,
      [ma_UserID] AS userId,
      [ma_Vorname] AS givenName,
      [ma_Nachname] AS surname,
      [ma_Telefon] AS phone,
      [ma_Handy] AS mobile,
      [ma_Durchwahl] AS extension,
      [ma_FirmaID] AS mainCompanyId,
      [ma_K\u00FCrzel] AS shortCode
    FROM [dbo].[${config.fxSql.views.mitarbeiter}]
    WHERE LOWER(LTRIM(RTRIM(COALESCE([ma_K\u00FCrzel], '')))) IN (${values.map(() => '?').join(', ')})
  `, values);

  const identities = new Map();
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const identity = mapIdentityRow(row);
    const key = String(identity?.shortCode || '').trim().toLowerCase();
    if (!identity || !key || identities.has(key)) continue;
    identities.set(key, identity);
    setCached(identity);
  }
  return identities;
}

async function getUserIdentitiesByPersonNumbers(personNumbers) {
  const values = [...new Set(
    (Array.isArray(personNumbers) ? personNumbers : [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value)),
  )];
  if (!values.length) return new Map();

  const rows = await runSQLQueryFx(config.fxSql.databases.mlPlastics, `
    SELECT
      [ma_PersNR] AS personNumber,
      [ma_eMail] AS email,
      [ma_UserID] AS userId,
      [ma_Vorname] AS givenName,
      [ma_Nachname] AS surname,
      [ma_Telefon] AS phone,
      [ma_Handy] AS mobile,
      [ma_Durchwahl] AS extension,
      [ma_FirmaID] AS mainCompanyId,
      [ma_K\u00FCrzel] AS shortCode
    FROM [dbo].[${config.fxSql.views.mitarbeiter}]
    WHERE [ma_PersNR] IN (${values.map(() => '?').join(', ')})
  `, values);

  const identities = new Map();
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const identity = mapIdentityRow(row);
    const key = String(identity?.personNumber || '').trim();
    if (!identity || !key || identities.has(key)) continue;
    identities.set(key, identity);
    setCached(identity);
  }
  return identities;
}

async function getUserIdentityByShortCode(shortCode, companyId = null) {
  const normalized = String(shortCode || '').trim().toLowerCase();
  if (!normalized) return null;

  const numericCompanyId = Number(companyId);
  const hasCompanyId = companyId !== null && companyId !== undefined && Number.isFinite(numericCompanyId);
  const orderSql = hasCompanyId
    ? 'ORDER BY CASE WHEN [ma_FirmaID] = ? THEN 0 ELSE 1 END, [ma_Aktiv] DESC, [ma_PersNR] ASC'
    : 'ORDER BY [ma_Aktiv] DESC, [ma_PersNR] ASC';
  const rows = await runSQLQueryFx(config.fxSql.databases.mlPlastics, `
    SELECT
      [ma_PersNR] AS personNumber,
      [ma_eMail] AS email,
      [ma_UserID] AS userId,
      [ma_Vorname] AS givenName,
      [ma_Nachname] AS surname,
      [ma_Telefon] AS phone,
      [ma_Handy] AS mobile,
      [ma_Durchwahl] AS extension,
      [ma_FirmaID] AS mainCompanyId,
      [ma_K\u00FCrzel] AS shortCode
    FROM [dbo].[${config.fxSql.views.mitarbeiter}]
    WHERE LOWER(LTRIM(RTRIM(COALESCE([ma_K\u00FCrzel], '')))) = ?
    ${orderSql}
  `, hasCompanyId ? [normalized, numericCompanyId] : [normalized]);

  const identity = (Array.isArray(rows) ? rows : [])
    .map(mapIdentityRow)
    .find(Boolean) || null;
  if (identity) setCached(identity);
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
  getUserIdentityByUserId,
  getUserIdentityFromRequestContext,
  resolveIdentityFromRows,
  getUserIdentityByShortCode,
  getUserIdentitiesByShortCodes,
  getUserIdentitiesByPersonNumbers,
  getUserPersonNumberByEmail,
  getUserDisplayNameByPersonNumber,
  getUserShortCodeByPersonNumber,
};
