const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const logger = require('../logger');
const { asyncHandler, createHttpError, sendEnvelope, parseListParams } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { runSQLQueryAccess, runSQLQuerySqlServer, withSqlTransaction } = require('../db/access');
const { appTableSql } = require('../db/app-tables');
const { getCustomerAccessScope, loadVisibleCustomer } = require('../db/customer-access');
const { loadCustomerDeliveryAddresses } = require('../db/delivery-addresses');
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
const TEMP_PURCHASE_ORDER_TABLE = appTableSql('tempPurchaseOrder');
const TEMP_PURCHASE_POSITION_TABLE = appTableSql('tempPurchaseOrderPosition');

const STATUS = Object.freeze({ DRAFT: 0, APP_FINALIZED: 1, CS_ACCEPTED: 2, NEEDS_REWORK: 3 });

function asText(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function asNumber(value, fallback = null) {
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
      amount: asNumber(position.amount, 0),
      unit: asText(position.unit) || 'kg',
      purchasePrice: asNumber(position.purchasePrice, 0),
      currency: asText(position.currency) || 'EUR',
      requestedDeliveryDate: asDate(position.requestedDeliveryDate),
      reservedFor: asText(position.reservedFor),
      comment: asText(position.comment),
      sourceBestellindex: asText(position.sourceBestellindex),
      sourcePositionId: asText(position.sourcePositionId),
      sourceOrderDate: asDate(position.sourceOrderDate),
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

async function loadPositions(orderId) {
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT
      [tbp_id] AS id,
      [tbp_line_no] AS lineNo,
      [tbp_article_index] AS articleIndex,
      [tbp_article] AS article,
      [tbp_amount] AS amount,
      [tbp_unit] AS unit,
      [tbp_purchase_price] AS purchasePrice,
      [tbp_currency] AS currency,
      [tbp_requested_delivery_date] AS requestedDeliveryDate,
      [tbp_reserved_for] AS reservedFor,
      [tbp_comment] AS comment,
      [tbp_source_bestellindex] AS sourceBestellindex,
      [tbp_source_position_id] AS sourcePositionId,
      [tbp_source_order_date] AS sourceOrderDate
    FROM ${TEMP_PURCHASE_POSITION_TABLE}
    WHERE [tbp_tb_id] = ?
    ORDER BY [tbp_line_no] ASC
  `, [orderId]);
  return Array.isArray(rows) ? rows : [];
}

async function loadOwnDeliveryContext(database) {
  const name = asText(database?.name);
  const shortName = asText(database?.shortName);
  const candidates = [name, shortName].filter(Boolean);
  let ownCustomerId = '';
  if (candidates.length) {
    const normalizedCandidates = candidates.map((item) => item.toUpperCase());
    const placeholders = candidates.map(() => '?').join(', ');
    const exactRows = await runSQLQueryAccess(database, `
      SELECT TOP 1 [kd_KdNR] AS customerId
      FROM [dbo].[tblKunden]
      WHERE (
        UPPER(LTRIM(RTRIM(COALESCE([kd_Name1], '')))) IN (${placeholders})
        OR UPPER(LTRIM(RTRIM(COALESCE([kd_Name2], '')))) IN (${placeholders})
        OR UPPER(LTRIM(RTRIM(COALESCE([kd_Kurz], '')))) IN (${placeholders})
      )
      ORDER BY [kd_KdNR]
    `, [
      ...normalizedCandidates,
      ...normalizedCandidates,
      ...normalizedCandidates,
    ]);
    ownCustomerId = asText(exactRows?.[0]?.customerId);
    if (!ownCustomerId) {
      // Each LIKE predicate takes exactly one parameter.  A comma-separated
      // placeholder list (`LIKE ?, ?`) is invalid SQL Server syntax and was
      // especially visible for the Test tenant, which supplies name + shortName.
      const name1Like = normalizedCandidates
        .map(() => `UPPER(LTRIM(RTRIM(COALESCE([kd_Name1], '')))) LIKE ?`)
        .join(' OR ');
      const name2Like = normalizedCandidates
        .map(() => `UPPER(LTRIM(RTRIM(COALESCE([kd_Name2], '')))) LIKE ?`)
        .join(' OR ');
      const likeRows = await runSQLQueryAccess(database, `
        SELECT TOP 1 [kd_KdNR] AS customerId
        FROM [dbo].[tblKunden]
        WHERE (${name1Like} OR ${name2Like})
        ORDER BY [kd_KdNR]
      `, [
        ...normalizedCandidates.map((item) => `%${item}%`),
        ...normalizedCandidates.map((item) => `%${item}%`),
      ]);
      ownCustomerId = asText(likeRows?.[0]?.customerId);
    }
  }
  if (!ownCustomerId) return { customerId: '', addresses: [] };
  return {
    customerId: ownCustomerId,
    addresses: await loadCustomerDeliveryAddresses(database, ownCustomerId),
  };
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
  const context = await loadOwnDeliveryContext(database);
  const id = body?.loadingLocationId === null || body?.loadingLocationId === undefined || asText(body.loadingLocationId) === ''
    ? null : Number(body.loadingLocationId);
  let address = null;
  if (id !== null && Number.isInteger(id)) address = context.addresses.find((item) => Number(item.id) === id) || null;
  if (id === null) throw createHttpError(400, 'Bitte einen Ladeort aus den Lieferadressen des aktuellen Mandanten auswählen.', { code: 'LOADING_LOCATION_REQUIRED' });
  if (!address) throw createHttpError(400, 'Der Ladeort gehört nicht zu den Lieferadressen des aktuellen Mandanten.', { code: 'LOADING_LOCATION_NOT_FOUND' });
  const text = asText(address.text) || asText(body?.loadingLocationText);
  if (!text) throw createHttpError(400, 'Die ausgewählte Lieferadresse hat keinen lesbaren Ladeort.', { code: 'LOADING_LOCATION_REQUIRED' });
  return { context, address, text, id };
}

function normalizePositions(rawPositions) {
  const list = Array.isArray(rawPositions) ? rawPositions : [];
  if (!list.length) throw createHttpError(400, 'Die Bestellung benötigt mindestens eine Position.', { code: 'PURCHASE_POSITIONS_REQUIRED' });
  return list.map((item, index) => {
    const amount = asNumber(item?.amount, null);
    const price = asNumber(item?.purchasePrice, null);
    const article = asText(item?.article);
    if (!article || amount === null || amount <= 0 || price === null || price < 0) {
      throw createHttpError(400, `Position ${index + 1} ist unvollständig.`, { code: 'PURCHASE_POSITION_INVALID', lineNo: index + 1 });
    }
    const requestedDeliveryDate = asDate(item?.requestedDeliveryDate);
    if (!requestedDeliveryDate) throw createHttpError(400, `Position ${index + 1} benötigt ein gültiges Lieferdatum.`, { code: 'PURCHASE_DELIVERY_DATE_REQUIRED', lineNo: index + 1 });
    return {
      articleIndex: asText(item?.articleIndex) || null,
      article,
      amount,
      unit: asText(item?.unit) || 'kg',
      purchasePrice: price,
      currency: asText(item?.currency) || 'EUR',
      requestedDeliveryDate,
      reservedFor: asText(item?.reservedFor) || null,
      comment: asText(item?.comment) || null,
      sourceBestellindex: asText(item?.sourceBestellindex) || null,
      sourcePositionId: asText(item?.sourcePositionId) || null,
      sourceOrderDate: asDate(item?.sourceOrderDate),
    };
  });
}

async function loadOrderForUser(id, companyId, userShortCode, isFullAccess, forUpdate = false) {
  const ownerSql = isFullAccess ? '' : `AND [tb_created_by] = ?`;
  const params = isFullAccess ? [id, companyId] : [id, companyId, userShortCode];
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    ${orderSelectSql()}
    WHERE [tb_id] = ? AND [tb_company_id] = ? ${ownerSql}
  `, params);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

router.get('/purchase-order-loading-locations', requireMandant, asyncHandler(async (req, res) => {
  const context = await loadOwnDeliveryContext(req.database);
  sendEnvelope(res, {
    status: 200,
    data: context.addresses,
    meta: { mandant: req.mandant, ownCustomerId: context.customerId, count: context.addresses.length },
    error: null,
  });
}));

router.get('/customers/:supplierId/procured-articles/:articleIndex/purchase-defaults', requireMandant, asyncHandler(async (req, res) => {
  const supplierId = asText(req.params.supplierId);
  const articleIndex = asText(req.params.articleIndex);
  const accessScope = await getCustomerAccessScope(req.userIdentity, req.database);
  const supplier = await assertSupplier(req.database, supplierId, accessScope);
  const rows = await runSQLQueryAccess(req.database, `
    SELECT TOP 1
      [b].[be_Bestellindex] AS sourceBestellindex,
      [b].[be_Bestelldatum] AS sourceOrderDate,
      [b].[be_KontaktpersonBE] AS supplierContact,
      [b].[be_ZahlText] AS paymentConditionId,
      [b].[be_Lieferbedingung] AS deliveryTermText,
      [b].[be_Verpackung] AS packagingType,
      [b].[be_BemerkungBE] AS comment,
      [b].[be_AdresseAbhol] AS loadingLocationText,
      [p].[beP_BEposID] AS sourcePositionId,
      [p].[beP_Artikelindex] AS articleIndex,
      [p].[beP_Artikel] AS article,
      [p].[beP_Anzahl] AS amount,
      [p].[beP_Einheit] AS unit,
      COALESCE([p].[beP_EK_EU], [p].[beP_EK_DM]) AS purchasePrice,
      [p].[beP_Lieferdatum] AS requestedDeliveryDate,
      [p].[beP_VLbemerkung] AS reservedFor,
      [p].[beP_Zusatztext] AS positionComment
    FROM [dbo].[tblBest_Position] [p]
    INNER JOIN [dbo].[tblBestellung] [b]
      ON [b].[be_Bestellindex] = [p].[beP_Bestellindex]
    WHERE LTRIM(RTRIM(COALESCE([b].[be_KdNr], ''))) = ?
      AND LTRIM(RTRIM(COALESCE([p].[beP_Artikelindex], ''))) = ?
      AND COALESCE([p].[beP_Storno], 0) <> 1
    ORDER BY [b].[be_Bestelldatum] DESC, [b].[be_Bestellindex] DESC, [p].[beP_BEposID] DESC
  `, [supplierId, articleIndex]);
  const source = rows?.[0] || null;
  let paymentConditionText = '';
  if (source?.paymentConditionId) {
    const paymentRows = await runSQLQuerySqlServer(config.sql.database, `
      SELECT TOP 1 [zaS_Zahl_Text] AS text
      FROM [dbo].[tblZahltext_Sprachen]
      WHERE [zaS_ID] = ? AND LOWER(COALESCE([zaS_SprachID], '')) = ?
    `, [Number(source.paymentConditionId), String(req.header('x-lang') || 'de').toLowerCase() === 'en' ? 'en' : 'de']);
    paymentConditionText = asText(paymentRows?.[0]?.text);
  }
  const context = await loadOwnDeliveryContext(req.database);
  const { profile, holidays } = await loadWorkingCalendar(context.addresses[0] || null);
  let suggestedDate = asDate(source?.requestedDeliveryDate);
  const sourceOrderDate = asDate(source?.sourceOrderDate);
  if (sourceOrderDate && suggestedDate) {
    const leadDays = Math.max(1, Math.round((new Date(`${suggestedDate}T00:00:00Z`) - new Date(`${sourceOrderDate}T00:00:00Z`)) / 86400000));
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const raw = new Date(`${todayKey}T00:00:00Z`);
    raw.setUTCDate(raw.getUTCDate() + leadDays);
    suggestedDate = getNextWorkingDate(raw.toISOString().slice(0, 10), profile, holidays);
  }
  if (!suggestedDate) {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    suggestedDate = getNextWorkingDate(tomorrow.toISOString().slice(0, 10), profile, holidays);
  }
  const loadingText = asText(source?.loadingLocationText);
  const normalized = loadingText.toLocaleLowerCase('de-DE');
  const preferred = context.addresses.find((address) => (
    String(address.text || '').toLocaleLowerCase('de-DE') === normalized
    || String(address.addressNo || '').toLocaleLowerCase('de-DE') === normalized
    || String(address.short || '').toLocaleLowerCase('de-DE') === normalized
  )) || null;
  sendEnvelope(res, {
    status: 200,
    data: {
      supplier: {
        id: supplierId,
        name: asText(supplier.kd_Name1 || supplier.kd_Name2),
        address: [supplier.kd_Strasse, [supplier.kd_PLZ, supplier.kd_Ort].filter(Boolean).join(' '), supplier.kd_LK].filter(Boolean).join(', '),
      },
      defaults: source ? {
        ...source,
        paymentConditionText,
        suggestedDate,
        loadingLocationId: preferred ? preferred.id : null,
        loadingLocationText: preferred?.text || loadingText,
        purchasePrice: asNumber(source.purchasePrice, 0),
      } : { suggestedDate, loadingLocationId: null, loadingLocationText: '' },
      loadingLocations: context.addresses,
      loadingCustomerId: context.customerId,
    },
    meta: { mandant: req.mandant, sourceFound: Boolean(source) },
    error: null,
  });
}));

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
  const accessScope = await getCustomerAccessScope(req.userIdentity, req.database);
  const supplierId = asText(req.body?.supplierId);
  if (!supplierId) throw createHttpError(400, 'Lieferant fehlt.', { code: 'SUPPLIER_REQUIRED' });
  const supplier = await assertSupplier(req.database, supplierId, accessScope);
  const positions = normalizePositions(req.body?.positions);
  const loading = await resolveLoadingAddress(req.database, req.body);
  await validateWorkingDates(positions, loading.address || null);
  const companyId = Number(req.database?.firmaId || 0);
  const userShortCode = asText(req.userIdentity?.shortCode) || asText(req.userEmail) || 'APP';
  const clientRequestId = isUuid(req.body?.clientRequestId) ? asText(req.body.clientRequestId) : crypto.randomUUID();
  const now = new Date().toISOString();
  const supplierName = asText(supplier.kd_Name1 || supplier.kd_Name2) || supplierId;
  const supplierAddress = [supplier.kd_Strasse, [supplier.kd_PLZ, supplier.kd_Ort].filter(Boolean).join(' '), supplier.kd_LK].filter(Boolean).join(', ');
  const created = await withSqlTransaction(config.sql.database, async ({ query }) => {
    const existing = await query(`SELECT TOP 1 * FROM ${TEMP_PURCHASE_ORDER_TABLE} WHERE [tb_company_id] = ? AND [tb_client_request_id] = ?`, [companyId, clientRequestId]);
    if (existing.rows?.[0]) return existing.rows[0];
    const result = await query(`
      INSERT INTO ${TEMP_PURCHASE_ORDER_TABLE} (
        [tb_company_id], [tb_client_request_id], [tb_supplier_id], [tb_supplier_name], [tb_supplier_address], [tb_supplier_contact],
        [tb_payment_condition_changed], [tb_payment_condition_id], [tb_payment_condition_text], [tb_delivery_term_id], [tb_delivery_term_text],
        [tb_packaging_type], [tb_loading_location_source], [tb_loading_location_id], [tb_loading_location_text], [tb_loading_location_changed],
        [tb_comment], [tb_status], [tb_created_by], [tb_create_date], [tb_last_modified_by], [tb_last_modified_date]
      ) OUTPUT INSERTED.* VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
    `, [companyId, clientRequestId, supplierId, supplierName, supplierAddress, asText(req.body?.supplierContact) || null,
      req.body?.paymentConditionChanged ? 1 : 0, asNumber(req.body?.paymentConditionId), asText(req.body?.paymentConditionText) || null,
      asNumber(req.body?.deliveryTermId), asText(req.body?.deliveryTermText) || null, asText(req.body?.packagingType) || null,
      'mandant_delivery_address', loading.id, loading.text, req.body?.loadingLocationChanged ? 1 : 0,
      asText(req.body?.comment) || null, userShortCode, now, userShortCode, now]);
    const order = result.rows?.[0];
    for (let i = 0; i < positions.length; i += 1) {
      const p = positions[i];
      await query(`
        INSERT INTO ${TEMP_PURCHASE_POSITION_TABLE} (
          [tbp_tb_id], [tbp_line_no], [tbp_article_index], [tbp_article], [tbp_amount], [tbp_unit], [tbp_purchase_price], [tbp_currency],
          [tbp_requested_delivery_date], [tbp_reserved_for], [tbp_comment], [tbp_source_bestellindex], [tbp_source_position_id], [tbp_source_order_date],
          [tbp_created_by], [tbp_create_date], [tbp_last_modified_by], [tbp_last_modified_date]
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [order.tb_id, i + 1, p.articleIndex, p.article, p.amount, p.unit, p.purchasePrice, p.currency, p.requestedDeliveryDate,
        p.reservedFor, p.comment, p.sourceBestellindex, p.sourcePositionId, p.sourceOrderDate, userShortCode, now, userShortCode, now]);
    }
    return order;
  });
  sendEnvelope(res, { status: 201, data: mapOrder(created, await loadPositions(created.tb_id)), meta: { mandant: req.mandant }, error: null });
}));

router.put('/temp-purchase-orders/:id', requireMandant, asyncHandler(async (req, res) => {
  const accessScope = await getCustomerAccessScope(req.userIdentity, req.database);
  const id = Number(req.params.id);
  const companyId = Number(req.database?.firmaId || 0);
  const userShortCode = asText(req.userIdentity?.shortCode) || asText(req.userEmail) || 'APP';
  const existing = await loadOrderForUser(id, companyId, userShortCode, accessScope.isFullAccess);
  if (!existing) throw createHttpError(404, 'Bestellung nicht gefunden.', { code: 'RESOURCE_NOT_FOUND' });
  if (!isEditable(normalizeStatus(existing.status))) throw createHttpError(409, 'Diese Bestellung ist nicht mehr bearbeitbar.', { code: 'PURCHASE_ORDER_LOCKED' });
  const supplier = await assertSupplier(req.database, asText(req.body?.supplierId || existing.supplierId), accessScope);
  const positions = normalizePositions(req.body?.positions);
  const loading = await resolveLoadingAddress(req.database, req.body);
  await validateWorkingDates(positions, loading.address || null);
  const now = new Date().toISOString();
  await withSqlTransaction(config.sql.database, async ({ query }) => {
    await query(`UPDATE ${TEMP_PURCHASE_ORDER_TABLE} SET [tb_supplier_id]=?, [tb_supplier_name]=?, [tb_supplier_address]=?, [tb_supplier_contact]=?, [tb_payment_condition_changed]=?, [tb_payment_condition_id]=?, [tb_payment_condition_text]=?, [tb_delivery_term_id]=?, [tb_delivery_term_text]=?, [tb_packaging_type]=?, [tb_loading_location_source]=?, [tb_loading_location_id]=?, [tb_loading_location_text]=?, [tb_loading_location_changed]=?, [tb_comment]=?, [tb_last_modified_by]=?, [tb_last_modified_date]=? WHERE [tb_id]=? AND [tb_company_id]=?`, [asText(req.body?.supplierId || existing.supplierId), asText(supplier.kd_Name1 || supplier.kd_Name2), [supplier.kd_Strasse, [supplier.kd_PLZ, supplier.kd_Ort].filter(Boolean).join(' '), supplier.kd_LK].filter(Boolean).join(', '), asText(req.body?.supplierContact) || null, req.body?.paymentConditionChanged ? 1 : 0, asNumber(req.body?.paymentConditionId), asText(req.body?.paymentConditionText) || null, asNumber(req.body?.deliveryTermId), asText(req.body?.deliveryTermText) || null, asText(req.body?.packagingType) || null, 'mandant_delivery_address', loading.id, loading.text, req.body?.loadingLocationChanged ? 1 : 0, asText(req.body?.comment) || null, userShortCode, now, id, companyId]);
    await query(`DELETE FROM ${TEMP_PURCHASE_POSITION_TABLE} WHERE [tbp_tb_id] = ?`, [id]);
    for (let i = 0; i < positions.length; i += 1) {
      const p = positions[i];
      await query(`INSERT INTO ${TEMP_PURCHASE_POSITION_TABLE} ([tbp_tb_id],[tbp_line_no],[tbp_article_index],[tbp_article],[tbp_amount],[tbp_unit],[tbp_purchase_price],[tbp_currency],[tbp_requested_delivery_date],[tbp_reserved_for],[tbp_comment],[tbp_source_bestellindex],[tbp_source_position_id],[tbp_source_order_date],[tbp_created_by],[tbp_create_date],[tbp_last_modified_by],[tbp_last_modified_date]) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, i + 1, p.articleIndex, p.article, p.amount, p.unit, p.purchasePrice, p.currency, p.requestedDeliveryDate, p.reservedFor, p.comment, p.sourceBestellindex, p.sourcePositionId, p.sourceOrderDate, existing.createdBy || userShortCode, existing.createdAt || now, userShortCode, now]);
    }
  });
  const row = await loadOrderForUser(id, companyId, userShortCode, accessScope.isFullAccess);
  sendEnvelope(res, { status: 200, data: mapOrder(row, await loadPositions(id)), meta: { mandant: req.mandant }, error: null });
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
  const row = await loadOrderForUser(id, companyId, userShortCode, accessScope.isFullAccess);
  if (!row) throw createHttpError(404, 'Bestellung nicht gefunden.', { code: 'RESOURCE_NOT_FOUND' });
  const positions = await loadPositions(id);
  if (!positions.length) throw createHttpError(400, 'Die Bestellung benötigt mindestens eine Position.', { code: 'PURCHASE_POSITIONS_REQUIRED' });
  if (normalizeStatus(row.status) === STATUS.APP_FINALIZED || normalizeStatus(row.status) === STATUS.CS_ACCEPTED) {
    sendEnvelope(res, { status: 200, data: mapOrder(row, positions), meta: { alreadyFinalized: true }, error: null });
    return;
  }
  const loading = await resolveLoadingAddress(req.database, row);
  await validateWorkingDates(positions.map((p) => ({ requestedDeliveryDate: p.requestedDeliveryDate })), loading.address || null);
  const now = new Date().toISOString();
  await runSQLQuerySqlServer(config.sql.database, `UPDATE ${TEMP_PURCHASE_ORDER_TABLE} SET [tb_status]=1, [tb_return_comment]=NULL, [tb_completed_by]=?, [tb_closing_date]=?, [tb_last_modified_by]=?, [tb_last_modified_date]=? WHERE [tb_id]=? AND [tb_company_id]=? AND [tb_status] IN (0,3)`, [userShortCode, now, userShortCode, now, id, companyId]);
  const updated = await loadOrderForUser(id, companyId, userShortCode, accessScope.isFullAccess);
  const updatedPositions = await loadPositions(id);
  const mapped = mapOrder(updated, updatedPositions);
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
        beNumber: asText(position.sourceBestellindex),
        amountKg: Number(position.amount),
        unit: asText(position.unit) || 'kg',
        referenceId: String(id),
        supplierName: asText(mapped.supplierName),
        payloadJson: {
          tempPurchaseOrderId: id,
          supplierId: mapped.supplierId,
          supplierName: mapped.supplierName,
          sourceBestellindex: position.sourceBestellindex || null,
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
