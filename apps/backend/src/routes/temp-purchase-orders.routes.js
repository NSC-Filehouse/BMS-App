const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const logger = require('../logger');
const { asyncHandler, createHttpError, sendEnvelope, parseListParams } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { requirePilotFeature } = require('../middlewares/pilot-feature.middleware');
const { runSQLQueryAccess, runSQLQuerySqlServer, withSqlTransaction } = require('../db/access');
const { appTableSql } = require('../db/app-tables');
const { getCustomerAccessScope, loadVisibleCustomer } = require('../db/customer-access');
const { loadPurchaseOptions, loadSupplierTerms, loadLatestPurchase, loadPurchaseLocations, findPackaging, packagingKey } = require('../db/purchase-order-values');
const { loadHolidayRows } = require('../db/holidays');
const {
  getHolidayStatus,
  getNextWorkingDate,
  resolveHolidayProfile,
} = require('../delivery-calendar');
const { queuePurchaseOrderCsMail, processPurchaseOrderCsMailOutboxById } = require('../db/purchase-order-mail-outbox');
const { resolveOrderMailRecipient, validateOrderMailConfig } = require('../mail/order-mail');
const { appendTimelineEntries } = require('../db/timeline');
const TIMELINE_TABLE = appTableSql('timeline');

const router = express.Router();
router.use(requirePilotFeature('purchaseOrders'));
const TEMP_PURCHASE_ORDER_TABLE = appTableSql('tempPurchaseOrder');
const TEMP_PURCHASE_POSITION_TABLE = appTableSql('tempPurchaseOrderPosition');

const STATUS = Object.freeze({ DRAFT: 0, APP_FINALIZED: 1, CS_ACCEPTED: 2, NEEDS_REWORK: 3 });

function asText(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function asNumber(value, fallback = null) {
  if (value === null || value === undefined || String(value).trim() === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = (part) => String(part).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  const text = asText(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : text;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(asText(value));
}

function normalizeStatus(value) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 0 && status <= 3 ? status : STATUS.DRAFT;
}

function isEditable(status) {
  return status === STATUS.DRAFT || status === STATUS.NEEDS_REWORK;
}

function mapOrder(row, positions = []) {
  if (!row) return null;
  return {
    id: Number(row.id),
    companyId: Number(row.companyId),
    clientRequestId: asText(row.clientRequestId),
    supplierId: asText(row.supplierId),
    supplierName: asText(row.supplierName),
    supplierAddress: asText(row.supplierAddress),
    supplierContact: asText(row.supplierContact),
    paymentConditionChanged: Boolean(row.paymentConditionChanged),
    paymentConditionId: row.paymentConditionId === null || row.paymentConditionId === undefined ? null : Number(row.paymentConditionId),
    paymentConditionText: asText(row.paymentConditionText),
    deliveryTermId: row.deliveryTermId === null || row.deliveryTermId === undefined ? null : Number(row.deliveryTermId),
    deliveryTermText: asText(row.deliveryTermText),
    packagingType: asText(row.packagingType),
    packagingTypeId: asNumber(row.packagingTypeId),
    loadingLocationSource: asText(row.loadingLocationSource),
    loadingLocationId: row.loadingLocationId === null || row.loadingLocationId === undefined ? null : Number(row.loadingLocationId),
    loadingLocationText: asText(row.loadingLocationText),
    loadingLocationChanged: Boolean(row.loadingLocationChanged),
    comment: asText(row.comment),
    status: normalizeStatus(row.status),
    bmsPurchaseOrderNumber: asText(row.bmsPurchaseOrderNumber),
    supplierMailStatus: asText(row.supplierMailStatus) || 'not_queued',
    supplierMailLastError: asText(row.supplierMailLastError),
    supplierMailSentAt: row.supplierMailSentAt || null,
    returnComment: asText(row.returnComment),
    createdBy: asText(row.createdBy),
    createdAt: row.createdAt || null,
    lastModifiedBy: asText(row.lastModifiedBy),
    lastModifiedAt: row.lastModifiedAt || null,
    completedBy: asText(row.completedBy),
    closingDate: row.closingDate || null,
    positions: (Array.isArray(positions) ? positions : []).map((position) => ({
      id: Number(position.id),
      lineNo: Number(position.lineNo),
      articleIndex: asText(position.articleIndex),
      article: asText(position.article),
      amount: asNumber(position.amount, 0) * (/^(t|to|tonne[n]?)$/i.test(asText(position.unit)) ? 1000 : 1),
      unit: 'kg',
      purchasePrice: asNumber(position.purchasePrice, 0),
      currency: asText(position.currency) || 'EUR',
      requestedDeliveryDate: asDate(position.requestedDeliveryDate),
      reservedFor: asText(position.reservedFor),
      comment: asText(position.comment),
      originalPackagingType: asText(position.originalPackagingType),
      originalPackagingTypeId: asNumber(position.originalPackagingTypeId),
      packagingTypeChanged: Boolean(position.packagingTypeChanged),
    })),
  };
}

function orderSelectSql() {
  return `
    SELECT
      [tb_id] AS id,
      [tb_company_id] AS companyId,
      [tb_client_request_id] AS clientRequestId,
      [tb_supplier_id] AS supplierId,
      [tb_supplier_name] AS supplierName,
      [tb_supplier_address] AS supplierAddress,
      [tb_supplier_contact] AS supplierContact,
      [tb_payment_condition_changed] AS paymentConditionChanged,
      [tb_payment_condition_id] AS paymentConditionId,
      [tb_payment_condition_text] AS paymentConditionText,
      [tb_delivery_term_id] AS deliveryTermId,
      [tb_delivery_term_text] AS deliveryTermText,
      [tb_packaging_type] AS packagingType,
      [tb_packaging_type_id] AS packagingTypeId,
      [tb_loading_location_source] AS loadingLocationSource,
      [tb_loading_location_id] AS loadingLocationId,
      [tb_loading_location_text] AS loadingLocationText,
      [tb_loading_location_changed] AS loadingLocationChanged,
      [tb_comment] AS comment,
      [tb_status] AS status,
      [tb_bestellindex] AS bmsPurchaseOrderNumber,
      [tb_supplier_mail_status] AS supplierMailStatus,
      [tb_supplier_mail_last_error] AS supplierMailLastError,
      [tb_supplier_mail_sent_at] AS supplierMailSentAt,
      [tb_return_comment] AS returnComment,
      [tb_created_by] AS createdBy,
      [tb_create_date] AS createdAt,
      [tb_last_modified_by] AS lastModifiedBy,
      [tb_last_modified_date] AS lastModifiedAt,
      [tb_completed_by] AS completedBy,
      [tb_closing_date] AS closingDate
    FROM ${TEMP_PURCHASE_ORDER_TABLE}`;
}

async function loadPositions(orderId, query = null) {
  const execute = query || ((sql, params) => runSQLQuerySqlServer(config.sql.database, sql, params));
  const result = await execute(`
    SELECT
      [tbp_id] AS id,
      [tbp_line_no] AS [lineNo],
      [tbp_article_index] AS articleIndex,
      [tbp_article] AS article,
      [tbp_amount] AS amount,
      [tbp_unit] AS unit,
      [tbp_purchase_price] AS purchasePrice,
      [tbp_currency] AS currency,
      [tbp_requested_delivery_date] AS requestedDeliveryDate,
      [tbp_reserved_for] AS reservedFor,
      [tbp_comment] AS comment,
      [tbp_original_packaging_type] AS originalPackagingType,
      [tbp_original_packaging_type_id] AS originalPackagingTypeId,
      [tbp_packaging_type_changed] AS packagingTypeChanged
    FROM ${TEMP_PURCHASE_POSITION_TABLE}
    WHERE [tbp_tb_id] = ?
    ORDER BY [tbp_line_no] ASC
  `, [orderId]);
  return Array.isArray(result) ? result : result.rows || [];
}

async function loadPurchaseLoadingContext(database, supplierId, articleIndexes) {
  return { customerId: '', addresses: await loadPurchaseLocations(database, supplierId, articleIndexes), source: 'supplier_order_history' };
}

function normalizePurchaseOwnerScope(value) {
  return asText(value).toLowerCase() === 'mine' ? 'mine' : 'all';
}

function normalizePurchaseListStatus(value) {
  const normalized = asText(value).toLowerCase();
  return ['draft', 'sent', 'rework'].includes(normalized) ? normalized : 'all';
}

function buildPurchaseOwnerFilter(userShortCode, isFullAccess, requestedScope) {
  const scope = isFullAccess ? normalizePurchaseOwnerScope(requestedScope) : 'mine';
  if (scope === 'all') return { whereSql: '', params: [], scope };
  return {
    whereSql: ' AND LOWER(COALESCE([tb_created_by], \'\')) = ?',
    params: [String(userShortCode || '').toLowerCase()],
    scope,
  };
}

function buildPurchaseStatusFilter(status) {
  const normalized = normalizePurchaseListStatus(status);
  if (normalized === 'draft') return { whereSql: ' AND COALESCE([tb_status], 0) = 0', status: normalized };
  if (normalized === 'rework') return { whereSql: ' AND COALESCE([tb_status], 0) = 3', status: normalized };
  if (normalized === 'sent') return { whereSql: ' AND COALESCE([tb_status], 0) IN (1, 2)', status: normalized };
  return { whereSql: '', status: normalized };
}

async function loadWorkingCalendar(address) {
  let holidays = [];
  let profile = null;
  if (address) {
    profile = resolveHolidayProfile(address.countryCode, address.region);
    if (profile) {
      try { holidays = await loadHolidayRows(); } catch { holidays = []; }
    }
  }
  return { profile, holidays };
}

async function validateWorkingDates(positions, address) {
  const { profile, holidays } = await loadWorkingCalendar(address);
  for (const position of positions) {
    const date = asDate(position.requestedDeliveryDate);
    if (!date) {
      throw createHttpError(400, 'Für jede Position ist ein gültiges Lieferdatum erforderlich.', { code: 'PURCHASE_DELIVERY_DATE_REQUIRED' });
    }
    const status = getHolidayStatus(date, profile, holidays);
    if (status?.isWeekend || status?.isHoliday) {
      throw createHttpError(400, `Das Lieferdatum ${date} ist kein Arbeitstag.`, {
        code: 'PURCHASE_DELIVERY_DATE_NON_WORKING',
        date,
        suggestedDate: getNextWorkingDate(date, profile, holidays),
        holidayText: status.holidayText || null,
      });
    }
  }
}

async function assertSupplier(database, supplierId, accessScope) {
  const customer = await loadVisibleCustomer(database, supplierId, accessScope);
  if (!customer) throw createHttpError(404, `Lieferant nicht gefunden: ${supplierId}`, { code: 'SUPPLIER_NOT_FOUND' });
  const rows = await runSQLQueryAccess(database, `
    SELECT TOP 1 1 AS ok
    FROM [dbo].[tblKun_Lieferanten]
    WHERE LTRIM(RTRIM(COALESCE([kdLi_Lieferanten_Nr], ''))) = ?
  `, [supplierId]);
  if (!rows?.length) throw createHttpError(400, 'Der ausgewählte Kunde ist kein Lieferant.', { code: 'CUSTOMER_NOT_SUPPLIER' });
  return customer;
}

async function resolveLoadingAddress(database, body) {
  const context = await loadPurchaseLoadingContext(database, body?.supplierId, (body?.positions || []).map((p) => asText(p.articleIndex)));
  const rawId = asText(body?.loadingLocationId);
  const requestedText = asText(body?.loadingLocationText);
  let address = rawId ? context.addresses.find((item) => String(item.id) === rawId) || null : null;
  if (!address && requestedText) {
    const normalized = requestedText.toLocaleLowerCase('de-DE');
    address = context.addresses.find((item) => String(item.text || '').trim().toLocaleLowerCase('de-DE') === normalized) || null;
  }
  if (!address) throw createHttpError(400, 'Bitte einen gemeinsamen Ladeort für die ausgewählten Artikel wählen. Ohne gemeinsamen Ladeort sind getrennte Bestellungen erforderlich.', { code: 'LOADING_LOCATION_REQUIRED' });
  const text = asText(address.text) || asText(body?.loadingLocationText);
  if (!text) throw createHttpError(400, 'Die ausgewählte Lieferadresse hat keinen lesbaren Ladeort.', { code: 'LOADING_LOCATION_REQUIRED' });
  const id = null;
  return { context, address, text, id, source: address.source || context.source };
}

function normalizePositions(rawPositions) {
  const list = Array.isArray(rawPositions) ? rawPositions : [];
  if (!list.length) throw createHttpError(400, 'Die Bestellung benötigt mindestens eine Position.', { code: 'PURCHASE_POSITIONS_REQUIRED' });
  const articleIds = new Set(list.map((item) => asText(item?.articleIndex || item?.article).toLocaleLowerCase('de-DE')));
  if (articleIds.size > 1) throw createHttpError(400, 'Pro Bestellung ist nur eine Artikelart möglich.', { code: 'PURCHASE_SINGLE_ARTICLE_REQUIRED' });
  return list.map((item, index) => {
    const amount = asNumber(item?.amount, null);
    const price = asNumber(item?.purchasePrice, null);
    const unit = asText(item?.unit || 'kg').toLowerCase();
    if (!['kg', 't', 'to', 'tonne', 'tonnen'].includes(unit)) throw createHttpError(400, 'Die Bestellmenge muss in kg oder Tonnen angegeben sein.', { code: 'PURCHASE_POSITION_INVALID' });
    const article = asText(item?.article);
    if (!article || amount === null || amount <= 0 || price === null || price < 0) {
      throw createHttpError(400, `Position ${index + 1} ist unvollständig.`, { code: 'PURCHASE_POSITION_INVALID', lineNo: index + 1 });
    }
    const requestedDeliveryDate = asDate(item?.requestedDeliveryDate);
    if (!requestedDeliveryDate) throw createHttpError(400, `Position ${index + 1} benötigt ein gültiges Lieferdatum.`, { code: 'PURCHASE_DELIVERY_DATE_REQUIRED', lineNo: index + 1 });
    return {
      id: asNumber(item?.id),
      articleIndex: asText(item?.articleIndex) || null,
      article,
      amount: ['t', 'to', 'tonne', 'tonnen'].includes(unit) ? amount * 1000 : amount,
      unit: 'kg',
      purchasePrice: price,
      currency: 'EUR',
      requestedDeliveryDate,
      reservedFor: asText(item?.reservedFor) || null,
      comment: asText(item?.comment) || null,
      copyOfPositionId: asNumber(item?.copyOfPositionId),
    };
  });
}

async function loadOrderForUser(id, companyId, userShortCode, isFullAccess) {
  const ownerSql = isFullAccess ? '' : `AND [tb_created_by] = ?`;
  const params = isFullAccess ? [id, companyId] : [id, companyId, userShortCode];
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    ${orderSelectSql()}
    WHERE [tb_id] = ? AND [tb_company_id] = ? ${ownerSql}
  `, params);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

router.get('/purchase-order-loading-locations', requireMandant, asyncHandler(async (req, res) => {
  const accessScope = await getCustomerAccessScope(req.userIdentity, req.database);
  const supplierId = asText(req.query?.supplierId);
  await assertSupplier(req.database, supplierId, accessScope);
  const ids = Array.isArray(req.query?.articleIndex) ? req.query.articleIndex : [req.query?.articleIndex].filter(Boolean);
  const context = await loadPurchaseLoadingContext(req.database, supplierId, ids);
  sendEnvelope(res, { data: context.addresses, meta: { count: context.addresses.length, source: context.source } });
}));

router.get('/purchase-order-options', requireMandant, asyncHandler(async (req, res) => {
  const supplierId = asText(req.query?.supplierId);
  const scope = await getCustomerAccessScope(req.userIdentity, req.database);
  await assertSupplier(req.database, supplierId, scope);
  const lang = req.header('x-lang') === 'en' ? 'en' : 'de';
  const [options, defaults] = await Promise.all([loadPurchaseOptions(req.database, lang), loadSupplierTerms(req.database, supplierId, lang)]);
  sendEnvelope(res, { data: { ...options, defaults } });
}));

router.get('/customers/:supplierId/procured-articles/:articleIndex/purchase-defaults', requireMandant, asyncHandler(async (req, res) => {
  const supplierId = asText(req.params.supplierId);
  const articleIndex = asText(req.params.articleIndex);
  const scope = await getCustomerAccessScope(req.userIdentity, req.database);
  const supplier = await assertSupplier(req.database, supplierId, scope);
  const source = await loadLatestPurchase(req.database, supplierId, articleIndex);
  if (!source) throw createHttpError(404, 'Für diesen Artikel gibt es keinen Einkauf bei diesem Lieferanten.', { code: 'PURCHASE_ARTICLE_NOT_FOUND' });
  sendEnvelope(res, { data: {
    supplier: { id: supplierId, name: asText(supplier.kd_Name1 || supplier.kd_Name2) },
    defaults: { ...source, lastDeliveryDate: asDate(source.lastDeliveryDate), lastOrderDate: asDate(source.lastOrderDate), amount: packagingKey(source.originalPackagingType) === 'silo' ? 25000 : 24750, unit: 'kg', purchasePrice: '', requestedDeliveryDate: '', reservedFor: '', comment: '' },
  } });
}));

async function preparePurchase(req, supplierId, rawPositions, existing = null, storedPositions = []) {
  const lang = req.header('x-lang') === 'en' ? 'en' : 'de';
  const [options, terms] = await Promise.all([loadPurchaseOptions(req.database, lang), loadSupplierTerms(req.database, supplierId, lang)]);
  const packaging = findPackaging(options.packagingTypes, req.body?.packagingType, req.body?.packagingTypeId);
  const incoterm = options.incoterms.find((item) => Number(item.id) === Number(req.body?.deliveryTermId));
  if (!packaging || !incoterm) throw createHttpError(400, 'Bitte Verpackungsart und Incoterm auswählen.', { code: 'PURCHASE_HEADER_INVALID' });
  const positions = normalizePositions(rawPositions);
  const latestByArticle = new Map();
  for (const position of positions) {
    if (!position.articleIndex) throw createHttpError(400, 'Artikelindex fehlt.', { code: 'PURCHASE_POSITION_INVALID' });
    if (!latestByArticle.has(position.articleIndex)) latestByArticle.set(position.articleIndex, await loadLatestPurchase(req.database, supplierId, position.articleIndex));
    const latest = latestByArticle.get(position.articleIndex);
    if (!latest) throw createHttpError(400, 'Der Artikel gehört nicht zum gewählten Lieferanten.', { code: 'PURCHASE_POSITION_INVALID' });
    const stored = storedPositions.find((p) => p.id === (position.id || position.copyOfPositionId) && p.articleIndex === position.articleIndex);
    const original = stored?.originalPackagingType || (stored ? existing?.packagingType : latest.originalPackagingType);
    const originalOption = findPackaging(options.packagingTypes, original);
    position.article = asText(latest.article);
    position.originalPackagingType = asText(original) || null;
    position.originalPackagingTypeId = originalOption?.id || null;
    position.packagingTypeChanged = originalOption ? packaging.id !== originalOption.id : packagingKey(packaging.text) !== packagingKey(original);
  }
  // New orders use authoritative supplier terms; edits keep their saved terms.
  const payment = existing || terms;
  const loading = await resolveLoadingAddress(req.database, { ...req.body, supplierId, positions });
  await validateWorkingDates(positions, loading.address);
  return { positions, loading, packaging, incoterm, payment };
}

async function insertPurchasePositions(query, id, positions, user, now, createdBy = user, createdAt = now) {
  for (let i = 0; i < positions.length; i += 1) {
    const p = positions[i];
    await query(`INSERT INTO ${TEMP_PURCHASE_POSITION_TABLE} (
      [tbp_tb_id],[tbp_line_no],[tbp_article_index],[tbp_article],[tbp_amount],[tbp_unit],[tbp_purchase_price],[tbp_currency],
      [tbp_requested_delivery_date],[tbp_reserved_for],[tbp_comment],[tbp_original_packaging_type],[tbp_original_packaging_type_id],[tbp_packaging_type_changed],
      [tbp_created_by],[tbp_create_date],[tbp_last_modified_by],[tbp_last_modified_date]) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, i + 1, p.articleIndex, p.article, p.amount, p.unit, p.purchasePrice, p.currency, p.requestedDeliveryDate, p.reservedFor, p.comment,
      p.originalPackagingType, p.originalPackagingTypeId, p.packagingTypeChanged ? 1 : 0, createdBy, createdAt, user, now]);
  }
}

router.get('/temp-purchase-orders', requireMandant, asyncHandler(async (req, res) => {
  const accessScope = await getCustomerAccessScope(req.userIdentity, req.database);
  const userShortCode = asText(req.userIdentity?.shortCode);
  const companyId = Number(req.database?.firmaId || 0);
  const { page, pageSize } = parseListParams(req.query, { page: 1, pageSize: 20, sort: 'createdAt', dir: 'DESC' });
  const q = asText(req.query.q);
  const statusFilter = buildPurchaseStatusFilter(req.query.status);
  const ownerFilter = buildPurchaseOwnerFilter(userShortCode, accessScope.isFullAccess, req.query.ownerScope);
  const clauses = ['[tb_company_id] = ?'];
  const params = [companyId];
  if (ownerFilter.whereSql) { clauses.push(ownerFilter.whereSql.replace(/^\s*AND\s+/i, '')); params.push(...ownerFilter.params); }
  if (statusFilter.whereSql) { clauses.push(statusFilter.whereSql.replace(/^\s*AND\s+/i, '')); }
  if (q) {
    clauses.push(`([tb_supplier_name] LIKE ? OR [tb_supplier_id] LIKE ? OR EXISTS (
      SELECT 1 FROM ${TEMP_PURCHASE_POSITION_TABLE} p
      WHERE p.[tbp_tb_id] = [tb_id] AND (p.[tbp_article] LIKE ? OR p.[tbp_article_index] LIKE ?)
    ))`);
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  // The status filter contains no parameters; keeping this list explicit
  // makes count and page queries use exactly the same predicate order.
  const where = clauses.join(' AND ');
  const countRows = await runSQLQuerySqlServer(config.sql.database, `SELECT COUNT(*) AS total FROM ${TEMP_PURCHASE_ORDER_TABLE} WHERE ${where}`, params);
  const total = Number(countRows?.[0]?.total || 0);
  const offset = (page - 1) * pageSize;
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    ${orderSelectSql()}
    WHERE ${where}
    ORDER BY [tb_last_modified_date] DESC, [tb_id] DESC
    OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
  `, [...params, offset, pageSize]);
  const data = [];
  for (const row of (Array.isArray(rows) ? rows : [])) data.push(mapOrder(row, await loadPositions(row.id)));
  sendEnvelope(res, {
    status: 200,
    data,
    meta: {
      page,
      pageSize,
      total,
      mandant: req.mandant,
      status: statusFilter.status,
      ownerScope: ownerFilter.scope,
      canViewAll: Boolean(accessScope.isFullAccess),
    },
    error: null,
  });
}));

router.get('/temp-purchase-orders/:id', requireMandant, asyncHandler(async (req, res) => {
  const accessScope = await getCustomerAccessScope(req.userIdentity, req.database);
  const row = await loadOrderForUser(Number(req.params.id), Number(req.database?.firmaId || 0), asText(req.userIdentity?.shortCode), accessScope.isFullAccess);
  if (!row) throw createHttpError(404, 'Bestellung nicht gefunden.', { code: 'RESOURCE_NOT_FOUND' });
  sendEnvelope(res, { status: 200, data: mapOrder(row, await loadPositions(row.id)), meta: { mandant: req.mandant }, error: null });
}));

router.post('/temp-purchase-orders', requireMandant, asyncHandler(async (req, res) => {
  const scope = await getCustomerAccessScope(req.userIdentity, req.database);
  const supplierId = asText(req.body?.supplierId);
  const supplier = await assertSupplier(req.database, supplierId, scope);
  const companyId = Number(req.database?.firmaId || 0);
  const user = asText(req.userIdentity?.shortCode) || asText(req.userEmail) || 'APP';
  const clientRequestId = isUuid(req.body?.clientRequestId) ? asText(req.body.clientRequestId) : crypto.randomUUID();
  const now = new Date().toISOString();
  const prior = await runSQLQuerySqlServer(config.sql.database, `${orderSelectSql()} WHERE [tb_company_id]=? AND [tb_client_request_id]=?`, [companyId, clientRequestId]);
  if (prior[0]) {
    if (asText(prior[0].createdBy).toLowerCase() !== user.toLowerCase()) throw createHttpError(409, 'Anfragekennung bereits verwendet.');
    sendEnvelope(res, { data: mapOrder(prior[0], await loadPositions(prior[0].id)), meta: { alreadyCreated: true } });
    return;
  }
  const { positions, loading, packaging, incoterm, payment } = await preparePurchase(req, supplierId, req.body?.positions);
  const created = await withSqlTransaction(config.sql.database, async ({ query }) => {
    const retry = await query(`${orderSelectSql()} WITH (UPDLOCK, HOLDLOCK) WHERE [tb_company_id]=? AND [tb_client_request_id]=?`, [companyId, clientRequestId]);
    if (retry.rows[0]) {
      if (asText(retry.rows[0].createdBy).toLowerCase() !== user.toLowerCase()) throw createHttpError(409, 'Anfragekennung bereits verwendet.');
      return mapOrder(retry.rows[0], await loadPositions(retry.rows[0].id, query));
    }
    const result = await query(`INSERT INTO ${TEMP_PURCHASE_ORDER_TABLE} (
      [tb_company_id],[tb_client_request_id],[tb_supplier_id],[tb_supplier_name],[tb_supplier_address],[tb_supplier_contact],
      [tb_payment_condition_changed],[tb_payment_condition_id],[tb_payment_condition_text],[tb_delivery_term_id],[tb_delivery_term_text],
      [tb_packaging_type],[tb_packaging_type_id],[tb_loading_location_source],[tb_loading_location_id],[tb_loading_location_text],[tb_loading_location_changed],
      [tb_comment],[tb_status],[tb_created_by],[tb_create_date],[tb_last_modified_by],[tb_last_modified_date])
      OUTPUT INSERTED.[tb_id] AS id VALUES (?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,0,?,0,?,?,?,?)`,
    [companyId, clientRequestId, supplierId, asText(supplier.kd_Name1 || supplier.kd_Name2) || supplierId,
      [supplier.kd_Strasse, [supplier.kd_PLZ, supplier.kd_Ort].filter(Boolean).join(' '), supplier.kd_LK].filter(Boolean).join(', '), asText(req.body?.supplierContact) || null,
      payment.paymentConditionId, payment.paymentConditionText || null, incoterm.id, incoterm.text, packaging.text, packaging.id, loading.source, loading.id, loading.text,
      asText(req.body?.comment) || null, user, now, user, now]);
    const id = result.rows[0].id;
    await insertPurchasePositions(query, id, positions, user, now);
    const saved = await query(`${orderSelectSql()} WHERE [tb_id]=?`, [id]);
    return mapOrder(saved.rows[0], await loadPositions(id, query));
  });
  sendEnvelope(res, { status: 201, data: created, meta: { mandant: req.mandant } });
}));

router.put('/temp-purchase-orders/:id', requireMandant, asyncHandler(async (req, res) => {
  const scope = await getCustomerAccessScope(req.userIdentity, req.database);
  const id = Number(req.params.id);
  const companyId = Number(req.database?.firmaId || 0);
  const user = asText(req.userIdentity?.shortCode) || asText(req.userEmail) || 'APP';
  const existing = await loadOrderForUser(id, companyId, user, scope.isFullAccess);
  if (!existing) throw createHttpError(404, 'Bestellung nicht gefunden.', { code: 'RESOURCE_NOT_FOUND' });
  if (!isEditable(normalizeStatus(existing.status))) throw createHttpError(409, 'Diese Bestellung ist nicht mehr bearbeitbar.', { code: 'PURCHASE_ORDER_LOCKED' });
  if (req.body?.supplierId && asText(req.body.supplierId) !== existing.supplierId) throw createHttpError(400, 'Der Lieferant einer Bestellung kann nicht geändert werden.');
  await assertSupplier(req.database, existing.supplierId, scope);
  const storedPositions = await loadPositions(id);
  const { positions, loading, packaging, incoterm } = await preparePurchase(req, existing.supplierId, req.body?.positions, existing, storedPositions);
  const now = new Date().toISOString();
  const updated = await withSqlTransaction(config.sql.database, async ({ query }) => {
    const locked = await query(`SELECT [tb_status] AS status FROM ${TEMP_PURCHASE_ORDER_TABLE} WITH (UPDLOCK,HOLDLOCK) WHERE [tb_id]=? AND [tb_company_id]=?`, [id, companyId]);
    if (!locked.rows[0] || !isEditable(normalizeStatus(locked.rows[0].status))) throw createHttpError(409, 'Diese Bestellung ist nicht mehr bearbeitbar.', { code: 'PURCHASE_ORDER_LOCKED' });
    await query(`UPDATE ${TEMP_PURCHASE_ORDER_TABLE} SET [tb_supplier_contact]=?,[tb_payment_condition_changed]=0,[tb_delivery_term_id]=?,[tb_delivery_term_text]=?,
      [tb_packaging_type]=?,[tb_packaging_type_id]=?,[tb_loading_location_source]=?,[tb_loading_location_id]=?,[tb_loading_location_text]=?,[tb_comment]=?,[tb_last_modified_by]=?,[tb_last_modified_date]=?
      WHERE [tb_id]=? AND [tb_company_id]=?`, [asText(req.body?.supplierContact) || null, incoterm.id, incoterm.text, packaging.text, packaging.id, loading.source, loading.id, loading.text, asText(req.body?.comment) || null, user, now, id, companyId]);
    await query(`DELETE FROM ${TEMP_PURCHASE_POSITION_TABLE} WHERE [tbp_tb_id]=?`, [id]);
    await insertPurchasePositions(query, id, positions, user, now, existing.createdBy, existing.createdAt);
    const saved = await query(`${orderSelectSql()} WHERE [tb_id]=?`, [id]);
    return mapOrder(saved.rows[0], await loadPositions(id, query));
  });
  sendEnvelope(res, { data: updated, meta: { mandant: req.mandant } });
}));

router.delete('/temp-purchase-orders/:id', requireMandant, asyncHandler(async (req, res) => {
  const accessScope = await getCustomerAccessScope(req.userIdentity, req.database);
  const id = Number(req.params.id);
  const companyId = Number(req.database?.firmaId || 0);
  const userShortCode = asText(req.userIdentity?.shortCode);
  const row = await loadOrderForUser(id, companyId, userShortCode, accessScope.isFullAccess);
  if (!row) throw createHttpError(404, 'Bestellung nicht gefunden.', { code: 'RESOURCE_NOT_FOUND' });
  if (!isEditable(normalizeStatus(row.status))) throw createHttpError(409, 'Diese Bestellung kann nicht gelöscht werden.', { code: 'PURCHASE_ORDER_LOCKED' });
  await withSqlTransaction(config.sql.database, async ({ query }) => {
    // The position FK is intentionally restrictive so an accidental parent
    // delete cannot orphan lines; remove the owned draft's lines first.
    await query(`DELETE FROM ${appTableSql('purchaseOrderMailOutbox')} WHERE [pom_PurchaseOrderID] = ?`, [id]);
    await query(`DELETE FROM ${appTableSql('purchaseOrderCsMailOutbox')} WHERE [pcom_PurchaseOrderID] = ?`, [id]);
    await query(`DELETE FROM ${TEMP_PURCHASE_POSITION_TABLE} WHERE [tbp_tb_id] = ?`, [id]);
    await query(`DELETE FROM ${TEMP_PURCHASE_ORDER_TABLE} WHERE [tb_id] = ? AND [tb_company_id] = ?`, [id, companyId]);
  });
  res.status(204).end();
}));

router.post('/temp-purchase-orders/:id/finalize', requireMandant, asyncHandler(async (req, res) => {
  const accessScope = await getCustomerAccessScope(req.userIdentity, req.database);
  const id = Number(req.params.id);
  const companyId = Number(req.database?.firmaId || 0);
  const userShortCode = asText(req.userIdentity?.shortCode) || asText(req.userEmail) || 'APP';
  const mailValidation = validateOrderMailConfig(config.orderMail, config.mailService);
  if (!mailValidation.ok) throw createHttpError(503, 'CS-Mail-Konfiguration fehlt.', { code: 'PURCHASE_CS_MAIL_CONFIG_MISSING', missing: mailValidation.missing || [] });
  const csRecipient = resolveOrderMailRecipient(companyId, config.orderMail);
  if (!csRecipient.ok) throw createHttpError(422, 'Kein CS-Mail-Empfänger für den Mandanten konfiguriert.', { code: 'PURCHASE_CS_MAIL_RECIPIENT_MISSING' });
  const now = new Date().toISOString();
  const finalized = await withSqlTransaction(config.sql.database, async ({ query }) => {
    const ownerSql = accessScope.isFullAccess ? '' : ' AND [tb_created_by]=?';
    const ownerParams = accessScope.isFullAccess ? [id, companyId] : [id, companyId, userShortCode];
    const current = await query(`${orderSelectSql()} WITH (UPDLOCK,HOLDLOCK) WHERE [tb_id]=? AND [tb_company_id]=?${ownerSql}`, ownerParams);
    const row = current.rows[0];
    if (!row) throw createHttpError(404, 'Bestellung nicht gefunden.', { code: 'RESOURCE_NOT_FOUND' });
    const positions = await loadPositions(id, query);
    if ([STATUS.APP_FINALIZED, STATUS.CS_ACCEPTED].includes(normalizeStatus(row.status))) return { mapped: mapOrder(row, positions), alreadyFinalized: true };
    normalizePositions(positions);
    const loading = await resolveLoadingAddress(req.database, { ...row, positions });
    await validateWorkingDates(positions, loading.address);
    await query(`UPDATE ${TEMP_PURCHASE_ORDER_TABLE} SET [tb_status]=1,[tb_return_comment]=NULL,[tb_completed_by]=?,[tb_closing_date]=?,[tb_last_modified_by]=?,[tb_last_modified_date]=? WHERE [tb_id]=? AND [tb_company_id]=? AND [tb_status] IN (0,3)`, [userShortCode, now, userShortCode, now, id, companyId]);
    return { mapped: mapOrder({ ...row, status: 1, returnComment: '', completedBy: userShortCode, closingDate: now, lastModifiedBy: userShortCode, lastModifiedAt: now }, positions), alreadyFinalized: false };
  });
  const mapped = finalized.mapped;
  const updatedPositions = mapped.positions;
  if (finalized.alreadyFinalized) {
    sendEnvelope(res, { data: mapped, meta: { alreadyFinalized: true } });
    return;
  }
  let csMail = { queued: false, reason: 'not_available' };
  try {
    csMail = await queuePurchaseOrderCsMail({
      order: mapped,
      positions: mapped.positions,
      mandantName: req.mandant,
      mandantShortName: req.database?.shortName || null,
    });
    if (csMail.outboxId) await processPurchaseOrderCsMailOutboxById(csMail.outboxId);
  } catch (mailError) {
    csMail = { queued: false, reason: mailError?.message || 'mail_failed' };
  }
  // A finalized purchase order is visible in the shared timeline and follows
  // the same push-notification path as sales orders. It never enters sales
  // planning or reservation logic.
  let timelineEntries = [];
  try {
    const existingTimeline = await runSQLQuerySqlServer(config.sql.database, `
      SELECT TOP 1 [tl_ID] AS id
      FROM ${TIMELINE_TABLE}
      WHERE [tl_Type] = N'purchase_order'
        AND [tl_CompanyId] = ?
        AND [tl_ReferenceId] = ?
    `, [companyId, String(id)]);
    if (!Array.isArray(existingTimeline) || !existingTimeline.length) {
      timelineEntries = updatedPositions.map((position) => ({
        createdAt: now,
        mandant: req.mandant,
        mandantShortName: req.database?.shortName || null,
        companyId,
        userEmail: req.userEmail || null,
        userShortCode,
        type: 'purchase_order',
        product: asText(position.article) || asText(position.articleIndex) || '-',
        productId: asText(position.articleIndex),
        beNumber: asText(mapped.bmsPurchaseOrderNumber),
        amountKg: Number(position.amount),
        unit: asText(position.unit) || 'kg',
        referenceId: String(id),
        supplierName: asText(mapped.supplierName),
        payloadJson: {
          tempPurchaseOrderId: id,
          supplierId: mapped.supplierId,
          supplierName: mapped.supplierName,
        },
      }));
      if (timelineEntries.length) await appendTimelineEntries(timelineEntries);
    }
  } catch (timelineError) {
    // Timeline/push is intentionally non-blocking for the purchase hand-off;
    // the order and its e-mails remain valid if the optional table is absent.
    logger.warn(`Timeline fuer Bestellung ${id} konnte nicht angelegt werden: ${timelineError?.message || timelineError}`);
    timelineEntries = [];
  }
  sendEnvelope(res, { status: 200, data: { ...mapped, csMail }, meta: { alreadyFinalized: false }, error: null });
}));

module.exports = router;
module.exports.STATUS = STATUS;
module.exports.normalizePositions = normalizePositions;
module.exports.getNextWorkingDate = getNextWorkingDate;
