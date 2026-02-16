const express = require('express');
const { asyncHandler, createHttpError, sendEnvelope, parseListParams } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { runSQLQueryAccess } = require('../db/access');
const { getUserIdentityByEmail } = require('../db/users');

const router = express.Router();
const VIEW_SQL = '[dbo].[qryMengen_Verfügbarkeitsliste_fürAPP]';
const ID_SEPARATOR = '||';

function buildReservationId(beNumber, warehouseId) {
  return `${String(beNumber || '').trim()}${ID_SEPARATOR}${String(warehouseId || '').trim()}`;
}

function parseReservationId(id) {
  const [beNumber = '', warehouseId = ''] = String(id || '').split(ID_SEPARATOR);
  return { beNumber: beNumber.trim(), warehouseId: warehouseId.trim() };
}

function normalizeDir(dir) {
  return String(dir || '').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
}

function normalizeTotal(rows) {
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || typeof row !== 'object') return null;
  return row.total ?? row.TOTAL ?? row.Total ?? Object.values(row)[0] ?? null;
}

function resolveSort(sort) {
  const map = {
    id: 'r.[bePR_BEposID]',
    orderNumber: 'r.[bePR_BEposID]',
    createdAt: 'r.[bePR_gueltigBis]',
    reservationDate: 'r.[bePR_gueltigBis]',
    article: 'v.[Artikel]',
    amount: 'r.[bePR_Anzahl]',
    au_Auftragsdatum: 'r.[bePR_gueltigBis]',
  };
  return map[String(sort || '').trim()] || 'r.[bePR_gueltigBis]';
}

function buildWhereClause(q) {
  const text = String(q || '').trim();
  if (!text) return { whereSql: '', params: [] };
  const like = `%${text}%`;
  const fields = ['r.[bePR_BEposID]', 'r.[bePR_LagerID]', 'r.[bePR_Notiz]', 'v.[Artikel]'];
  const clauses = fields.map((f) => `${f} LIKE ?`);
  return {
    whereSql: `AND (${clauses.join(' OR ')})`,
    params: fields.map(() => like),
  };
}

router.get('/orders', requireMandant, asyncHandler(async (req, res) => {
  const userIdentity = await getUserIdentityByEmail(req.userEmail);
  const userShortCode = String(userIdentity.shortCode || '').trim();
  if (!userShortCode) {
    throw createHttpError(403, 'Missing Mitarbeiterkuerzel (ma_Kuerzel) for current user.');
  }

  const { page, pageSize, q, sort, dir } = parseListParams(req.query, {
    page: 1,
    pageSize: 25,
    sort: 'createdAt',
    dir: 'DESC',
  });

  const safeSort = resolveSort(sort);
  const safeDir = normalizeDir(dir);
  const { whereSql, params } = buildWhereClause(q);
  const offset = (page - 1) * pageSize;

  const fromSql = `
    FROM [dbo].[tblBest_Pos_Reserviert] AS r
    LEFT JOIN ${VIEW_SQL} AS v
      ON COALESCE(v.[Bestell-Pos], '') = COALESCE(r.[bePR_BEposID], '')
     AND COALESCE(v.[bePL_LagerID], '') = COALESCE(r.[bePR_LagerID], '')
    WHERE LOWER(COALESCE(r.[bePR_reserviertVon], '')) = ?
    ${whereSql}
  `;

  const countSql = `SELECT COUNT(*) AS total ${fromSql}`;
  const totalRows = await runSQLQueryAccess(req.database, countSql, [userShortCode.toLowerCase(), ...params]);
  const total = normalizeTotal(totalRows);

  const dataSql = `
    SELECT
      r.[bePR_BEposID] AS beNumber,
      r.[bePR_LagerID] AS warehouseId,
      COALESCE(v.[Artikel], r.[bePR_BEposID]) AS clientName,
      r.[bePR_Anzahl] AS reserveAmount,
      r.[bePR_gueltigBis] AS reservationDate,
      r.[bePR_gueltigBis] AS createdAt
    ${fromSql}
    ORDER BY ${safeSort} ${safeDir}
    OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
  `;
  const rows = await runSQLQueryAccess(req.database, dataSql, [userShortCode.toLowerCase(), ...params, offset, pageSize]);
  const data = (rows || []).map((row) => {
    const beNumber = row.beNumber || null;
    const warehouseId = row.warehouseId || null;
    return {
      id: buildReservationId(beNumber, warehouseId),
      orderNumber: beNumber,
      clientName: row.clientName || beNumber,
      reserveAmount: row.reserveAmount,
      reservationDate: row.reservationDate,
      createdAt: row.createdAt,
    };
  });

  sendEnvelope(res, {
    status: 200,
    data,
    meta: {
      mandant: req.mandant,
      page,
      pageSize,
      count: data.length,
      total,
      q,
      sort: String(sort || 'createdAt'),
      dir: safeDir,
    },
    error: null,
  });
}));

router.get('/orders/:id', requireMandant, asyncHandler(async (req, res) => {
  const userIdentity = await getUserIdentityByEmail(req.userEmail);
  const userShortCode = String(userIdentity.shortCode || '').trim();
  if (!userShortCode) {
    throw createHttpError(403, 'Missing Mitarbeiterkuerzel (ma_Kuerzel) for current user.');
  }

  const id = String(req.params.id || '');
  const parsedId = parseReservationId(id);
  if (!parsedId.beNumber || !parsedId.warehouseId) {
    throw createHttpError(400, `Invalid reservation id: ${id}`);
  }

  const sql = `
    SELECT TOP 1
      r.[bePR_BEposID] AS beNumber,
      r.[bePR_LagerID] AS warehouseId,
      r.[bePR_Anzahl] AS reserveAmount,
      r.[bePR_gueltigBis] AS reservationDate,
      r.[bePR_Notiz] AS comment,
      r.[bePR_reserviertVon] AS reservedBy,
      r.[bePR_gueltigBis] AS createdAt,
      v.[Artikel] AS article,
      v.[EP] AS price,
      v.[Einheit] AS unit
    FROM [dbo].[tblBest_Pos_Reserviert] AS r
    LEFT JOIN ${VIEW_SQL} AS v
      ON COALESCE(v.[Bestell-Pos], '') = COALESCE(r.[bePR_BEposID], '')
     AND COALESCE(v.[bePL_LagerID], '') = COALESCE(r.[bePR_LagerID], '')
    WHERE r.[bePR_BEposID] = ? AND r.[bePR_LagerID] = ?
      AND LOWER(COALESCE(r.[bePR_reserviertVon], '')) = ?
  `;
  const rows = await runSQLQueryAccess(req.database, sql, [
    parsedId.beNumber,
    parsedId.warehouseId,
    userShortCode.toLowerCase(),
  ]);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row) {
    throw createHttpError(404, `reservations not found: ${id}`);
  }

  const detail = {
    id: buildReservationId(row.beNumber, row.warehouseId),
    orderNumber: row.beNumber || row.id,
    clientName: null,
    distributor: req.mandant,
    article: row.article || row.beNumber || null,
    price: row.price,
    closingDate: null,
    reservationDate: row.reservationDate,
    createdAt: row.createdAt,
    receivedFrom: row.reservedBy || userShortCode || null,
    passedTo: null,
    isReserved: true,
    reserveAmount: row.reserveAmount,
    comment: row.comment || null,
    unit: row.unit || null,
    warehouseId: row.warehouseId || null,
  };

  sendEnvelope(res, {
    status: 200,
    data: detail,
    meta: { mandant: req.mandant, idField: 'id', id },
    error: null,
  });
}));

module.exports = router;
