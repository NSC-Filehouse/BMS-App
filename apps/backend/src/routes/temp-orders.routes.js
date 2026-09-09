const express = require('express');
const multer = require('multer');
const config = require('../config');
const { asyncHandler, createHttpError, sendEnvelope, parseListParams } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { runSQLQueryAccess, runSQLQuerySqlServer, withSqlTransaction } = require('../db/access');
const { getDatabaseConnectionForIdentityById } = require('../db/databases');
const { appSchemaName, appTableDisplayName, appTableName, appTableSql } = require('../db/app-tables');
const { getCustomerAccessScope, loadVisibleCustomer } = require('../db/customer-access');
const { sendPushNotificationsForTimelineEntries } = require('../db/push');
const { processOrderMailOutboxById } = require('../db/order-mail-outbox');
const {
  ORDER_MAIL_SUBJECT,
  formatOrderMailBody,
  resolveOrderMailRecipient,
  validateOrderMailConfig,
} = require('../mail/order-mail');
const logger = require('../logger');
const { productAvailabilitySource } = require('../db/product-availability');
const {
  buildTempPlanningKey,
  getTempOrderPlanningEntry,
  loadTempOrderPlanning,
} = require('../db/temp-order-planning');
const { loadCustomerDeliveryAddresses } = require('../db/delivery-addresses');
const { parseMandantIdFromBeNumber } = require('../mandant-prefix');

const router = express.Router();
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);
const ALLOWED_ATTACHMENT_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.heif'];
const MULTIPART_MOJIBAKE_PATTERN = /(?:Ã.|Â.|â.|ð|Ð|Ñ)/;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: MAX_ATTACHMENT_SIZE_BYTES,
  },
  fileFilter: (req, file, cb) => {
    const originalName = String(file?.originalname || '').trim().toLowerCase();
    const hasAllowedMimeType = ALLOWED_ATTACHMENT_MIME_TYPES.has(String(file?.mimetype || '').trim().toLowerCase());
    const hasAllowedExtension = ALLOWED_ATTACHMENT_EXTENSIONS.some((ext) => originalName.endsWith(ext));
    if (hasAllowedMimeType || hasAllowedExtension) {
      cb(null, true);
      return;
    }
    cb(createHttpError(400, 'Invalid attachment type.', { code: 'ATTACHMENT_INVALID_TYPE' }));
  },
});

function attachmentUploadMiddleware(req, res, next) {
  upload.single('attachment')(req, res, (err) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      next(createHttpError(400, 'Attachment file is too large.', { code: 'ATTACHMENT_TOO_LARGE' }));
      return;
    }
    next(err);
  });
}
const VIEW_SQL = productAvailabilitySource('availability');
const TEMP_ORDER_TABLE = appTableSql('tempOrder');
const TEMP_ORDER_POSITION_TABLE = appTableSql('tempOrderPosition');
const TEMP_ORDER_TABLE_NAME = appTableName('tempOrder');
const TEMP_ORDER_POSITION_TABLE_NAME = appTableName('tempOrderPosition');
const ORDER_MAIL_OUTBOX_TABLE = appTableSql('orderMailOutbox');
const TIMELINE_TABLE = appTableSql('timeline');
const APP_SCHEMA_NAME = appSchemaName();

const TEMP_ORDER_STATUS = Object.freeze({
  DRAFT: 0,
  APP_FINALIZED: 1,
  CS_ACCEPTED: 2,
  NEEDS_REWORK: 3,
});

function normalizeDir(dir) {
  return String(dir || '').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
}

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

const PACKAGING_TYPE_CANONICAL = new Map([
  ['sackware', 'sackware'],
  ['bags', 'sackware'],
  ['siloware', 'siloware'],
  ['silo/bulk', 'siloware'],
  ['big bags', 'big bags'],
  ['octa', 'octa'],
  ['octabins', 'octa'],
  ['andere', 'andere'],
  ['others', 'andere'],
  ['neutrale sackware', 'neutrale sackware'],
  ['neutral bags', 'neutrale sackware'],
  ['neutrale oktabins', 'neutrale oktabins'],
  ['neutral octas', 'neutrale oktabins'],
]);

function normalizePackagingType(value) {
  const key = asText(value).toLocaleLowerCase('de-DE').replace(/\s+/g, ' ');
  return PACKAGING_TYPE_CANONICAL.get(key) || key;
}

function packagingTypesEqual(left, right) {
  return normalizePackagingType(left) === normalizePackagingType(right);
}

async function resolvePositionDatabase(req, beNumber) {
  const sourceMandantId = parseMandantIdFromBeNumber(beNumber);
  if (sourceMandantId === null || Number(req.database?.firmaId) === sourceMandantId) {
    return req.database;
  }
  return getDatabaseConnectionForIdentityById(req.userIdentity, sourceMandantId);
}

function assertPositionsBelongToActiveMandant(req, positions) {
  for (const position of Array.isArray(positions) ? positions : []) {
    const beNumber = asText(position?.beNumber);
    const sourceMandantId = parseMandantIdFromBeNumber(beNumber);
    if (sourceMandantId !== null && Number(req.database?.firmaId) !== sourceMandantId) {
      throw createHttpError(403, 'Fremde VL-Mandanten sind im Auftrag nicht zulaessig.', {
        code: 'FOREIGN_VL_READ_ONLY',
        beNumber,
        sourceMandantId,
      });
    }
  }
}

function normalizeTempOrderCompanyId(value) {
  const text = asText(value);
  if (!text) return null;

  const companyId = Number(text);
  return Number.isSafeInteger(companyId) && companyId >= 0 ? companyId : null;
}

async function requireVisibleCustomer(req, customerId) {
  const id = asText(customerId);
  if (!id) {
    throw createHttpError(400, 'Missing customer id.', { code: 'INVALID_CUSTOMER_ID' });
  }

  const accessScope = await getCustomerAccessScope(req.userIdentity, req.database);
  const customer = await loadVisibleCustomer(req.database, id, accessScope);
  if (!customer) {
    throw createHttpError(404, `customers not found: ${id}`, { code: 'CUSTOMER_NOT_FOUND', id });
  }
  return customer;
}

function normalizeTempOrderOwnerScope(scope) {
  return asText(scope).toLowerCase() === 'mine' ? 'mine' : 'all';
}

function normalizeTempOrderStatus(status) {
  const value = asText(status).toLowerCase();
  return value === 'draft' || value === 'sent' || value === 'rework' ? value : 'all';
}

function normalizeStoredTempOrderStatus(value, legacyCompleted = false) {
  const text = asText(value);
  if (text) {
    const numeric = Number(text);
    if (Number.isInteger(numeric) && numeric >= 0) return numeric;
  }
  return legacyCompleted ? TEMP_ORDER_STATUS.APP_FINALIZED : TEMP_ORDER_STATUS.DRAFT;
}

function isTempOrderEditableStatus(value, legacyCompleted = false) {
  const status = normalizeStoredTempOrderStatus(value, legacyCompleted);
  return status === TEMP_ORDER_STATUS.DRAFT || status === TEMP_ORDER_STATUS.NEEDS_REWORK;
}

function isTempOrderFinalizedStatus(value, legacyCompleted = false) {
  const status = normalizeStoredTempOrderStatus(value, legacyCompleted);
  return status === TEMP_ORDER_STATUS.APP_FINALIZED || status === TEMP_ORDER_STATUS.CS_ACCEPTED;
}

function shouldRetryExistingOrderMail(existingOutbox) {
  return Boolean(existingOutbox)
    && asText(existingOutbox.status).toLowerCase() !== 'sent';
}

function buildTempOrderOwnerFilter(userShortCode, isFullAccess, column = '[ta_CreatedBy]', requestedScope = 'all') {
  const scope = isFullAccess ? normalizeTempOrderOwnerScope(requestedScope) : 'mine';
  if (scope === 'all') {
    return { whereSql: '', params: [], scope };
  }
  return {
    whereSql: ` AND LOWER(COALESCE(${column}, '')) = ?`,
    params: [String(userShortCode || '').toLowerCase()],
    scope,
  };
}

function buildTempOrderStatusFilter(status, column = '[o].[ta_Status]') {
  const normalizedStatus = normalizeTempOrderStatus(status);
  if (normalizedStatus === 'sent') {
    return { whereSql: ` AND COALESCE(${column}, 0) IN (1, 2)`, status: normalizedStatus };
  }
  if (normalizedStatus === 'draft') {
    return { whereSql: ` AND COALESCE(${column}, 0) = 0`, status: normalizedStatus };
  }
  if (normalizedStatus === 'rework') {
    return { whereSql: ` AND COALESCE(${column}, 0) = 3`, status: normalizedStatus };
  }
  return { whereSql: '', status: normalizedStatus };
}

function normalizeAttachmentFileName(value) {
  const text = asText(value);
  if (!text) return '';
  if (!MULTIPART_MOJIBAKE_PATTERN.test(text)) {
    return text;
  }

  try {
    const decoded = Buffer.from(text, 'latin1').toString('utf8').replace(/\0/g, '').trim();
    if (!decoded || decoded.includes('\uFFFD')) {
      return text;
    }
    return decoded;
  } catch {
    return text;
  }
}

function buildContentDisposition(fileName, fallbackName) {
  const resolved = normalizeAttachmentFileName(fileName) || fallbackName;
  const asciiFallback = resolved
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\r\n]/g, '')
    || fallbackName;
  const encoded = encodeURIComponent(resolved)
    .replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
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

function parseDeliveryAddressId(value) {
  if (value === undefined || value === null || asText(value) === '') {
    return { provided: false, id: null };
  }
  const text = asText(value);
  const id = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(id) || id > 2147483647) {
    throw createHttpError(400, 'Invalid delivery address id.', { code: 'INVALID_TEMP_ORDER_PAYLOAD' });
  }
  return { provided: true, id };
}

function parseJsonField(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getRequestBody(req) {
  const body = req && req.body && typeof req.body === 'object' ? req.body : {};
  const positions = Array.isArray(body.positions) ? body.positions : parseJsonField(body.positions, undefined);
  return positions === undefined ? body : { ...body, positions };
}

function normalizeAttachmentInput(req) {
  const body = getRequestBody(req);
  const removeAttachment = asBit(body?.removeAttachment, 0) === 1;
  const file = req.file || null;
  if (!file) {
    return {
      shouldReplace: false,
      shouldRemove: removeAttachment,
      buffer: null,
      fileName: null,
      mimeType: null,
    };
  }
  return {
    shouldReplace: true,
    shouldRemove: false,
    buffer: file.buffer,
    fileName: normalizeAttachmentFileName(file.originalname) || 'attachment',
    mimeType: asText(file.mimetype) || 'application/octet-stream',
  };
}

function resolveLang(req) {
  const raw = String(req?.header?.('x-lang') || '').trim().toLowerCase();
  return raw === 'en' ? 'en' : 'de';
}

function normalizeTotal(rows) {
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || typeof row !== 'object') return null;
  return row.total ?? row.TOTAL ?? row.Total ?? Object.values(row)[0] ?? null;
}

function mapTempOrderRow(row) {
  const orderStatus = normalizeStoredTempOrderStatus(row.ta_Status, row.ta_completed);
  return {
    id: row.ta_id,
    companyId: row.ta_company_id,
    clientReferenceId: row.ta_ClientReferenceId,
    distributor: row.ta_distributor,
    distributorLogo: row.ta_distributorLogo,
    clientName: row.ta_client_name,
    clientAddress: row.ta_client_address,
    clientRepresentative: row.ta_client_representative,
    comment: row.ta_comment,
    returnComment: asText(row.ta_return_comment),
    specialPaymentCondition: Boolean(row.ta_special_payment_condition),
    specialPaymentText: asText(row.ta_special_payment_text),
    specialPaymentId: row.ta_special_payment_id === null || row.ta_special_payment_id === undefined ? null : Number(row.ta_special_payment_id),
    deliveryTypeId: row.ta_delivery_type_id === null || row.ta_delivery_type_id === undefined ? null : Number(row.ta_delivery_type_id),
    deliveryType: asText(row.ta_delivery_type),
    packagingType: asText(row.ta_packaging_type),
    deliveryDate: row.ta_delivery_date || null,
    deliveryAddress: asText(row.ta_delivery_address),
    deliveryAddressId: row.ta_delivery_address_id === null || row.ta_delivery_address_id === undefined || row.ta_delivery_address_id === ''
      ? null
      : Number(row.ta_delivery_address_id),
    deliveryAddressChanged: Boolean(row.ta_delivery_address_changed),
    completed: Boolean(row.ta_completed),
    finalized: isTempOrderFinalizedStatus(orderStatus),
    orderStatus,
    editable: isTempOrderEditableStatus(orderStatus),
    closingDate: row.ta_closing_date,
    completedBy: row.ta_CompletedBy,
    createdBy: row.ta_CreatedBy,
    createdAt: row.ta_CreateDate,
    lastModifiedBy: row.ta_LastModifiedBy,
    lastModifiedDate: row.ta_LastModifiedDate,
    passedTo: row.ta_PassedTo,
    receivedFrom: row.ta_ReceivedFrom,
    passedToUserId: row.ta_PassedToUserId,
    receivedFromUserId: row.ta_ReceivedFromUserId,
    isConfirmed: Boolean(row.ta_IsConfirmed),
    hasAttachment: row.ta_Attachment !== null && row.ta_Attachment !== undefined,
    attachmentFileName: normalizeAttachmentFileName(row.ta_AttachmentFileName),
    attachmentMimeType: asText(row.ta_AttachmentMimeType),
  };
}

async function loadOrderMailState(orderId) {
  let rows;
  try {
    rows = await runSQLQuerySqlServer(config.sql.database, `
      SELECT TOP 1
        [om_Status] AS status,
        [om_Recipient] AS recipient,
        [om_RecipientSource] AS recipientSource,
        [om_AttemptCount] AS attemptCount,
        [om_SentAt] AS sentAt,
        [om_LastError] AS lastError
      FROM ${ORDER_MAIL_OUTBOX_TABLE}
      WHERE [om_OrderID] = ?
    `, [orderId]);
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('invalid object name') && message.includes('ordermailoutbox')) return null;
    throw error;
  }
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row) return null;
  return {
    status: asText(row.status),
    recipient: asText(row.recipient),
    recipientSource: asText(row.recipientSource),
    attemptCount: Number(row.attemptCount || 0),
    sentAt: row.sentAt || null,
    lastError: asText(row.lastError) || null,
  };
}

function validateFinalOrder(order, positions) {
  if (!order?.clientReferenceId || !order?.clientName || !order?.clientAddress
    || !order?.deliveryType || !order?.packagingType || !order?.deliveryAddress
    || !order?.specialPaymentText) {
    throw createHttpError(400, 'Final order is incomplete.', { code: 'INVALID_TEMP_ORDER_PAYLOAD' });
  }
  if (!Array.isArray(positions) || positions.length === 0) {
    throw createHttpError(400, 'At least one position is required.', { code: 'TEMP_ORDER_MISSING_POSITIONS' });
  }
  const invalidPosition = positions.find((position) => (
    !asText(position?.beNumber)
    || !asText(position?.warehouse)
    || !asText(position?.originalPackagingType)
    || !position?.deliveryDate
    || Number(position?.amountInKg) <= 0
    || Number(position?.price) <= 0
    || Number(position?.costPrice) <= 0
  ));
  if (invalidPosition) {
    throw createHttpError(400, 'Final order contains an incomplete position.', { code: 'INVALID_TEMP_ORDER_PAYLOAD' });
  }
}

function mapTempOrderWithPositions(row, positions) {
  const base = mapTempOrderRow(row);
  const list = (Array.isArray(positions) ? positions : []).map((p) => ({
    ...p,
    wpzId: p.wpzId === null || p.wpzId === undefined ? null : Number(p.wpzId),
    wpzOriginal: p.wpzOriginal === null || p.wpzOriginal === undefined ? null : Boolean(p.wpzOriginal),
    wpzComment: asText(p.wpzComment),
    originalPackagingType: asText(p.originalPackagingType),
    packagingTypeChanged: Boolean(p.packagingTypeChanged),
  }));
  return {
    ...base,
    positions: list,
  };
}

function normalizePositionsInput(body) {
  const positionsValue = Array.isArray(body?.positions) ? body.positions : parseJsonField(body?.positions, []);
  const positions = Array.isArray(positionsValue) ? positionsValue : [];
  if (positions.length > 0) return positions;
  return [{
    beNumber: body?.beNumber,
    warehouseId: body?.warehouseId,
    deliveryDate: body?.deliveryDate,
    amountInKg: body?.amountInKg,
    pricePerKg: body?.pricePerKg,
    salePricePerKg: body?.salePricePerKg,
    costPricePerKg: body?.costPricePerKg,
    reservationInKg: body?.reservationInKg,
    reservationDate: body?.reservationDate,
    wpzId: body?.wpzId,
    wpzOriginal: body?.wpzOriginal,
    wpzComment: body?.wpzComment,
  }];
}

function toId(name) {
  return `[${String(name || '').replace(/]/g, ']]')}]`;
}

function hasColumn(columns, name) {
  const target = String(name || '').trim().toLowerCase();
  return Boolean(target) && (columns || []).some((col) => String(col || '').trim().toLowerCase() === target);
}

async function getTableColumns(database, tableName, schemaName = APP_SCHEMA_NAME) {
  const sql = `
    SELECT [COLUMN_NAME] AS col
    FROM [INFORMATION_SCHEMA].[COLUMNS]
    WHERE [TABLE_SCHEMA] = ? AND [TABLE_NAME] = ?
  `;
  const rows = await runSQLQuerySqlServer(database, sql, [schemaName, tableName]);
  return (Array.isArray(rows) ? rows : [])
    .map((r) => asText(r.col))
    .filter(Boolean);
}

function resolveColumn(columns, candidates) {
  const byLower = new Map((columns || []).map((c) => [String(c).toLowerCase(), c]));
  for (const c of candidates) {
    const hit = byLower.get(String(c).toLowerCase());
    if (hit) return hit;
  }
  return null;
}

async function loadProductContext(database, beNumber, warehouseId) {
  const sqlByStorageId = `
    SELECT TOP 1
      [Artikel] AS article,
      [Lagerort] AS warehouse,
      [Menge] AS amount,
      [bePR_Anzahl] AS reserved,
      [beP_VLbemerkung] AS about,
      [beP_Additive] AS packaging,
      [beP_MFIgemessen] AS mfiMeasured,
      [beP_MFI] AS mfiBase
    FROM ${VIEW_SQL}
    WHERE COALESCE([Bestell-Pos], '') = ?
      AND COALESCE([bePL_LagerID], '') = ?
  `;
  const rowsByStorageId = await runSQLQueryAccess(database, sqlByStorageId, [beNumber, warehouseId]);
  let row = Array.isArray(rowsByStorageId) && rowsByStorageId.length ? rowsByStorageId[0] : null;

  // Backward compatibility: older position rows might store Lagerort text in tap_warehouse.
  if (!row) {
    const sqlByWarehouseName = `
      SELECT TOP 1
        [Artikel] AS article,
        [Lagerort] AS warehouse,
        [Menge] AS amount,
        [bePR_Anzahl] AS reserved,
        [beP_VLbemerkung] AS about,
        [beP_Additive] AS packaging,
        [beP_MFIgemessen] AS mfiMeasured,
        [beP_MFI] AS mfiBase
      FROM ${VIEW_SQL}
      WHERE COALESCE([Bestell-Pos], '') = ?
        AND COALESCE([Lagerort], '') = ?
    `;
    const rowsByWarehouseName = await runSQLQueryAccess(database, sqlByWarehouseName, [beNumber, warehouseId]);
    row = Array.isArray(rowsByWarehouseName) && rowsByWarehouseName.length ? rowsByWarehouseName[0] : null;
  }

  if (!row) {
    throw createHttpError(404, 'Product availability row not found for reservation.', {
      code: 'PRODUCT_AVAILABILITY_NOT_FOUND',
      beNumber,
      warehouseId,
    });
  }

  const measured = Number(row.mfiMeasured);
  const base = Number(row.mfiBase);
  const mfi = Number.isFinite(measured)
    ? String(measured)
    : (Number.isFinite(base) ? String(base) : asText(row.mfiMeasured || row.mfiBase));

  return {
    article: asText(row.article),
    warehouse: asText(row.warehouse),
    amount: Number(row.amount) || 0,
    reserved: Number(row.reserved) || 0,
    about: asText(row.about),
    packaging: asText(row.packaging),
    mfi,
  };
}

async function assertTempOrderPositionsAvailable({ companyId, positions, excludeOrderId = null }) {
  const normalizedPositions = Array.isArray(positions) ? positions : [];
  if (!normalizedPositions.length) return;

  const planning = await loadTempOrderPlanning({
    companyId,
    excludeOrderId,
    keys: normalizedPositions,
  });
  const requestedByKey = new Map();

  for (const position of normalizedPositions) {
    const key = buildTempPlanningKey(position.beNumber, position.warehouseId);
    const current = requestedByKey.get(key) || { position, amountInKg: 0 };
    current.amountInKg += Number(position.amountInKg) || 0;
    requestedByKey.set(key, current);
  }

  for (const { position, amountInKg } of requestedByKey.values()) {
    const baseAmount = Math.max(
      (Number(position.productContext?.amount) || 0)
        - (Number(position.productContext?.reserved) || 0),
      0,
    );
    const plannedAmount = getTempOrderPlanningEntry(
      planning,
      position.beNumber,
      position.warehouseId,
    ).totalAmountKg;
    const availableAmount = Math.max(baseAmount - plannedAmount, 0);
    if (amountInKg > availableAmount + 0.000001) {
      throw createHttpError(400, `Temp order amount exceeds available quantity (${availableAmount}).`, {
        code: 'TEMP_ORDER_AMOUNT_EXCEEDS_AVAILABLE',
        availableAmount,
        plannedAmount,
        requestedAmount: amountInKg,
        beNumber: position.beNumber,
        warehouseId: position.warehouseId,
      });
    }
  }
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

async function loadDeliveryType(database, beNumber) {
  // Business rule from legacy app: delivery type is read via be_Verpackung chain.
  return loadPackagingType(database, beNumber);
}

async function loadLatestWpzId(database, beNumber) {
  const sql = `
    SELECT TOP 1 [bePZ_ID] AS wpzId
    FROM [dbo].[tblBest_Pos_WPZ]
    WHERE COALESCE([bePZ_BEposID], '') = ?
    ORDER BY [bePZ_ID] DESC
  `;
  const rows = await runSQLQueryAccess(database, sql, [beNumber]);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  const id = Number(row?.wpzId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function loadIncoterms(database, lang) {
  const safeLang = String(lang || 'de').toLowerCase() === 'en' ? 'en' : 'de';
  const sql = `
    SELECT [lib_ID] AS id, [lib_Lieferbedingung] AS text
    FROM [dbo].[tblLieferbedingungen]
    WHERE LOWER(COALESCE([lib_SprachID], '')) = ?
      AND COALESCE([lib_Lieferbedingung], '') <> ''
    ORDER BY [lib_Lieferbedingung] ASC
  `;
  const rows = await runSQLQueryAccess(database, sql, [safeLang]);
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    id: Number(r.id),
    text: asText(r.text),
  })).filter((x) => Number.isFinite(x.id) && x.id > 0 && x.text);
}

async function loadIncotermById(database, incotermId, lang) {
  const safeLang = String(lang || 'de').toLowerCase() === 'en' ? 'en' : 'de';
  const id = asInt(incotermId, 0);
  if (!id) return null;
  const sql = `
    SELECT TOP 1 [lib_ID] AS id, [lib_Lieferbedingung] AS text
    FROM [dbo].[tblLieferbedingungen]
    WHERE [lib_ID] = ?
      AND LOWER(COALESCE([lib_SprachID], '')) = ?
  `;
  const rows = await runSQLQueryAccess(database, sql, [id, safeLang]);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row) return null;
  return {
    id: Number(row.id),
    text: asText(row.text),
  };
}

async function loadPaymentTexts(lang) {
  const safeLang = String(lang || 'de').toLowerCase() === 'en' ? 'en' : 'de';
  const sql = `
    SELECT [zaS_ID] AS id, [zaS_Zahl_Text] AS text
    FROM [dbo].[tblZahltext_Sprachen]
    WHERE LOWER(COALESCE([zaS_SprachID], '')) = ?
      AND COALESCE([zaS_Zahl_Text], '') <> ''
    ORDER BY [zaS_Zahl_Text] ASC
  `;
  const rows = await runSQLQuerySqlServer(config.sql.database, sql, [safeLang]);
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    id: Number(r.id),
    text: asText(r.text),
  })).filter((x) => Number.isFinite(x.id) && x.id > 0 && x.text);
}

async function loadPaymentTextById(paymentId, lang) {
  const safeLang = String(lang || 'de').toLowerCase() === 'en' ? 'en' : 'de';
  const id = asInt(paymentId, 0);
  if (!id) return null;
  const sql = `
    SELECT TOP 1 [zaS_ID] AS id, [zaS_Zahl_Text] AS text
    FROM [dbo].[tblZahltext_Sprachen]
    WHERE [zaS_ID] = ?
      AND LOWER(COALESCE([zaS_SprachID], '')) = ?
  `;
  const rows = await runSQLQuerySqlServer(config.sql.database, sql, [id, safeLang]);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row) return null;
  return {
    id: Number(row.id),
    text: asText(row.text),
  };
}

async function loadCustomerPaymentDefaultId(database, clientReferenceId) {
  const id = asText(clientReferenceId);
  if (!id) return null;
  const rows = await runSQLQueryAccess(database, `
    SELECT TOP 1 [kd_Zahltext] AS paymentTextId
    FROM [dbo].[tblKunden]
    WHERE [kd_KdNR] = ?
  `, [id]);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  const paymentTextId = Number(row?.paymentTextId);
  return Number.isFinite(paymentTextId) && paymentTextId > 0 ? paymentTextId : null;
}

async function normalizeOrderLevelInput(
  req,
  body,
  clientAddress,
  lang,
) {
  const specialPaymentCondition = asBit(body?.specialPaymentCondition, 0);
  const customerPaymentDefaultId = await loadCustomerPaymentDefaultId(req.database, body?.clientReferenceId);
  const requestedPaymentId = asInt(body?.specialPaymentId, 0) || null;
  const effectivePaymentId = specialPaymentCondition
    ? (requestedPaymentId || customerPaymentDefaultId)
    : (customerPaymentDefaultId || requestedPaymentId);
  const specialPayment = await loadPaymentTextById(effectivePaymentId, lang);
  if (!specialPayment) {
    throw createHttpError(400, 'Invalid special payment text.', { code: 'INVALID_TEMP_ORDER_PAYLOAD' });
  }

  const incotermIdInput = body?.incotermId ?? body?.deliveryTypeId;
  let incoterm = null;
  if (incotermIdInput !== undefined && incotermIdInput !== null && incotermIdInput !== '') {
    incoterm = await loadIncotermById(req.database, incotermIdInput, lang);
    if (!incoterm) {
      throw createHttpError(400, 'Invalid incoterm.', { code: 'INVALID_TEMP_ORDER_PAYLOAD' });
    }
  }
  if (!incoterm) {
    throw createHttpError(400, 'Invalid incoterm.', { code: 'INVALID_TEMP_ORDER_PAYLOAD' });
  }

  const packagingType = asText(body?.packagingType);
  if (!packagingType) {
    throw createHttpError(400, 'Invalid packaging type.', { code: 'INVALID_TEMP_ORDER_PAYLOAD' });
  }

  const deliveryAddressChanged = asBit(body?.deliveryAddressChanged ?? body?.deliveryAddressManual, 0);
  const requestedDeliveryAddressId = parseDeliveryAddressId(body?.deliveryAddressId);
  const submittedDeliveryAddress = asText(body?.deliveryAddress);
  let deliveryAddressId = null;
  let deliveryAddress = submittedDeliveryAddress || clientAddress;
  if (!deliveryAddressChanged) {
    const deliveryAddresses = await loadCustomerDeliveryAddresses(req.database, body?.clientReferenceId);
    const selectedAddress = requestedDeliveryAddressId.provided
      ? deliveryAddresses.find((address) => Number(address.id) === requestedDeliveryAddressId.id)
      : deliveryAddresses.find((address) => address.text === submittedDeliveryAddress);
    if (requestedDeliveryAddressId.provided && !selectedAddress) {
      throw createHttpError(400, 'Delivery address does not belong to the selected customer.', {
        code: 'INVALID_TEMP_ORDER_PAYLOAD',
      });
    }
    if (selectedAddress) {
      deliveryAddressId = Number(selectedAddress.id);
      deliveryAddress = selectedAddress.text || submittedDeliveryAddress || clientAddress;
    }
  }
  if (!deliveryAddress) {
    throw createHttpError(400, 'Invalid delivery address.', { code: 'INVALID_TEMP_ORDER_PAYLOAD' });
  }

  return {
    specialPaymentCondition,
    specialPaymentText: specialPayment?.text || null,
    specialPaymentId: specialPayment?.id || null,
    incotermText: incoterm?.text || null,
    incotermId: incoterm?.id || null,
    packagingType,
    deliveryAddress,
    deliveryAddressId,
    deliveryAddressChanged,
  };
}

async function loadOrderPositions(orderId) {
  try {
    const cols = await getTableColumns(config.sql.database, TEMP_ORDER_POSITION_TABLE_NAME);
    if (!cols.length) return [];

    const cOrderId = resolveColumn(cols, ['tap_ta_id', 'taP_ta_id', 'ta_id']);
    if (!cOrderId) return [];

    const cLineNo = resolveColumn(cols, ['tap_line_no', 'taP_line_no', 'line_no']);
    const cId = resolveColumn(cols, ['tap_id', 'taP_id', 'id']);
    const cBeNumber = resolveColumn(cols, ['tap_be_number', 'taP_be_number', 'be_number']);
    const cArticle = resolveColumn(cols, ['tap_article', 'taP_article', 'article']);
    const cAmount = resolveColumn(cols, ['tap_amount_in_kg', 'taP_amount_in_kg', 'amount_in_kg']);
    const cWarehouse = resolveColumn(cols, ['tap_warehouse', 'taP_warehouse', 'warehouse']);
    const cPrice = resolveColumn(cols, ['tap_price', 'taP_price', 'price']);
    const cEp = resolveColumn(cols, ['tap_ep', 'taP_ep', 'ep']);
    const cDeliveryDate = resolveColumn(cols, ['tap_delivery_date']);
    const cReservationInKg = resolveColumn(cols, ['tap_reservation_in_kg', 'taP_reservation_in_kg', 'reservation_in_kg']);
    const cReservationDate = resolveColumn(cols, ['tap_reservation_date', 'taP_reservation_date', 'reservation_date']);
    const cAbout = resolveColumn(cols, ['tap_about', 'taP_about', 'about']);
    const cMfi = resolveColumn(cols, ['tap_mfi', 'taP_mfi', 'mfi']);
    const cWpzId = resolveColumn(cols, ['tap_wpz_id']);
    const cWpzOriginal = resolveColumn(cols, ['tap_wpz_original']);
    const cWpzComment = resolveColumn(cols, ['tap_wpz_comment']);
    const cOriginalPackagingType = resolveColumn(cols, ['tap_Verpackungsart']);
    const cPackagingTypeChanged = resolveColumn(cols, ['tap_Verpackungsart_Gewechselt']);

    const pick = (col, alias) => (col ? `${toId(col)} AS ${toId(alias)}` : `NULL AS ${toId(alias)}`);
    const sql = `
      SELECT
        ${pick(cId, 'id')},
        ${pick(cOrderId, 'orderId')},
        ${pick(cLineNo, 'lineNo')},
        ${pick(cBeNumber, 'beNumber')},
        ${pick(cArticle, 'article')},
        ${pick(cAmount, 'amountInKg')},
        ${pick(cWarehouse, 'warehouse')},
        ${pick(cPrice, 'price')},
        ${pick(cEp, 'costPrice')},
        ${pick(cDeliveryDate, 'deliveryDate')},
        ${pick(cReservationInKg, 'reservationInKg')},
        ${pick(cReservationDate, 'reservationDate')},
        ${pick(cAbout, 'about')},
        ${pick(cMfi, 'mfi')},
        ${pick(cOriginalPackagingType, 'originalPackagingType')},
        ${pick(cWpzId, 'wpzId')},
        ${pick(cWpzOriginal, 'wpzOriginal')},
        ${pick(cWpzComment, 'wpzComment')},
        ${pick(cPackagingTypeChanged, 'packagingTypeChanged')}
      FROM ${TEMP_ORDER_POSITION_TABLE}
      WHERE ${toId(cOrderId)} = ?
      ORDER BY ${cLineNo ? `${toId(cLineNo)} ASC` : '(SELECT 1)'}
    `;
    const rows = await runSQLQuerySqlServer(config.sql.database, sql, [orderId]);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    logger.error(`Positionen fuer Temp-Auftrag ${orderId} konnten nicht geladen werden`, error);
    throw error;
  }
}

async function loadPositionSummariesForOrders(orderIds) {
  const ids = Array.isArray(orderIds)
    ? orderIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
    : [];
  if (!ids.length) return new Map();

  const cols = await getTableColumns(config.sql.database, TEMP_ORDER_POSITION_TABLE_NAME);
  if (!cols.length) return new Map();

  const cOrderId = resolveColumn(cols, ['tap_ta_id', 'taP_ta_id', 'ta_id']);
  if (!cOrderId) return new Map();

  const cArticle = resolveColumn(cols, ['tap_article', 'taP_article', 'article']);
  const cBeNumber = resolveColumn(cols, ['tap_be_number', 'taP_be_number', 'be_number']);
  const cAmount = resolveColumn(cols, ['tap_amount_in_kg', 'taP_amount_in_kg', 'amount_in_kg']);
  const cDeliveryDate = resolveColumn(cols, ['tap_delivery_date']);
  const cLineNo = resolveColumn(cols, ['tap_line_no', 'taP_line_no', 'line_no']);
  const pick = (col, alias) => (col ? `${toId(col)} AS ${toId(alias)}` : `NULL AS ${toId(alias)}`);
  const placeholders = ids.map(() => '?').join(', ');
  const sql = `
    SELECT
      ${pick(cOrderId, 'orderId')},
      ${pick(cArticle, 'article')},
      ${pick(cBeNumber, 'beNumber')},
      ${pick(cAmount, 'amountInKg')},
      ${pick(cDeliveryDate, 'deliveryDate')}
    FROM ${TEMP_ORDER_POSITION_TABLE}
    WHERE ${toId(cOrderId)} IN (${placeholders})
    ORDER BY ${toId(cOrderId)} ASC${cLineNo ? `, ${toId(cLineNo)} ASC` : ''}
  `;
  const rows = await runSQLQuerySqlServer(config.sql.database, sql, ids);
  const map = new Map();
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const orderId = Number(row.orderId);
    if (!Number.isFinite(orderId) || orderId <= 0) continue;
    if (!map.has(orderId)) map.set(orderId, []);
    map.get(orderId).push({
      article: asText(row.article),
      beNumber: asText(row.beNumber),
      amountInKg: row.amountInKg,
      deliveryDate: row.deliveryDate || null,
    });
  }
  return map;
}

router.get('/temp-orders/meta/by-be-number/:beNumber', requireMandant, asyncHandler(async (req, res) => {
  const beNumber = asText(req.params?.beNumber);
  if (!beNumber) {
    throw createHttpError(400, 'Missing beNumber.', { code: 'MISSING_BE_NUMBER' });
  }

  const sourceDatabase = await resolvePositionDatabase(req, beNumber);
  const packagingType = await loadPackagingType(sourceDatabase, beNumber);
  const deliveryType = await loadDeliveryType(sourceDatabase, beNumber);
  sendEnvelope(res, {
    status: 200,
    data: {
      beNumber,
      packagingType,
      deliveryType,
    },
    meta: {
      mandant: req.mandant,
      sourceMandant: sourceDatabase?.name || req.mandant,
      sourceMandantId: sourceDatabase?.firmaId ?? null,
    },
    error: null,
  });
}));

router.get('/temp-orders/payment-texts', requireMandant, asyncHandler(async (req, res) => {
  const lang = resolveLang(req);
  const data = await loadPaymentTexts(lang);
  sendEnvelope(res, {
    status: 200,
    data,
    meta: { mandant: req.mandant, count: data.length, lang },
    error: null,
  });
}));

router.get('/temp-orders/incoterms', requireMandant, asyncHandler(async (req, res) => {
  const lang = resolveLang(req);
  const data = await loadIncoterms(req.database, lang);
  sendEnvelope(res, {
    status: 200,
    data,
    meta: { mandant: req.mandant, count: data.length, lang },
    error: null,
  });
}));

router.get('/temp-orders', requireMandant, asyncHandler(async (req, res) => {
  const userIdentity = req.userIdentity;
  const accessScope = await getCustomerAccessScope(req.userIdentity, req.database);
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
    id: '[o].[ta_id]',
    createdAt: '[o].[ta_CreateDate]',
    article: '[fp].[article]',
    clientName: '[o].[ta_client_name]',
    beNumber: '[fp].[beNumber]',
  };
  const safeSort = sortMap[String(sort || '').trim()] || '[ta_CreateDate]';
  const safeDir = normalizeDir(dir);
  const offset = (page - 1) * pageSize;

  const text = asText(q);
  const like = `%${text}%`;
  const whereText = text
    ? ` AND (
        [o].[ta_client_name] LIKE ? OR [o].[ta_comment] LIKE ?
        OR EXISTS (
          SELECT 1
          FROM ${TEMP_ORDER_POSITION_TABLE} p
          WHERE p.[tap_ta_id] = [o].[ta_id]
            AND (p.[tap_article] LIKE ? OR p.[tap_be_number] LIKE ?)
        )
      )`
    : '';
  const whereParams = text ? [like, like, like, like] : [];
  const statusFilter = buildTempOrderStatusFilter(req.query?.status);
  const requestedOwnerScope = normalizeTempOrderOwnerScope(req.query?.ownerScope);
  const ownerFilter = buildTempOrderOwnerFilter(
    userShortCode,
    accessScope.isFullAccess,
    '[o].[ta_CreatedBy]',
    requestedOwnerScope,
  );

  const countSql = `
    SELECT COUNT(*) AS total
    FROM ${TEMP_ORDER_TABLE} o
    WHERE [o].[ta_company_id] = ?
    ${ownerFilter.whereSql}
    ${statusFilter.whereSql}
    ${whereText}
  `;
  const totalRows = await runSQLQuerySqlServer(config.sql.database, countSql, [companyId, ...ownerFilter.params, ...whereParams]);
  const total = normalizeTotal(totalRows);

  const listSql = `
    SELECT
      [o].[ta_id] AS id,
      [fp].[beNumber] AS beNumber,
      [fp].[article] AS article,
      [fp].[price] AS price,
      [fp].[amountInKg] AS amountInKg,
      [o].[ta_client_name] AS clientName,
      [o].[ta_CreateDate] AS createdAt,
      [o].[ta_CreatedBy] AS createdBy,
      [o].[ta_completed] AS completed,
      [o].[ta_IsConfirmed] AS isConfirmed,
      [o].[ta_Status] AS orderStatus
    FROM ${TEMP_ORDER_TABLE} o
    OUTER APPLY (
      SELECT TOP 1
        [tap_be_number] AS beNumber,
        [tap_article] AS article,
        [tap_price] AS price,
        [tap_amount_in_kg] AS amountInKg
      FROM ${TEMP_ORDER_POSITION_TABLE} p
      WHERE p.[tap_ta_id] = o.[ta_id]
      ORDER BY p.[tap_line_no] ASC
    ) fp
    WHERE [o].[ta_company_id] = ?
    ${ownerFilter.whereSql}
    ${statusFilter.whereSql}
    ${whereText}
    ORDER BY ${safeSort} ${safeDir}
    OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
  `;
  const rows = await runSQLQuerySqlServer(config.sql.database, listSql, [
    companyId,
    ...ownerFilter.params,
    ...whereParams,
    offset,
    pageSize,
  ]);
  const summariesByOrderId = await loadPositionSummariesForOrders((rows || []).map((x) => x.id));

  const data = (rows || []).map((row) => ({
    id: row.id,
    beNumber: row.beNumber,
    article: row.article,
    clientName: row.clientName,
    price: row.price,
    amountInKg: row.amountInKg,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    completed: Boolean(row.completed),
    finalized: isTempOrderFinalizedStatus(row.orderStatus, row.completed),
    orderStatus: normalizeStoredTempOrderStatus(row.orderStatus, row.completed),
    editable: isTempOrderEditableStatus(row.orderStatus, row.completed),
    isConfirmed: Boolean(row.isConfirmed),
    positions: summariesByOrderId.get(Number(row.id)) || [],
  }));

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
      sort,
      dir: safeDir,
      status: statusFilter.status,
      ownerScope: ownerFilter.scope,
      canViewAll: Boolean(accessScope.isFullAccess),
    },
    error: null,
  });
}));

router.get('/temp-orders/:id', requireMandant, asyncHandler(async (req, res) => {
  const userIdentity = req.userIdentity;
  const accessScope = await getCustomerAccessScope(req.userIdentity, req.database);
  const userShortCode = asText(userIdentity.shortCode);
  if (!userShortCode) {
    throw createHttpError(403, 'Missing Mitarbeiterkuerzel (ma_Kuerzel) for current user.', { code: 'MISSING_USER_SHORT_CODE' });
  }

  const companyId = Number(req.database?.firmaId || 0);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    throw createHttpError(400, `Invalid temp order id: ${req.params.id}`, { code: 'RESOURCE_NOT_FOUND' });
  }

  const ownerFilter = buildTempOrderOwnerFilter(userShortCode, accessScope.isFullAccess);

  const sql = `
    SELECT TOP 1 *
    FROM ${TEMP_ORDER_TABLE}
    WHERE [ta_id] = ? AND [ta_company_id] = ?
      ${ownerFilter.whereSql}
  `;
  const rows = await runSQLQuerySqlServer(config.sql.database, sql, [id, companyId, ...ownerFilter.params]);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row) {
    throw createHttpError(404, `temp order not found: ${id}`, { code: 'RESOURCE_NOT_FOUND', id });
  }

  sendEnvelope(res, {
    status: 200,
    data: {
      ...mapTempOrderWithPositions(row, await loadOrderPositions(row.ta_id)),
      mail: await loadOrderMailState(row.ta_id),
    },
    meta: { mandant: req.mandant, id },
    error: null,
  });
}));

router.get('/temp-orders/:id/attachment', requireMandant, asyncHandler(async (req, res) => {
  const userIdentity = req.userIdentity;
  const accessScope = await getCustomerAccessScope(req.userIdentity, req.database);
  const userShortCode = asText(userIdentity.shortCode);
  if (!userShortCode) {
    throw createHttpError(403, 'Missing Mitarbeiterkuerzel (ma_Kuerzel) for current user.', { code: 'MISSING_USER_SHORT_CODE' });
  }

  const companyId = Number(req.database?.firmaId || 0);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    throw createHttpError(400, `Invalid temp order id: ${req.params.id}`, { code: 'RESOURCE_NOT_FOUND' });
  }

  const ownerFilter = buildTempOrderOwnerFilter(userShortCode, accessScope.isFullAccess);

  const sql = `
    SELECT TOP 1
      [ta_Attachment] AS attachment,
      [ta_AttachmentFileName] AS fileName,
      [ta_AttachmentMimeType] AS mimeType
    FROM ${TEMP_ORDER_TABLE}
    WHERE [ta_id] = ? AND [ta_company_id] = ?
      ${ownerFilter.whereSql}
  `;
  const rows = await runSQLQuerySqlServer(config.sql.database, sql, [id, companyId, ...ownerFilter.params]);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row || row.attachment === null || row.attachment === undefined) {
    throw createHttpError(404, `temp order attachment not found: ${id}`, { code: 'RESOURCE_NOT_FOUND', id });
  }

  res.setHeader('Content-Type', asText(row.mimeType) || 'application/octet-stream');
  res.setHeader('Content-Disposition', buildContentDisposition(row.fileName, `temp-order-${id}-attachment`));
  res.send(row.attachment);
}));

router.post('/temp-orders', requireMandant, attachmentUploadMiddleware, asyncHandler(async (req, res) => {
  const userIdentity = req.userIdentity;
  const userShortCode = asText(userIdentity.shortCode);
  if (!userShortCode) {
    throw createHttpError(403, 'Missing Mitarbeiterkuerzel (ma_Kuerzel) for current user.', { code: 'MISSING_USER_SHORT_CODE' });
  }

  const companyId = normalizeTempOrderCompanyId(req.database?.firmaId);
  if (companyId === null) {
    throw createHttpError(400, 'Invalid company id for selected mandant.', { code: 'INVALID_COMPANY_ID' });
  }

  const body = getRequestBody(req);
  const attachment = normalizeAttachmentInput(req);
  const positionsInput = normalizePositionsInput(body);
  if (!Array.isArray(positionsInput) || !positionsInput.length) {
    throw createHttpError(400, 'At least one position is required.', { code: 'TEMP_ORDER_MISSING_POSITIONS' });
  }
  assertPositionsBelongToActiveMandant(req, positionsInput);

  const clientReferenceId = asText(body?.clientReferenceId);
  const clientName = asText(body?.clientName);
  const clientAddress = asText(body?.clientAddress);
  const clientRepresentative = asText(body?.clientRepresentative);
  const supplier = asText(body?.supplier);
  const lang = resolveLang(req);
  if (!clientReferenceId || !clientName || !clientAddress) {
    throw createHttpError(400, 'Missing required client data for temp order.', { code: 'TEMP_ORDER_MISSING_CLIENT_DATA' });
  }
  await requireVisibleCustomer(req, clientReferenceId);
  const orderLevel = await normalizeOrderLevelInput(
    req,
    body,
    clientAddress,
    lang,
  );
  const orderCols = await getTableColumns(config.sql.database, TEMP_ORDER_TABLE_NAME);
  const positionCols = await getTableColumns(config.sql.database, TEMP_ORDER_POSITION_TABLE_NAME);
  const hasOrderDeliveryDate = hasColumn(orderCols, 'ta_delivery_date');
  const hasOrderDeliveryAddressId = hasColumn(orderCols, 'ta_delivery_address_id');
  const hasPositionDeliveryDate = hasColumn(positionCols, 'tap_delivery_date');
  if (!hasOrderDeliveryAddressId) {
    throw createHttpError(503, 'Temp order table is missing delivery address id support. Apply the migration first.', {
      code: 'TEMP_ORDER_DELIVERY_ADDRESS_ID_SCHEMA_MISSING',
    });
  }
  const hasOriginalPackagingType = hasColumn(positionCols, 'tap_Verpackungsart');
  const hasPackagingTypeChanged = hasColumn(positionCols, 'tap_Verpackungsart_Gewechselt');
  if (!hasOriginalPackagingType || !hasPackagingTypeChanged) {
    throw createHttpError(503, 'Temp order position table is missing packaging change support. Apply the migration first.', { code: 'TEMP_ORDER_PACKAGING_CHANGE_SCHEMA_MISSING' });
  }

  const normalizedPositions = [];
  for (const raw of positionsInput) {
    const beNumber = asText(raw?.beNumber);
    const warehouseId = asText(raw?.warehouseId);
    const deliveryDate = raw?.deliveryDate ? new Date(raw.deliveryDate) : (body?.deliveryDate ? new Date(body.deliveryDate) : null);
    const amountInKg = asInt(raw?.amountInKg, 0);
    const salePricePerKg = asInt(raw?.salePricePerKg ?? raw?.pricePerKg, 0);
    const costPricePerKg = asInt(raw?.costPricePerKg ?? raw?.epPerKg ?? raw?.ep ?? 0, 0);
    if (!beNumber || !warehouseId) {
      throw createHttpError(400, 'Missing position keys: beNumber and warehouseId.', { code: 'MISSING_RESERVATION_KEYS' });
    }
    if (!deliveryDate || Number.isNaN(deliveryDate.getTime())) {
      throw createHttpError(400, 'Invalid delivery date.', { code: 'INVALID_TEMP_ORDER_PAYLOAD' });
    }
    if (amountInKg <= 0 || salePricePerKg <= 0 || costPricePerKg <= 0) {
      throw createHttpError(400, 'Invalid position amount or price.', { code: 'INVALID_TEMP_ORDER_PAYLOAD' });
    }
    const reservationInKg = raw?.reservationInKg !== undefined && raw?.reservationInKg !== null && raw?.reservationInKg !== ''
      ? asInt(raw?.reservationInKg, 0)
      : null;
    const reservationDate = raw?.reservationDate ? new Date(raw.reservationDate) : null;
    if (raw?.reservationDate && Number.isNaN(reservationDate.getTime())) {
      throw createHttpError(400, 'Invalid reservation end date.', { code: 'INVALID_RESERVATION_END_DATE' });
    }
    const sourceDatabase = await resolvePositionDatabase(req, beNumber);
    const productContext = await loadProductContext(sourceDatabase, beNumber, warehouseId);
    const originalPackagingType = await loadPackagingType(sourceDatabase, beNumber);
    if (!originalPackagingType) {
      throw createHttpError(400, 'Original packaging type is missing for position.', {
        code: 'INVALID_TEMP_ORDER_PAYLOAD',
        beNumber,
      });
    }
    const packagingTypeChanged = !packagingTypesEqual(orderLevel.packagingType, originalPackagingType);
    const wpzId = await loadLatestWpzId(sourceDatabase, beNumber);
    const wpzOriginal = wpzId ? asBit(raw?.wpzOriginal, 1) : null;
    const wpzCommentText = asText(raw?.wpzComment);
    const wpzComment = wpzCommentText || null;
    if (wpzId && wpzOriginal === 0 && !wpzComment) {
      throw createHttpError(400, 'Invalid WPZ comment.', { code: 'INVALID_TEMP_ORDER_PAYLOAD' });
    }
    normalizedPositions.push({
      beNumber,
      warehouseId,
      deliveryDate: deliveryDate.toISOString(),
      amountInKg,
      salePricePerKg,
      costPricePerKg,
      reservationInKg,
      reservationDate: reservationDate ? reservationDate.toISOString() : null,
      wpzId,
      wpzOriginal,
      wpzComment,
      originalPackagingType,
      packagingTypeChanged,
      productContext,
      sourceDatabase,
    });
  }

  await assertTempOrderPositionsAvailable({
    companyId,
    positions: normalizedPositions,
  });

  const deliveryDates = Array.from(new Set(normalizedPositions.map((pos) => String(pos.deliveryDate || '')).filter(Boolean)));
  if (!hasPositionDeliveryDate && deliveryDates.length > 1) {
    throw createHttpError(500, 'Temp order position table is missing delivery date support. Apply the migration first.', { code: 'TEMP_ORDER_POSITION_DELIVERY_DATE_MISSING' });
  }
  if (!hasPositionDeliveryDate && !hasOrderDeliveryDate) {
    throw createHttpError(500, 'Temp order tables are missing delivery date columns. Apply the migration first.', { code: 'TEMP_ORDER_DELIVERY_DATE_SCHEMA_MISSING' });
  }

  const nowIso = new Date().toISOString();
  const fallbackOrderDeliveryDate = deliveryDates[0] || null;
  const orderInsertColumns = [
    '[ta_company_id]', '[ta_ClientReferenceId]', '[ta_client_name]', '[ta_client_address]', '[ta_client_representative]',
    '[ta_comment]', '[ta_special_payment_condition]', '[ta_special_payment_text]', '[ta_special_payment_id]', '[ta_delivery_type_id]', '[ta_delivery_type]',
    ...(hasOrderDeliveryDate ? ['[ta_delivery_date]'] : []),
    '[ta_packaging_type]', '[ta_delivery_address]', '[ta_delivery_address_id]', '[ta_delivery_address_changed]', '[ta_completed]', '[ta_Status]',
    '[ta_Attachment]', '[ta_AttachmentFileName]', '[ta_AttachmentMimeType]',
    '[ta_CreatedBy]', '[ta_CreateDate]', '[ta_LastModifiedBy]', '[ta_LastModifiedDate]',
    '[ta_PassedTo]', '[ta_ReceivedFrom]', '[ta_PassedToUserId]', '[ta_ReceivedFromUserId]', '[ta_IsConfirmed]',
  ];
  const orderInsertValues = [
    '?', '?', '?', '?', '?',
    '?', '?', '?', '?', '?', '?',
    ...(hasOrderDeliveryDate ? ['?'] : []),
    '?', '?', '?', '?', '?', '?',
    'CAST(? AS VARBINARY(MAX))', '?', '?',
    '?', '?', '?', '?',
    '?', '?', '?', '?', '?',
  ];
  const orderInsertParams = [
    companyId,
    clientReferenceId,
    clientName,
    clientAddress,
    clientRepresentative || null,
    asText(body?.comment) || null,
    orderLevel.specialPaymentCondition,
    orderLevel.specialPaymentText,
    orderLevel.specialPaymentId,
    orderLevel.incotermId,
    orderLevel.incotermText,
    ...(hasOrderDeliveryDate ? [fallbackOrderDeliveryDate] : []),
    orderLevel.packagingType,
    orderLevel.deliveryAddress,
    orderLevel.deliveryAddressId,
    orderLevel.deliveryAddressChanged,
    0,
    TEMP_ORDER_STATUS.DRAFT,
    attachment.buffer,
    attachment.fileName,
    attachment.mimeType,
    userShortCode,
    nowIso,
    userShortCode,
    nowIso,
    null,
    null,
    null,
    null,
    0,
  ];
  const sql = `
    INSERT INTO ${TEMP_ORDER_TABLE} (
      ${orderInsertColumns.join(', ')}
    )
    OUTPUT INSERTED.*
    VALUES (${orderInsertValues.join(', ')})
  `;
  const created = await withSqlTransaction(config.sql.database, async ({ query }) => {
    const createdResult = await query(sql, orderInsertParams);
    const createdRow = createdResult.rows[0] || null;
    if (!createdRow) {
      throw createHttpError(500, 'Temp order create verification failed.', { code: 'TEMP_ORDER_CREATE_FAILED' });
    }

    for (let i = 0; i < normalizedPositions.length; i += 1) {
      const pos = normalizedPositions[i];
      const posCtx = pos.productContext;
      const posInsertColumns = [
        '[tap_ta_id]', '[tap_line_no]', '[tap_be_number]', '[tap_article]', '[tap_amount_in_kg]', '[tap_warehouse]', '[tap_price]',
        '[tap_ep]', '[tap_reservation_in_kg]', '[tap_reservation_date]',
        ...(hasPositionDeliveryDate ? ['[tap_delivery_date]'] : []),
        '[tap_about]', '[tap_mfi]',
        '[tap_wpz_original]', '[tap_wpz_comment]', '[tap_wpz_id]', '[tap_Verpackungsart]', '[tap_Verpackungsart_Gewechselt]',
        '[tap_CreatedBy]', '[tap_CreateDate]', '[tap_LastModifiedBy]', '[tap_LastModifiedDate]',
      ];
      const posSql = `
        INSERT INTO ${TEMP_ORDER_POSITION_TABLE} (
          ${posInsertColumns.join(', ')}
        )
        VALUES (${posInsertColumns.map(() => '?').join(', ')})
      `;
      await query(posSql, [
        createdRow.ta_id,
        i + 1,
        pos.beNumber,
        posCtx.article,
        pos.amountInKg,
        pos.warehouseId,
        pos.salePricePerKg,
        pos.costPricePerKg,
        pos.reservationInKg,
        pos.reservationDate,
        ...(hasPositionDeliveryDate ? [pos.deliveryDate] : []),
        posCtx.about || null,
        posCtx.mfi || '',
        pos.wpzOriginal,
        pos.wpzComment,
        pos.wpzId,
        pos.originalPackagingType,
        pos.packagingTypeChanged,
        userShortCode,
        nowIso,
        userShortCode,
        nowIso,
      ]);
    }

    return createdRow;
  });

  sendEnvelope(res, {
    status: 201,
    data: mapTempOrderWithPositions(created, await loadOrderPositions(created.ta_id)),
    meta: { mandant: req.mandant },
    error: null,
  });
}));

router.post('/temp-orders/:id/finalize', requireMandant, asyncHandler(async (req, res) => {
  const userIdentity = req.userIdentity;
  const accessScope = await getCustomerAccessScope(req.userIdentity, req.database);
  const userShortCode = asText(userIdentity.shortCode);
  if (!userShortCode) {
    throw createHttpError(403, 'Missing Mitarbeiterkuerzel (ma_Kuerzel) for current user.', { code: 'MISSING_USER_SHORT_CODE' });
  }

  const mailConfigValidation = validateOrderMailConfig(config.orderMail, config.mailService);
  if (!mailConfigValidation.ok) {
    throw createHttpError(503, 'Order mail configuration is incomplete.', {
      code: 'TEMP_ORDER_MAIL_CONFIG_MISSING',
      missing: mailConfigValidation.missing || [],
    });
  }

  const companyId = Number(req.database?.firmaId || 0);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    throw createHttpError(400, `Invalid temp order id: ${req.params.id}`, { code: 'RESOURCE_NOT_FOUND' });
  }

  const ownerFilter = buildTempOrderOwnerFilter(userShortCode, accessScope.isFullAccess);
  const qualifiedOwnerFilter = buildTempOrderOwnerFilter(userShortCode, accessScope.isFullAccess, 'o.[ta_CreatedBy]');

  const nowIso = new Date().toISOString();
  const missingPackagingRows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT p.[tap_id] AS id, p.[tap_be_number] AS beNumber
    FROM ${TEMP_ORDER_POSITION_TABLE} AS p
    INNER JOIN ${TEMP_ORDER_TABLE} AS o
      ON o.[ta_id] = p.[tap_ta_id]
    WHERE p.[tap_ta_id] = ?
      AND o.[ta_company_id] = ?
      AND o.[ta_Status] IN (0, 3)
      AND NULLIF(LTRIM(RTRIM(COALESCE(p.[tap_Verpackungsart], N''))), N'') IS NULL
      ${qualifiedOwnerFilter.whereSql}
  `, [id, companyId, ...qualifiedOwnerFilter.params]);
  const resolvedMissingPackaging = new Map();
  for (const position of (missingPackagingRows || [])) {
    const beNumber = asText(position.beNumber);
    const sourceDatabase = await resolvePositionDatabase(req, beNumber);
    const originalPackagingType = await loadPackagingType(sourceDatabase, beNumber);
    if (originalPackagingType) resolvedMissingPackaging.set(Number(position.id), originalPackagingType);
  }
  let finalized;
  try {
    finalized = await withSqlTransaction(config.sql.database, async ({ query }) => {
      const orderResult = await query(`
        SELECT TOP 1 *
        FROM ${TEMP_ORDER_TABLE} WITH (UPDLOCK, HOLDLOCK)
        WHERE [ta_id] = ? AND [ta_company_id] = ?
          ${ownerFilter.whereSql}
      `, [id, companyId, ...ownerFilter.params]);
      const orderRow = orderResult.rows[0] || null;
      if (!orderRow) {
        throw createHttpError(404, `temp order not found: ${id}`, { code: 'RESOURCE_NOT_FOUND', id });
      }

      const orderStatus = normalizeStoredTempOrderStatus(orderRow.ta_Status, orderRow.ta_completed);

      const existingOutboxResult = await query(`
        SELECT TOP 1 [om_ID] AS id, [om_Status] AS status
        FROM ${ORDER_MAIL_OUTBOX_TABLE} WITH (UPDLOCK, HOLDLOCK)
        WHERE [om_OrderID] = ?
      `, [id]);
      const existingOutbox = existingOutboxResult.rows[0] || null;
      if (isTempOrderFinalizedStatus(orderStatus)) {
        return {
          alreadyFinalized: true,
          outboxId: existingOutbox ? Number(existingOutbox.id) : null,
          timelineEntries: [],
        };
      }
      if (!isTempOrderEditableStatus(orderStatus)) {
        throw createHttpError(409, `Temp order status ${orderStatus} cannot be finalized.`, {
          code: 'TEMP_ORDER_STATUS_LOCKED',
          id,
          orderStatus,
        });
      }

      const positionsResult = await query(`
        SELECT
          [tap_id] AS id,
          [tap_line_no] AS [lineNo],
          [tap_be_number] AS beNumber,
          [tap_article] AS article,
          [tap_amount_in_kg] AS amountInKg,
          [tap_warehouse] AS warehouse,
          [tap_price] AS price,
          [tap_ep] AS costPrice,
          [tap_delivery_date] AS deliveryDate,
          [tap_reservation_in_kg] AS reservationInKg,
          [tap_reservation_date] AS reservationDate,
          [tap_about] AS about,
          [tap_mfi] AS mfi,
          [tap_wpz_id] AS wpzId,
          [tap_wpz_original] AS wpzOriginal,
          [tap_wpz_comment] AS wpzComment,
          [tap_Verpackungsart] AS originalPackagingType,
          [tap_Verpackungsart_Gewechselt] AS packagingTypeChanged
        FROM ${TEMP_ORDER_POSITION_TABLE} WITH (HOLDLOCK)
        WHERE [tap_ta_id] = ?
        ORDER BY [tap_line_no] ASC
      `, [id]);
      const positions = positionsResult.rows || [];
      const mappedOrder = mapTempOrderRow(orderRow);
      for (const position of positions) {
        const originalPackagingType = asText(position.originalPackagingType)
          || asText(resolvedMissingPackaging.get(Number(position.id)));
        if (!originalPackagingType) {
          throw createHttpError(400, 'Original packaging type is missing for position.', {
            code: 'INVALID_TEMP_ORDER_PAYLOAD',
            beNumber: position.beNumber,
          });
        }
        const packagingTypeChanged = !packagingTypesEqual(mappedOrder.packagingType, originalPackagingType);
        if (asText(position.originalPackagingType) !== originalPackagingType
          || Boolean(position.packagingTypeChanged) !== packagingTypeChanged) {
          await query(`
            UPDATE ${TEMP_ORDER_POSITION_TABLE}
            SET [tap_Verpackungsart] = ?,
                [tap_Verpackungsart_Gewechselt] = ?,
                [tap_LastModifiedBy] = ?,
                [tap_LastModifiedDate] = ?
            WHERE [tap_id] = ? AND [tap_ta_id] = ?
          `, [originalPackagingType, packagingTypeChanged ? 1 : 0, userShortCode, nowIso, position.id, id]);
          position.originalPackagingType = originalPackagingType;
          position.packagingTypeChanged = packagingTypeChanged;
        }
      }
      validateFinalOrder(mappedOrder, positions);

      const recipient = resolveOrderMailRecipient(companyId, config.orderMail);
      if (!recipient.ok) {
        throw createHttpError(422, 'No order mail recipient configured for mandant.', {
          code: 'TEMP_ORDER_MAIL_RECIPIENT_MISSING',
          companyId,
          reason: recipient.reason,
        });
      }

      const finalizedBy = [userIdentity.fullName, userShortCode, req.userEmail].filter(Boolean).join(' / ');
      const mailBody = formatOrderMailBody({
        order: { ...mappedOrder, createdByEmail: req.userEmail },
        positions,
        mandantName: req.mandant,
        mandantShortName: req.database?.shortName || null,
        finalizedBy,
        finalizedAt: nowIso,
      });

      await query(`
        UPDATE ${TEMP_ORDER_TABLE}
        SET [ta_Status] = 1,
            [ta_return_comment] = NULL,
            [ta_closing_date] = ?,
            [ta_CompletedBy] = ?,
            [ta_LastModifiedBy] = ?,
            [ta_LastModifiedDate] = ?
        WHERE [ta_id] = ? AND [ta_company_id] = ?
          ${ownerFilter.whereSql}
          AND [ta_Status] IN (0, 3)
      `, [nowIso, userShortCode, userShortCode, nowIso, id, companyId, ...ownerFilter.params]);

      let outboxId;
      // The normal order mail belongs to the first hand-off of this order only.
      // A later status-3 return must not send it again. Non-sent rows are still
      // requeued so a failed first delivery can be retried.
      if (shouldRetryExistingOrderMail(existingOutbox)) {
        const requeuedOutboxResult = await query(`
          UPDATE ${ORDER_MAIL_OUTBOX_TABLE}
          SET [om_CompanyID] = ?,
              [om_Recipient] = ?,
              [om_RecipientSource] = ?,
              [om_Subject] = ?,
              [om_Body] = ?,
              [om_Status] = N'pending',
              [om_AttemptCount] = 0,
              [om_NextAttemptAt] = NULL,
              [om_LockedAt] = NULL,
              [om_LastError] = NULL,
              [om_SentAt] = NULL,
              [om_LastModifiedDate] = ?
          OUTPUT INSERTED.[om_ID] AS id
          WHERE [om_ID] = ? AND [om_OrderID] = ?
        `, [
          companyId,
          recipient.address,
          recipient.source,
          ORDER_MAIL_SUBJECT,
          mailBody,
          nowIso,
          existingOutbox.id,
          id,
        ]);
        outboxId = Number(requeuedOutboxResult.rows[0]?.id);
      } else if (existingOutbox) {
        outboxId = Number(existingOutbox.id);
      } else {
        const outboxResult = await query(`
          INSERT INTO ${ORDER_MAIL_OUTBOX_TABLE} (
            [om_OrderID], [om_CompanyID], [om_Recipient], [om_RecipientSource],
            [om_Subject], [om_Body], [om_Status], [om_AttemptCount],
            [om_NextAttemptAt], [om_CreateDate], [om_LastModifiedDate]
          )
          OUTPUT INSERTED.[om_ID] AS id
          VALUES (?, ?, ?, ?, ?, ?, N'pending', 0, ?, ?, ?)
        `, [
          id,
          companyId,
          recipient.address,
          recipient.source,
          ORDER_MAIL_SUBJECT,
          mailBody,
          nowIso,
          nowIso,
          nowIso,
        ]);
        outboxId = Number(outboxResult.rows[0]?.id);
      }

      const timelineExistsResult = await query(`
        SELECT TOP 1 1 AS ok
        FROM ${TIMELINE_TABLE}
        WHERE [tl_Type] = N'order' AND [tl_CompanyId] = ? AND [tl_ReferenceId] = ?
      `, [companyId, String(id)]);
      const timelineEntries = [];
      if (!timelineExistsResult.rows.length) {
        for (const position of positions) {
          const entry = {
            createdAt: nowIso,
            mandant: req.mandant,
            mandantShortName: req.database?.shortName || null,
            companyId,
            userEmail: req.userEmail || null,
            userShortCode,
            type: 'order',
            product: asText(position.article) || asText(position.beNumber),
            productId: asText(position.beNumber),
            beNumber: asText(position.beNumber),
            amountKg: Number(position.amountInKg),
            unit: 'kg',
            referenceId: String(id),
            payloadJson: {
              clientReferenceId: mappedOrder.clientReferenceId,
              clientName: mappedOrder.clientName,
              warehouseId: asText(position.warehouse),
            },
          };
          await query(`
            INSERT INTO ${TIMELINE_TABLE} (
              [tl_CreatedAt], [tl_Mandant], [tl_MandantKurz], [tl_CompanyId],
              [tl_UserEmail], [tl_UserShortCode], [tl_Type], [tl_Product],
              [tl_ProductId], [tl_BeNumber], [tl_AmountKg], [tl_Unit],
              [tl_ReferenceId], [tl_PayloadJson]
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            entry.createdAt,
            entry.mandant,
            entry.mandantShortName,
            entry.companyId,
            entry.userEmail,
            entry.userShortCode,
            entry.type,
            entry.product,
            entry.productId,
            entry.beNumber,
            entry.amountKg,
            entry.unit,
            entry.referenceId,
            JSON.stringify(entry.payloadJson),
          ]);
          timelineEntries.push(entry);
        }
      }

      return { alreadyFinalized: false, outboxId, timelineEntries };
    });
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('invalid column name') && (message.includes('ta_closing_date') || message.includes('ta_completedby') || message.includes('ta_status') || message.includes('ta_return_comment') || message.includes('tap_verpackungsart'))
      || message.includes('invalid object name') && message.includes('ordermailoutbox')) {
      throw createHttpError(503, 'Temp order finalization migration is missing.', { code: 'TEMP_ORDER_FINALIZATION_SCHEMA_MISSING' });
    }
    throw error;
  }

  if (finalized.timelineEntries.length) {
    try {
      await sendPushNotificationsForTimelineEntries(finalized.timelineEntries);
    } catch (error) {
      logger.error(`Push fuer finalisierten Auftrag ${id} fehlgeschlagen`, error);
    }
  }

  const mailResult = finalized.outboxId
    ? await processOrderMailOutboxById(finalized.outboxId)
    : { processed: false, status: 'not_available' };
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT TOP 1 *
    FROM ${TEMP_ORDER_TABLE}
    WHERE [ta_id] = ? AND [ta_company_id] = ?
      ${ownerFilter.whereSql}
  `, [id, companyId, ...ownerFilter.params]);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;

  sendEnvelope(res, {
    status: 200,
    data: {
      ...mapTempOrderWithPositions(row, await loadOrderPositions(id)),
      mail: await loadOrderMailState(id),
    },
    meta: {
      mandant: req.mandant,
      id,
      alreadyFinalized: finalized.alreadyFinalized,
      mailStatus: mailResult.status,
    },
    error: null,
  });
}));

router.put('/temp-orders/:id', requireMandant, attachmentUploadMiddleware, asyncHandler(async (req, res) => {
  const userIdentity = req.userIdentity;
  const accessScope = await getCustomerAccessScope(req.userIdentity, req.database);
  const userShortCode = asText(userIdentity.shortCode);
  if (!userShortCode) {
    throw createHttpError(403, 'Missing Mitarbeiterkuerzel (ma_Kuerzel) for current user.', { code: 'MISSING_USER_SHORT_CODE' });
  }

  const body = getRequestBody(req);
  const attachment = normalizeAttachmentInput(req);
  const companyId = Number(req.database?.firmaId || 0);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    throw createHttpError(400, `Invalid temp order id: ${req.params.id}`, { code: 'RESOURCE_NOT_FOUND' });
  }

  const ownerFilter = buildTempOrderOwnerFilter(userShortCode, accessScope.isFullAccess);

  const clientReferenceId = asText(body?.clientReferenceId);
  const clientName = asText(body?.clientName);
  const clientAddress = asText(body?.clientAddress);
  const clientRepresentative = asText(body?.clientRepresentative);
  const supplier = asText(body?.supplier);
  const lang = resolveLang(req);
  const qualifiedOwnerFilter = buildTempOrderOwnerFilter(userShortCode, accessScope.isFullAccess, 'o.[ta_CreatedBy]');

  if (!clientReferenceId || !clientName || !clientAddress) {
    throw createHttpError(400, 'Invalid temp order payload.', { code: 'INVALID_TEMP_ORDER_PAYLOAD' });
  }
  await requireVisibleCustomer(req, clientReferenceId);
  const positionsInput = normalizePositionsInput(body);
  if (!Array.isArray(positionsInput) || !positionsInput.length) {
    throw createHttpError(400, 'At least one position is required.', { code: 'TEMP_ORDER_MISSING_POSITIONS' });
  }
  assertPositionsBelongToActiveMandant(req, positionsInput);
  const orderLevel = await normalizeOrderLevelInput(
    req,
    body,
    clientAddress,
    lang,
  );
  const orderCols = await getTableColumns(config.sql.database, TEMP_ORDER_TABLE_NAME);
  const positionCols = await getTableColumns(config.sql.database, TEMP_ORDER_POSITION_TABLE_NAME);
  const hasOrderDeliveryDate = hasColumn(orderCols, 'ta_delivery_date');
  const hasOrderDeliveryAddressId = hasColumn(orderCols, 'ta_delivery_address_id');
  const hasPositionDeliveryDate = hasColumn(positionCols, 'tap_delivery_date');
  if (!hasOrderDeliveryAddressId) {
    throw createHttpError(503, 'Temp order table is missing delivery address id support. Apply the migration first.', {
      code: 'TEMP_ORDER_DELIVERY_ADDRESS_ID_SCHEMA_MISSING',
    });
  }
  const hasOriginalPackagingType = hasColumn(positionCols, 'tap_Verpackungsart');
  const hasPackagingTypeChanged = hasColumn(positionCols, 'tap_Verpackungsart_Gewechselt');
  if (!hasOriginalPackagingType || !hasPackagingTypeChanged) {
    throw createHttpError(503, 'Temp order position table is missing packaging change support. Apply the migration first.', { code: 'TEMP_ORDER_PACKAGING_CHANGE_SCHEMA_MISSING' });
  }

  const storedPackagingRows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT
      p.[tap_id] AS id,
      p.[tap_be_number] AS beNumber,
      p.[tap_warehouse] AS warehouseId,
      p.[tap_Verpackungsart] AS originalPackagingType,
      p.[tap_CreatedBy] AS createdBy,
      p.[tap_CreateDate] AS createdAt
    FROM ${TEMP_ORDER_POSITION_TABLE} AS p
    INNER JOIN ${TEMP_ORDER_TABLE} AS o
      ON o.[ta_id] = p.[tap_ta_id]
    WHERE p.[tap_ta_id] = ?
      AND o.[ta_company_id] = ?
      ${qualifiedOwnerFilter.whereSql}
  `, [id, companyId, ...qualifiedOwnerFilter.params]);
  const storedPackagingById = new Map((storedPackagingRows || []).map((row) => [Number(row.id), row]));

  const normalizedPositions = [];
  for (const raw of positionsInput) {
    const beNumber = asText(raw?.beNumber);
    const warehouseId = asText(raw?.warehouseId);
    const deliveryDate = raw?.deliveryDate ? new Date(raw.deliveryDate) : (body?.deliveryDate ? new Date(body.deliveryDate) : null);
    const amountInKg = asInt(raw?.amountInKg, 0);
    const salePricePerKg = asInt(raw?.salePricePerKg ?? raw?.pricePerKg, 0);
    const costPricePerKg = asInt(raw?.costPricePerKg ?? raw?.epPerKg ?? raw?.ep ?? 0, 0);
    if (!beNumber || !warehouseId) {
      throw createHttpError(400, 'Missing position keys: beNumber and warehouseId.', { code: 'MISSING_RESERVATION_KEYS' });
    }
    if (!deliveryDate || Number.isNaN(deliveryDate.getTime())) {
      throw createHttpError(400, 'Invalid delivery date.', { code: 'INVALID_TEMP_ORDER_PAYLOAD' });
    }
    if (amountInKg <= 0 || salePricePerKg <= 0 || costPricePerKg <= 0) {
      throw createHttpError(400, 'Invalid position amount or price.', { code: 'INVALID_TEMP_ORDER_PAYLOAD' });
    }
    const reservationInKg = raw?.reservationInKg !== undefined && raw?.reservationInKg !== null && raw?.reservationInKg !== ''
      ? asInt(raw?.reservationInKg, 0)
      : null;
    const reservationDate = raw?.reservationDate ? new Date(raw.reservationDate) : null;
    if (raw?.reservationDate && Number.isNaN(reservationDate.getTime())) {
      throw createHttpError(400, 'Invalid reservation end date.', { code: 'INVALID_RESERVATION_END_DATE' });
    }
    const sourceDatabase = await resolvePositionDatabase(req, beNumber);
    const productContext = await loadProductContext(sourceDatabase, beNumber, warehouseId);
    const storedPosition = storedPackagingById.get(Number(raw?.id));
    const storedOriginalPackagingType = storedPosition
      && asText(storedPosition.beNumber) === beNumber
      && asText(storedPosition.warehouseId) === warehouseId
      ? asText(storedPosition.originalPackagingType)
      : '';
    const originalPackagingType = storedOriginalPackagingType
      || await loadPackagingType(sourceDatabase, beNumber);
    if (!originalPackagingType) {
      throw createHttpError(400, 'Original packaging type is missing for position.', {
        code: 'INVALID_TEMP_ORDER_PAYLOAD',
        beNumber,
      });
    }
    const packagingTypeChanged = !packagingTypesEqual(orderLevel.packagingType, originalPackagingType);
    const wpzId = await loadLatestWpzId(sourceDatabase, beNumber);
    const wpzOriginal = wpzId ? asBit(raw?.wpzOriginal, 1) : null;
    const wpzCommentText = asText(raw?.wpzComment);
    const wpzComment = wpzCommentText || null;
    if (wpzId && wpzOriginal === 0 && !wpzComment) {
      throw createHttpError(400, 'Invalid WPZ comment.', { code: 'INVALID_TEMP_ORDER_PAYLOAD' });
    }
    normalizedPositions.push({
      beNumber,
      warehouseId,
      deliveryDate: deliveryDate.toISOString(),
      amountInKg,
      salePricePerKg,
      costPricePerKg,
      reservationInKg,
      reservationDate: reservationDate ? reservationDate.toISOString() : null,
      wpzId,
      wpzOriginal,
      wpzComment,
      originalPackagingType,
      packagingTypeChanged,
      createdBy: asText(storedPosition?.createdBy) || userShortCode,
      createdAt: storedPosition?.createdAt || null,
      productContext,
      sourceDatabase,
    });
  }
  await assertTempOrderPositionsAvailable({
    companyId,
    excludeOrderId: id,
    positions: normalizedPositions,
  });

  const deliveryDates = Array.from(new Set(normalizedPositions.map((pos) => String(pos.deliveryDate || '')).filter(Boolean)));
  if (!hasPositionDeliveryDate && deliveryDates.length > 1) {
    throw createHttpError(500, 'Temp order position table is missing delivery date support. Apply the migration first.', { code: 'TEMP_ORDER_POSITION_DELIVERY_DATE_MISSING' });
  }
  if (!hasPositionDeliveryDate && !hasOrderDeliveryDate) {
    throw createHttpError(500, 'Temp order tables are missing delivery date columns. Apply the migration first.', { code: 'TEMP_ORDER_DELIVERY_DATE_SCHEMA_MISSING' });
  }

  const existingRows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT TOP 1
      [ta_id] AS id,
      [ta_completed] AS completed,
      [ta_Status] AS orderStatus
    FROM ${TEMP_ORDER_TABLE}
    WHERE [ta_id] = ? AND [ta_company_id] = ?
      ${ownerFilter.whereSql}
  `, [id, companyId, ...ownerFilter.params]);
  const existing = Array.isArray(existingRows) && existingRows.length ? existingRows[0] : null;
  if (!existing) {
    throw createHttpError(404, `temp order not found: ${id}`, { code: 'RESOURCE_NOT_FOUND', id });
  }
  const existingStatus = normalizeStoredTempOrderStatus(existing.orderStatus, existing.completed);
  if (!isTempOrderEditableStatus(existingStatus)) {
    throw createHttpError(409, 'Finalized temp order cannot be edited.', { code: 'TEMP_ORDER_FINALIZED', id });
  }
  const fallbackOrderDeliveryDate = deliveryDates[0] || null;
  const orderAssignments = [
    '[ta_ClientReferenceId] = ?',
    '[ta_client_name] = ?',
    '[ta_client_address] = ?',
    '[ta_client_representative] = ?',
    '[ta_comment] = ?',
    '[ta_special_payment_condition] = ?',
    '[ta_special_payment_text] = ?',
    '[ta_special_payment_id] = ?',
    '[ta_delivery_type_id] = ?',
    '[ta_delivery_type] = ?',
    ...(hasOrderDeliveryDate ? ['[ta_delivery_date] = ?'] : []),
    '[ta_packaging_type] = ?',
    '[ta_delivery_address] = ?',
    '[ta_delivery_address_id] = ?',
    '[ta_delivery_address_changed] = ?',
    '[ta_LastModifiedBy] = ?',
    '[ta_LastModifiedDate] = ?',
  ];
  if (attachment.shouldReplace) {
    orderAssignments.push('[ta_Attachment] = CAST(? AS VARBINARY(MAX))', '[ta_AttachmentFileName] = ?', '[ta_AttachmentMimeType] = ?');
  }
  if (attachment.shouldRemove) {
    orderAssignments.push('[ta_Attachment] = NULL', '[ta_AttachmentFileName] = NULL', '[ta_AttachmentMimeType] = NULL');
  }
  const updateSql = `
    UPDATE ${TEMP_ORDER_TABLE}
    SET ${orderAssignments.join(',\n        ')}
    WHERE [ta_id] = ? AND [ta_company_id] = ?
      ${ownerFilter.whereSql}
      AND [ta_Status] IN (0, 3)
  `;
  const updateParams = [
    clientReferenceId,
    clientName,
    clientAddress,
    clientRepresentative || null,
    asText(body?.comment) || null,
    orderLevel.specialPaymentCondition,
    orderLevel.specialPaymentText,
    orderLevel.specialPaymentId,
    orderLevel.incotermId,
    orderLevel.incotermText,
    ...(hasOrderDeliveryDate ? [fallbackOrderDeliveryDate] : []),
    orderLevel.packagingType,
    orderLevel.deliveryAddress,
    orderLevel.deliveryAddressId,
    orderLevel.deliveryAddressChanged,
    userShortCode,
    new Date().toISOString(),
  ];
  if (attachment.shouldReplace) {
    updateParams.push(attachment.buffer, attachment.fileName, attachment.mimeType);
  }
  updateParams.push(id, companyId, ...ownerFilter.params);
  const nowIso = new Date().toISOString();
  await withSqlTransaction(config.sql.database, async ({ query }) => {
    const lockedOrderResult = await query(`
      SELECT TOP 1 [ta_completed] AS completed, [ta_Status] AS orderStatus
      FROM ${TEMP_ORDER_TABLE} WITH (UPDLOCK, HOLDLOCK)
      WHERE [ta_id] = ? AND [ta_company_id] = ?
        ${ownerFilter.whereSql}
    `, [id, companyId, ...ownerFilter.params]);
    const lockedOrder = lockedOrderResult.rows[0] || null;
    if (!lockedOrder) {
      throw createHttpError(404, `temp order not found: ${id}`, { code: 'RESOURCE_NOT_FOUND', id });
    }
    if (!isTempOrderEditableStatus(lockedOrder.orderStatus, lockedOrder.completed)) {
      throw createHttpError(409, 'Finalized temp order cannot be edited.', { code: 'TEMP_ORDER_FINALIZED', id });
    }

    const updateResult = await query(updateSql, updateParams);
    if (!Number(updateResult.rowsAffected[0] || 0)) {
      throw createHttpError(409, 'Temp order could not be updated.', { code: 'TEMP_ORDER_STATUS_LOCKED', id });
    }

    await query(`
      DELETE FROM ${TEMP_ORDER_POSITION_TABLE}
      WHERE [tap_ta_id] = ?
    `, [id]);

    for (let i = 0; i < normalizedPositions.length; i += 1) {
      const pos = normalizedPositions[i];
      const posCtx = pos.productContext;
      const posInsertColumns = [
        '[tap_ta_id]', '[tap_line_no]', '[tap_be_number]', '[tap_article]', '[tap_amount_in_kg]', '[tap_warehouse]', '[tap_price]',
        '[tap_ep]', '[tap_reservation_in_kg]', '[tap_reservation_date]',
        ...(hasPositionDeliveryDate ? ['[tap_delivery_date]'] : []),
        '[tap_about]', '[tap_mfi]',
        '[tap_wpz_original]', '[tap_wpz_comment]', '[tap_wpz_id]', '[tap_Verpackungsart]', '[tap_Verpackungsart_Gewechselt]',
        '[tap_CreatedBy]', '[tap_CreateDate]', '[tap_LastModifiedBy]', '[tap_LastModifiedDate]',
      ];
      const posSql = `
        INSERT INTO ${TEMP_ORDER_POSITION_TABLE} (
          ${posInsertColumns.join(', ')}
        )
        VALUES (${posInsertColumns.map(() => '?').join(', ')})
      `;
      await query(posSql, [
        id,
        i + 1,
        pos.beNumber,
        posCtx.article,
        pos.amountInKg,
        pos.warehouseId,
        pos.salePricePerKg,
        pos.costPricePerKg,
        pos.reservationInKg,
        pos.reservationDate,
        ...(hasPositionDeliveryDate ? [pos.deliveryDate] : []),
        posCtx.about || null,
        posCtx.mfi || '',
        pos.wpzOriginal,
        pos.wpzComment,
        pos.wpzId,
        pos.originalPackagingType,
        pos.packagingTypeChanged,
        pos.createdBy,
        pos.createdAt || nowIso,
        userShortCode,
        nowIso,
      ]);
    }
  });

  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT TOP 1 *
    FROM ${TEMP_ORDER_TABLE}
    WHERE [ta_id] = ? AND [ta_company_id] = ?
      ${ownerFilter.whereSql}
  `, [id, companyId, ...ownerFilter.params]);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row) {
    throw createHttpError(404, `temp order not found: ${id}`, { code: 'RESOURCE_NOT_FOUND', id });
  }

  sendEnvelope(res, {
    status: 200,
    data: mapTempOrderWithPositions(row, await loadOrderPositions(id)),
    meta: { mandant: req.mandant, id },
    error: null,
  });
}));

router.delete('/temp-orders/:id', requireMandant, asyncHandler(async (req, res) => {
  const userIdentity = req.userIdentity;
  const accessScope = await getCustomerAccessScope(req.userIdentity, req.database);
  const userShortCode = asText(userIdentity.shortCode);
  if (!userShortCode) {
    throw createHttpError(403, 'Missing Mitarbeiterkuerzel (ma_Kuerzel) for current user.', { code: 'MISSING_USER_SHORT_CODE' });
  }

  const companyId = Number(req.database?.firmaId || 0);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    throw createHttpError(400, `Invalid temp order id: ${req.params.id}`, { code: 'RESOURCE_NOT_FOUND' });
  }

  const ownerFilter = buildTempOrderOwnerFilter(userShortCode, accessScope.isFullAccess);

  const existsSql = `
    SELECT TOP 1
      [ta_completed] AS completed,
      [ta_Status] AS orderStatus
    FROM ${TEMP_ORDER_TABLE}
    WHERE [ta_id] = ? AND [ta_company_id] = ?
      ${ownerFilter.whereSql}
  `;
  const existsRows = await runSQLQuerySqlServer(config.sql.database, existsSql, [id, companyId, ...ownerFilter.params]);
  if (!Array.isArray(existsRows) || !existsRows.length) {
    throw createHttpError(404, `temp order not found: ${id}`, { code: 'RESOURCE_NOT_FOUND', id });
  }
  const existingStatus = normalizeStoredTempOrderStatus(existsRows[0].orderStatus, existsRows[0].completed);
  if (!isTempOrderEditableStatus(existingStatus)) {
    throw createHttpError(409, 'Finalized temp order cannot be deleted.', { code: 'TEMP_ORDER_FINALIZED', id });
  }

  await runSQLQuerySqlServer(config.sql.database, `
    DELETE FROM ${TEMP_ORDER_POSITION_TABLE}
    WHERE [tap_ta_id] = ?
      AND EXISTS (
        SELECT 1 FROM ${TEMP_ORDER_TABLE}
        WHERE [ta_id] = ? AND [ta_Status] IN (0, 3)
      )
    `, [id, id]);
  await runSQLQuerySqlServer(config.sql.database, `
    DELETE FROM ${ORDER_MAIL_OUTBOX_TABLE}
    WHERE [om_OrderID] = ?
  `, [id]);
  await runSQLQuerySqlServer(config.sql.database, `
    DELETE FROM ${TEMP_ORDER_TABLE}
    WHERE [ta_id] = ? AND [ta_company_id] = ?
      ${ownerFilter.whereSql}
      AND [ta_Status] IN (0, 3)
  `, [id, companyId, ...ownerFilter.params]);

  sendEnvelope(res, {
    status: 200,
    data: { id, deleted: true },
    meta: { mandant: req.mandant },
    error: null,
  });
}));

module.exports = router;
module.exports.buildTempOrderOwnerFilter = buildTempOrderOwnerFilter;
module.exports.buildTempOrderStatusFilter = buildTempOrderStatusFilter;
module.exports.normalizeTempOrderOwnerScope = normalizeTempOrderOwnerScope;
module.exports.normalizeTempOrderStatus = normalizeTempOrderStatus;
module.exports.normalizeStoredTempOrderStatus = normalizeStoredTempOrderStatus;
module.exports.isTempOrderEditableStatus = isTempOrderEditableStatus;
module.exports.isTempOrderFinalizedStatus = isTempOrderFinalizedStatus;
module.exports.shouldRetryExistingOrderMail = shouldRetryExistingOrderMail;
module.exports.normalizeTempOrderCompanyId = normalizeTempOrderCompanyId;
module.exports.parseDeliveryAddressId = parseDeliveryAddressId;
module.exports.normalizePackagingType = normalizePackagingType;
module.exports.packagingTypesEqual = packagingTypesEqual;
