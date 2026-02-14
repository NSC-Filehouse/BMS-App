const express = require('express');
const { asyncHandler, createHttpError, sendEnvelope, parseListParams } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { runSQLQueryAccess } = require('../db/access');
const { getUserPersonNumberByEmail } = require('../db/users');

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

function getField(row, key) {
  if (!row || typeof row !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  const wanted = String(key || '').toLowerCase();
  const foundKey = Object.keys(row).find((k) => String(k).toLowerCase() === wanted);
  return foundKey ? row[foundKey] : undefined;
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
  const categorySub = asText(getField(row, 'Kunststoff_Untergruppe'));
  const categoryMain = asText(getField(row, 'Kunststoff'));
  const category = categorySub || categoryMain;
  const mfiMeasured = asNumber(getField(row, 'beP_MFIgemessen'));
  const mfiBase = asNumber(getField(row, 'beP_MFI'));
  const mfi = mfiMeasured !== null ? mfiMeasured : mfiBase;

  return {
    id: buildProductId(row),
    article: asText(getField(row, 'Artikel')),
    articleName: asText(getField(row, 'Artikel')),
    category,
    amount: asNumber(getField(row, 'Menge')),
    unit: asText(getField(row, 'Einheit')),
    reserved: asNumber(getField(row, 'bePR_Anzahl')),
    about: asText(getField(row, 'beP_VLbemerkung')),
    acquisitionPrice: asNumber(getField(row, 'EP')),
    warehouse: asText(getField(row, 'Lagerort')),
    description: asText(getField(row, 'txtLagerInfo')),
    beNumber: asText(getField(row, 'Bestell-Pos')),
    packaging: asText(getField(row, 'beP_Additive')),
    mfi,
    reservedBy: asText(getField(row, 'bePR_reserviertVon')),
    reservedUntil: asText(getField(row, 'bePR_gueltigBis')),
    mfiTestMethod: asText(getField(row, 'beP_MFI_Pruefmethode')),
    warehouseSection: asText(getField(row, 'beP_LagerBeiStrecke')),
    storageId: asText(getField(row, 'bePL_LagerID')),
    plastic: categoryMain,
    plasticSubCategory: categorySub,
    storageInfo: asText(getField(row, 'txtLagerInfo')),
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

router.post('/products/reserve', requireMandant, asyncHandler(async (req, res) => {
  const userId = await getUserPersonNumberByEmail(req.userEmail);
  const amount = Number(req.body?.amount);
  const reservationEndDateRaw = req.body?.reservationEndDate;
  const comment = req.body?.comment ? String(req.body.comment).trim() : '';

  if (!Number.isFinite(amount) || amount <= 0) {
    throw createHttpError(400, 'Invalid reservation amount.');
  }
  const reservationEndDate = new Date(reservationEndDateRaw);
  if (!reservationEndDateRaw || Number.isNaN(reservationEndDate.getTime())) {
    throw createHttpError(400, 'Invalid reservation end date.');
  }

  let beNumber = req.body?.beNumber ? String(req.body.beNumber).trim() : '';
  let warehouseId = req.body?.warehouseId ? String(req.body.warehouseId).trim() : '';

  if ((!beNumber || !warehouseId) && req.body?.productId) {
    const key = parseProductId(String(req.body.productId));
    if (!beNumber) beNumber = key.beNumber;
  }

  if (!beNumber || !warehouseId) {
    throw createHttpError(400, 'Missing required reservation keys: beNumber and warehouseId.');
  }

  const createdBy = String(req.userEmail || '').trim() || null;
  const nowIso = new Date().toISOString();

  const insertSql = `
    INSERT INTO [dbo].[tblReservation]
      ([BENumber], [WarehouseId], [ReservationUserId], [Amount], [ReservationEndDate], [Comment], [CreatedBy], [CreateDate], [LastModifiedBy], [LastModifiedDate])
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  await runSQLQueryAccess(req.database, insertSql, [
    beNumber,
    warehouseId,
    userId,
    amount,
    reservationEndDate.toISOString(),
    comment,
    createdBy,
    nowIso,
    createdBy,
    nowIso,
  ]);

  const createdSql = `
    SELECT TOP 1 [Id] AS id, [BENumber] AS beNumber, [WarehouseId] AS warehouseId, [Amount] AS amount, [ReservationEndDate] AS reservationEndDate
    FROM [dbo].[tblReservation]
    WHERE [ReservationUserId] = ? AND [BENumber] = ? AND [WarehouseId] = ?
    ORDER BY [Id] DESC
  `;
  const rows = await runSQLQueryAccess(req.database, createdSql, [userId, beNumber, warehouseId]);
  const created = Array.isArray(rows) && rows.length ? rows[0] : null;

  sendEnvelope(res, {
    status: 201,
    data: created || { id: null, beNumber, warehouseId, amount, reservationEndDate },
    meta: { mandant: req.mandant, reservationUserId: userId },
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
