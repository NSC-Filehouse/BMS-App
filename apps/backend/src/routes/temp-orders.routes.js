const express = require('express');
const multer = require('multer');
const config = require('../config');
const { asyncHandler, createHttpError, sendEnvelope, parseListParams } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { runSQLQueryAccess, runSQLQuerySqlServer } = require('../db/access');
const { getUserIdentityByEmail } = require('../db/users');
const { appendTimelineEntries } = require('../db/timeline');

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
    fileName: asText(file.originalname) || 'attachment',
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
    specialPaymentCondition: Boolean(row.ta_special_payment_condition),
    specialPaymentText: asText(row.ta_special_payment_text),
    specialPaymentId: row.ta_special_payment_id === null || row.ta_special_payment_id === undefined ? null : Number(row.ta_special_payment_id),
    deliveryTypeId: row.ta_delivery_type_id === null || row.ta_delivery_type_id === undefined ? null : Number(row.ta_delivery_type_id),
    deliveryType: asText(row.ta_delivery_type),
    packagingType: asText(row.ta_packaging_type),
    deliveryDate: row.ta_delivery_date || null,
    deliveryAddress: asText(row.ta_delivery_address),
    deliveryAddressChanged: Boolean(row.ta_delivery_address_changed),
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
    hasAttachment: row.ta_Attachment !== null && row.ta_Attachment !== undefined,
    attachmentFileName: asText(row.ta_AttachmentFileName),
    attachmentMimeType: asText(row.ta_AttachmentMimeType),
  };
}

function mapTempOrderWithPositions(row, positions) {
  const base = mapTempOrderRow(row);
  const list = (Array.isArray(positions) ? positions : []).map((p) => ({
    ...p,
    wpzId: p.wpzId === null || p.wpzId === undefined ? null : Number(p.wpzId),
    wpzOriginal: p.wpzOriginal === null || p.wpzOriginal === undefined ? null : Boolean(p.wpzOriginal),
    wpzComment: asText(p.wpzComment),
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

async function getTableColumns(database, tableName) {
  const sql = `
    SELECT [COLUMN_NAME] AS col
    FROM [INFORMATION_SCHEMA].[COLUMNS]
    WHERE [TABLE_SCHEMA] = 'dbo' AND [TABLE_NAME] = ?
  `;
  const rows = await runSQLQuerySqlServer(database, sql, [tableName]);
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

async function normalizeOrderLevelInput(req, body, clientAddress, lang) {
  const specialPaymentCondition = asBit(body?.specialPaymentCondition, 0);
  const specialPaymentIdInput = body?.specialPaymentId;
  let specialPayment = null;
  if (specialPaymentCondition) {
    specialPayment = await loadPaymentTextById(specialPaymentIdInput, lang);
    if (!specialPayment) {
      throw createHttpError(400, 'Invalid special payment text.', { code: 'INVALID_TEMP_ORDER_PAYLOAD' });
    }
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
  const deliveryAddress = asText(body?.deliveryAddress || clientAddress);
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
    deliveryAddressChanged,
  };
}

async function loadOrderPositions(orderId) {
  try {
    const cols = await getTableColumns(config.sql.database, 'tbl_Temp_Auf_Position');
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
        NULL AS [packaging],
        ${pick(cWpzId, 'wpzId')},
        ${pick(cWpzOriginal, 'wpzOriginal')},
        ${pick(cWpzComment, 'wpzComment')}
      FROM [dbo].[tbl_Temp_Auf_Position]
      WHERE ${toId(cOrderId)} = ?
      ORDER BY ${cLineNo ? `${toId(cLineNo)} ASC` : '(SELECT 1)'}
    `;
    const rows = await runSQLQuerySqlServer(config.sql.database, sql, [orderId]);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function loadPositionSummariesForOrders(orderIds) {
  const ids = Array.isArray(orderIds)
    ? orderIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
    : [];
  if (!ids.length) return new Map();

  const cols = await getTableColumns(config.sql.database, 'tbl_Temp_Auf_Position');
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
    FROM [dbo].[tbl_Temp_Auf_Position]
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

  const packagingType = await loadPackagingType(req.database, beNumber);
  const deliveryType = await loadDeliveryType(req.database, beNumber);
  sendEnvelope(res, {
    status: 200,
    data: {
      beNumber,
      packagingType,
      deliveryType,
    },
    meta: { mandant: req.mandant },
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
          FROM [dbo].[tbl_Temp_Auf_Position] p
          WHERE p.[tap_ta_id] = [o].[ta_id]
            AND (p.[tap_article] LIKE ? OR p.[tap_be_number] LIKE ?)
        )
      )`
    : '';
  const whereParams = text ? [like, like, like, like] : [];

  const countSql = `
    SELECT COUNT(*) AS total
    FROM [dbo].[tbl_Temp_Auftrag] o
    WHERE [o].[ta_company_id] = ? AND LOWER(COALESCE([o].[ta_CreatedBy], '')) = ?
    ${whereText}
  `;
  const totalRows = await runSQLQuerySqlServer(config.sql.database, countSql, [companyId, userShortCode.toLowerCase(), ...whereParams]);
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
      [o].[ta_completed] AS completed,
      [o].[ta_IsConfirmed] AS isConfirmed
    FROM [dbo].[tbl_Temp_Auftrag] o
    OUTER APPLY (
      SELECT TOP 1
        [tap_be_number] AS beNumber,
        [tap_article] AS article,
        [tap_price] AS price,
        [tap_amount_in_kg] AS amountInKg
      FROM [dbo].[tbl_Temp_Auf_Position] p
      WHERE p.[tap_ta_id] = o.[ta_id]
      ORDER BY p.[tap_line_no] ASC
    ) fp
    WHERE [o].[ta_company_id] = ? AND LOWER(COALESCE([o].[ta_CreatedBy], '')) = ?
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
  const summariesByOrderId = await loadPositionSummariesForOrders((rows || []).map((x) => x.id));

  const data = (rows || []).map((row) => ({
    id: row.id,
    beNumber: row.beNumber,
    article: row.article,
    clientName: row.clientName,
    price: row.price,
    amountInKg: row.amountInKg,
    createdAt: row.createdAt,
    completed: Boolean(row.completed),
    isConfirmed: Boolean(row.isConfirmed),
    positions: summariesByOrderId.get(Number(row.id)) || [],
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
    FROM [dbo].[tbl_Temp_Auftrag]
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
    data: mapTempOrderWithPositions(row, await loadOrderPositions(row.ta_id)),
    meta: { mandant: req.mandant, id },
    error: null,
  });
}));

router.get('/temp-orders/:id/attachment', requireMandant, asyncHandler(async (req, res) => {
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
    SELECT TOP 1
      [ta_Attachment] AS attachment,
      [ta_AttachmentFileName] AS fileName,
      [ta_AttachmentMimeType] AS mimeType
    FROM [dbo].[tbl_Temp_Auftrag]
    WHERE [ta_id] = ? AND [ta_company_id] = ?
      AND LOWER(COALESCE([ta_CreatedBy], '')) = ?
  `;
  const rows = await runSQLQuerySqlServer(config.sql.database, sql, [id, companyId, userShortCode.toLowerCase()]);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row || row.attachment === null || row.attachment === undefined) {
    throw createHttpError(404, `temp order attachment not found: ${id}`, { code: 'RESOURCE_NOT_FOUND', id });
  }

  res.setHeader('Content-Type', asText(row.mimeType) || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${String(asText(row.fileName) || `temp-order-${id}-attachment`).replace(/"/g, '')}"`);
  res.send(row.attachment);
}));

router.post('/temp-orders', requireMandant, attachmentUploadMiddleware, asyncHandler(async (req, res) => {
  const userIdentity = await getUserIdentityByEmail(req.userEmail);
  const userShortCode = asText(userIdentity.shortCode);
  if (!userShortCode) {
    throw createHttpError(403, 'Missing Mitarbeiterkuerzel (ma_Kuerzel) for current user.', { code: 'MISSING_USER_SHORT_CODE' });
  }

  const companyId = Number(req.database?.firmaId || 0);
  if (!Number.isFinite(companyId) || companyId <= 0) {
    throw createHttpError(400, 'Invalid company id for selected mandant.', { code: 'INVALID_COMPANY_ID' });
  }

  const body = getRequestBody(req);
  const attachment = normalizeAttachmentInput(req);
  const positionsInput = normalizePositionsInput(body);
  if (!Array.isArray(positionsInput) || !positionsInput.length) {
    throw createHttpError(400, 'At least one position is required.', { code: 'TEMP_ORDER_MISSING_POSITIONS' });
  }

  const clientReferenceId = asText(body?.clientReferenceId);
  const clientName = asText(body?.clientName);
  const clientAddress = asText(body?.clientAddress);
  const clientRepresentative = asText(body?.clientRepresentative);
  const supplier = asText(body?.supplier);
  const lang = resolveLang(req);
  if (!clientReferenceId || !clientName || !clientAddress) {
    throw createHttpError(400, 'Missing required client data for temp order.', { code: 'TEMP_ORDER_MISSING_CLIENT_DATA' });
  }
  const orderLevel = await normalizeOrderLevelInput(req, body, clientAddress, lang);
  const orderCols = await getTableColumns(config.sql.database, 'tbl_Temp_Auftrag');
  const positionCols = await getTableColumns(config.sql.database, 'tbl_Temp_Auf_Position');
  const hasOrderDeliveryDate = hasColumn(orderCols, 'ta_delivery_date');
  const hasPositionDeliveryDate = hasColumn(positionCols, 'tap_delivery_date');

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
    const wpzId = await loadLatestWpzId(req.database, beNumber);
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
    });
  }

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
    '[ta_packaging_type]', '[ta_delivery_address]', '[ta_delivery_address_changed]', '[ta_completed]',
    '[ta_Attachment]', '[ta_AttachmentFileName]', '[ta_AttachmentMimeType]',
    '[ta_CreatedBy]', '[ta_CreateDate]', '[ta_LastModifiedBy]', '[ta_LastModifiedDate]',
    '[ta_PassedTo]', '[ta_ReceivedFrom]', '[ta_PassedToUserId]', '[ta_ReceivedFromUserId]', '[ta_IsConfirmed]',
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
    orderLevel.deliveryAddressChanged,
    0,
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
    INSERT INTO [dbo].[tbl_Temp_Auftrag] (
      ${orderInsertColumns.join(', ')}
    )
    VALUES (${orderInsertColumns.map(() => '?').join(', ')})
  `;
  await runSQLQuerySqlServer(config.sql.database, sql, orderInsertParams);

  const createdRows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT TOP 1 *
    FROM [dbo].[tbl_Temp_Auftrag]
    WHERE [ta_company_id] = ? AND LOWER(COALESCE([ta_CreatedBy], '')) = ?
    ORDER BY [ta_id] DESC
  `, [companyId, userShortCode.toLowerCase()]);
  const created = Array.isArray(createdRows) && createdRows.length ? createdRows[0] : null;
  if (!created) {
    throw createHttpError(500, 'Temp order create verification failed.', { code: 'TEMP_ORDER_CREATE_FAILED' });
  }

  const timelineEntries = [];
  for (let i = 0; i < normalizedPositions.length; i += 1) {
    const pos = normalizedPositions[i];
    const posCtx = await loadProductContext(req.database, pos.beNumber, pos.warehouseId);
    const posInsertColumns = [
      '[tap_ta_id]', '[tap_line_no]', '[tap_be_number]', '[tap_article]', '[tap_amount_in_kg]', '[tap_warehouse]', '[tap_price]',
      '[tap_ep]', '[tap_reservation_in_kg]', '[tap_reservation_date]',
      ...(hasPositionDeliveryDate ? ['[tap_delivery_date]'] : []),
      '[tap_about]', '[tap_mfi]',
      '[tap_wpz_original]', '[tap_wpz_comment]', '[tap_wpz_id]',
      '[tap_CreatedBy]', '[tap_CreateDate]', '[tap_LastModifiedBy]', '[tap_LastModifiedDate]',
    ];
    const posSql = `
      INSERT INTO [dbo].[tbl_Temp_Auf_Position] (
        ${posInsertColumns.join(', ')}
      )
      VALUES (${posInsertColumns.map(() => '?').join(', ')})
    `;
    try {
      await runSQLQuerySqlServer(config.sql.database, posSql, [
        created.ta_id,
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
        userShortCode,
        nowIso,
        userShortCode,
        nowIso,
      ]);
    } catch (err) {
      const msg = String(err?.message || '').toLowerCase();
      if (msg.includes('invalid object name') && msg.includes('tbl_temp_auf_position')) {
        throw createHttpError(500, 'Position table [dbo].[tbl_Temp_Auf_Position] is missing.', { code: 'TEMP_ORDER_POSITION_TABLE_MISSING' });
      }
      throw err;
    }
    timelineEntries.push({
      createdAt: nowIso,
      mandant: req.mandant,
      mandantShortName: req.database?.shortName || null,
      companyId: req.database?.firmaId || null,
      userEmail: req.userEmail || null,
      userShortCode,
      type: 'order',
      product: posCtx.article || pos.beNumber,
      productId: pos.beNumber,
      beNumber: pos.beNumber,
      amountKg: pos.amountInKg,
      unit: 'kg',
      referenceId: String(created.ta_id),
      payloadJson: {
        clientReferenceId,
        clientName,
        warehouseId: pos.warehouseId,
      },
    });
  }

  await appendTimelineEntries(timelineEntries);

  sendEnvelope(res, {
    status: 201,
    data: mapTempOrderWithPositions(created, await loadOrderPositions(created.ta_id)),
    meta: { mandant: req.mandant },
    error: null,
  });
}));

router.put('/temp-orders/:id', requireMandant, attachmentUploadMiddleware, asyncHandler(async (req, res) => {
  const userIdentity = await getUserIdentityByEmail(req.userEmail);
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

  const clientReferenceId = asText(body?.clientReferenceId);
  const clientName = asText(body?.clientName);
  const clientAddress = asText(body?.clientAddress);
  const clientRepresentative = asText(body?.clientRepresentative);
  const supplier = asText(body?.supplier);
  const lang = resolveLang(req);

  if (!clientReferenceId || !clientName || !clientAddress) {
    throw createHttpError(400, 'Invalid temp order payload.', { code: 'INVALID_TEMP_ORDER_PAYLOAD' });
  }
  const orderLevel = await normalizeOrderLevelInput(req, body, clientAddress, lang);
  const orderCols = await getTableColumns(config.sql.database, 'tbl_Temp_Auftrag');
  const positionCols = await getTableColumns(config.sql.database, 'tbl_Temp_Auf_Position');
  const hasOrderDeliveryDate = hasColumn(orderCols, 'ta_delivery_date');
  const hasPositionDeliveryDate = hasColumn(positionCols, 'tap_delivery_date');

  const positionsInput = normalizePositionsInput(body);
  if (!Array.isArray(positionsInput) || !positionsInput.length) {
    throw createHttpError(400, 'At least one position is required.', { code: 'TEMP_ORDER_MISSING_POSITIONS' });
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
    const wpzId = await loadLatestWpzId(req.database, beNumber);
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
    });
  }
  const deliveryDates = Array.from(new Set(normalizedPositions.map((pos) => String(pos.deliveryDate || '')).filter(Boolean)));
  if (!hasPositionDeliveryDate && deliveryDates.length > 1) {
    throw createHttpError(500, 'Temp order position table is missing delivery date support. Apply the migration first.', { code: 'TEMP_ORDER_POSITION_DELIVERY_DATE_MISSING' });
  }
  if (!hasPositionDeliveryDate && !hasOrderDeliveryDate) {
    throw createHttpError(500, 'Temp order tables are missing delivery date columns. Apply the migration first.', { code: 'TEMP_ORDER_DELIVERY_DATE_SCHEMA_MISSING' });
  }

  const existingRows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT TOP 1 [ta_id] AS id
    FROM [dbo].[tbl_Temp_Auftrag]
    WHERE [ta_id] = ? AND [ta_company_id] = ?
      AND LOWER(COALESCE([ta_CreatedBy], '')) = ?
  `, [id, companyId, userShortCode.toLowerCase()]);
  const existing = Array.isArray(existingRows) && existingRows.length ? existingRows[0] : null;
  if (!existing) {
    throw createHttpError(404, `temp order not found: ${id}`, { code: 'RESOURCE_NOT_FOUND', id });
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
    '[ta_delivery_address_changed] = ?',
    '[ta_LastModifiedBy] = ?',
    '[ta_LastModifiedDate] = ?',
  ];
  if (attachment.shouldReplace) {
    orderAssignments.push('[ta_Attachment] = ?', '[ta_AttachmentFileName] = ?', '[ta_AttachmentMimeType] = ?');
  }
  if (attachment.shouldRemove) {
    orderAssignments.push('[ta_Attachment] = NULL', '[ta_AttachmentFileName] = NULL', '[ta_AttachmentMimeType] = NULL');
  }
  const updateSql = `
    UPDATE [dbo].[tbl_Temp_Auftrag]
    SET ${orderAssignments.join(',\n        ')}
    WHERE [ta_id] = ? AND [ta_company_id] = ?
      AND LOWER(COALESCE([ta_CreatedBy], '')) = ?
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
    orderLevel.deliveryAddressChanged,
    userShortCode,
    new Date().toISOString(),
  ];
  if (attachment.shouldReplace) {
    updateParams.push(attachment.buffer, attachment.fileName, attachment.mimeType);
  }
  updateParams.push(id, companyId, userShortCode.toLowerCase());
  await runSQLQuerySqlServer(config.sql.database, updateSql, updateParams);

  await runSQLQuerySqlServer(config.sql.database, `
    DELETE FROM [dbo].[tbl_Temp_Auf_Position]
    WHERE [tap_ta_id] = ?
  `, [id]);

  const nowIso = new Date().toISOString();
  for (let i = 0; i < normalizedPositions.length; i += 1) {
    const pos = normalizedPositions[i];
    const posCtx = await loadProductContext(req.database, pos.beNumber, pos.warehouseId);
    const posInsertColumns = [
      '[tap_ta_id]', '[tap_line_no]', '[tap_be_number]', '[tap_article]', '[tap_amount_in_kg]', '[tap_warehouse]', '[tap_price]',
      '[tap_ep]', '[tap_reservation_in_kg]', '[tap_reservation_date]',
      ...(hasPositionDeliveryDate ? ['[tap_delivery_date]'] : []),
      '[tap_about]', '[tap_mfi]',
      '[tap_wpz_original]', '[tap_wpz_comment]', '[tap_wpz_id]',
      '[tap_CreatedBy]', '[tap_CreateDate]', '[tap_LastModifiedBy]', '[tap_LastModifiedDate]',
    ];
    const posSql = `
      INSERT INTO [dbo].[tbl_Temp_Auf_Position] (
        ${posInsertColumns.join(', ')}
      )
      VALUES (${posInsertColumns.map(() => '?').join(', ')})
    `;
    await runSQLQuerySqlServer(config.sql.database, posSql, [
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
      userShortCode,
      nowIso,
      userShortCode,
      nowIso,
    ]);
  }

  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT TOP 1 *
    FROM [dbo].[tbl_Temp_Auftrag]
    WHERE [ta_id] = ? AND [ta_company_id] = ?
      AND LOWER(COALESCE([ta_CreatedBy], '')) = ?
  `, [id, companyId, userShortCode.toLowerCase()]);
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
    FROM [dbo].[tbl_Temp_Auftrag]
    WHERE [ta_id] = ? AND [ta_company_id] = ?
      AND LOWER(COALESCE([ta_CreatedBy], '')) = ?
  `;
  const existsRows = await runSQLQuerySqlServer(config.sql.database, existsSql, [id, companyId, userShortCode.toLowerCase()]);
  if (!Array.isArray(existsRows) || !existsRows.length) {
    throw createHttpError(404, `temp order not found: ${id}`, { code: 'RESOURCE_NOT_FOUND', id });
  }

  await runSQLQuerySqlServer(config.sql.database, `
    DELETE FROM [dbo].[tbl_Temp_Auf_Position]
    WHERE [tap_ta_id] = ?
  `, [id]);
  await runSQLQuerySqlServer(config.sql.database, `
    DELETE FROM [dbo].[tbl_Temp_Auftrag]
    WHERE [ta_id] = ? AND [ta_company_id] = ?
      AND LOWER(COALESCE([ta_CreatedBy], '')) = ?
  `, [id, companyId, userShortCode.toLowerCase()]);

  sendEnvelope(res, {
    status: 200,
    data: { id, deleted: true },
    meta: { mandant: req.mandant },
    error: null,
  });
}));

module.exports = router;
