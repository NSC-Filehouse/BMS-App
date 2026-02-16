const express = require('express');
const config = require('../config');
const { asyncHandler, createHttpError, sendEnvelope, parseListParams } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { runSQLQueryAccess, runSQLQuerySqlServer } = require('../db/access');
const { getUserIdentityByEmail } = require('../db/users');

const router = express.Router();
const VIEW_SQL = '[dbo].[qryMengen_Verfügbarkeitsliste_fürAPP]';

function normalizeDir(dir) {
  return String(dir || '').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
}

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function asBit(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true') return 1;
  return 0;
}

function asInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n);
}

function normalizeTotal(rows) {
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || typeof row !== 'object') return null;
  return row.total ?? row.TOTAL ?? row.Total ?? Object.values(row)[0] ?? null;
}

function mapTempOrderRow(row) {
  return {
    id: row.ta_id,
    companyId: row.ta_company_id,
    clientReferenceId: row.ta_ClientReferenceId,
    distributor: row.ta_distributor,
    distributorLogo: row.ta_distributorLogo,
    beNumber: row.ta_be_number,
    article: row.ta_article,
    amountInKg: row.ta_amount_in_kg,
    warehouse: row.ta_warehouse,
    price: row.ta_price,
    reservationInKg: row.ta_reservation_in_kg,
    reservationDate: row.ta_reservation_date,
    about: row.ta_about,
    packaging: row.ta_packaging,
    mfi: row.ta_mfi,
    clientName: row.ta_client_name,
    clientAddress: row.ta_client_address,
    clientRepresentative: row.ta_client_representative,
    specialPaymentCondition: Boolean(row.ta_special_payment_condition),
    comment: row.ta_comment,
    deliveryType: row.ta_delivery_type,
    packagingType: row.ta_packaging_type,
    deliveryStartDate: row.ta_delivery_start_date,
    deliveryEndDate: row.ta_delivery_end_date,
    completed: Boolean(row.ta_completed),
    closingDate: row.ta_closing_date,
    createdBy: row.ta_CreatedBy,
    createdAt: row.ta_CreateDate,
    lastModifiedBy: row.ta_LastModifiedBy,
    lastModifiedDate: row.ta_LastModifiedDate,
    passedTo: row.ta_PassedTo,
    receivedFrom: row.ta_ReceivedFrom,
    passedToUserId: row.ta_PassedToUserId,
    receivedFromUserId: row.ta_ReceivedFromUserId,
    isConfirmed: Boolean(row.ta_IsConfirmed),
  };
}

async function loadProductContext(database, beNumber, warehouseId) {
  const sql = `
    SELECT TOP 1
      [Artikel] AS article,
      [Lagerort] AS warehouse,
      [beP_VLbemerkung] AS about,
      [beP_Additive] AS packaging,
      [beP_MFIgemessen] AS mfiMeasured,
      [beP_MFI] AS mfiBase
    FROM ${VIEW_SQL}
    WHERE COALESCE([Bestell-Pos], '') = ?
      AND COALESCE([bePL_LagerID], '') = ?
  `;
  const rows = await runSQLQueryAccess(database, sql, [beNumber, warehouseId]);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row) {
    throw createHttpError(404, 'Product availability row not found for reservation.', { code: 'PRODUCT_AVAILABILITY_NOT_FOUND' });
  }

  const measured = Number(row.mfiMeasured);
  const base = Number(row.mfiBase);
  const mfi = Number.isFinite(measured)
    ? String(measured)
    : (Number.isFinite(base) ? String(base) : asText(row.mfiMeasured || row.mfiBase));

  return {
    article: asText(row.article),
    warehouse: asText(row.warehouse),
    about: asText(row.about),
    packaging: asText(row.packaging),
    mfi,
  };
}

async function loadPackagingType(database, beNumber) {
  const sql = `
    SELECT TOP 1 b.[be_Verpackung] AS packagingType
    FROM [dbo].[tblBest_Position] p
    INNER JOIN [dbo].[tblBestellung] b ON b.[be_Bestellindex] = p.[beP_BestellIndex]
    WHERE COALESCE(p.[beP_BEposID], '') = ?
  `;
  const rows = await runSQLQueryAccess(database, sql, [beNumber]);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  return asText(row?.packagingType || '');
}

router.get('/temp-orders/meta/by-be-number/:beNumber', requireMandant, asyncHandler(async (req, res) => {
  const beNumber = asText(req.params?.beNumber);
  if (!beNumber) {
    throw createHttpError(400, 'Missing beNumber.', { code: 'MISSING_BE_NUMBER' });
  }

  const packagingType = await loadPackagingType(req.database, beNumber);
  sendEnvelope(res, {
    status: 200,
    data: {
      beNumber,
      packagingType,
      deliveryType: 'LKW',
    },
    meta: { mandant: req.mandant },
    error: null,
  });
}));

router.get('/temp-orders', requireMandant, asyncHandler(async (req, res) => {
  const userIdentity = await getUserIdentityByEmail(req.userEmail);
  const userShortCode = asText(userIdentity.shortCode);
  if (!userShortCode) {
    throw createHttpError(403, 'Missing Mitarbeiterkuerzel (ma_Kuerzel) for current user.', { code: 'MISSING_USER_SHORT_CODE' });
  }

  const companyId = Number(req.database?.firmaId || 0);
  const { page, pageSize, q, sort, dir } = parseListParams(req.query, {
    page: 1,
    pageSize: 25,
    sort: 'ta_CreateDate',
    dir: 'DESC',
  });

  const sortMap = {
    id: '[ta_id]',
    createdAt: '[ta_CreateDate]',
    article: '[ta_article]',
    clientName: '[ta_client_name]',
    beNumber: '[ta_be_number]',
  };
  const safeSort = sortMap[String(sort || '').trim()] || '[ta_CreateDate]';
  const safeDir = normalizeDir(dir);
  const offset = (page - 1) * pageSize;

  const text = asText(q);
  const like = `%${text}%`;
  const whereText = text
    ? ` AND ([ta_article] LIKE ? OR [ta_be_number] LIKE ? OR [ta_client_name] LIKE ? OR [ta_comment] LIKE ?)`
    : '';
  const whereParams = text ? [like, like, like, like] : [];

  const countSql = `
    SELECT COUNT(*) AS total
    FROM [dbo].[tbl_Temp_Auftraege]
    WHERE [ta_company_id] = ? AND LOWER(COALESCE([ta_CreatedBy], '')) = ?
    ${whereText}
  `;
  const totalRows = await runSQLQuerySqlServer(config.sql.database, countSql, [companyId, userShortCode.toLowerCase(), ...whereParams]);
  const total = normalizeTotal(totalRows);

  const listSql = `
    SELECT
      [ta_id], [ta_be_number], [ta_article], [ta_client_name], [ta_price], [ta_amount_in_kg],
      [ta_CreateDate], [ta_delivery_start_date], [ta_delivery_end_date], [ta_completed], [ta_IsConfirmed]
    FROM [dbo].[tbl_Temp_Auftraege]
    WHERE [ta_company_id] = ? AND LOWER(COALESCE([ta_CreatedBy], '')) = ?
    ${whereText}
    ORDER BY ${safeSort} ${safeDir}
    OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
  `;
  const rows = await runSQLQuerySqlServer(config.sql.database, listSql, [
    companyId,
    userShortCode.toLowerCase(),
    ...whereParams,
    offset,
    pageSize,
  ]);

  const data = (rows || []).map((row) => ({
    id: row.ta_id,
    beNumber: row.ta_be_number,
    article: row.ta_article,
    clientName: row.ta_client_name,
    price: row.ta_price,
    amountInKg: row.ta_amount_in_kg,
    createdAt: row.ta_CreateDate,
    deliveryStartDate: row.ta_delivery_start_date,
    deliveryEndDate: row.ta_delivery_end_date,
    completed: Boolean(row.ta_completed),
    isConfirmed: Boolean(row.ta_IsConfirmed),
  }));

  sendEnvelope(res, {
    status: 200,
    data,
    meta: { mandant: req.mandant, page, pageSize, count: data.length, total, q, sort, dir: safeDir },
    error: null,
  });
}));

router.get('/temp-orders/:id', requireMandant, asyncHandler(async (req, res) => {
  const userIdentity = await getUserIdentityByEmail(req.userEmail);
  const userShortCode = asText(userIdentity.shortCode);
  if (!userShortCode) {
    throw createHttpError(403, 'Missing Mitarbeiterkuerzel (ma_Kuerzel) for current user.', { code: 'MISSING_USER_SHORT_CODE' });
  }

  const companyId = Number(req.database?.firmaId || 0);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    throw createHttpError(400, `Invalid temp order id: ${req.params.id}`, { code: 'RESOURCE_NOT_FOUND' });
  }

  const sql = `
    SELECT TOP 1 *
    FROM [dbo].[tbl_Temp_Auftraege]
    WHERE [ta_id] = ? AND [ta_company_id] = ?
      AND LOWER(COALESCE([ta_CreatedBy], '')) = ?
  `;
  const rows = await runSQLQuerySqlServer(config.sql.database, sql, [id, companyId, userShortCode.toLowerCase()]);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row) {
    throw createHttpError(404, `temp order not found: ${id}`, { code: 'RESOURCE_NOT_FOUND', id });
  }

  sendEnvelope(res, {
    status: 200,
    data: mapTempOrderRow(row),
    meta: { mandant: req.mandant, id },
    error: null,
  });
}));

router.post('/temp-orders', requireMandant, asyncHandler(async (req, res) => {
  const userIdentity = await getUserIdentityByEmail(req.userEmail);
  const userShortCode = asText(userIdentity.shortCode);
  if (!userShortCode) {
    throw createHttpError(403, 'Missing Mitarbeiterkuerzel (ma_Kuerzel) for current user.', { code: 'MISSING_USER_SHORT_CODE' });
  }

  const companyId = Number(req.database?.firmaId || 0);
  if (!Number.isFinite(companyId) || companyId <= 0) {
    throw createHttpError(400, 'Invalid company id for selected mandant.', { code: 'INVALID_COMPANY_ID' });
  }

  const beNumber = asText(req.body?.beNumber);
  const warehouseId = asText(req.body?.warehouseId);
  if (!beNumber || !warehouseId) {
    throw createHttpError(400, 'Missing required reservation keys: beNumber and warehouseId.', { code: 'MISSING_RESERVATION_KEYS' });
  }

  const clientReferenceId = asText(req.body?.clientReferenceId);
  const clientName = asText(req.body?.clientName);
  const clientAddress = asText(req.body?.clientAddress);
  const clientRepresentative = asText(req.body?.clientRepresentative);
  const supplier = asText(req.body?.supplier);
  if (!clientReferenceId || !clientName || !clientAddress) {
    throw createHttpError(400, 'Missing required client data for temp order.', { code: 'TEMP_ORDER_MISSING_CLIENT_DATA' });
  }

  const amountInKg = asInt(req.body?.amountInKg, 0);
  const pricePerKg = asInt(req.body?.pricePerKg, 0);
  if (amountInKg <= 0 || pricePerKg <= 0) {
    throw createHttpError(400, 'Invalid order amount or price.', { code: 'INVALID_TEMP_ORDER_PAYLOAD' });
  }

  const reservationInKg = req.body?.reservationInKg !== undefined && req.body?.reservationInKg !== null && req.body?.reservationInKg !== ''
    ? asInt(req.body?.reservationInKg, 0)
    : null;
  const reservationDate = req.body?.reservationDate ? new Date(req.body.reservationDate) : null;
  if (req.body?.reservationDate && Number.isNaN(reservationDate.getTime())) {
    throw createHttpError(400, 'Invalid reservation end date.', { code: 'INVALID_RESERVATION_END_DATE' });
  }

  const deliveryStartDate = new Date(req.body?.deliveryStartDate);
  const deliveryEndDate = new Date(req.body?.deliveryEndDate);
  if (Number.isNaN(deliveryStartDate.getTime()) || Number.isNaN(deliveryEndDate.getTime())) {
    throw createHttpError(400, 'Invalid delivery date range.', { code: 'INVALID_RESERVATION_END_DATE' });
  }

  const productCtx = await loadProductContext(req.database, beNumber, warehouseId);
  const packagingTypeDerived = await loadPackagingType(req.database, beNumber);

  const nowIso = new Date().toISOString();
  const sql = `
    INSERT INTO [dbo].[tbl_Temp_Auftraege] (
      [ta_company_id], [ta_ClientReferenceId], [ta_distributor], [ta_distributorLogo], [ta_be_number], [ta_article],
      [ta_amount_in_kg], [ta_warehouse], [ta_price], [ta_reservation_in_kg], [ta_reservation_date], [ta_about],
      [ta_packaging], [ta_mfi], [ta_client_name], [ta_client_address], [ta_client_representative],
      [ta_special_payment_condition], [ta_comment], [ta_delivery_type], [ta_packaging_type],
      [ta_delivery_start_date], [ta_delivery_end_date], [ta_completed], [ta_closing_date],
      [ta_CreatedBy], [ta_CreateDate], [ta_LastModifiedBy], [ta_LastModifiedDate],
      [ta_PassedTo], [ta_ReceivedFrom], [ta_PassedToUserId], [ta_ReceivedFromUserId], [ta_IsConfirmed]
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  await runSQLQuerySqlServer(config.sql.database, sql, [
    companyId,
    clientReferenceId,
    supplier || req.mandant,
    null,
    beNumber,
    productCtx.article,
    amountInKg,
    productCtx.warehouse,
    pricePerKg,
    reservationInKg,
    reservationDate ? reservationDate.toISOString() : null,
    productCtx.about || null,
    productCtx.packaging || '',
    productCtx.mfi || '',
    clientName,
    clientAddress,
    clientRepresentative || null,
    asBit(req.body?.specialPaymentCondition, 0),
    asText(req.body?.comment) || null,
    'LKW',
    packagingTypeDerived || '',
    deliveryStartDate.toISOString(),
    deliveryEndDate.toISOString(),
    0,
    null,
    userShortCode,
    nowIso,
    userShortCode,
    nowIso,
    null,
    null,
    null,
    null,
    0,
  ]);

  const createdRows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT TOP 1 *
    FROM [dbo].[tbl_Temp_Auftraege]
    WHERE [ta_company_id] = ? AND LOWER(COALESCE([ta_CreatedBy], '')) = ?
    ORDER BY [ta_id] DESC
  `, [companyId, userShortCode.toLowerCase()]);
  const created = Array.isArray(createdRows) && createdRows.length ? createdRows[0] : null;

  sendEnvelope(res, {
    status: 201,
    data: created ? mapTempOrderRow(created) : null,
    meta: { mandant: req.mandant },
    error: null,
  });
}));

router.put('/temp-orders/:id', requireMandant, asyncHandler(async (req, res) => {
  const userIdentity = await getUserIdentityByEmail(req.userEmail);
  const userShortCode = asText(userIdentity.shortCode);
  if (!userShortCode) {
    throw createHttpError(403, 'Missing Mitarbeiterkuerzel (ma_Kuerzel) for current user.', { code: 'MISSING_USER_SHORT_CODE' });
  }

  const companyId = Number(req.database?.firmaId || 0);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    throw createHttpError(400, `Invalid temp order id: ${req.params.id}`, { code: 'RESOURCE_NOT_FOUND' });
  }

  const clientReferenceId = asText(req.body?.clientReferenceId);
  const clientName = asText(req.body?.clientName);
  const clientAddress = asText(req.body?.clientAddress);
  const clientRepresentative = asText(req.body?.clientRepresentative);
  const supplier = asText(req.body?.supplier);
  const amountInKg = asInt(req.body?.amountInKg, 0);
  const pricePerKg = asInt(req.body?.pricePerKg, 0);
  const reservationInKg = req.body?.reservationInKg !== undefined && req.body?.reservationInKg !== null && req.body?.reservationInKg !== ''
    ? asInt(req.body?.reservationInKg, 0)
    : null;
  const reservationDate = req.body?.reservationDate ? new Date(req.body.reservationDate) : null;
  const deliveryStartDate = new Date(req.body?.deliveryStartDate);
  const deliveryEndDate = new Date(req.body?.deliveryEndDate);

  if (!clientReferenceId || !clientName || !clientAddress || amountInKg <= 0 || pricePerKg <= 0 || Number.isNaN(deliveryStartDate.getTime()) || Number.isNaN(deliveryEndDate.getTime())) {
    throw createHttpError(400, 'Invalid temp order payload.', { code: 'INVALID_TEMP_ORDER_PAYLOAD' });
  }
  if (req.body?.reservationDate && Number.isNaN(reservationDate.getTime())) {
    throw createHttpError(400, 'Invalid reservation end date.', { code: 'INVALID_RESERVATION_END_DATE' });
  }

  const existingRows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT TOP 1 [ta_be_number] AS beNumber
    FROM [dbo].[tbl_Temp_Auftraege]
    WHERE [ta_id] = ? AND [ta_company_id] = ?
      AND LOWER(COALESCE([ta_CreatedBy], '')) = ?
  `, [id, companyId, userShortCode.toLowerCase()]);
  const existing = Array.isArray(existingRows) && existingRows.length ? existingRows[0] : null;
  if (!existing) {
    throw createHttpError(404, `temp order not found: ${id}`, { code: 'RESOURCE_NOT_FOUND', id });
  }
  const packagingTypeDerived = await loadPackagingType(req.database, asText(existing.beNumber));

  const updateSql = `
    UPDATE [dbo].[tbl_Temp_Auftraege]
    SET [ta_ClientReferenceId] = ?,
        [ta_amount_in_kg] = ?,
        [ta_price] = ?,
        [ta_reservation_in_kg] = ?,
        [ta_reservation_date] = ?,
        [ta_client_name] = ?,
        [ta_client_address] = ?,
        [ta_client_representative] = ?,
        [ta_special_payment_condition] = ?,
        [ta_comment] = ?,
        [ta_distributor] = ?,
        [ta_delivery_type] = ?,
        [ta_packaging_type] = ?,
        [ta_delivery_start_date] = ?,
        [ta_delivery_end_date] = ?,
        [ta_LastModifiedBy] = ?,
        [ta_LastModifiedDate] = ?
    WHERE [ta_id] = ? AND [ta_company_id] = ?
      AND LOWER(COALESCE([ta_CreatedBy], '')) = ?
  `;
  await runSQLQuerySqlServer(config.sql.database, updateSql, [
    clientReferenceId,
    amountInKg,
    pricePerKg,
    reservationInKg,
    reservationDate ? reservationDate.toISOString() : null,
    clientName,
    clientAddress,
    clientRepresentative || null,
    asBit(req.body?.specialPaymentCondition, 0),
    asText(req.body?.comment) || null,
    supplier || req.mandant,
    'LKW',
    packagingTypeDerived || '',
    deliveryStartDate.toISOString(),
    deliveryEndDate.toISOString(),
    userShortCode,
    new Date().toISOString(),
    id,
    companyId,
    userShortCode.toLowerCase(),
  ]);

  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT TOP 1 *
    FROM [dbo].[tbl_Temp_Auftraege]
    WHERE [ta_id] = ? AND [ta_company_id] = ?
      AND LOWER(COALESCE([ta_CreatedBy], '')) = ?
  `, [id, companyId, userShortCode.toLowerCase()]);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row) {
    throw createHttpError(404, `temp order not found: ${id}`, { code: 'RESOURCE_NOT_FOUND', id });
  }

  sendEnvelope(res, {
    status: 200,
    data: mapTempOrderRow(row),
    meta: { mandant: req.mandant, id },
    error: null,
  });
}));

router.delete('/temp-orders/:id', requireMandant, asyncHandler(async (req, res) => {
  const userIdentity = await getUserIdentityByEmail(req.userEmail);
  const userShortCode = asText(userIdentity.shortCode);
  if (!userShortCode) {
    throw createHttpError(403, 'Missing Mitarbeiterkuerzel (ma_Kuerzel) for current user.', { code: 'MISSING_USER_SHORT_CODE' });
  }

  const companyId = Number(req.database?.firmaId || 0);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    throw createHttpError(400, `Invalid temp order id: ${req.params.id}`, { code: 'RESOURCE_NOT_FOUND' });
  }

  const existsSql = `
    SELECT TOP 1 1 AS ok
    FROM [dbo].[tbl_Temp_Auftraege]
    WHERE [ta_id] = ? AND [ta_company_id] = ?
      AND LOWER(COALESCE([ta_CreatedBy], '')) = ?
  `;
  const existsRows = await runSQLQuerySqlServer(config.sql.database, existsSql, [id, companyId, userShortCode.toLowerCase()]);
  if (!Array.isArray(existsRows) || !existsRows.length) {
    throw createHttpError(404, `temp order not found: ${id}`, { code: 'RESOURCE_NOT_FOUND', id });
  }

  const sql = `
    DELETE FROM [dbo].[tbl_Temp_Auftraege]
    WHERE [ta_id] = ? AND [ta_company_id] = ?
      AND LOWER(COALESCE([ta_CreatedBy], '')) = ?
  `;
  await runSQLQuerySqlServer(config.sql.database, sql, [id, companyId, userShortCode.toLowerCase()]);

  sendEnvelope(res, {
    status: 200,
    data: { id, deleted: true },
    meta: { mandant: req.mandant },
    error: null,
  });
}));

module.exports = router;
