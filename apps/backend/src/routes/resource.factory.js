const express = require('express');
const { asyncHandler, createHttpError, sendEnvelope, parseListParams } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { runSQLQueryAccess } = require('../db/access');
const { buildWhereClause, buildCountQuery, buildPagedSelectQuery, buildDetailQuery } = require('../db/queries');

function normalizeTotal(countResult) {
  if (!countResult) return null;
  const row = Array.isArray(countResult) ? countResult[0] : countResult;
  if (!row || typeof row !== 'object') return null;

  // Access/ODBC can return different casings
  return row.total ?? row.TOTAL ?? row.Total ?? Object.values(row)[0] ?? null;
}

function createResourceRouter(resource) {
  const router = express.Router();

  // LIST
  router.get(`/${resource.key}`, requireMandant, asyncHandler(async (req, res) => {
    const { page, pageSize, q, sort, dir } = parseListParams(req.query, {
      page: 1,
      pageSize: 25,
      sort: resource.defaultSort || resource.pk,
      dir: 'ASC',
    });

    const allowedSort = new Set([resource.pk, ...(resource.searchableFields || [])]);
    const sortField = allowedSort.has(sort) ? sort : (resource.defaultSort || resource.pk);

    const { whereSql, params } = buildWhereClause(resource, q);

    const countSql = buildCountQuery(resource, whereSql);
    const totalResult = await runSQLQueryAccess(req.database, countSql, params);
    const total = normalizeTotal(totalResult);

    const dataSql = buildPagedSelectQuery(resource, { whereSql, orderBy: sortField, dir, page, pageSize });
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
        sort: sortField,
        dir,
      },
      error: null,
    });
  }));

  // DETAIL
  router.get(`/${resource.key}/:id`, requireMandant, asyncHandler(async (req, res) => {
    const id = req.params.id;

    const sql = buildDetailQuery(resource);
    const rows = await runSQLQueryAccess(req.database, sql, [id]);

    const item = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!item) {
      throw createHttpError(404, `${resource.key} not found: ${id}`);
    }

    sendEnvelope(res, {
      status: 200,
      data: item,
      meta: { mandant: req.mandant, idField: resource.pk, id },
      error: null,
    });
  }));

  return router;
}

module.exports = { createResourceRouter };
