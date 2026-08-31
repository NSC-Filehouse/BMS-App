const express = require('express');
const config = require('../config');
const { asyncHandler, createHttpError, sendEnvelope, parseListParams } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { runSQLQueryAccess, runSQLQuerySqlServer } = require('../db/access');
const {
  getCustomerAccessScope,
  loadVisibleCustomer,
} = require('../db/customer-access');
const { productAvailabilitySource } = require('../db/product-availability');

const router = express.Router();
const PRODUCTS_VIEW_SQL = productAvailabilitySource('availability');
const PRODUCT_ID_SEPARATOR = '||';
const ACTIVE_CUSTOMERS_TTL_MS = 5 * 60 * 1000;
const activeCustomersCache = new Map();

function normalizeTotal(countResult) {
  if (!countResult) return null;
  const row = Array.isArray(countResult) ? countResult[0] : countResult;
  if (!row || typeof row !== 'object') return null;
  return row.total ?? row.TOTAL ?? row.Total ?? Object.values(row)[0] ?? null;
}

function normalizeDir(dir) {
  return String(dir || '').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
}

function resolveSortField(sort) {
  const map = {
    kd_KdNR: '[kd_KdNR]',
    kd_Name1: '[kd_Name1]',
    kd_Name2: '[kd_Name2]',
    kd_PLZ: '[kd_PLZ]',
    kd_Aussendienst: '[kd_Aussendienst]',
    kd_Region: '[kd_Region]',
    kd_Ort: '[kd_Ort]',
    kd_LK: '[kd_LK]',
    kd_eMail: '[kd_eMail]',
    kd_Telefon: '[kd_Telefon]',
  };
  return map[String(sort || '').trim()] || '[kd_Name1]';
}

function qualifyCustomerSortField(sortField, alias = 'k') {
  return String(sortField || '[kd_Name1]').replace(/\[([^\]]+)\]/g, `[${alias}].[$1]`);
}

function resolveSearchField(searchField) {
  const key = String(searchField || '').trim().toLowerCase();
  if (key === 'plz') return 'plz';
  if (key === 'region') return 'region';
  if (key === 'sales') return 'sales';
  return 'name';
}

function resolveInvoiceScope(scope) {
  const value = String(scope || '').trim().toLowerCase();
  if (value === '3m' || value === '6m' || value === 'year' || value === 'all') return value;
  return 'open';
}

function resolveOfferScope(scope) {
  const value = String(scope || '').trim().toLowerCase();
  if (value === '90d' || value === '3m') return '3m';
  if (value === '6m' || value === 'year') return value;
  return '3m';
}

function resolveOrderScope(scope) {
  const value = String(scope || '').trim().toLowerCase();
  if (value === '3m' || value === '6m' || value === 'year' || value === 'all') return value;
  return 'open';
}

function resolveCalendarYear(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (Number.isInteger(parsed) && parsed >= 1900 && parsed <= 2100) return parsed;
  return new Date().getFullYear();
}

function buildDocumentDateFilter(column, scope, year) {
  if (scope === '3m') {
    return {
      sql: `AND ${column} >= DATEADD(MONTH, -3, CONVERT(date, GETDATE()))`,
      params: [],
      year: null,
    };
  }
  if (scope === '6m') {
    return {
      sql: `AND ${column} >= DATEADD(MONTH, -6, CONVERT(date, GETDATE()))`,
      params: [],
      year: null,
    };
  }
  if (scope === 'year') {
    const selectedYear = resolveCalendarYear(year);
    return {
      sql: `AND ${column} >= DATEFROMPARTS(?, 1, 1)
        AND ${column} < DATEFROMPARTS(?, 1, 1)`,
      params: [selectedYear, selectedYear + 1],
      year: selectedYear,
    };
  }
  return { sql: '', params: [], year: null };
}

function pickReminderStageValue(reminderTextId, reminderTextIdNew) {
  const current = Number(reminderTextId);
  const next = Number(reminderTextIdNew);
  const currentStage = Number.isFinite(current) && current > 0 ? current : 0;
  const nextStage = Number.isFinite(next) && next > 0 ? next : 0;
  return nextStage > currentStage ? nextStage : currentStage;
}

function buildWhereClause(q, searchField, options = {}) {
  const text = String(q || '').trim();
  const clauses = [];
  const params = [];
  const customerAlias = toText(options.customerAlias);
  const col = (name) => customerAlias ? `[${customerAlias}].${name}` : name;

  const customerAccess = options.customerAccess || null;
  if (customerAccess?.whereSql) {
    clauses.push(`(${customerAccess.whereSql})`);
    params.push(...(Array.isArray(customerAccess.params) ? customerAccess.params : []));
  }

  if (options.reminderOnly) {
    clauses.push(`COALESCE([rc].[reminderInvoicesCount], 0) > 0`);
  }

  if (!text) {
    return {
      whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
      params,
    };
  }

  const like = `%${text}%`;
  const mode = resolveSearchField(searchField);
  const fields = mode === 'plz'
    ? [col('[kd_PLZ]')]
    : mode === 'region'
      ? [col('[kd_Region]')]
      : mode === 'sales'
        ? [col('[kd_Aussendienst]')]
        : [col('[kd_Name1]'), col('[kd_Name2]')];
  const searchClauses = fields.map((f) => `${f} LIKE ?`);
  clauses.push(`(${searchClauses.join(' OR ')})`);
  return {
    whereSql: `WHERE ${clauses.join(' AND ')}`,
    params: [...params, ...fields.map(() => like)],
  };
}

async function requireVisibleCustomer(req, customerId, accessScope = null) {
  const id = toText(customerId);
  if (!id) {
    throw createHttpError(400, 'Missing customer id.', { code: 'INVALID_CUSTOMER_ID' });
  }

  const scope = accessScope || await getCustomerAccessScope(req.userEmail, req.database);
  const customer = await loadVisibleCustomer(req.database, id, scope);
  if (!customer) {
    throw createHttpError(404, `customers not found: ${id}`, { code: 'CUSTOMER_NOT_FOUND', id });
  }
  return customer;
}

function getReminderCountsCte() {
  return `
    WITH [reminder_counts] AS (
      SELECT
        COALESCE([re_KdNr], '') AS customerId,
        COUNT(*) AS reminderInvoicesCount
      FROM [dbo].[tblRechnung]
      WHERE [re_Bezahlt] = 0
        AND (
          COALESCE([re_MahnTextID], 0) > 0
          OR COALESCE([re_MahnTextIDneu], 0) > 0
        )
      GROUP BY COALESCE([re_KdNr], '')
    )
  `;
}

async function loadActiveCustomerIds(database) {
  const databaseName = toText(database?.databaseName || database?.name || database?.database);
  const cached = activeCustomersCache.get(databaseName);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }

  const promise = runSQLQueryAccess(database, `
    SELECT [activity].[kdH_KdNR] AS customerId
    FROM [dbo].[tblKun_Historie] [activity]
    WHERE [activity].[kdH_Datum] >= DATEADD(YEAR, -2, CONVERT(date, GETDATE()))
      AND COALESCE([activity].[kdH_KdNR], '') <> ''
    UNION
    SELECT [invoice].[re_KdNr]
    FROM [dbo].[tblRechnung] [invoice]
    WHERE [invoice].[re_RgDatum] >= DATEADD(YEAR, -2, CONVERT(date, GETDATE()))
      AND COALESCE([invoice].[re_KdNr], '') <> ''
    UNION
    SELECT [customer_order].[au_KdNr]
    FROM [dbo].[tblAuftrag] [customer_order]
    WHERE [customer_order].[au_Auftragsdatum] >= DATEADD(YEAR, -2, CONVERT(date, GETDATE()))
      AND COALESCE([customer_order].[au_KdNr], '') <> ''
    UNION
    SELECT [offer].[an_KdNR]
    FROM [dbo].[tblAngebot] [offer]
    WHERE [offer].[an_Angebotsdatum] >= DATEADD(YEAR, -2, CONVERT(date, GETDATE()))
      AND COALESCE([offer].[an_KdNR], '') <> ''
  `).then((rows) => (Array.isArray(rows) ? rows : [])
    .map((row) => toText(row.customerId))
    .filter(Boolean));

  activeCustomersCache.set(databaseName, {
    expiresAt: Date.now() + ACTIVE_CUSTOMERS_TTL_MS,
    promise,
  });

  try {
    return await promise;
  } catch (error) {
    activeCustomersCache.delete(databaseName);
    throw error;
  }
}

function toText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function toDateOnly(value) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = (part) => String(part).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }

  const text = toText(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function getTodayDateOnly() {
  return toDateOnly(new Date());
}

async function loadCustomerCreditLimit(database, customerId) {
  const rows = await runSQLQueryAccess(database, `
    SELECT TOP 1
      [kdKL_Kredit_Limit] AS amount,
      [kdKL_Kredit_Datum_bis] AS validUntil
    FROM [dbo].[tblKun_KreditLimit]
    WHERE [kdKL_KdNR] = ?
    ORDER BY [kdKL_Kredit_Datum] DESC, [kdKL_LfdNr] DESC
  `, [customerId]);

  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row) {
    return { amount: null, validUntil: null, status: 'missing' };
  }

  const amount = row.amount === null || row.amount === undefined || toText(row.amount) === ''
    ? null
    : Number(row.amount);
  const validUntil = toDateOnly(row.validUntil);
  if (!Number.isFinite(amount)) {
    return { amount: null, validUntil, status: 'missing' };
  }

  const expired = Boolean(validUntil && validUntil < getTodayDateOnly());
  return {
    amount,
    validUntil,
    status: expired ? 'expired' : 'active',
  };
}

function buildProductIdFromViewRow(row) {
  return [
    toText(row?.article),
    toText(row?.warehouse),
    toText(row?.beNumber),
    toText(row?.plastic),
    toText(row?.sub),
  ].join(PRODUCT_ID_SEPARATOR);
}

function parseMfiFromText(value) {
  const match = toText(value).match(/\bMFI\s*(?:ca\.?\s*)?([0-9]+(?:[.,][0-9]+)?)/i);
  if (!match) return null;
  const parsed = Number(match[1].replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function isPpCopo3600Article(value) {
  const text = toText(value);
  return /\bpp[\s-]*(?:copo|c)\b/i.test(text) && /\b3600\b/i.test(text);
}

function resolvePurchasedArticleGroup(row) {
  if (isPpCopo3600Article(row.article)) {
    return { key: 'pp-copo-3600-og', name: 'PP Copo 3600 OG' };
  }

  const groupId = toText(row.articleGroupId);
  const groupName = toText(row.articleGroupName);
  if (groupId || groupName) {
    return {
      key: `article-group:${groupId || groupName.toLowerCase()}`,
      name: groupName || `Artikelgruppe ${groupId}`,
    };
  }

  const category = [toText(row.plastic), toText(row.plasticSubCategory)]
    .filter((value) => value && value.toLowerCase() !== 'unbekannt')
    .join(' ');
  if (category) return { key: `category:${category.toLowerCase()}`, name: category };
  return { key: 'other', name: 'Sonstige' };
}

function mapRepresentatives(rows) {
  return (rows || [])
    .map((row) => {
      const firstName = toText(row.kdA_Vorname);
      const lastName = toText(row.kdA_Name);
      const salutation = toText(row.kdA_Anrede);
      const name = [salutation, firstName, lastName].filter(Boolean).join(' ').trim();
      const phone = toText(row.kdA_Telefon) || toText(row.kdA_PrivatTel) || toText(row.kdA_Handy);
      const email = toText(row.kdA_eMail);
      const position = toText(row.kdA_Position);
      const id = null;

      return { id, name, phone, email, position, salutation };
    })
    .filter((rep) => rep.name || rep.phone || rep.email);
}

function buildAddressText(row) {
  const name1 = toText(row?.kdL_Name1);
  const name2 = toText(row?.kdL_Name2);
  const street = toText(row?.kdL_Strasse);
  const plz = toText(row?.kdL_PLZ);
  const city = toText(row?.kdL_Ort);
  const country = toText(row?.kdL_LK);
  const plzCity = [plz, city].filter(Boolean).join(' ');
  return [name1, name2, street, plzCity, country].filter(Boolean).join(', ');
}

function resolveLang(req) {
  const raw = String(req?.header?.('x-lang') || '').trim().toLowerCase();
  return raw === 'en' ? 'en' : 'de';
}

async function loadPaymentTextMap(ids, lang) {
  const list = Array.isArray(ids)
    ? ids.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
    : [];
  if (!list.length) return new Map();
  const placeholders = list.map(() => '?').join(', ');
  const safeLang = String(lang || 'de').toLowerCase() === 'en' ? 'en' : 'de';
  const sql = `
    SELECT [zaS_ID] AS id, [zaS_Zahl_Text] AS text
    FROM [dbo].[tblZahltext_Sprachen]
    WHERE LOWER(COALESCE([zaS_SprachID], '')) = ?
      AND [zaS_ID] IN (${placeholders})
  `;
  const rows = await runSQLQuerySqlServer(config.sql.database, sql, [safeLang, ...list]);
  const map = new Map();
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const id = Number(row.id);
    if (Number.isFinite(id) && id > 0) map.set(id, toText(row.text));
  }
  return map;
}

async function loadReminderStageTextMap(database, ids, lang) {
  const list = Array.isArray(ids)
    ? ids.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
    : [];
  if (!list.length) return new Map();

  const altList = [...new Set(list)];
  const altPlaceholders = altList.map(() => '?').join(', ');
  const safeLang = String(lang || 'de').toLowerCase() === 'en' ? 'en' : 'de';
  const textRows = await runSQLQueryAccess(database, `
    SELECT [ma_AlternativeNR] AS alternativeNo, [ma_TextMahnung_Ueberschrift] AS text
    FROM [dbo].[tblMahnung_Texte]
    WHERE LOWER(COALESCE([ma_SprachID], '')) = ?
      AND [ma_AlternativeNR] IN (${altPlaceholders})
  `, [safeLang, ...altList]);

  const alternativeToText = new Map();
  for (const row of (Array.isArray(textRows) ? textRows : [])) {
    const alternativeNo = Number(row.alternativeNo);
    if (Number.isFinite(alternativeNo) && alternativeNo > 0) {
      alternativeToText.set(alternativeNo, toText(row.text));
    }
  }

  const map = new Map();
  for (const alternativeNo of altList) {
    map.set(alternativeNo, {
      alternativeNo,
      text: alternativeToText.get(alternativeNo) || '',
    });
  }
  return map;
}

// LIST (all columns from dbo.tblKunden)
router.get('/customers', requireMandant, asyncHandler(async (req, res) => {
  const accessScope = await getCustomerAccessScope(req.userEmail, req.database);
  const reminderOnly = String(req.query.reminderOnly || '').trim() === '1';
  const includeInactive = String(req.query.includeInactive || '').trim() === '1';
  const { page, pageSize, q, sort, dir } = parseListParams(req.query, {
    page: 1,
    pageSize: 25,
    sort: 'kd_Name1',
    dir: 'ASC',
  });

  const safeSort = resolveSortField(sort);
  const safeDir = normalizeDir(dir);
  const searchField = resolveSearchField(req.query.searchField);
  const activeOnly = !reminderOnly && !includeInactive;
  const activeCustomerIds = activeOnly ? await loadActiveCustomerIds(req.database) : [];
  const activeCustomerIdsJson = activeOnly ? JSON.stringify(activeCustomerIds) : null;
  const activeJoinSql = activeOnly
    ? `INNER JOIN OPENJSON(?) [active_customer] ON [active_customer].[value] = [k].[kd_KdNR]`
    : '';
  const { whereSql, params } = buildWhereClause(q, searchField, {
    customerAccess: accessScope.customerAccess,
    customerAlias: 'k',
    reminderOnly,
  });
  const queryParams = activeOnly ? [activeCustomerIdsJson, ...params] : params;
  const offset = (page - 1) * pageSize;

  const cteSql = getReminderCountsCte();
  const countSql = `
    ${cteSql}
    SELECT COUNT(*) AS total
    FROM [dbo].[tblKunden] [k]
    ${activeJoinSql}
    LEFT JOIN [reminder_counts] [rc]
      ON COALESCE([k].[kd_KdNR], '') = [rc].[customerId]
    ${whereSql}
  `;
  const totalResult = await runSQLQueryAccess(req.database, countSql, queryParams);
  const total = normalizeTotal(totalResult);

  const dataSql = `
    ${cteSql}
    SELECT
      [k].*,
      COALESCE([rc].[reminderInvoicesCount], 0) AS reminderInvoicesCount
    FROM [dbo].[tblKunden] [k]
    ${activeJoinSql}
    LEFT JOIN [reminder_counts] [rc]
      ON COALESCE([k].[kd_KdNR], '') = [rc].[customerId]
    ${whereSql}
    ORDER BY ${qualifyCustomerSortField(safeSort)} ${safeDir}
    OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
  `;
  const rows = await runSQLQueryAccess(req.database, dataSql, [...queryParams, offset, pageSize]);

  sendEnvelope(res, {
    status: 200,
    data: rows,
    meta: {
      mandant: req.mandant,
      databaseName: req.database?.databaseName || null,
      page,
      pageSize,
      count: Array.isArray(rows) ? rows.length : 0,
      total,
      q,
      searchField,
      reminderOnly,
      includeInactive,
      activityWindowYears: 2,
      sort: String(sort || 'kd_Name1'),
      dir: safeDir,
    },
    error: null,
  });
}));

router.get('/customers/reminders-summary', requireMandant, asyncHandler(async (req, res) => {
  const accessScope = await getCustomerAccessScope(req.userEmail, req.database);
  const { whereSql, params } = buildWhereClause('', 'name', {
    customerAccess: accessScope.customerAccess,
    customerAlias: 'k',
    reminderOnly: true,
  });
  const sql = `
    ${getReminderCountsCte()}
    SELECT COUNT(*) AS total
    FROM [dbo].[tblKunden] [k]
    LEFT JOIN [reminder_counts] [rc]
      ON COALESCE([k].[kd_KdNR], '') = [rc].[customerId]
    ${whereSql}
  `;
  const rows = await runSQLQueryAccess(req.database, sql, params);
  const total = Number(normalizeTotal(rows) || 0);

  sendEnvelope(res, {
    status: 200,
    data: { count: total },
    meta: { mandant: req.mandant },
    error: null,
  });
}));

// DETAIL (all columns from dbo.tblKunden)
router.get('/customers/:id', requireMandant, asyncHandler(async (req, res) => {
  const id = toText(req.params.id);
  const accessScope = await getCustomerAccessScope(req.userEmail, req.database);
  const item = await requireVisibleCustomer(req, id, accessScope);

  const creditLimit = await loadCustomerCreditLimit(req.database, id);

  const repsSql = `
    SELECT [kdA_Vorname], [kdA_Name], [kdA_Anrede], [kdA_Position], [kdA_Telefon], [kdA_PrivatTel], [kdA_Handy], [kdA_eMail]
    FROM [dbo].[tblKun_Ansprech]
    WHERE [kdA_KdNR] = ?
    ORDER BY [kdA_Name] ASC, [kdA_Vorname] ASC
  `;
  const repsRows = await runSQLQueryAccess(req.database, repsSql, [id]);
  const representatives = mapRepresentatives(repsRows);

  const reminderRows = await runSQLQueryAccess(req.database, `
    SELECT [re_MahnTextID] AS reminderTextId, [re_MahnTextIDneu] AS reminderTextIdNew
    FROM [dbo].[tblRechnung]
    WHERE COALESCE([re_KdNr], '') = ?
      AND [re_Bezahlt] = 0
  `, [id]);
  const reminderInvoicesCount = (Array.isArray(reminderRows) ? reminderRows : [])
    .filter((row) => pickReminderStageValue(row.reminderTextId, row.reminderTextIdNew) > 0)
    .length;

  const activityRows = await runSQLQueryAccess(req.database, `
    SELECT [kdH_Beschr] AS text, [kdH_Datum] AS noteDate
    FROM [dbo].[tblKun_Historie]
    WHERE [kdH_KdNR] = ?
    ORDER BY [kdH_Datum] DESC
  `, [id]);
  const activities = (Array.isArray(activityRows) ? activityRows : [])
    .map((row, index) => ({
      id: `${id}-activity-${index + 1}`,
      text: toText(row?.text),
      noteDate: row?.noteDate || null,
    }))
    .filter((row) => row.text);

  const detail = {
    ...item,
    creditLimit,
    representatives,
    reminderInvoicesCount,
    activities,
  };

  sendEnvelope(res, {
    status: 200,
    data: detail,
    meta: {
      mandant: req.mandant,
      databaseName: req.database?.databaseName || null,
      idField: 'kd_KdNR',
      id,
    },
    error: null,
  });
}));

router.get('/customers/:id/delivery-addresses', requireMandant, asyncHandler(async (req, res) => {
  const id = toText(req.params.id);
  if (!id) {
    throw createHttpError(400, 'Missing customer id.', { code: 'INVALID_CUSTOMER_ID' });
  }
  await requireVisibleCustomer(req, id);

  const sql = `
    SELECT
      [kdL_KdNR],
      [kdL_Lieferanschrift_Nr],
      [kdL_Kurz],
      [kdL_Name1],
      [kdL_Name2],
      [kdL_Strasse],
      [kdL_LK],
      [kdL_PLZ],
      [kdL_Ort],
      [kdL_Region],
      [kdL_Kontrakt],
      [kdL_Abhol]
    FROM [dbo].[tblKun_LiefAdress]
    WHERE COALESCE([kdL_KdNR], '') = ?
    ORDER BY [kdL_Lieferanschrift_Nr] ASC
  `;
  const rows = await runSQLQueryAccess(req.database, sql, [id]);
  const data = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      id: toText(row.kdL_Lieferanschrift_Nr),
      customerId: toText(row.kdL_KdNR),
      text: buildAddressText(row),
      short: toText(row.kdL_Kurz),
      name1: toText(row.kdL_Name1),
      name2: toText(row.kdL_Name2),
    }))
    .filter((x) => x.text);

  sendEnvelope(res, {
    status: 200,
    data,
    meta: {
      mandant: req.mandant,
      databaseName: req.database?.databaseName || null,
      idField: 'kdL_KdNR',
      id,
      count: data.length,
    },
    error: null,
  });
}));

router.get('/customers/:id/orders', requireMandant, asyncHandler(async (req, res) => {
  const customerId = toText(req.params.id);
  const lang = resolveLang(req);
  const scope = resolveOrderScope(req.query.scope);
  if (!customerId) {
    throw createHttpError(400, 'Missing customer id.', { code: 'INVALID_CUSTOMER_ID' });
  }
  await requireVisibleCustomer(req, customerId);

  const scopeFilterSql = scope === 'open'
    ? 'AND COALESCE([au_Abgeschlossen], 0) <> 1'
    : '';
  const dateFilter = buildDocumentDateFilter('[au_Auftragsdatum]', scope, req.query.year);

  const sql = `
    SELECT
      [au_Auftragsindex] AS orderIndex,
      [au_KontaktpersonAU] AS contact,
      [au_Zahltext] AS paymentTextId,
      [au_RGfaellig] AS dueDate,
      [au_Auftragsdatum] AS orderDate
    FROM [dbo].[tblAuftrag]
    WHERE COALESCE([au_KdNr], '') = ?
      ${scopeFilterSql}
      ${dateFilter.sql}
    ORDER BY [au_Auftragsdatum] DESC
  `;
  const rows = await runSQLQueryAccess(req.database, sql, [customerId, ...dateFilter.params]);
  const orders = Array.isArray(rows) ? rows : [];
  const indices = orders.map((x) => toText(x.orderIndex)).filter(Boolean);
  const paymentMap = await loadPaymentTextMap(orders.map((x) => x.paymentTextId), lang);

  let posMap = new Map();
  if (indices.length) {
    const placeholders = indices.map(() => '?').join(', ');
    const posSql = `
      SELECT
        [auP_Auftragsindex] AS orderIndex,
        [auP_Artikel] AS article,
        [auP_Anzahl] AS amount,
        [auP_Einheit] AS unit,
        [auP_Lieferdatum] AS deliveryDate,
        [auP_VK_EU] AS salePricePerTonneEu,
        [auP_VK_DM] AS salePricePerTonneDm
      FROM [dbo].[tblAuf_Position]
      WHERE [auP_Auftragsindex] IN (${placeholders})
      ORDER BY [auP_Auftragsindex] ASC
    `;
    const posRows = await runSQLQueryAccess(req.database, posSql, indices);
    posMap = new Map();
    for (const row of (Array.isArray(posRows) ? posRows : [])) {
      const key = toText(row.orderIndex);
      if (!key) continue;
      if (!posMap.has(key)) posMap.set(key, []);
      const salePricePerTonneEu = Number(row.salePricePerTonneEu);
      const salePricePerTonneDm = Number(row.salePricePerTonneDm);
      posMap.get(key).push({
        article: toText(row.article),
        amount: row.amount,
        unit: toText(row.unit),
        deliveryDate: row.deliveryDate || null,
        salePricePerTonne: Number.isFinite(salePricePerTonneEu)
          ? salePricePerTonneEu
          : (Number.isFinite(salePricePerTonneDm) ? salePricePerTonneDm : null),
      });
    }
  }

  const data = orders.map((row) => {
    const idx = toText(row.orderIndex);
    const paymentId = Number(row.paymentTextId);
    return {
      id: idx || null,
      contact: toText(row.contact),
      orderDate: row.orderDate || null,
      dueDate: row.dueDate || null,
      paymentTextId: Number.isFinite(paymentId) ? paymentId : null,
      paymentText: Number.isFinite(paymentId) ? (paymentMap.get(paymentId) || '') : '',
      positions: posMap.get(idx) || [],
    };
  });

  sendEnvelope(res, {
    status: 200,
    data,
    meta: {
      mandant: req.mandant,
      count: data.length,
      id: customerId,
      scope,
      year: dateFilter.year,
    },
    error: null,
  });
}));

router.get('/customers/:id/offers', requireMandant, asyncHandler(async (req, res) => {
  const customerId = toText(req.params.id);
  const lang = resolveLang(req);
  const scope = resolveOfferScope(req.query.scope);
  if (!customerId) {
    throw createHttpError(400, 'Missing customer id.', { code: 'INVALID_CUSTOMER_ID' });
  }
  await requireVisibleCustomer(req, customerId);
  const dateFilter = buildDocumentDateFilter('[an_Angebotsdatum]', scope, req.query.year);

  const sql = `
    SELECT
      [an_Angebotsnummer] AS offerNo,
      [an_Kontaktperson] AS contact,
      [an_Zahltext] AS paymentTextId,
      [an_Angebotsdatum] AS offerDate
    FROM [dbo].[tblAngebot]
    WHERE COALESCE([an_KdNr], '') = ?
      ${dateFilter.sql}
    ORDER BY [an_Angebotsdatum] DESC
  `;
  const rows = await runSQLQueryAccess(req.database, sql, [customerId, ...dateFilter.params]);
  const offers = Array.isArray(rows) ? rows : [];
  const offerNos = offers.map((x) => toText(x.offerNo)).filter(Boolean);
  const paymentMap = await loadPaymentTextMap(offers.map((x) => x.paymentTextId), lang);

  let posMap = new Map();
  if (offerNos.length) {
    const placeholders = offerNos.map(() => '?').join(', ');
    const posSql = `
      SELECT
        [anP_AngebotsNr] AS offerNo,
        [anP_Artikel] AS article,
        [anP_Anzahl] AS amount,
        [anP_Einheit] AS unit,
        [anP_VK_EU] AS priceEu,
        [anP_VK_DM] AS priceDm
      FROM [dbo].[tblAng_Position]
      WHERE COALESCE([anP_AngebotsNr], '') IN (${placeholders})
      ORDER BY [anP_AngebotsNr] ASC
    `;
    const posRows = await runSQLQueryAccess(req.database, posSql, offerNos);
    posMap = new Map();
    for (const row of (Array.isArray(posRows) ? posRows : [])) {
      const key = toText(row.offerNo);
      if (!key) continue;
      if (!posMap.has(key)) posMap.set(key, []);
      const eu = Number(row.priceEu);
      const dm = Number(row.priceDm);
      posMap.get(key).push({
        article: toText(row.article),
        amount: row.amount,
        unit: toText(row.unit),
        offeredPrice: Number.isFinite(eu) ? eu : (Number.isFinite(dm) ? dm : null),
      });
    }
  }

  const data = offers.map((row) => {
    const offerNo = toText(row.offerNo);
    const paymentId = Number(row.paymentTextId);
    return {
      id: offerNo,
      contact: toText(row.contact),
      offerDate: row.offerDate || null,
      paymentTextId: Number.isFinite(paymentId) ? paymentId : null,
      paymentText: Number.isFinite(paymentId) ? (paymentMap.get(paymentId) || '') : '',
      positions: posMap.get(offerNo) || [],
    };
  });

  sendEnvelope(res, {
    status: 200,
    data,
    meta: {
      mandant: req.mandant,
      count: data.length,
      id: customerId,
      scope,
      year: dateFilter.year,
    },
    error: null,
  });
}));

router.get('/customers/:id/invoices', requireMandant, asyncHandler(async (req, res) => {
  const customerId = toText(req.params.id);
  const lang = resolveLang(req);
  const scope = resolveInvoiceScope(req.query.scope);
  if (!customerId) {
    throw createHttpError(400, 'Missing customer id.', { code: 'INVALID_CUSTOMER_ID' });
  }
  await requireVisibleCustomer(req, customerId);

  const scopeFilterSql = scope === 'open' ? 'AND [re_Bezahlt] = 0' : '';
  const dateFilter = buildDocumentDateFilter('[re_rgDatum]', scope, req.query.year);

  const sql = `
    SELECT
      [re_RgNummer] AS invoiceNumber,
      [re_rgDatum] AS invoiceDate,
      [re_RGfaellig] AS dueDate,
      [re_Bezahlt] AS paidFlag,
      [re_Zahltext] AS paymentTextId,
      [re_MahnTextID] AS reminderTextId,
      [re_MahnTextIDneu] AS reminderTextIdNew,
      [re_Bruttosumme_EU] AS grossEu,
      [re_Bruttosumme_DM] AS grossDm
    FROM [dbo].[tblRechnung]
    WHERE COALESCE([re_KdNr], '') = ?
      ${scopeFilterSql}
      ${dateFilter.sql}
    ORDER BY [re_rgDatum] DESC
  `;
  const rows = await runSQLQueryAccess(req.database, sql, [customerId, ...dateFilter.params]);
  const invoices = Array.isArray(rows) ? rows : [];
  const paymentMap = await loadPaymentTextMap(invoices.map((x) => x.paymentTextId), lang);
  const reminderMap = await loadReminderStageTextMap(
    req.database,
    invoices.flatMap((x) => [x.reminderTextId, x.reminderTextIdNew]),
    lang,
  );

  const data = invoices.map((row, idx) => {
    const paidFlag = Number(row.paidFlag);
    const paymentId = Number(row.paymentTextId);
    const reminderId = Number(row.reminderTextId);
    const reminderIdNew = Number(row.reminderTextIdNew);
    const reminderCurrent = Number.isFinite(reminderId) ? (reminderMap.get(reminderId) || null) : null;
    const reminderNew = Number.isFinite(reminderIdNew) ? (reminderMap.get(reminderIdNew) || null) : null;
    const reminderStageValue = pickReminderStageValue(reminderId, reminderIdNew);
    const reminderStage = reminderStageValue > 0 ? (reminderMap.get(reminderStageValue) || null) : null;
    const eu = Number(row.grossEu);
    const dm = Number(row.grossDm);
    const invoiceDate = row.invoiceDate || null;
    return {
      id: `${invoiceDate || 'inv'}-${idx + 1}`,
      invoiceNumber: toText(row.invoiceNumber),
      invoiceDate,
      dueDate: row.dueDate || null,
      isPaid: paidFlag !== 0,
      amount: Number.isFinite(eu) ? eu : (Number.isFinite(dm) ? dm : null),
      paymentTextId: Number.isFinite(paymentId) ? paymentId : null,
      paymentText: Number.isFinite(paymentId) ? (paymentMap.get(paymentId) || '') : '',
      reminderStage: reminderStage?.alternativeNo || null,
      reminderStageText: reminderStage?.text || '',
    };
  });

  sendEnvelope(res, {
    status: 200,
    data,
    meta: {
      mandant: req.mandant,
      count: data.length,
      id: customerId,
      scope,
      year: dateFilter.year,
    },
    error: null,
  });
}));

router.get('/customers/:id/purchased-articles', requireMandant, asyncHandler(async (req, res) => {
  const customerId = toText(req.params.id);
  if (!customerId) {
    throw createHttpError(400, 'Missing customer id.', { code: 'INVALID_CUSTOMER_ID' });
  }
  await requireVisibleCustomer(req, customerId);

  const sql = `
    SELECT DISTINCT
      [p].[reP_Artikelindex] AS articleIndex,
      [p].[reP_Artikel] AS article
    FROM [dbo].[tblRech_Position] p
    INNER JOIN [dbo].[tblRechnung] r
      ON COALESCE([r].[re_RgNummer], '') = COALESCE([p].[reP_Rgnummer], '')
    WHERE COALESCE([r].[re_KdNr], '') = ?
      AND COALESCE([p].[reP_Artikel], '') <> ''
    ORDER BY [p].[reP_Artikel] ASC
  `;
  const rows = await runSQLQueryAccess(req.database, sql, [customerId]);
  const purchasedRows = Array.isArray(rows) ? rows : [];

  const articleIndexes = [...new Set(purchasedRows
    .map((row) => toText(row.articleIndex))
    .filter(Boolean))];
  const articleMetaMap = new Map();
  if (articleIndexes.length) {
    const placeholders = articleIndexes.map(() => '?').join(', ');
    const metaRows = await runSQLQueryAccess(req.database, `
      SELECT
        [a].[agA_Artikelindex] AS articleIndex,
        [a].[agA_Artikelgruppe] AS articleGroupId,
        [g].[ag_Gruppenname] AS articleGroupName,
        [a].[agA_MFI] AS mfi,
        [plastic].[art4_Bezeichnung] AS plastic,
        [plasticSub].[art5_Bezeichnung] AS plasticSubCategory
      FROM [dbo].[tblArt_Artikel] [a]
      LEFT JOIN [dbo].[tblArtikelgruppe] [g]
        ON [g].[ag_Gruppenindex] = [a].[agA_Artikelgruppe]
      LEFT JOIN [dbo].[tblArt4_Kunststoff] [plastic]
        ON [plastic].[art4_ID_Kunststoff] = [a].[agA_ID_Kunststoff]
      LEFT JOIN [dbo].[tblArt5_KunststoffUnter] [plasticSub]
        ON [plasticSub].[art5_ID_Kunststoff] = [a].[agA_ID_Kunststoff]
       AND [plasticSub].[art5_ID_KunststoffUnter] = [a].[agA_ID_KunststoffUnter]
      WHERE [a].[agA_Artikelindex] IN (${placeholders})
    `, articleIndexes);
    for (const row of (Array.isArray(metaRows) ? metaRows : [])) {
      const articleIndex = toText(row.articleIndex);
      if (articleIndex) articleMetaMap.set(articleIndex, row);
    }
  }

  const articles = [...new Set(purchasedRows
    .map((row) => toText(row.article))
    .filter(Boolean))];
  const viewMap = new Map();
  if (articles.length) {
    const placeholders = articles.map(() => '?').join(', ');
    const viewRows = await runSQLQueryAccess(req.database, `
      SELECT
        [Artikel] AS article,
        [Lagerort] AS warehouse,
        [Bestell-Pos] AS beNumber,
        [Kunststoff] AS plastic,
        [Kunststoff_Untergruppe] AS sub
      FROM ${PRODUCTS_VIEW_SQL}
      WHERE COALESCE([Artikel], '') IN (${placeholders})
    `, articles);

    const groupedViewRows = new Map();
    for (const viewRow of (Array.isArray(viewRows) ? viewRows : [])) {
      const article = toText(viewRow.article);
      if (!article) continue;
      if (!groupedViewRows.has(article)) groupedViewRows.set(article, []);
      groupedViewRows.get(article).push(viewRow);
    }

    for (const article of articles) {
      const candidates = groupedViewRows.get(article) || [];
      const chosen = candidates[0] || null;
      if (chosen) {
        viewMap.set(article, buildProductIdFromViewRow(chosen));
      }
    }
  }

  const groups = new Map();
  const seenArticles = new Set();
  for (const row of purchasedRows) {
    const article = toText(row.article);
    if (!article || seenArticles.has(article)) continue;
    seenArticles.add(article);
    const articleIndex = toText(row.articleIndex);
    const meta = articleMetaMap.get(articleIndex) || {};
    const group = resolvePurchasedArticleGroup({
      article,
      articleGroupId: meta.articleGroupId,
      articleGroupName: meta.articleGroupName,
      plastic: meta.plastic,
      plasticSubCategory: meta.plasticSubCategory,
    });
    if (!groups.has(group.key)) groups.set(group.key, { ...group, articles: [] });

    const textMfi = parseMfiFromText(article);
    const masterMfi = Number(meta.mfi);
    const mfi = textMfi !== null
      ? textMfi
      : (Number.isFinite(masterMfi) ? masterMfi : null);
    const groupArticles = groups.get(group.key).articles;
    groupArticles.push({
      id: `${customerId}-purchased-article-${group.key}-${groupArticles.length + 1}`,
      article,
      articleIndex: articleIndex || null,
      mfi,
      productId: viewMap.get(article) || null,
    });
  }

  const data = Array.from(groups.values())
    .map((group) => ({
      ...group,
      articles: group.articles.sort((left, right) => {
        if (left.mfi === null && right.mfi !== null) return 1;
        if (left.mfi !== null && right.mfi === null) return -1;
        if (left.mfi !== null && right.mfi !== null && left.mfi !== right.mfi) {
          return left.mfi - right.mfi;
        }
        return left.article.localeCompare(right.article, 'de');
      }),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'de'));

  sendEnvelope(res, {
    status: 200,
    data,
    meta: {
      mandant: req.mandant,
      count: data.reduce((total, group) => total + group.articles.length, 0),
      groupCount: data.length,
      id: customerId,
    },
    error: null,
  });
}));

module.exports = router;
