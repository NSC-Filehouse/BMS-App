const express = require('express');
const { asyncHandler, createHttpError, sendEnvelope, parseListParams } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { runSQLQueryAccess } = require('../db/access');

const router = express.Router();

const FROM_SQL_LIST = 'FROM [tblArt_Artikel] AS a ' +
  'LEFT JOIN [tblArtikelgruppe] AS g ON a.[agA_Artikelgruppe] = g.[ag_Gruppenindex]';

const FROM_SQL_DETAIL = FROM_SQL_LIST;

function isEnglish(req) {
  const lang = String(req.headers['x-lang'] || '').toLowerCase();
  return lang.startsWith('en');
}

const LIST_COLUMNS = [
  'a.[agA_Artikelindex] AS id',
  'a.[agA_Artikelname] AS article',
  'a.[agA_Artikelname] AS articleName',
  'g.[ag_Gruppenname] AS category',
  'NULL AS amount',
  'a.[agA_Einheit] AS unit',
  'NULL AS reserved',
  'a.[agA_interneInfo] AS about',
  'a.[agA_NettoEK_EU] AS acquisitionPrice',
  'NULL AS warehouse',
  'a.[agA_Beschreibung] AS description',
  'NULL AS beNumber',
].join(', ');

const DETAIL_COLUMNS = [
  LIST_COLUMNS,
  'a.[agA_KdNr_Lieferant] AS supplierId',
  'a.[agA_MFI] AS mfi',
].join(', ');

function normalizeDir(dir) {
  return String(dir).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
}

function buildWhereClause(q, groupId) {
  const text = (q || '').toString().trim();
  const conditions = [];
  const params = [];

  if (text) {
    const like = `%${text}%`;
    const fields = [
      'a.[agA_Artikelindex]',
      'a.[agA_Artikelname]',
      'g.[ag_Gruppenname]',
    ];
    const clauses = fields.map(f => `${f} LIKE ?`);
    conditions.push(`(${clauses.join(' OR ')})`);
    fields.forEach(() => params.push(like));
  }

  if (groupId !== null && groupId !== undefined && groupId !== '') {
    conditions.push('a.[agA_Artikelgruppe] = ?');
    params.push(groupId);
  }

  if (!conditions.length) return { whereSql: '', params: [] };
  return {
    whereSql: `WHERE ${conditions.join(' AND ')}`,
    params,
  };
}

function buildCountQuery(whereSql) {
  return `SELECT COUNT(*) AS total ${FROM_SQL_LIST} ${whereSql}`;
}

function buildPagedSelectQuery({ whereSql, orderBy, orderByOuter, dir, page, pageSize, columns }) {
  const safeDir = normalizeDir(dir);
  const orderSql = `ORDER BY ${orderBy} ${safeDir}`;
  const orderSqlOuter = `ORDER BY ${orderByOuter || orderBy} ${safeDir}`;

  if (page <= 1) {
    return `SELECT TOP ${pageSize} ${columns} ${FROM_SQL_LIST} ${whereSql} ${orderSql}`;
  }

  const skip = (page - 1) * pageSize;
  const topN = skip + pageSize;
  const reversedDir = safeDir === 'ASC' ? 'DESC' : 'ASC';

  const inner = `SELECT TOP ${topN} ${columns} ${FROM_SQL_LIST} ${whereSql} ${orderSql}`;
  const middle = `SELECT TOP ${pageSize} * FROM (${inner}) AS sub1 ORDER BY ${orderByOuter || orderBy} ${reversedDir}`;
  const outer = `SELECT * FROM (${middle}) AS sub2 ${orderSqlOuter}`;

  return outer;
}

function resolveOrderBy(sort) {
  const map = {
    agA_Artikelindex: { field: 'a.[agA_Artikelindex]', outer: 'id' },
    agA_Artikelname: { field: 'a.[agA_Artikelname]', outer: 'articleName' },
    agA_Artikelgruppe: { field: 'a.[agA_Artikelgruppe]', outer: 'agA_Artikelgruppe' },
    category: { field: 'g.[ag_Gruppenname]', outer: 'category' },
    article: { field: 'a.[agA_Artikelname]', outer: 'articleName' },
    id: { field: 'a.[agA_Artikelindex]', outer: 'id' },
  };
  return map[sort] || { field: 'a.[agA_Artikelname]', outer: 'articleName' };
}

// LIST
router.get('/products', requireMandant, asyncHandler(async (req, res) => {
  const { page, pageSize, q, sort, dir } = parseListParams(req.query, {
    page: 1,
    pageSize: 25,
    sort: 'agA_Artikelname',
    dir: 'ASC',
  });

  const groupIdRaw = req.query.groupId;
  const groupId = groupIdRaw === undefined || groupIdRaw === null || groupIdRaw === ''
    ? null
    : parseInt(groupIdRaw, 10);

  const orderBy = resolveOrderBy(sort);
  const categoryField = isEnglish(req) ? 'g.[ag_Gruppenname_EN]' : 'g.[ag_Gruppenname]';
  const listColumns = LIST_COLUMNS.replace('g.[ag_Gruppenname] AS category', `${categoryField} AS category`);
  const { whereSql, params } = buildWhereClause(q, groupId);

  const countSql = buildCountQuery(whereSql);
  const totalResult = await runSQLQueryAccess(req.database, countSql, params);
  const totalRow = Array.isArray(totalResult) ? totalResult[0] : totalResult;
  const total = totalRow ? (totalRow.total ?? totalRow.TOTAL ?? totalRow.Total ?? Object.values(totalRow)[0] ?? null) : null;

  const dataSql = buildPagedSelectQuery({
    whereSql,
    orderBy: orderBy.field,
    orderByOuter: orderBy.outer,
    dir,
    page,
    pageSize,
    columns: listColumns,
  });
  const rows = await runSQLQueryAccess(req.database, dataSql, params);

  sendEnvelope(res, {
    status: 200,
    data: rows,
    meta: {
      mandant: req.mandant,
      page,
      pageSize,
      count: Array.isArray(rows) ? rows.length : 0,
      total,
      q,
      groupId,
      sort,
      dir,
    },
    error: null,
  });
}));

// DETAIL
router.get('/products/:id', requireMandant, asyncHandler(async (req, res) => {
  const id = req.params.id;
  const sql = `SELECT TOP 1 ${DETAIL_COLUMNS} ${FROM_SQL_DETAIL} WHERE a.[agA_Artikelindex] = ?`;
  const rows = await runSQLQueryAccess(req.database, sql, [id]);

  const item = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!item) {
    throw createHttpError(404, `products not found: ${id}`);
  }

  let packaging = null;
  const supplierId = item.supplierId;
  if (supplierId !== null && supplierId !== undefined && supplierId !== '') {
    const supplierRows = await runSQLQueryAccess(
      req.database,
      'SELECT TOP 1 [kd_Name1] FROM [tblKunden] WHERE [kd_KdNR] = ?',
      [supplierId]
    );
    const supplier = Array.isArray(supplierRows) && supplierRows.length ? supplierRows[0] : null;
    packaging = supplier ? (supplier.kd_Name1 ?? supplier.KD_NAME1 ?? Object.values(supplier)[0] ?? null) : null;
  }

  item.packaging = packaging;

  sendEnvelope(res, {
    status: 200,
    data: item,
    meta: { mandant: req.mandant, idField: 'agA_Artikelindex', id },
    error: null,
  });
}));

// CATEGORIES
router.get('/product-categories', requireMandant, asyncHandler(async (req, res) => {
  const groupsSql = 'SELECT [ag_Gruppenindex], [ag_Gruppenname], [ag_Gruppenname_EN], [ag_Hauptgruppe] FROM [tblArtikelgruppe]';
  const mainSql = 'SELECT [ah_HauptGruppenindex], [ah_HauptGruppenname], [ah_HauptGruppenname_EN] FROM [tblArtikelHauptgruppe]';

  const [groupsRaw, mainsRaw] = await Promise.all([
    runSQLQueryAccess(req.database, groupsSql, []),
    runSQLQueryAccess(req.database, mainSql, []),
  ]);

  const trimText = (val) => (val === null || val === undefined ? '' : String(val).trim());

  const useEn = isEnglish(req);
  const mains = (mainsRaw || [])
    .map(m => ({
      id: m.ah_HauptGruppenindex,
      name: trimText(useEn ? m.ah_HauptGruppenname_EN : m.ah_HauptGruppenname),
      children: [],
    }))
    .filter(m => m.name);

  const mainMap = new Map(mains.map(m => [m.id, m]));

  const groups = (groupsRaw || [])
    .map(g => ({
      id: g.ag_Gruppenindex,
      name: trimText(useEn ? g.ag_Gruppenname_EN : g.ag_Gruppenname),
      parentId: g.ag_Hauptgruppe,
      children: [],
    }))
    .filter(g => g.name);

  const roots = [];

  groups.forEach(g => {
    if (g.parentId !== null && g.parentId !== undefined && mainMap.has(g.parentId)) {
      mainMap.get(g.parentId).children.push(g);
    } else {
      roots.push(g);
    }
  });

  // Add main groups as top-level categories (with children)
  mains.forEach(m => {
    roots.push(m);
  });

  // Sort by name (German)
  const byName = (a, b) => a.name.localeCompare(b.name, 'de');
  roots.forEach(r => {
    if (Array.isArray(r.children)) r.children.sort(byName);
  });
  roots.sort(byName);

  sendEnvelope(res, {
    status: 200,
    data: roots,
    meta: { mandant: req.mandant, count: roots.length },
    error: null,
  });
}));

module.exports = router;
