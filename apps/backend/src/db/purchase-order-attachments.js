const multer = require('multer');
const config = require('../config');
const { createHttpError } = require('../utils');
const { appTableSql } = require('./app-tables');
const { runSQLQuerySqlServer } = require('./access');

const TABLE = appTableSql('tempPurchaseOrderAttachment');
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_BATCH_SIZE = 100 * 1024 * 1024;
// Keep the file picker and upload limits identical to temp-orders.routes.js.
const MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/heic', 'image/heif']);
const EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.heif'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter(_req, file, callback) {
    const name = String(file.originalname || '').trim().toLowerCase();
    if (MIME_TYPES.has(String(file.mimetype || '').trim().toLowerCase()) || EXTENSIONS.some((ext) => name.endsWith(ext))) {
      callback(null, true);
    } else {
      callback(createHttpError(400, 'Dieser Dateityp ist nicht erlaubt. Bitte PDF oder Bild auswählen.', { code: 'ATTACHMENT_INVALID_TYPE' }));
    }
  },
});

function attachmentUploadMiddleware(req, res, next) {
  const length = Number(req.headers?.['content-length']);
  if (Number.isFinite(length) && length > MAX_BATCH_SIZE + 2 * 1024 * 1024) {
    return next(createHttpError(413, 'Die Anhänge dürfen zusammen höchstens 100 MB groß sein.', { code: 'ATTACHMENT_BATCH_TOO_LARGE' }));
  }
  upload.array('attachment')(req, res, (error) => {
    if (error?.code === 'LIMIT_FILE_SIZE') {
      return next(createHttpError(400, 'Eine Datei darf höchstens 10 MB groß sein.', { code: 'ATTACHMENT_TOO_LARGE' }));
    }
    if (error) return next(error);
    if ((req.files || []).reduce((sum, file) => sum + file.size, 0) > MAX_BATCH_SIZE) {
      return next(createHttpError(413, 'Die Anhänge dürfen zusammen höchstens 100 MB groß sein.', { code: 'ATTACHMENT_BATCH_TOO_LARGE' }));
    }
    next();
  });
}

function normalizeFileName(value) {
  const name = String(value || '').replace(/\0/g, '').trim();
  if (!/(?:Ã.|Â.|â.|ð|Ð|Ñ)/.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8').replace(/\0/g, '').trim();
  return decoded && !decoded.includes('\uFFFD') ? decoded : name;
}

function buildContentDisposition(fileName, fallback) {
  const resolved = normalizeFileName(fileName) || fallback;
  const ascii = resolved.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '_').replace(/["\r\n]/g, '') || fallback;
  const encoded = encodeURIComponent(resolved).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function parseArray(value, fallback) {
  if (value === undefined) return fallback;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (Array.isArray(parsed)) return parsed;
  } catch { /* Report malformed JSON as an invalid payload. */ }
  throw createHttpError(400, 'Ungültige Bestelldaten.', { code: 'INVALID_PURCHASE_ORDER_PAYLOAD' });
}

function parsePurchaseBody(req) {
  req.body = { ...req.body, positions: parseArray(req.body?.positions, undefined) };
}

function normalizeAttachmentInput(req) {
  const removeAttachmentIds = [...new Set(parseArray(req.body?.removeAttachmentIds, []).map(Number))];
  if (removeAttachmentIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw createHttpError(400, 'Ungültiger Anhang.', { code: 'INVALID_ATTACHMENT_ID' });
  }
  const files = (req.files || []).map((file) => ({
    buffer: file.buffer,
    fileName: normalizeFileName(file.originalname) || 'attachment',
    mimeType: String(file.mimetype || '').trim() || 'application/octet-stream',
    sizeBytes: Number(file.size || file.buffer?.length || 0),
  }));
  const count = req.body?.attachmentCount === undefined ? files.length : Number(req.body.attachmentCount);
  if (!Number.isSafeInteger(count) || count < 0 || count !== files.length) {
    throw createHttpError(422, 'Bitte die Anhänge erneut auswählen. Die Bestellung wurde nicht ohne die ausgewählten Dateien gespeichert.', { code: 'PURCHASE_ATTACHMENTS_MISSING' });
  }
  return { files, removeAttachmentIds };
}

async function loadPurchaseOrderAttachments(orderId, { query, includeContent = false, attachmentId } = {}) {
  const sql = `SELECT [tba_ID] AS id, [tba_FileName] AS fileName, [tba_MimeType] AS mimeType,
    [tba_SizeBytes] AS sizeBytes, [tba_CreatedAt] AS createdAt${includeContent ? ', [tba_Content] AS buffer' : ''}
    FROM ${TABLE} WHERE [tba_tb_id]=? AND [tba_DeletedAt] IS NULL${attachmentId === undefined ? '' : ' AND [tba_ID]=?'} ORDER BY [tba_ID]`;
  const params = attachmentId === undefined ? [orderId] : [orderId, attachmentId];
  const rows = query ? (await query(sql, params)).rows : await runSQLQuerySqlServer(config.sql.database, sql, params);
  return (rows || []).map((row) => ({
    id: Number(row.id), fileName: normalizeFileName(row.fileName) || 'attachment',
    mimeType: row.mimeType || 'application/octet-stream', sizeBytes: Number(row.sizeBytes || 0), createdAt: row.createdAt || null,
    ...(includeContent ? { buffer: row.buffer } : {}),
  }));
}

async function withPurchaseOrderAttachments(order, query) {
  const attachments = await loadPurchaseOrderAttachments(order.id, { query });
  return { ...order, attachments, hasAttachment: attachments.length > 0 };
}

async function savePurchaseOrderAttachments(query, { orderId, files, removeAttachmentIds, user, now }) {
  // Individual statements also avoid exceeding SQL Server's parameter limit.
  for (const id of removeAttachmentIds) {
    const result = await query(`UPDATE ${TABLE} SET [tba_DeletedAt]=?, [tba_DeletedBy]=?
      OUTPUT INSERTED.[tba_ID] AS id WHERE [tba_tb_id]=? AND [tba_ID]=? AND [tba_DeletedAt] IS NULL`, [now, user, orderId, id]);
    if (!result.rows?.length) throw createHttpError(404, 'Anhang für diese Bestellung nicht gefunden.', { code: 'PURCHASE_ORDER_ATTACHMENT_NOT_FOUND' });
  }
  for (const file of files) {
    await query(`INSERT INTO ${TABLE} ([tba_tb_id],[tba_FileName],[tba_MimeType],[tba_Content],[tba_SizeBytes],[tba_CreatedBy],[tba_CreatedAt])
      VALUES (?,?,?,CAST(? AS VARBINARY(MAX)),?,?,?)`, [orderId, file.fileName, file.mimeType, file.buffer, file.sizeBytes, user, now]);
  }
}

module.exports = {
  attachmentUploadMiddleware, parsePurchaseBody, normalizeAttachmentInput, buildContentDisposition,
  loadPurchaseOrderAttachments, withPurchaseOrderAttachments, savePurchaseOrderAttachments,
};
