const express = require('express');
const { asyncHandler, createHttpError, sendEnvelope, parseListParams } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { runSQLQueryAccess } = require('../db/access');
const { getUserPersonNumberByEmail } = require('../db/users');

const router = express.Router();
const VIEW_SQL = '[dbo].[qryMengen_Verfügbarkeitsliste_fürAPP]';

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
    id: 'r.[Id]',
    orderNumber: 'r.[BENumber]',
    createdAt: 'r.[CreateDate]',
    reservationDate: 'r.[ReservationEndDate]',
    article: 'v.[Artikel]',
    amount: 'r.[Amount]',
    au_Auftragsdatum: 'r.[CreateDate]',
  };
  return map[String(sort || '').trim()] || 'r.[CreateDate]';
}

function buildWhereClause(q) {
  const text = String(q || '').trim();
  if (!text) return { whereSql: '', params: [] };
  const like = `%${text}%`;
  const fields = ['r.[BENumber]', 'r.[WarehouseId]', 'r.[Comment]', 'v.[Artikel]'];
  const clauses = fields.map((f) => `${f} LIKE ?`);
  return {
    whereSql: `AND (${clauses.join(' OR ')})`,
    params: fields.map(() => like),
  };
}

router.get('/orders', requireMandant, asyncHandler(async (req, res) => {
  const userId = await getUserPersonNumberByEmail(req.userEmail);
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
    FROM [dbo].[tblReservation] AS r
    LEFT JOIN ${VIEW_SQL} AS v
      ON COALESCE(v.[Bestell-Pos], '') = COALESCE(r.[BENumber], '')
     AND COALESCE(v.[bePL_LagerID], '') = COALESCE(r.[WarehouseId], '')
    WHERE r.[ReservationUserId] = ?
    ${whereSql}
  `;

  const countSql = `SELECT COUNT(*) AS total ${fromSql}`;
  const totalRows = await runSQLQueryAccess(req.database, countSql, [userId, ...params]);
  const total = normalizeTotal(totalRows);

  const dataSql = `
    SELECT
      r.[Id] AS id,
      r.[BENumber] AS orderNumber,
      COALESCE(v.[Artikel], r.[BENumber]) AS clientName,
      r.[Amount] AS reserveAmount,
      r.[ReservationEndDate] AS reservationDate,
      r.[CreateDate] AS createdAt
    ${fromSql}
    ORDER BY ${safeSort} ${safeDir}
    OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
  `;
  const rows = await runSQLQueryAccess(req.database, dataSql, [userId, ...params, offset, pageSize]);

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
      sort: String(sort || 'createdAt'),
      dir: safeDir,
    },
    error: null,
  });
}));

router.get('/orders/:id', requireMandant, asyncHandler(async (req, res) => {
  const userId = await getUserPersonNumberByEmail(req.userEmail);
  const id = req.params.id;
  const sql = `
    SELECT TOP 1
      r.[Id] AS id,
      r.[BENumber] AS orderNumber,
      r.[WarehouseId] AS warehouseId,
      r.[Amount] AS reserveAmount,
      r.[ReservationEndDate] AS reservationDate,
      r.[Comment] AS comment,
      r.[CreatedBy] AS createdBy,
      r.[CreateDate] AS createdAt,
      v.[Artikel] AS article,
      v.[EP] AS price,
      v.[Einheit] AS unit
    FROM [dbo].[tblReservation] AS r
    LEFT JOIN ${VIEW_SQL} AS v
      ON COALESCE(v.[Bestell-Pos], '') = COALESCE(r.[BENumber], '')
     AND COALESCE(v.[bePL_LagerID], '') = COALESCE(r.[WarehouseId], '')
    WHERE r.[Id] = ? AND r.[ReservationUserId] = ?
  `;
  const rows = await runSQLQueryAccess(req.database, sql, [id, userId]);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row) {
    throw createHttpError(404, `reservations not found: ${id}`);
  }

  const detail = {
    id: row.id,
    orderNumber: row.orderNumber || row.id,
    clientName: null,
    distributor: req.mandant,
    article: row.article || row.orderNumber || null,
    price: row.price,
    closingDate: null,
    reservationDate: row.reservationDate,
    createdAt: row.createdAt,
    receivedFrom: row.createdBy,
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
