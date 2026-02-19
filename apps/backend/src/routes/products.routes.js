const express = require('express');
const { asyncHandler, createHttpError, sendEnvelope, parseListParams } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { runSQLQueryAccess } = require('../db/access');
const { getUserIdentityByEmail } = require('../db/users');

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
    mfiMeasured,
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

function buildWhereClause(filters = {}) {
  const text = asText(filters.q);
  const plastic = asText(filters.plastic);
  const sub = asText(filters.sub);
  const subEmpty = String(filters.subEmpty || '') === '1';

  const clauses = [];
  const params = [];

  if (text) {
    const like = `%${text}%`;
    const fields = ['[Artikel]', '[Kunststoff]', '[Kunststoff_Untergruppe]', '[Lagerort]', '[Bestell-Pos]'];
    clauses.push(`(${fields.map((f) => `${f} LIKE ?`).join(' OR ')})`);
    params.push(...fields.map(() => like));
  }

  if (plastic) {
    clauses.push(`COALESCE([Kunststoff], '') = ?`);
    params.push(plastic);
  }

  if (subEmpty) {
    clauses.push(`COALESCE([Kunststoff_Untergruppe], '') = ''`);
  } else if (sub) {
    clauses.push(`COALESCE([Kunststoff_Untergruppe], '') = ?`);
    params.push(sub);
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
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
  const { whereSql, params } = buildWhereClause({
    q,
    plastic: req.query?.plastic,
    sub: req.query?.sub,
    subEmpty: req.query?.subEmpty,
  });
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
      plastic: asText(req.query?.plastic),
      sub: asText(req.query?.sub),
      subEmpty: String(req.query?.subEmpty || '') === '1',
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
    throw createHttpError(404, `products not found: ${id}`, { code: 'PRODUCT_NOT_FOUND', id });
  }

  sendEnvelope(res, {
    status: 200,
    data: mapProductRow(row),
    meta: { mandant: req.mandant, idField: 'id', id },
    error: null,
  });
}));

router.get('/products/:id/wpz', requireMandant, asyncHandler(async (req, res) => {
  const id = req.params.id;
  const key = parseProductId(id);
  const beNumber = asText(key.beNumber);
  if (!beNumber) {
    throw createHttpError(400, `Invalid product id for WPZ: ${id}`, { code: 'PRODUCT_NOT_FOUND', id });
  }

  const sql = `
    SELECT TOP 1 *
    FROM [dbo].[tblBest_Pos_WPZ]
    WHERE COALESCE([bePZ_BEposID], '') = ?
    ORDER BY [bePZ_ID] DESC
  `;
  const rows = await runSQLQueryAccess(req.database, sql, [beNumber]);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;

  if (!row) {
    sendEnvelope(res, {
      status: 200,
      data: { exists: false, beNumber, fields: [] },
      meta: { mandant: req.mandant, idField: 'id', id },
      error: null,
    });
    return;
  }

  const excluded = new Set(['bepz_id', 'ssma_timestamp']);
  const fields = Object.keys(row)
    .filter((k) => !excluded.has(String(k || '').toLowerCase()))
    .map((k) => ({
      key: k,
      value: row[k] === undefined ? null : row[k],
    }));

  sendEnvelope(res, {
    status: 200,
    data: { exists: true, beNumber, fields },
    meta: { mandant: req.mandant, idField: 'id', id },
    error: null,
  });
}));

router.post('/products/reserve', requireMandant, asyncHandler(async (req, res) => {
  const userIdentity = await getUserIdentityByEmail(req.userEmail);
  const userShortCode = String(userIdentity.shortCode || '').trim();
  const amount = Number(req.body?.amount);
  const reservationEndDateRaw = req.body?.reservationEndDate;
  const comment = req.body?.comment ? String(req.body.comment).trim() : '';

  if (!Number.isFinite(amount) || amount <= 0) {
    throw createHttpError(400, 'Invalid reservation amount.', { code: 'INVALID_RESERVATION_AMOUNT' });
  }
  const reservationEndDate = new Date(reservationEndDateRaw);
  if (!reservationEndDateRaw || Number.isNaN(reservationEndDate.getTime())) {
    throw createHttpError(400, 'Invalid reservation end date.', { code: 'INVALID_RESERVATION_END_DATE' });
  }

  let beNumber = req.body?.beNumber ? String(req.body.beNumber).trim() : '';
  let warehouseId = req.body?.warehouseId ? String(req.body.warehouseId).trim() : '';

  if ((!beNumber || !warehouseId) && req.body?.productId) {
    const key = parseProductId(String(req.body.productId));
    if (!beNumber) beNumber = key.beNumber;
  }

  if (!beNumber || !warehouseId) {
    throw createHttpError(400, 'Missing required reservation keys: beNumber and warehouseId.', { code: 'MISSING_RESERVATION_KEYS' });
  }
  if (!userShortCode) {
    throw createHttpError(403, 'Missing Mitarbeiterkuerzel (ma_Kuerzel) for current user.', { code: 'MISSING_USER_SHORT_CODE' });
  }

  const productSql = `
    SELECT TOP 1 [Menge] AS amount, [bePR_Anzahl] AS reserved
    FROM ${VIEW_SQL}
    WHERE COALESCE([Bestell-Pos], '') = ?
      AND COALESCE([bePL_LagerID], '') = ?
  `;
  const productRows = await runSQLQueryAccess(req.database, productSql, [beNumber, warehouseId]);
  const productRow = Array.isArray(productRows) && productRows.length ? productRows[0] : null;
  if (!productRow) {
    throw createHttpError(404, 'Product availability row not found for reservation.', { code: 'PRODUCT_AVAILABILITY_NOT_FOUND' });
  }
  const totalAmount = asNumber(getField(productRow, 'amount')) ?? asNumber(getField(productRow, 'Menge')) ?? 0;
  const alreadyReserved = asNumber(getField(productRow, 'reserved')) ?? asNumber(getField(productRow, 'bePR_Anzahl')) ?? 0;
  const availableAmount = Math.max(totalAmount - alreadyReserved, 0);
  if (amount > availableAmount) {
    throw createHttpError(400, `Reservation amount exceeds available quantity (${availableAmount}).`, {
      code: 'RESERVATION_AMOUNT_EXCEEDS_AVAILABLE',
      availableAmount,
    });
  }

  const nowIso = new Date().toISOString();
  const selectedBy = 'APP';
  const lastUpdate = `${userShortCode} ${nowIso}`.slice(0, 50);

  const insertSql = `
    INSERT INTO [dbo].[tblBest_Pos_Reserviert]
      ([bePR_BEposID], [bePR_LagerID], [bePR_gewaehlt], [bePR_gewaehltWER], [bePR_reserviertVon], [bePR_gueltigBis], [bePR_Anzahl], [bePR_Notiz], [bePR_LastUpdate])
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  try {
    await runSQLQueryAccess(req.database, insertSql, [
      beNumber,
      warehouseId,
      1,
      selectedBy,
      userShortCode,
      reservationEndDate.toISOString(),
      amount,
      comment,
      lastUpdate,
    ]);
  } catch (error) {
    const msg = String(error?.message || '').toLowerCase();
    const detailsMsg = String(error?.details?.message || '').toLowerCase();
    const duplicate = msg.includes('duplicate') || msg.includes('2601') || msg.includes('2627')
      || detailsMsg.includes('duplicate') || detailsMsg.includes('2601') || detailsMsg.includes('2627');
    if (duplicate) {
      let existingBy = '';
      try {
        const existingSql = `
          SELECT TOP 1 [bePR_reserviertVon] AS reservedBy
          FROM [dbo].[tblBest_Pos_Reserviert]
          WHERE [bePR_BEposID] = ? AND [bePR_LagerID] = ?
        `;
        const existingRows = await runSQLQueryAccess(req.database, existingSql, [beNumber, warehouseId]);
        const existing = Array.isArray(existingRows) && existingRows.length ? existingRows[0] : null;
        existingBy = String(existing?.reservedBy || '').trim();
      } catch (ignored) {
        existingBy = '';
      }
      const suffix = existingBy ? ` durch ${existingBy}.` : '.';
      throw createHttpError(409, `Fuer dieses Produkt liegt bereits eine Reservierung${suffix}`, {
        code: 'RESERVATION_ALREADY_EXISTS',
        reservedBy: existingBy || null,
      });
    }
    throw error;
  }

  const createdSql = `
    SELECT TOP 1
      [bePR_BEposID] AS beNumber,
      [bePR_LagerID] AS warehouseId,
      [bePR_Anzahl] AS amount,
      [bePR_gueltigBis] AS reservationEndDate
    FROM [dbo].[tblBest_Pos_Reserviert]
    WHERE [bePR_BEposID] = ? AND [bePR_LagerID] = ?
  `;
  const rows = await runSQLQueryAccess(req.database, createdSql, [beNumber, warehouseId]);
  const created = Array.isArray(rows) && rows.length ? rows[0] : null;
  const createdData = created
    ? { ...created, id: `${created.beNumber}${ID_SEPARATOR}${created.warehouseId}` }
    : { id: `${beNumber}${ID_SEPARATOR}${warehouseId}`, beNumber, warehouseId, amount, reservationEndDate };

  sendEnvelope(res, {
    status: 201,
    data: createdData,
    meta: { mandant: req.mandant, reservationUserShortCode: userShortCode },
    error: null,
  });
}));

// No category tree for availability view; keep endpoint for frontend compatibility.
router.get('/product-categories', requireMandant, asyncHandler(async (req, res) => {
  const { whereSql, params } = buildWhereClause({ q: req.query?.q });
  const sql = `
    SELECT
      COALESCE([Kunststoff], '') AS plastic,
      COALESCE([Kunststoff_Untergruppe], '') AS sub,
      COUNT(*) AS total
    FROM ${VIEW_SQL}
    ${whereSql}
    GROUP BY COALESCE([Kunststoff], ''), COALESCE([Kunststoff_Untergruppe], '')
    ORDER BY COALESCE([Kunststoff], '') ASC, COALESCE([Kunststoff_Untergruppe], '') ASC
  `;
  const rows = await runSQLQueryAccess(req.database, sql, params);

  const grouped = new Map();
  for (const row of (rows || [])) {
    const plastic = asText(row.plastic);
    const sub = asText(row.sub);
    const total = asNumber(row.total) || 0;
    if (!grouped.has(plastic)) {
      grouped.set(plastic, { plastic, total: 0, subCategories: [] });
    }
    const entry = grouped.get(plastic);
    entry.total += total;
    entry.subCategories.push({ sub, total });
  }
  const data = Array.from(grouped.values());

  sendEnvelope(res, {
    status: 200,
    data,
    meta: { mandant: req.mandant, count: data.length, q: asText(req.query?.q) },
    error: null,
  });
}));

module.exports = router;
