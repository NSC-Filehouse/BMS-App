const express = require('express');
const { asyncHandler, createHttpError, sendEnvelope } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { getDatabaseConnectionForIdentityById, getMandantsForIdentity } = require('../db/databases');
const { runSQLQueryAccess, runSQLQuerySqlServer } = require('../db/access');
const { appTableDisplayName, appTableName, appTableSql } = require('../db/app-tables');
const { getConfiguredBaseFilePath, resolveLatestOrderPdf } = require('../order-pdf');
const config = require('../config');
const logger = require('../logger');

const router = express.Router();
const TIMELINE_TABLE = appTableSql('timeline');
const TEMP_ORDER_TABLE = appTableSql('tempOrder');
const TEMP_ORDER_POSITION_TABLE = appTableSql('tempOrderPosition');
const TIMELINE_TABLE_NAME = appTableName('timeline').toLowerCase();
const LEGACY_TIMELINE_TABLE_NAME = 'tblbmsapp_timeline';

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function isMissingTimelineTableError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (msg.includes(TIMELINE_TABLE_NAME) || msg.includes(LEGACY_TIMELINE_TABLE_NAME)) && (
    msg.includes('invalid object name')
    || msg.includes('ungültiger objektname')
    || msg.includes('ungueltiger objektname')
  );
}

router.get('/timeline', requireMandant, asyncHandler(async (req, res) => {
  const identity = req.userIdentity;
  if (!identity) {
    throw createHttpError(401, 'Missing user identity.', { code: 'AUTH_MISSING_IDENTITY' });
  }

  const mandants = await getMandantsForIdentity(identity);
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
      [tl_ReferenceId] AS referenceId,
      [temp].[ta_Auftragsindex] AS orderIndex,
      [tempPosition].[salePrice] AS salePrice
    FROM ${TIMELINE_TABLE}
    LEFT JOIN ${TEMP_ORDER_TABLE} AS [temp]
      ON [tl_Type] = N'order'
     AND [temp].[ta_company_id] = [tl_CompanyId]
     AND CONVERT(NVARCHAR(100), [temp].[ta_id]) = [tl_ReferenceId]
    OUTER APPLY (
      SELECT TOP 1
        [position].[tap_price] AS salePrice
      FROM ${TEMP_ORDER_POSITION_TABLE} AS [position]
      WHERE [position].[tap_ta_id] = [temp].[ta_id]
        AND [position].[tap_be_number] = [tl_BeNumber]
      ORDER BY [position].[tap_line_no] ASC, [position].[tap_id] ASC
    ) AS [tempPosition]
    WHERE [tl_CreatedAt] >= ?
      AND (${filters.join(' OR ')})
    ORDER BY [tl_CreatedAt] DESC, [tl_ID] DESC
  `;
  let rows = [];
  try {
    rows = await runSQLQuerySqlServer(config.sql.database, sql, params);
  } catch (error) {
    if (isMissingTimelineTableError(error)) {
      logger.warn(`Timeline table ${appTableDisplayName('timeline')} is missing. Returning empty timeline.`);
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
    orderIndex: asText(row.orderIndex),
    salePrice: row.salePrice === null || row.salePrice === undefined ? null : Number(row.salePrice),
  }));

  sendEnvelope(res, {
    status: 200,
    data,
    meta: { count: data.length, days: 14 },
    error: null,
  });
}));

router.get('/timeline/:timelineId/order-pdf', requireMandant, asyncHandler(async (req, res, next) => {
  const timelineId = Number.parseInt(String(req.params.timelineId || '').trim(), 10);
  if (!Number.isSafeInteger(timelineId) || timelineId <= 0) {
    throw createHttpError(400, 'Invalid timeline id.', { code: 'INVALID_TIMELINE_ID' });
  }

  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT TOP 1
      [timeline].[tl_Type] AS type,
      [timeline].[tl_CompanyId] AS companyId,
      [temp].[ta_Auftragsindex] AS orderIndex,
      [temp].[ta_ClientReferenceId] AS customerId
    FROM ${TIMELINE_TABLE} AS [timeline]
    INNER JOIN ${TEMP_ORDER_TABLE} AS [temp]
      ON [timeline].[tl_Type] = N'order'
     AND [timeline].[tl_CompanyId] = [temp].[ta_company_id]
     AND CONVERT(NVARCHAR(100), [temp].[ta_id]) = [timeline].[tl_ReferenceId]
    WHERE [timeline].[tl_ID] = ?
      AND [timeline].[tl_CreatedAt] >= DATEADD(DAY, -14, SYSUTCDATETIME())
  `, [timelineId]);
  const timelineOrder = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!timelineOrder) {
    throw createHttpError(404, 'Timeline order not found.', {
      code: 'TIMELINE_ORDER_NOT_FOUND',
      id: timelineId,
    });
  }

  const companyId = Number(timelineOrder.companyId);
  const orderIndex = asText(timelineOrder.orderIndex);
  if (!Number.isSafeInteger(companyId) || companyId < 0 || !orderIndex) {
    throw createHttpError(404, 'ERP order number is not available yet.', {
      code: 'TIMELINE_ORDER_INDEX_NOT_AVAILABLE',
      id: timelineId,
    });
  }

  const sourceDatabase = await getDatabaseConnectionForIdentityById(req.userIdentity, companyId);
  const customerId = asText(timelineOrder.customerId);
  const customerFilter = customerId ? 'AND COALESCE([au_KdNr], \'\') = ?' : '';
  const orderRows = await runSQLQueryAccess(sourceDatabase, `
    SELECT TOP 1
      [au_Auftragsindex] AS orderIndex,
      [au_Auftragsnummer] AS orderNumber
    FROM [dbo].[tblAuftrag]
    WHERE COALESCE([au_Auftragsindex], '') = ?
      ${customerFilter}
  `, customerId ? [orderIndex, customerId] : [orderIndex]);
  const orderRow = Array.isArray(orderRows) && orderRows.length ? orderRows[0] : null;
  if (!orderRow) {
    throw createHttpError(404, `Order not found: ${orderIndex}`, {
      code: 'ORDER_NOT_FOUND',
      id: orderIndex,
    });
  }

  if (!getConfiguredBaseFilePath()) {
    throw createHttpError(503, 'Order PDF storage is not configured.', {
      code: 'ORDER_PDF_STORAGE_NOT_CONFIGURED',
    });
  }
  const orderNumber = asText(orderRow.orderNumber) || asText(orderRow.orderIndex) || orderIndex;
  const pdf = await resolveLatestOrderPdf({
    companyName: sourceDatabase.name,
    orderNumber,
  });
  if (!pdf) {
    throw createHttpError(404, `Order PDF not found: ${orderNumber}`, {
      code: 'ORDER_PDF_NOT_FOUND',
      orderNumber,
    });
  }

  const safeFileName = pdf.fileName.replace(/["\\\r\n]/g, '_');
  res.sendFile(pdf.filePath, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${safeFileName}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  }, (error) => {
    if (error && !res.headersSent) next(error);
  });
}));

module.exports = router;
