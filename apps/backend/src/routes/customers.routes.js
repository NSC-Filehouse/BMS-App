const express = require('express');
const { asyncHandler, createHttpError, sendEnvelope, parseListParams } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { runSQLQueryAccess } = require('../db/access');

const router = express.Router();

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

function buildWhereClause(q) {
  const text = String(q || '').trim();
  if (!text) return { whereSql: '', params: [] };

  const like = `%${text}%`;
  const fields = [
    '[kd_KdNR]',
    '[kd_Name1]',
    '[kd_Name2]',
    '[kd_PLZ]',
    '[kd_Aussendienst]',
    '[kd_Region]',
    '[kd_Ort]',
    '[kd_eMail]',
    '[kd_Telefon]',
  ];
  const clauses = fields.map((f) => `${f} LIKE ?`);
  return {
    whereSql: `WHERE (${clauses.join(' OR ')})`,
    params: fields.map(() => like),
  };
}

function toText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function mapRepresentatives(rows) {
  return (rows || [])
    .map((row) => {
      const firstName = toText(row.kdA_Vorname);
      const lastName = toText(row.kdA_Name);
      const name = toText(row.kdA_Name) || [firstName, lastName].filter(Boolean).join(' ').trim();
      const phone = toText(row.kdA_Telefon) || toText(row.kdA_PrivatTel) || toText(row.kdA_Handy);
      const email = toText(row.kdA_eMail);
      const position = toText(row.kdA_Position);
      const salutation = toText(row.kdA_Anrede);
      const id = null;

      return { id, name, phone, email, position, salutation };
    })
    .filter((rep) => rep.name || rep.phone || rep.email);
}

// LIST (all columns from dbo.tblKunden)
router.get('/customers', requireMandant, asyncHandler(async (req, res) => {
  const { page, pageSize, q, sort, dir } = parseListParams(req.query, {
    page: 1,
    pageSize: 25,
    sort: 'kd_Name1',
    dir: 'ASC',
  });

  const safeSort = resolveSortField(sort);
  const safeDir = normalizeDir(dir);
  const { whereSql, params } = buildWhereClause(q);
  const offset = (page - 1) * pageSize;

  const countSql = `SELECT COUNT(*) AS total FROM [dbo].[tblKunden] ${whereSql}`;
  const totalResult = await runSQLQueryAccess(req.database, countSql, params);
  const total = normalizeTotal(totalResult);

  const dataSql = `
    SELECT *
    FROM [dbo].[tblKunden]
    ${whereSql}
    ORDER BY ${safeSort} ${safeDir}
    OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
  `;
  const rows = await runSQLQueryAccess(req.database, dataSql, [...params, offset, pageSize]);

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
      sort: String(sort || 'kd_Name1'),
      dir: safeDir,
    },
    error: null,
  });
}));

// DETAIL (all columns from dbo.tblKunden)
router.get('/customers/:id', requireMandant, asyncHandler(async (req, res) => {
  const id = req.params.id;
  const sql = 'SELECT TOP 1 * FROM [dbo].[tblKunden] WHERE [kd_KdNR] = ?';
  const rows = await runSQLQueryAccess(req.database, sql, [id]);

  const item = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!item) {
    throw createHttpError(404, `customers not found: ${id}`, { code: 'CUSTOMER_NOT_FOUND', id });
  }

  const repsSql = `
    SELECT [kdA_Vorname], [kdA_Name], [kdA_Anrede], [kdA_Position], [kdA_Telefon], [kdA_PrivatTel], [kdA_Handy], [kdA_eMail]
    FROM [dbo].[tblKun_Ansprech]
    WHERE [kdA_KdNR] = ?
    ORDER BY [kdA_Name] ASC, [kdA_Vorname] ASC
  `;
  const repsRows = await runSQLQueryAccess(req.database, repsSql, [id]);
  const representatives = mapRepresentatives(repsRows);

  const detail = {
    ...item,
    representatives,
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

module.exports = router;
