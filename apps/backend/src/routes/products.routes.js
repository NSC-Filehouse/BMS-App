const express = require('express');
const { asyncHandler, createHttpError, sendEnvelope, parseListParams } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { runSQLQueryAccess } = require('../db/access');

const router = express.Router();
const VIEW_SQL = '[dbo].[qryMengen_Verfügbarkeitsliste_fürAPP]';
const ID_SEPARATOR = '||';

function normalizeDir(dir) {
  return String(dir || '').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
}

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildProductId(row) {
  const article = asText(row.Artikel);
  const warehouse = asText(row.Lagerort);
  const beNumber = asText(row['Bestell-Pos']);
  const plastic = asText(row.Kunststoff);
  const sub = asText(row.Kunststoff_Untergruppe);
  return [article, warehouse, beNumber, plastic, sub].join(ID_SEPARATOR);
}

function parseProductId(id) {
  const parts = String(id || '').split(ID_SEPARATOR);
  return {
    article: parts[0] || '',
    warehouse: parts[1] || '',
    beNumber: parts[2] || '',
    plastic: parts[3] || '',
    sub: parts[4] || '',
  };
}

function mapProductRow(row) {
  const categorySub = asText(row.Kunststoff_Untergruppe);
  const categoryMain = asText(row.Kunststoff);
  const category = categorySub || categoryMain;
  const mfiMeasured = asNumber(row.beP_MFIgemessen);
  const mfiBase = asNumber(row.beP_MFI);
  const mfi = mfiMeasured !== null ? mfiMeasured : mfiBase;

  return {
    id: buildProductId(row),
    article: asText(row.Artikel),
    articleName: asText(row.Artikel),
    category,
    amount: asNumber(row.Menge),
    unit: asText(row.Einheit),
    reserved: asNumber(row.bePR_Anzahl),
    about: asText(row.beP_VLbemerkung),
    acquisitionPrice: asNumber(row.EP),
    warehouse: asText(row.Lagerort),
    description: asText(row.txtLagerInfo),
    beNumber: asText(row['Bestell-Pos']),
    packaging: asText(row.beP_Additive),
    mfi,
    reservedBy: asText(row.bePR_reserviertVon),
    reservedUntil: asText(row.bePR_gueltigBis),
    mfiTestMethod: asText(row.beP_MFI_Pruefmethode),
    warehouseSection: asText(row.beP_LagerBeiStrecke),
    storageId: asText(row.beP_LagerID),
    plastic: categoryMain,
    plasticSubCategory: categorySub,
    storageInfo: asText(row.txtLagerInfo),
  };
}

function buildWhereClause(q) {
  const text = asText(q);
  if (!text) return { whereSql: '', params: [] };
  const like = `%${text}%`;
  const fields = ['[Artikel]', '[Kunststoff]', '[Kunststoff_Untergruppe]', '[Lagerort]', '[Bestell-Pos]'];
  const clauses = fields.map((f) => `${f} LIKE ?`);
  return {
    whereSql: `WHERE (${clauses.join(' OR ')})`,
    params: fields.map(() => like),
  };
}

function resolveSort(sort) {
  const map = {
    article: '[Artikel]',
    category: '[Kunststoff_Untergruppe]',
    amount: '[Menge]',
    warehouse: '[Lagerort]',
    reserved: '[bePR_Anzahl]',
    beNumber: '[Bestell-Pos]',
    // compatibility with old callers
    agA_Artikelname: '[Artikel]',
    agA_Artikelindex: '[Artikel]',
    id: '[Artikel]',
  };
  return map[String(sort || '').trim()] || '[Artikel]';
}

function normalizeTotal(rows) {
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || typeof row !== 'object') return null;
  return row.total ?? row.TOTAL ?? row.Total ?? Object.values(row)[0] ?? null;
}

router.get('/products', requireMandant, asyncHandler(async (req, res) => {
  const { page, pageSize, q, sort, dir } = parseListParams(req.query, {
    page: 1,
    pageSize: 25,
    sort: 'article',
    dir: 'ASC',
  });

  const safeSort = resolveSort(sort);
  const safeDir = normalizeDir(dir);
  const { whereSql, params } = buildWhereClause(q);
  const offset = (page - 1) * pageSize;

  const countSql = `SELECT COUNT(*) AS total FROM ${VIEW_SQL} ${whereSql}`;
  const totalRows = await runSQLQueryAccess(req.database, countSql, params);
  const total = normalizeTotal(totalRows);

  const dataSql = `
    SELECT *
    FROM ${VIEW_SQL}
    ${whereSql}
    ORDER BY ${safeSort} ${safeDir}
    OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
  `;
  const rows = await runSQLQueryAccess(req.database, dataSql, [...params, offset, pageSize]);
  const data = (rows || []).map(mapProductRow);

  sendEnvelope(res, {
    status: 200,
    data,
    meta: {
      mandant: req.mandant,
      databaseName: req.database?.databaseName || null,
      page,
      pageSize,
      count: data.length,
      total,
      q,
      sort: String(sort || 'article'),
      dir: safeDir,
    },
    error: null,
  });
}));

router.get('/products/:id', requireMandant, asyncHandler(async (req, res) => {
  const id = req.params.id;
  const key = parseProductId(id);

  const sql = `
    SELECT TOP 1 *
    FROM ${VIEW_SQL}
    WHERE COALESCE([Artikel], '') = ?
      AND COALESCE([Lagerort], '') = ?
      AND COALESCE([Bestell-Pos], '') = ?
      AND COALESCE([Kunststoff], '') = ?
      AND COALESCE([Kunststoff_Untergruppe], '') = ?
  `;
  const rows = await runSQLQueryAccess(req.database, sql, [
    key.article,
    key.warehouse,
    key.beNumber,
    key.plastic,
    key.sub,
  ]);

  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row) {
    throw createHttpError(404, `products not found: ${id}`);
  }

  sendEnvelope(res, {
    status: 200,
    data: mapProductRow(row),
    meta: { mandant: req.mandant, idField: 'id', id },
    error: null,
  });
}));

// No category tree for availability view; keep endpoint for frontend compatibility.
router.get('/product-categories', requireMandant, asyncHandler(async (req, res) => {
  sendEnvelope(res, {
    status: 200,
    data: [],
    meta: { mandant: req.mandant, count: 0 },
    error: null,
  });
}));

module.exports = router;
