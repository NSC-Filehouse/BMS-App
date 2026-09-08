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

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+$/.test(String(value || '').trim());
}

function getEmailLocalPart(value) {
  const text = String(value || '').trim();
  const at = text.indexOf('@');
  return at > 0 ? text.slice(0, at) : text;
}

function uniqueNormalized(values, normalizer) {
  return [...new Set(
    values
      .map((value) => normalizer(value))
      .filter(Boolean),
  )];
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
      [ma_K\u00FCrzel] AS shortCode
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
    email: normalized,
  });
}

function getRequestIdentityCandidates(context = {}) {
  const mailCandidates = uniqueNormalized([context.mail], normalizeEmail)
    .filter(looksLikeEmail);
  const principalEmailCandidates = uniqueNormalized([context.principalHeader], normalizeEmail)
    .filter(looksLikeEmail);
  const contextEmailCandidates = uniqueNormalized([context.email], normalizeEmail)
    .filter(looksLikeEmail);
  const emailCandidates = uniqueNormalized(
    [...mailCandidates, ...principalEmailCandidates, ...contextEmailCandidates],
    normalizeEmail,
  );

  const userIdCandidates = uniqueNormalized([
    context.samAccountName,
    ...principalEmailCandidates.map(getEmailLocalPart),
    context.principalHeader && !looksLikeEmail(context.principalHeader) ? context.principalHeader : null,
    context.forwardedUser && !looksLikeEmail(context.forwardedUser) ? context.forwardedUser : null,
  ], normalizeUserId);

  return {
    mailCandidates,
    principalEmailCandidates,
    emailCandidates,
    userIdCandidates,
  };
}

async function queryIdentityRowsByCandidates({ emailCandidates = [], userIdCandidates = [] } = {}) {
  const clauses = [];
  const params = [];

  if (emailCandidates.length) {
    clauses.push(`LOWER(LTRIM(RTRIM(COALESCE([ma_eMail], '')))) IN (${emailCandidates.map(() => '?').join(', ')})`);
    params.push(...emailCandidates);
  }
  if (userIdCandidates.length) {
    clauses.push(`LOWER(LTRIM(RTRIM(COALESCE([ma_UserID], '')))) IN (${userIdCandidates.map(() => '?').join(', ')})`);
    params.push(...userIdCandidates);
  }
  if (!clauses.length) return [];

  const sql = buildIdentitySelectSql(`WHERE (${clauses.join(' OR ')})`, { top: false });
  return runSQLQueryFx(config.fxSql.databases.mlPlastics, sql, params);
}

function chooseIdentityFromRows(rows, candidates) {
  const identitiesByPerson = getIdentityRowsByPerson(rows);
  const identities = [...identitiesByPerson.values()];
  const mailMatches = identities.filter((identity) => (
    candidates.mailCandidates.includes(normalizeEmail(identity.email))
  ));
  const principalMatches = identities.filter((identity) => (
    candidates.principalEmailCandidates.includes(normalizeEmail(identity.email))
  ));
  const userIdMatches = identities.filter((identity) => (
    candidates.userIdCandidates.includes(normalizeUserId(identity.userId))
  ));

  const userIdPeople = new Set(userIdMatches.map(getIdentityPersonKey));
  const mailPeople = new Set(mailMatches.map(getIdentityPersonKey));
  const principalPeople = new Set(principalMatches.map(getIdentityPersonKey));

  if (userIdPeople.size > 1) {
    throw createIdentityConflictError(['x-ms-client-samaccountname', 'x-ms-client-principal-name'], [...userIdPeople]);
  }

  let selectedPerson = [...userIdPeople][0] || null;
  if (!selectedPerson) {
    if (mailPeople.size > 1) {
      throw createIdentityConflictError(['x-ms-client-mail'], [...mailPeople]);
    }
    if (mailPeople.size === 1) selectedPerson = [...mailPeople][0];
  }
  if (!selectedPerson) {
    if (principalPeople.size > 1) {
      throw createIdentityConflictError(['x-ms-client-principal-name'], [...principalPeople]);
    }
    if (principalPeople.size === 1) selectedPerson = [...principalPeople][0];
  }

  if (!selectedPerson) return null;

  if (candidates.mailCandidates.length && !mailPeople.has(selectedPerson)) {
    throw createIdentityConflictError(['x-ms-client-mail', 'x-ms-client-samaccountname'], [selectedPerson, ...userIdPeople]);
  }
  if (principalPeople.size && !principalPeople.has(selectedPerson)) {
    throw createIdentityConflictError(['x-ms-client-principal-name', 'x-ms-client-samaccountname'], [selectedPerson, ...principalPeople]);
  }

  return identities
    .filter((identity) => getIdentityPersonKey(identity) === selectedPerson)
    .sort((left, right) => {
      const leftScore = (candidates.userIdCandidates.includes(normalizeUserId(left.userId)) ? 4 : 0)
        + (candidates.mailCandidates.includes(normalizeEmail(left.email)) ? 2 : 0)
        + (candidates.principalEmailCandidates.includes(normalizeEmail(left.email)) ? 1 : 0);
      const rightScore = (candidates.userIdCandidates.includes(normalizeUserId(right.userId)) ? 4 : 0)
        + (candidates.mailCandidates.includes(normalizeEmail(right.email)) ? 2 : 0)
        + (candidates.principalEmailCandidates.includes(normalizeEmail(right.email)) ? 1 : 0);
      return rightScore - leftScore;
    })[0] || null;
}

function resolveIdentityFromRows(rows, context = {}) {
  const candidates = getRequestIdentityCandidates(context);
  const identity = chooseIdentityFromRows(rows, candidates);
  if (!identity) {
    throw createUserNotFoundError(
      context.mail || context.principalHeader || context.samAccountName || context.forwardedUser || context.email,
    );
  }
  return identity;
}

async function getUserIdentityFromRequestContext(context = {}) {
  const candidates = getRequestIdentityCandidates(context);
  const fallbackIdentifier = context.mail
    || context.principalHeader
    || context.samAccountName
    || context.forwardedUser
    || context.email;

  if (!candidates.emailCandidates.length && !candidates.userIdCandidates.length) {
    throw createHttpError(401, 'Missing user identity.', { code: 'AUTH_MISSING_IDENTITY' });
  }

  // Only use a cache when there is no second identifier that still needs to
  // be checked for consistency. Header conflicts must always be evaluated.
  if (!candidates.mailCandidates.length && candidates.userIdCandidates.length === 1) {
    const cached = getCachedByUserId(candidates.userIdCandidates[0]);
    if (cached) return cached;
  }
  if (!candidates.userIdCandidates.length && candidates.emailCandidates.length === 1) {
    const cached = getCachedByEmail(candidates.emailCandidates[0]);
    if (cached) return cached;
  }

  const rows = await queryIdentityRowsByCandidates(candidates);
  const identity = chooseIdentityFromRows(rows, candidates);
  if (!identity) throw createUserNotFoundError(fallbackIdentifier);

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
  getUserIdentityFromRequestContext,
  resolveIdentityFromRows,
  getUserIdentityByShortCode,
  getUserIdentitiesByShortCodes,
  getUserPersonNumberByEmail,
  getUserDisplayNameByPersonNumber,
  getUserShortCodeByPersonNumber,
};
