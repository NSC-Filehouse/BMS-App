const express = require('express');
const { asyncHandler, createHttpError, sendEnvelope } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { getMandantsForUser } = require('../db/databases');
const { runSQLQuerySqlServer } = require('../db/access');
const config = require('../config');
const logger = require('../logger');

const router = express.Router();

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function isMissingTimelineTableError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('tblbmsapp_timeline') && (
    msg.includes('invalid object name')
    || msg.includes('ungültiger objektname')
    || msg.includes('ungueltiger objektname')
  );
}

router.get('/timeline', requireMandant, asyncHandler(async (req, res) => {
  const email = asText(req.userEmail);
  if (!email) {
    throw createHttpError(401, 'Missing user identity.', { code: 'AUTH_MISSING_IDENTITY' });
  }

  const mandants = await getMandantsForUser(email);
  const names = mandants.map((x) => asText(x.name)).filter(Boolean);
  const companyIds = mandants.map((x) => Number(x.firmaId)).filter((x) => Number.isFinite(x) && x > 0);
  if (!names.length && !companyIds.length) {
    sendEnvelope(res, {
      status: 200,
      data: [],
      meta: { count: 0, days: 14 },
      error: null,
    });
    return;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);

  const filters = [];
  const params = [cutoff.toISOString()];
  if (companyIds.length) {
    filters.push(`[tl_CompanyId] IN (${companyIds.map(() => '?').join(', ')})`);
    params.push(...companyIds);
  }
  if (names.length) {
    filters.push(`[tl_Mandant] IN (${names.map(() => '?').join(', ')})`);
    params.push(...names);
  }

  const sql = `
    SELECT
      [tl_ID] AS id,
      [tl_CreatedAt] AS createdAt,
      [tl_Mandant] AS mandant,
      [tl_MandantKurz] AS mandantShortName,
      [tl_CompanyId] AS companyId,
      [tl_UserShortCode] AS userShortCode,
      [tl_Type] AS type,
      [tl_Product] AS product,
      [tl_ProductId] AS productId,
      [tl_BeNumber] AS beNumber,
      [tl_AmountKg] AS amountKg,
      [tl_Unit] AS unit,
      [tl_ReferenceId] AS referenceId
    FROM [dbo].[tblBMSApp_Timeline]
    WHERE [tl_CreatedAt] >= ?
      AND (${filters.join(' OR ')})
    ORDER BY [tl_CreatedAt] DESC, [tl_ID] DESC
  `;
  let rows = [];
  try {
    rows = await runSQLQuerySqlServer(config.sql.database, sql, params);
  } catch (error) {
    if (isMissingTimelineTableError(error)) {
      logger.warn('Timeline table [dbo].[tblBMSApp_Timeline] is missing. Returning empty timeline.');
      rows = [];
    } else {
      throw error;
    }
  }
  const data = (Array.isArray(rows) ? rows : []).map((row) => ({
    id: Number(row.id),
    createdAt: row.createdAt || null,
    mandant: asText(row.mandant),
    mandantShortName: asText(row.mandantShortName),
    companyId: Number(row.companyId) || null,
    userShortCode: asText(row.userShortCode),
    type: asText(row.type),
    product: asText(row.product),
    productId: asText(row.productId),
    beNumber: asText(row.beNumber),
    amountKg: row.amountKg === null || row.amountKg === undefined ? null : Number(row.amountKg),
    unit: asText(row.unit) || 'kg',
    referenceId: asText(row.referenceId),
  }));

  sendEnvelope(res, {
    status: 200,
    data,
    meta: { count: data.length, days: 14 },
    error: null,
  });
}));

module.exports = router;
