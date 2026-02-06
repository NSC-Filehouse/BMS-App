const express = require('express');
const { asyncHandler, createHttpError, sendEnvelope, parseListParams } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { runSQLQueryAccess } = require('../db/access');

const router = express.Router();

const LIST_COLUMNS = [
  'o.[au_Auftragsindex] AS id',
  'o.[au_Auftragsnummer] AS orderNumber',
  'k.[kd_Name1] AS clientName',
  'o.[au_Auftragsdatum] AS orderDate',
].join(', ');

const FROM_SQL_LIST = 'FROM [tblAuftrag] AS o ' +
  'LEFT JOIN [tblKunden] AS k ON o.[au_KdNr] = k.[kd_KdNR]';

function normalizeDir(dir) {
  return String(dir).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
}

function buildWhereClause(q) {
  const text = (q || '').toString().trim();
  const conditions = ['(o.[au_Abgeschlossen] = 0 OR o.[au_Abgeschlossen] IS NULL)'];
  const params = [];

  if (text) {
    const like = `%${text}%`;
    const fields = [
      'o.[au_Auftragsnummer]',
      'o.[au_Auftragsindex]',
      'k.[kd_Name1]',
    ];
    const clauses = fields.map(f => `${f} LIKE ?`);
    conditions.push(`(${clauses.join(' OR ')})`);
    fields.forEach(() => params.push(like));
  }

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
    au_Auftragsindex: { field: 'o.[au_Auftragsindex]', outer: 'id' },
    au_Auftragsnummer: { field: 'o.[au_Auftragsnummer]', outer: 'orderNumber' },
    au_Auftragsdatum: { field: 'o.[au_Auftragsdatum]', outer: 'orderDate' },
    clientName: { field: 'k.[kd_Name1]', outer: 'clientName' },
  };
  return map[sort] || { field: 'o.[au_Auftragsdatum]', outer: 'orderDate' };
}

// LIST
router.get('/orders', requireMandant, asyncHandler(async (req, res) => {
  const { page, pageSize, q, sort, dir } = parseListParams(req.query, {
    page: 1,
    pageSize: 25,
    sort: 'au_Auftragsdatum',
    dir: 'DESC',
  });

  const orderBy = resolveOrderBy(sort);
  const { whereSql, params } = buildWhereClause(q);

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
    columns: LIST_COLUMNS,
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
      sort,
      dir,
    },
    error: null,
  });
}));

// DETAIL
router.get('/orders/:id', requireMandant, asyncHandler(async (req, res) => {
  const id = req.params.id;
  const sql = 'SELECT TOP 1 * FROM [tblAuftrag] WHERE [au_Auftragsindex] = ?';
  const rows = await runSQLQueryAccess(req.database, sql, [id]);

  const order = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!order) {
    throw createHttpError(404, `orders not found: ${id}`);
  }

  let clientName = null;
  const customerId = order.au_KdNr ?? order.AU_KDNR;
  if (customerId !== null && customerId !== undefined && customerId !== '') {
    const customerRows = await runSQLQueryAccess(
      req.database,
      'SELECT TOP 1 [kd_Name1] FROM [tblKunden] WHERE [kd_KdNR] = ?',
      [customerId]
    );
    const customer = Array.isArray(customerRows) && customerRows.length ? customerRows[0] : null;
    clientName = customer ? (customer.kd_Name1 ?? customer.KD_NAME1 ?? Object.values(customer)[0] ?? null) : null;
  }

  let article = null;
  const posRows = await runSQLQueryAccess(
    req.database,
    'SELECT TOP 1 [auP_Artikel] FROM [tblAuf_Position] WHERE [auP_Auftragsindex] = ? ORDER BY [auP_PosNr] ASC',
    [id]
  );
  const pos = Array.isArray(posRows) && posRows.length ? posRows[0] : null;
  if (pos) {
    article = pos.auP_Artikel ?? pos.AUP_ARTIKEL ?? Object.values(pos)[0] ?? null;
  }

  const detail = {
    id,
    orderNumber: order.au_Auftragsnummer ?? order.AU_AUFTRAGSNUMMER ?? null,
    clientName,
    distributor: req.mandant,
    article,
    price: order.au_Bruttosumme_EU ?? order.AU_BRUTTOSUMME_EU ?? null,
    closingDate: null,
    reservationDate: null,
    createdAt: order.au_Auftragsdatum ?? order.AU_AUFTRAGSDATUM ?? null,
    receivedFrom: order.au_Aussendienst ?? order.AU_AUSSENDIENST ?? null,
    passedTo: null,
    isReserved: null,
  };

  sendEnvelope(res, {
    status: 200,
    data: detail,
    meta: { mandant: req.mandant, idField: 'au_Auftragsindex', id },
    error: null,
  });
}));

module.exports = router;
