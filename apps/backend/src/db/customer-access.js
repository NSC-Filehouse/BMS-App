const config = require('../config');
const { runSQLQueryFx, runSQLQueryAccess } = require('./access');
const { getUserIdentityByEmail } = require('./users');

const FILEHOUSE_TEST_MAIN_COMPANY_ID = 3;
const CUSTOMER_ACCESS_SCOPE_TTL_MS = 5 * 60 * 1000;
const customerAccessScopeCache = new Map();

function toText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeEmail(email) {
  return toText(email).toLowerCase();
}

function isFilehouseEmail(email) {
  const value = normalizeEmail(email);
  return value.endsWith('filehouse') || value.endsWith('@filehouse') || value.includes('@filehouse.');
}

function escapeIdentifier(value) {
  const text = toText(value);
  if (!text || /[^A-Za-z0-9_]/.test(text)) {
    throw new Error(`Invalid SQL identifier: ${value}`);
  }
  return `[${text}]`;
}

function normalizeUserGroup(value) {
  return toText(value).toUpperCase();
}

function getCustomerField(field, alias = 'k') {
  const column = `[${field}]`;
  return alias ? `[${alias}].${column}` : column;
}

function getTrimmedCustomerField(field, alias = 'k') {
  return `LTRIM(RTRIM(COALESCE(${getCustomerField(field, alias)}, '')))`;
}

function resolveCustomerAccessMode(userGroup, hasShortCode = true) {
  const group = normalizeUserGroup(userGroup);
  if (group === 'GR01') return 'all_assigned_innendienst';
  if (group === 'GR02') return hasShortCode ? 'own_innendienst' : 'no_customer_access';
  if (group === 'GR03') return hasShortCode ? 'own_innendienst_or_aussendienst' : 'no_customer_access';
  if (group === 'GR04') return 'all_assigned_aussendienst';
  if (group === 'GR05') return hasShortCode ? 'own_aussendienst' : 'no_customer_access';
  return hasShortCode ? 'legacy_own_aussendienst' : 'no_customer_access';
}

function buildCustomerScopeFilter(scope, alias = 'k') {
  if (scope?.isMainTenant) {
    return { whereSql: '', params: [], mode: 'main_tenant_all' };
  }

  const shortCode = toText(scope?.shortCode);
  const mode = resolveCustomerAccessMode(scope?.userGroup, Boolean(shortCode));
  if (mode === 'no_customer_access') {
    return { whereSql: '1 = 0', params: [], mode };
  }

  const inside = getTrimmedCustomerField('kd_Innendienst', alias);
  const outside = getTrimmedCustomerField('kd_Aussendienst', alias);

  switch (mode) {
    case 'all_assigned_innendienst':
      return { whereSql: `${inside} <> ''`, params: [], mode };
    case 'own_innendienst':
      return { whereSql: `${inside} = ?`, params: [shortCode], mode };
    case 'own_innendienst_or_aussendienst':
      return { whereSql: `(${inside} = ? OR ${outside} = ?)`, params: [shortCode, shortCode], mode };
    case 'all_assigned_aussendienst':
      return { whereSql: `${outside} <> ''`, params: [], mode };
    case 'own_aussendienst':
    case 'legacy_own_aussendienst':
    default:
      return { whereSql: `${outside} = ?`, params: [shortCode], mode };
  }
}

async function loadTargetUserGroup(personNumber, companyId) {
  const viewName = escapeIdentifier(config.fxSql.views.mitarbeiterMandant);
  const rows = await runSQLQueryFx(config.fxSql.databases.mandantManager, `
    SELECT DISTINCT [mamd_UserGruppe] AS userGroup
    FROM [dbo].${viewName}
    WHERE [mamd_PersNR] = ?
      AND [mamd_FirmaID] = ?
  `, [personNumber, companyId]);

  const groups = [...new Set((Array.isArray(rows) ? rows : [])
    .map((row) => normalizeUserGroup(row.userGroup))
    .filter(Boolean))];

  return {
    userGroup: groups.length === 1 ? groups[0] : null,
    groups,
    ambiguous: groups.length > 1,
  };
}

function getScopeCacheKey(email, activeCompanyId, mainCompanyId, personNumber) {
  return [normalizeEmail(email), activeCompanyId, mainCompanyId, personNumber].join('|');
}

function getCachedScope(key) {
  const item = customerAccessScopeCache.get(key);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    customerAccessScopeCache.delete(key);
    return null;
  }
  return item.value;
}

function setCachedScope(key, value) {
  customerAccessScopeCache.set(key, {
    expiresAt: Date.now() + CUSTOMER_ACCESS_SCOPE_TTL_MS,
    value,
  });
}

async function getCustomerAccessScope(email, database) {
  const userIdentity = await getUserIdentityByEmail(email);
  const activeCompanyId = Number(database?.firmaId);
  const resolvedMainCompanyId = isFilehouseEmail(email)
    ? FILEHOUSE_TEST_MAIN_COMPANY_ID
    : userIdentity?.mainCompanyId;
  const mainCompanyId = Number(resolvedMainCompanyId);
  const shortCode = toText(userIdentity?.shortCode);
  const personNumber = Number(userIdentity?.personNumber);
  const isMainTenant = Number.isFinite(activeCompanyId)
    && Number.isFinite(mainCompanyId)
    && activeCompanyId === mainCompanyId;

  if (isMainTenant) {
    return {
      userIdentity,
      activeCompanyId,
      mainCompanyId,
      personNumber,
      shortCode,
      userGroup: null,
      groups: [],
      ambiguousGroup: false,
      isMainTenant: true,
      customerAccess: buildCustomerScopeFilter({ isMainTenant: true }),
    };
  }

  const cacheKey = getScopeCacheKey(email, activeCompanyId, mainCompanyId, personNumber);
  const cached = getCachedScope(cacheKey);
  if (cached) return cached;

  const groupResult = Number.isFinite(personNumber) && Number.isFinite(activeCompanyId)
    ? await loadTargetUserGroup(personNumber, activeCompanyId)
    : { userGroup: null, groups: [], ambiguous: false };
  const scope = {
    userIdentity,
    activeCompanyId,
    mainCompanyId,
    personNumber,
    shortCode,
    userGroup: groupResult.userGroup,
    groups: groupResult.groups,
    ambiguousGroup: groupResult.ambiguous,
    isMainTenant: false,
  };
  scope.customerAccess = buildCustomerScopeFilter(scope);
  setCachedScope(cacheKey, scope);
  return scope;
}

async function loadVisibleCustomer(database, customerId, scope) {
  const id = toText(customerId);
  if (!id) return null;

  const filter = buildCustomerScopeFilter(scope, 'k');
  const scopeSql = filter.whereSql ? ` AND ${filter.whereSql}` : '';
  const rows = await runSQLQueryAccess(database, `
    SELECT TOP 1 [k].*
    FROM [dbo].[tblKunden] [k]
    WHERE [k].[kd_KdNR] = ?${scopeSql}
  `, [id, ...filter.params]);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

module.exports = {
  buildCustomerScopeFilter,
  getCustomerAccessScope,
  loadVisibleCustomer,
  normalizeUserGroup,
  resolveCustomerAccessMode,
};
