const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const logger = require('../logger');
const { asyncHandler, createHttpError, sendEnvelope, parseListParams } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { pilotFeaturesForIdentity } = require('../pilot-features');
const { requirePilotFeature } = require('../middlewares/pilot-feature.middleware');
const { runSQLQueryAccess, runSQLQuerySqlServer, withSqlTransaction } = require('../db/access');
const { appTableSql } = require('../db/app-tables');
const { attachmentUploadMiddleware, parsePurchaseBody, normalizeAttachmentInput, buildContentDisposition,
  loadPurchaseOrderAttachments, withPurchaseOrderAttachments, savePurchaseOrderAttachments, syncPurchaseOptionPdf } = require('../db/purchase-order-attachments');
const { getCustomerAccessScope, loadVisibleCustomer } = require('../db/customer-access');
const { loadPurchaseOptions, loadSupplierTerms, loadPurchaseWarehouses, loadPurchasePaymentText, loadLatestPurchase, loadPurchaseLocations, findPackaging, packagingKey, enrichPurchaseArticleNames } = require('../db/purchase-order-values');
const { loadCustomerDeliveryAddresses } = require('../db/delivery-addresses');
const { procurementSchemaReady, assertProcurementAccess, loadPurchaseOrderLinks } = require('../db/linked-procurement');
const { PURCHASE_RESERVATION_STATUS, reservePurchaseOrderPosition, removePurchaseReservation } = require('../db/purchase-order-reservation');
const { loadHolidayRows } = require('../db/holidays');
const {
  getHolidayStatus,
  getNextWorkingDate,
  resolveHolidayProfile,
} = require('../delivery-calendar');
const { queuePurchaseOrderCsMail, processPurchaseOrderCsMailOutboxById } = require('../db/purchase-order-mail-outbox');
const { resolveOrderMailRecipient, validateOrderMailConfig } = require('../mail/order-mail');
const { appendTimelineEntries } = require('../db/timeline');
const { loadOptionPosition, validateOptionArticle, validateOptionSupplier,assertOptionQuantities } = require('../options/purchase-source');
const { manualPurchaseLocation } = require('../options/manual-purchase-location');
const TIMELINE_TABLE = appTableSql('timeline');

const router = express.Router();
const requirePurchaseOrders = requirePilotFeature('purchaseOrders');
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
    supplierContactId: asNumber(row.supplierContactId),
    warehouseId: asText(row.warehouseId),
    addressCustomerId: asText(row.addressCustomerId),
    addressId: asNumber(row.addressId),
    reference: asText(row.reference),
    currency: asText(row.currency) || asText(positions[0]?.currency) || 'EUR',
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
      orderPositionId: asNumber(position.orderPositionId),
      lineNo: Number(position.lineNo),
      articleIndex: asText(position.articleIndex),
      article: asText(position.article),
      masterArticleName: asText(position.masterArticleName),
      amount: asNumber(position.amount, 0) * (/^(t|to|tonne[n]?)$/i.test(asText(position.unit)) ? 1000 : 1),
      unit: 'kg',
      purchasePrice: asNumber(position.purchasePrice, 0),
      currency: asText(row.currency || position.currency) || 'EUR',
      placeAtSupplier: asText(position.placeAtSupplier),
      pickupReference: asText(position.pickupReference),
      availabilityNote: asText(position.availabilityNote),
      requestedDeliveryDate: asDate(position.requestedDeliveryDate),
      reservedFor: asText(position.reservedFor),
      comment: asText(position.comment),
      originalPackagingType: asText(position.originalPackagingType),
      originalPackagingTypeId: asNumber(position.originalPackagingTypeId),
      packagingTypeChanged: Boolean(position.packagingTypeChanged),
      optionId: asNumber(position.optionId),
      optionPositionId: asNumber(position.optionPositionId),
      supplierConfirmed: position.optionId != null,
      articleConfirmed: position.optionId != null,
      acknowledgeUnverifiedMfi: Boolean(position.acknowledgeUnverifiedMfi),
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
      [tb_supplier_contact_id] AS supplierContactId,
      [tb_warehouse_id] AS warehouseId,
      [tb_address_customer_id] AS addressCustomerId,
      [tb_address_id] AS addressId,
      [tb_reference] AS reference,
      [tb_currency] AS currency,
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
      [tbp_order_position_id] AS orderPositionId,
      [tbp_line_no] AS [lineNo],
      [tbp_article_index] AS articleIndex,
      [tbp_article] AS article,
      [tbp_amount] AS amount,
      [tbp_unit] AS unit,
      [tbp_purchase_price] AS purchasePrice,
      [tbp_currency] AS currency,
      [tbp_place_at_supplier] AS placeAtSupplier,
      [tbp_pickup_reference] AS pickupReference,
      [tbp_availability_note] AS availabilityNote,
      [tbp_requested_delivery_date] AS requestedDeliveryDate,
      [tbp_reserved_for] AS reservedFor,
      [tbp_comment] AS comment,
      [tbp_original_packaging_type] AS originalPackagingType,
      [tbp_original_packaging_type_id] AS originalPackagingTypeId,
      [tbp_packaging_type_changed] AS packagingTypeChanged,
      [OptionID] AS optionId,[OptionPositionID] AS optionPositionId,
      [tbp_option_mfi_acknowledged] AS acknowledgeUnverifiedMfi
    FROM ${TEMP_PURCHASE_POSITION_TABLE}
    WHERE [tbp_tb_id] = ?
    ORDER BY [tbp_line_no] ASC
  `, [orderId]);
  return Array.isArray(result) ? result : result.rows || [];
}

async function loadPurchaseLoadingContext(database, supplierId, articleIndexes) {
  return { customerId: '', addresses: await loadPurchaseLocations(database, supplierId, articleIndexes, { supplierWide: true }), source: 'supplier_order_history' };
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

function buildPurchaseCreatedPeriodFilter(period) {
  const normalized = ['today', 'week'].includes(asText(period).toLowerCase()) ? asText(period).toLowerCase() : 'all';
  const today = 'CONVERT(date, GETDATE())';
  if (normalized === 'today') return { period: normalized, whereSql: ` AND [tb_create_date] >= ${today} AND [tb_create_date] < DATEADD(DAY,1,${today})` };
  if (normalized === 'week') {
    const offset = `(DATEDIFF(DAY,CONVERT(date,'19000101',112),${today}) % 7)`;
    return { period: normalized, whereSql: ` AND [tb_create_date] >= DATEADD(DAY,-${offset},${today}) AND [tb_create_date] < DATEADD(DAY,7-${offset},${today})` };
  }
  return { period: normalized, whereSql: '' };
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
    FROM [dbo].[tblKunden] k
    WHERE k.kd_KdNR=? AND (EXISTS(SELECT 1 FROM dbo.tblKun_Lieferanten l WHERE l.kdLi_Lieferanten_Nr=k.kd_KdNR)
      OR EXISTS(SELECT 1 FROM dbo.tblBestellung b WHERE b.be_KdNr=k.kd_KdNR))
  `, [supplierId]);
  const accounts = rows?.length ? [] : await runSQLQuerySqlServer(config.sql.database, `SELECT TOP 1 1 AS ok
    FROM BMSApp.tblOptionenLieferantenKonto WHERE olk_MandantID=? AND olk_LieferantenNummer=? AND olk_Aktiv=1`, [Number(database.firmaId),supplierId]);
  if ((!rows?.length && !accounts.length) || /gelöscht/i.test(`${customer.kd_Name1 || ''} ${customer.kd_Name2 || ''}`))
    throw createHttpError(400, 'Der ausgewählte Kunde ist kein verfügbarer Lieferant.', { code: 'CUSTOMER_NOT_SUPPLIER' });
  return customer;
}

function purchaseText(value, maxLength, field) {
  const text = asText(value);
  if (text.length > maxLength) {
    throw createHttpError(400, `${field} darf höchstens ${maxLength} Zeichen haben.`, { code: 'PURCHASE_FIELD_TOO_LONG', field, maxLength });
  }
  return text || null;
}

function purchaseArticleText(value) {
  return asText(value).slice(0, 75).replace(/[\uD800-\uDBFF]$/, '').trimEnd();
}

function purchaseCurrency(value) {
  const currency = asText(value).toUpperCase() || 'EUR';
  if (!['EUR', 'USD'].includes(currency)) {
    throw createHttpError(400, 'Bitte EUR oder USD als Bestellwährung auswählen.', { code: 'PURCHASE_CURRENCY_INVALID' });
  }
  return currency;
}

async function loadPurchaseAddressChoices(req, { supplierId, warehouseId, addressCustomerId, deliveryTermText }, accessScope) {
  const [warehouse] = warehouseId ? await loadPurchaseWarehouses(req.database, supplierId, warehouseId) : [];
  if (!warehouse || warehouse.id !== warehouseId) {
    throw createHttpError(400, 'Bitte ein Lager dieses Lieferanten oder das Streckenlager auswählen.', { code: 'PURCHASE_WAREHOUSE_REQUIRED' });
  }
  const customerId = purchaseText(addressCustomerId, 10, 'Adress-Kundennummer');
  const validOwner = customerId && (/^(FCA|EXW)\b/i.test(deliveryTermText)
    ? customerId === supplierId
    : warehouse.isDirect
      ? await loadVisibleCustomer(req.database, customerId, accessScope)
      : warehouse.owners.some(owner => owner.id === customerId));
  if (!validOwner) {
    throw createHttpError(400, 'Bitte einen gültigen Adressinhaber für diese Lieferung oder Abholung auswählen.', { code: 'PURCHASE_ADDRESS_OWNER_INVALID' });
  }
  return { warehouse, customerId, addresses: await loadCustomerDeliveryAddresses(req.database, customerId) };
}

async function resolvePurchaseAddress(req, body, accessScope) {
  if (body.loadingLocationSource === 'manual' && (body.loadingLocationChanged === true || body.loadingLocationChanged === 'true' || body.loadingLocationChanged === 1)) {
    const address = manualPurchaseLocation(body.loadingLocationText, body.loadingLocationCity, body.deliveryTermText);
    const warehouseId = asText(body.warehouseId);
    const [warehouse] = warehouseId ? await loadPurchaseWarehouses(req.database, body.supplierId, warehouseId) : [];
    if (!warehouse || warehouse.id !== warehouseId) {
      throw createHttpError(400, 'Bitte ein Lager dieses Lieferanten oder das Streckenlager auswählen.', { code: 'PURCHASE_WAREHOUSE_REQUIRED' });
    }
    return { warehouseId, isDirect: warehouse.isDirect, pickup: true, customerId: null, id: null,
      address, text: address.text, source: 'manual', changed: true };
  }
  const { warehouse, customerId, addresses } = await loadPurchaseAddressChoices(req, body, accessScope);
  const address = addresses.find(item => item.id === asText(body.addressId));
  if (!address?.text) {
    throw createHttpError(400, 'Bitte eine Liefer- oder Abholadresse aus dem Stamm auswählen.', { code: 'PURCHASE_ADDRESS_REQUIRED' });
  }
  return { warehouseId: warehouse.id, isDirect: warehouse.isDirect,
    pickup: /^(FCA|EXW)\b/i.test(body.deliveryTermText), customerId, id: Number(address.id), address, text: address.text, source: 'master', changed: false };
}

function applyPurchaseLogistics(positions, loading, storedPositions = []) {
  for (const position of positions) {
    const stored = storedPositions.find(item => item.id === (position.id || position.copyOfPositionId));
    const city = loading.isDirect && loading.pickup ? asText(loading.address.city).slice(0, 25) : '';
    position.placeAtSupplier = city || stored?.placeAtSupplier || position.placeAtSupplier || null;
    position.pickupReference = stored?.pickupReference || position.pickupReference || null;
  }
}

function resolveSupplierContact(terms, value) {
  if (!asText(value)) return null;
  const contact = terms.contacts.find(item => String(item.id) === asText(value));
  if (!contact) {
    throw createHttpError(400, 'Bitte einen Ansprechpartner dieses Lieferanten auswählen.', { code: 'PURCHASE_SUPPLIER_CONTACT_INVALID' });
  }
  return contact;
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
      articleIndex: asText(item?.articleIndex),
      article,
      amount: ['t', 'to', 'tonne', 'tonnen'].includes(unit) ? amount * 1000 : amount,
      unit: 'kg',
      purchasePrice: price,
      placeAtSupplier: purchaseText(item?.placeAtSupplier, 25, 'Lager bei Strecke'),
      pickupReference: purchaseText(item?.pickupReference, 25, 'Abholreferenz'),
      availabilityNote: purchaseText(item?.availabilityNote, 255, 'Bemerkung für die Verfügbarkeitsliste'),
      requestedDeliveryDate,
      reservedFor: asText(item?.reservedFor) || null,
      comment: asText(item?.comment) || null,
      copyOfPositionId: asNumber(item?.copyOfPositionId),
      optionId: item?.optionId == null ? null : Number(item.optionId),
      optionPositionId: item?.optionPositionId == null ? null : Number(item.optionPositionId),
      supplierConfirmed: item?.supplierConfirmed === true,
      articleConfirmed: item?.articleConfirmed === true,
      acknowledgeUnverifiedMfi: item?.acknowledgeUnverifiedMfi === true,
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

async function linkedPurchasePositions(query, id) {
  return (await query(`SELECT pp.[tbp_id] AS id,pp.[tbp_amount] AS amount,pp.[tbp_article_index] AS articleIndex,
      CASE WHEN o.ta_Status=${PURCHASE_RESERVATION_STATUS} THEN o.ta_id END AS reservedOrderId
    FROM ${TEMP_PURCHASE_POSITION_TABLE} pp
    JOIN ${appTableSql('tempOrderPosition')} p ON p.tap_id=pp.tbp_order_position_id
    JOIN ${appTableSql('tempOrder')} o ON o.ta_id=p.tap_ta_id
    WHERE pp.tbp_tb_id=?`, [id])).rows;
}

async function deletePurchaseForUser(id, companyId, userShortCode, isFullAccess) {
  if (!Number.isInteger(id) || id <= 0) throw createHttpError(400, 'Ungültige Bestellnummer.');
  const checkProcurement = await procurementSchemaReady();
  return withSqlTransaction(config.sql.database, async ({ query }) => {
    const ownerSql = isFullAccess ? '' : ' AND [tb_created_by]=?';
    const params = isFullAccess ? [id, companyId] : [id, companyId, userShortCode];
    const locked = await query(`${orderSelectSql()} WITH (UPDLOCK,HOLDLOCK) WHERE [tb_id]=? AND [tb_company_id]=?${ownerSql}`, params);
    const row = locked.rows[0];
    // Retrying a successfully completed DELETE is harmless, including when
    // its first HTTP response was lost. Owner/tenant filtering stays in SQL.
    if (!row) return { id, deleted: true };
    if (!isEditable(normalizeStatus(row.status))) throw createHttpError(409, 'Diese Bestellung kann nicht gelöscht werden.', { code: 'PURCHASE_ORDER_LOCKED' });
    const linked = checkProcurement ? await linkedPurchasePositions(query, id) : [];
    if (linked.some(position => position.reservedOrderId == null)) {
      throw createHttpError(409, 'Bitte den verknüpften Auftrag öffnen, um den Vorgang zu löschen.', { code: 'PURCHASE_ORDER_LINKED' });
    }
    for (const [tableKey, column] of [['purchaseOrderMailOutbox', 'pom_PurchaseOrderID'], ['purchaseOrderCsMailOutbox', 'pcom_PurchaseOrderID']]) {
      const table = appTableSql(tableKey);
      await query(`IF OBJECT_ID(?, N'U') IS NOT NULL DELETE FROM ${table} WHERE [${column}]=?`, [table, id]);
    }
    await query(`DELETE FROM ${TEMP_PURCHASE_POSITION_TABLE} WHERE [tbp_tb_id]=?`, [id]);
    for (const orderId of new Set(linked.map(position => position.reservedOrderId))) {
      await removePurchaseReservation(query, orderId, companyId);
    }
    await query(`DELETE FROM ${TEMP_PURCHASE_ORDER_TABLE} WHERE [tb_id]=? AND [tb_company_id]=?`, [id, companyId]);
    return { id, deleted: true };
  });
}

router.get('/purchase-order-loading-locations', requirePurchaseOrders, requireMandant, asyncHandler(async (req, res) => {
  const accessScope = await getCustomerAccessScope(req.userIdentity, req.database);
  const supplierId = asText(req.query?.supplierId);
  await assertSupplier(req.database, supplierId, accessScope);
  const ids = Array.isArray(req.query?.articleIndex) ? req.query.articleIndex : [req.query?.articleIndex].filter(Boolean);
  const context = await loadPurchaseLoadingContext(req.database, supplierId, ids);
  sendEnvelope(res, { data: context.addresses, meta: { count: context.addresses.length, source: context.source } });
}));

router.get('/purchase-order-options', requirePurchaseOrders, requireMandant, asyncHandler(async (req, res) => {
  const supplierId = asText(req.query?.supplierId);
  const scope = await getCustomerAccessScope(req.userIdentity, req.database);
  const supplier = await assertSupplier(req.database, supplierId, scope);
  const lang = req.header('x-lang') === 'en' ? 'en' : 'de';
  const [options, defaults, warehouses] = await Promise.all([
    loadPurchaseOptions(req.database, lang), loadSupplierTerms(req.database, supplierId, lang), loadPurchaseWarehouses(req.database, supplierId),
  ]);
  const supplierAddress = {
    name: asText(supplier.kd_Name1) || asText(supplier.kd_Name2),
    street: asText(supplier.kd_Strasse),
    postalCode: asText(supplier.kd_PLZ),
    city: asText(supplier.kd_Ort),
    countryCode: asText(supplier.kd_LK),
  };
  sendEnvelope(res, { data: { ...options, defaults, supplierAddress, warehouses } });
}));

router.get('/purchase-order-addresses', requirePurchaseOrders, requireMandant, asyncHandler(async (req, res) => {
  const scope = await getCustomerAccessScope(req.userIdentity, req.database);
  const supplierId = asText(req.query?.supplierId);
  await assertSupplier(req.database, supplierId, scope);
  const { incoterms } = await loadPurchaseOptions(req.database, req.header('x-lang') === 'en' ? 'en' : 'de');
  const incoterm = incoterms.find(item => item.id === Number(req.query?.deliveryTermId));
  if (!incoterm) throw createHttpError(400, 'Bitte eine gültige Lieferbedingung auswählen.', { code: 'PURCHASE_HEADER_INVALID' });
  if (req.query?.combined === '1') {
    const warehouses = await loadPurchaseWarehouses(req.database, supplierId);
    const pickup = /^(FCA|EXW)\b/i.test(incoterm.text);
    const directWarehouses = warehouses.filter(warehouse => warehouse.isDirect);
    const directWarehouse = directWarehouses.length === 1 ? directWarehouses[0] : null;
    const requestedCustomer = asText(req.query?.addressCustomerId);
    let sources;
    if (pickup) {
      const selected = warehouses.find(warehouse => warehouse.id === asText(req.query?.selectedWarehouseId)) || directWarehouse;
      sources = selected ? [{ warehouse: selected, customerId: supplierId }] : [];
    } else if (requestedCustomer) {
      if (!directWarehouse || !await loadVisibleCustomer(req.database, requestedCustomer, scope)) {
        throw createHttpError(400, 'Bitte einen gültigen Lieferkunden auswählen.', { code: 'PURCHASE_ADDRESS_OWNER_INVALID' });
      }
      sources = [{ warehouse: directWarehouse, customerId: requestedCustomer }];
    } else {
      sources = warehouses.filter(warehouse => !warehouse.isDirect).flatMap(warehouse =>
        warehouse.owners.map(owner => ({ warehouse, customerId: owner.id })));
    }
    const customerIds = [...new Set(sources.map(source => source.customerId))];
    const addressLists = new Map(await Promise.all(customerIds.map(async customerId =>
      [customerId, await loadCustomerDeliveryAddresses(req.database, customerId)])));
    const choices = sources.flatMap(({ warehouse, customerId }) =>
      addressLists.get(customerId).filter(address => address.text).map(address => ({
        ...address, warehouseId: warehouse.id, addressCustomerId: customerId, addressId: Number(address.id),
        warehouseName: pickup || warehouse.isDirect ? '' : warehouse.label,
      })));
    const uniqueChoices = [...new Map(choices.map(choice =>
      [JSON.stringify([choice.warehouseId, choice.addressCustomerId, choice.addressId]), choice])).values()];
    sendEnvelope(res, { data: uniqueChoices, meta: { canDeliverToCustomer: !pickup && Boolean(directWarehouse),
      ...(pickup ? { pickupWarehouseId: sources[0]?.warehouse.id ?? null } : {}) } });
    return;
  }
  const { addresses } = await loadPurchaseAddressChoices(req, {
    supplierId, warehouseId: asText(req.query?.warehouseId), addressCustomerId: req.query?.addressCustomerId,
    deliveryTermText: incoterm.text,
  }, scope);
  sendEnvelope(res, { data: addresses });
}));

router.get('/customers/:supplierId/procured-articles/:articleIndex/purchase-defaults', requirePurchaseOrders, requireMandant, asyncHandler(async (req, res) => {
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
  const currency = purchaseCurrency(req.body?.currency);
  const reference = purchaseText(req.body?.reference, 100, 'Referenz');
  const contact = resolveSupplierContact(terms, req.body?.supplierContactId);
  const catalogArticle = await assertPurchaseArticle(req.database, positions[0].articleIndex);
  const latestByArticle = new Map();
  for (const position of positions) {
    if (!position.articleIndex) throw createHttpError(400, 'Artikelindex fehlt.', { code: 'PURCHASE_POSITION_INVALID' });
    const stored = storedPositions.find((p) => p.id === (position.id || position.copyOfPositionId) && p.articleIndex === position.articleIndex);
    if (stored?.optionId != null && (position.optionId!==stored.optionId || position.optionPositionId!==stored.optionPositionId))
      throw createHttpError(422,'Die Optionsherkunft einer gespeicherten Position kann nicht geändert werden.',{code:'OPTION_REFERENCE_CHANGED'});
    if (position.optionId != null || position.optionPositionId != null) {
      if (position.supplierConfirmed!==true || position.articleConfirmed!==true)
        throw createHttpError(422,'Bitte Lieferant und Artikel ausdrücklich bestätigen.',{code:'OPTION_SELECTION_REQUIRED'});
      const source = await loadOptionPosition(position.optionId,position.optionPositionId,null,{identity:req.userIdentity});
      await validateOptionSupplier(req.database,source,supplierId);
      const article = await validateOptionArticle(req.database,source,position);
      position.article = purchaseArticleText(source.opp_Artikelname_Lieferant || article.supplierArticleName || article.articleName);
      position.optionSourceChanged = source.sourceVersion;
      position.originalPackagingType = stored?.originalPackagingType || source.opp_Verpackung || source.op_Verpackung || source.packagingText || null;
      const originalOption = findPackaging(options.packagingTypes,position.originalPackagingType);
      position.originalPackagingTypeId = originalOption?.id || null;
      position.packagingTypeChanged = originalOption ? packaging.id!==originalOption.id : packagingKey(packaging.text)!==packagingKey(position.originalPackagingType);
      continue;
    }
    if (!latestByArticle.has(position.articleIndex)) latestByArticle.set(position.articleIndex, await loadLatestPurchase(req.database, supplierId, position.articleIndex));
    const latest = latestByArticle.get(position.articleIndex);
    if (!latest) {
      if (!pilotFeaturesForIdentity(req.userIdentity).linkedProcurement) {
        throw createHttpError(400, 'Der Artikel gehört nicht zum gewählten Lieferanten.', { code: 'PURCHASE_POSITION_INVALID' });
      }
      position.article = purchaseArticleText(catalogArticle.article);
      position.originalPackagingType = stored?.originalPackagingType || null;
      position.originalPackagingTypeId = stored?.originalPackagingTypeId || null;
      position.packagingTypeChanged = Boolean(position.originalPackagingType && packagingKey(packaging.text) !== packagingKey(position.originalPackagingType));
      continue;
    }
    const original = stored?.originalPackagingType || (stored ? existing?.packagingType : latest.originalPackagingType);
    const originalOption = findPackaging(options.packagingTypes, original);
    position.article = purchaseArticleText(latest.article || catalogArticle.article);
    position.originalPackagingType = asText(original) || null;
    position.originalPackagingTypeId = originalOption?.id || null;
    position.packagingTypeChanged = originalOption ? packaging.id !== originalOption.id : packagingKey(packaging.text) !== packagingKey(original);
  }
  // Terms from purchase history and existing default snapshots take precedence.
  let payment = existing || terms;
  const selectedId = req.body?.paymentConditionId;
  if ((!payment.paymentConditionText || payment.paymentConditionChanged) && asText(selectedId)
    && (!payment.paymentConditionText || Number(selectedId) !== Number(payment.paymentConditionId))) {
    const paymentConditionId = Number(selectedId);
    const paymentConditionText = Number.isSafeInteger(paymentConditionId) && paymentConditionId > 0
      ? await loadPurchasePaymentText(paymentConditionId, lang) : '';
    if (!paymentConditionText) {
      throw createHttpError(400, 'Bitte ein gültiges Zahlungsziel auswählen.', { code: 'PURCHASE_PAYMENT_CONDITION_INVALID' });
    }
    payment = { paymentConditionId, paymentConditionText, paymentConditionChanged: true };
  }
  const scope = await getCustomerAccessScope(req.userIdentity, req.database);
  const loading = await resolvePurchaseAddress(req, { ...req.body, supplierId, deliveryTermText: incoterm.text }, scope);
  applyPurchaseLogistics(positions, loading, storedPositions);
  await validateWorkingDates(positions, loading.address);
  return { positions, loading, packaging, incoterm, payment, currency, reference, contact };
}

async function assertPurchaseArticle(database, articleIndex) {
  if (!articleIndex) throw createHttpError(400, 'Artikelindex fehlt.', { code: 'PURCHASE_POSITION_INVALID' });
  const [article] = await runSQLQueryAccess(database, `
    SELECT [agA_Artikelname] AS article FROM [dbo].[tblArt_Artikel]
    WHERE [agA_Artikelindex]=? AND COALESCE([agA_Deaktiv],0)=0
  `, [articleIndex]);
  if (!article?.article) throw createHttpError(422, 'Aktiver Artikel im Stamm nicht gefunden.', { code: 'PURCHASE_POSITION_INVALID' });
  return article;
}

async function insertPurchasePositions(query, id, positions, currency, user, now, createdBy = user, createdAt = now) {
  for (let i = 0; i < positions.length; i += 1) {
    const p = positions[i];
    await query(`INSERT INTO ${TEMP_PURCHASE_POSITION_TABLE} (
      [tbp_tb_id],[tbp_line_no],[tbp_article_index],[tbp_article],[tbp_amount],[tbp_unit],[tbp_purchase_price],[tbp_currency],
      [tbp_requested_delivery_date],[tbp_reserved_for],[tbp_comment],[tbp_original_packaging_type],[tbp_original_packaging_type_id],[tbp_packaging_type_changed],
      [tbp_created_by],[tbp_create_date],[tbp_last_modified_by],[tbp_last_modified_date],
      [OptionID],[OptionPositionID],[tbp_option_mfi_acknowledged],[tbp_place_at_supplier],[tbp_pickup_reference],[tbp_availability_note])
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, i + 1, p.articleIndex, p.article, p.amount, p.unit, p.purchasePrice, currency, p.requestedDeliveryDate, p.reservedFor, p.comment,
      p.originalPackagingType, p.originalPackagingTypeId, p.packagingTypeChanged ? 1 : 0, createdBy, createdAt, user, now,
      p.optionId,p.optionPositionId,p.acknowledgeUnverifiedMfi ? 1 : 0,p.placeAtSupplier,p.pickupReference,p.availabilityNote]);
  }
}

router.get('/temp-purchase-orders', requirePurchaseOrders, requireMandant, asyncHandler(async (req, res) => {
  const accessScope = await getCustomerAccessScope(req.userIdentity, req.database);
  const userShortCode = asText(req.userIdentity?.shortCode);
  const companyId = Number(req.database?.firmaId || 0);
  const { page, pageSize } = parseListParams(req.query, { page: 1, pageSize: 20, sort: 'createdAt', dir: 'DESC' });
  const q = asText(req.query.q);
  const statusFilter = buildPurchaseStatusFilter(req.query.status);
  const createdFilter = buildPurchaseCreatedPeriodFilter(req.query.createdPeriod);
  const ownerFilter = buildPurchaseOwnerFilter(userShortCode, accessScope.isFullAccess, req.query.ownerScope);
  const clauses = ['[tb_company_id] = ?'];
  const params = [companyId];
  if (ownerFilter.whereSql) { clauses.push(ownerFilter.whereSql.replace(/^\s*AND\s+/i, '')); params.push(...ownerFilter.params); }
  if (statusFilter.whereSql) { clauses.push(statusFilter.whereSql.replace(/^\s*AND\s+/i, '')); }
  if (createdFilter.whereSql) clauses.push(createdFilter.whereSql.replace(/^\s*AND\s+/i, ''));
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
  for (const row of (Array.isArray(rows) ? rows : [])) data.push(mapOrder(row, await enrichPurchaseArticleNames(req.database, row.supplierId, await loadPositions(row.id))));
  sendEnvelope(res, {
    status: 200,
    data,
    meta: {
      page,
      pageSize,
      total,
      mandant: req.mandant,
      status: statusFilter.status,
      createdPeriod: createdFilter.period,
      ownerScope: ownerFilter.scope,
      canViewAll: Boolean(accessScope.isFullAccess),
    },
    error: null,
  });
}));

router.get('/temp-purchase-orders/:id', requirePurchaseOrders, requireMandant, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const companyId = Number(req.database?.firmaId || 0);
  const accessScope = await getCustomerAccessScope(req.userIdentity, req.database);
  const row = await loadOrderForUser(id, companyId, asText(req.userIdentity?.shortCode), accessScope.isFullAccess);
  if (!row) throw createHttpError(404, 'Bestellung nicht gefunden.', { code: 'RESOURCE_NOT_FOUND' });
  const data = await withPurchaseOrderAttachments(mapOrder(row, await enrichPurchaseArticleNames(req.database, row.supplierId, await loadPositions(row.id))));
  if (pilotFeaturesForIdentity(req.userIdentity).linkedProcurement && await procurementSchemaReady()) {
    data.linkedOrderIds = await loadPurchaseOrderLinks(id, companyId);
  }
  sendEnvelope(res, { status: 200, data, meta: { mandant: req.mandant }, error: null });
}));

router.get('/temp-purchase-orders/:id/attachments/:attachmentId', requirePurchaseOrders, requireMandant, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const attachmentId = Number(req.params.attachmentId);
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(attachmentId) || attachmentId <= 0) {
    throw createHttpError(400, 'Ungültige Bestell- oder Anhangsnummer.');
  }
  const scope = await getCustomerAccessScope(req.userIdentity, req.database);
  const order = await loadOrderForUser(id, Number(req.database?.firmaId || 0), asText(req.userIdentity?.shortCode), scope.isFullAccess);
  if (!order) throw createHttpError(404, 'Bestellung nicht gefunden.', { code: 'RESOURCE_NOT_FOUND' });
  const [attachment] = await loadPurchaseOrderAttachments(id, { includeContent: true, attachmentId });
  if (!attachment) throw createHttpError(404, 'Anhang nicht gefunden.', { code: 'RESOURCE_NOT_FOUND' });
  res.setHeader('Content-Type', attachment.mimeType);
  res.setHeader('Content-Disposition', buildContentDisposition(attachment.fileName, `purchase-order-${id}-attachment-${attachmentId}`));
  res.setHeader('Cache-Control', 'no-store');
  res.send(attachment.buffer);
}));


async function preparePurchaseDraft(req) {
  const scope = await getCustomerAccessScope(req.userIdentity, req.database);
  const supplierId = asText(req.body?.supplierId);
  const supplier = await assertSupplier(req.database, supplierId, scope);
  const companyId = Number(req.database?.firmaId || 0);
  const user = asText(req.userIdentity?.shortCode) || asText(req.userEmail) || 'APP';
  const clientRequestId = isUuid(req.body?.clientRequestId) ? asText(req.body.clientRequestId) : crypto.randomUUID();
  const now = new Date().toISOString();
  const prepared = await preparePurchase(req, supplierId, req.body?.positions);
  return { ...prepared, supplier, supplierId, companyId, user, clientRequestId, now };
}

async function savePurchaseDraft(query, req, draft) {
  const { positions, loading, packaging, incoterm, payment, supplier, supplierId, companyId, user, clientRequestId, now,
    currency, reference, contact, reserveOrderPosition } = draft;
  const attachmentInput = normalizeAttachmentInput(req);
  if (attachmentInput.removeAttachmentIds.length) throw createHttpError(400, 'Eine neue Bestellung hat noch keine gespeicherten Anhänge.');
  const sources = await assertOptionQuantities(query,positions,null,packaging.text,req.userIdentity);
  const result = await query(`INSERT INTO ${TEMP_PURCHASE_ORDER_TABLE} (
    [tb_company_id],[tb_client_request_id],[tb_supplier_id],[tb_supplier_name],[tb_supplier_address],[tb_supplier_contact],
    [tb_payment_condition_changed],[tb_payment_condition_id],[tb_payment_condition_text],[tb_delivery_term_id],[tb_delivery_term_text],
    [tb_packaging_type],[tb_packaging_type_id],[tb_loading_location_source],[tb_loading_location_id],[tb_loading_location_text],[tb_loading_location_changed],
    [tb_comment],[tb_status],[tb_created_by],[tb_create_date],[tb_last_modified_by],[tb_last_modified_date],
    [tb_supplier_contact_id],[tb_warehouse_id],[tb_address_customer_id],[tb_address_id],[tb_reference],[tb_currency])
    OUTPUT INSERTED.[tb_id] AS id VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?)`,
  [companyId, clientRequestId, supplierId, asText(supplier.kd_Name1 || supplier.kd_Name2) || supplierId,
    [supplier.kd_Strasse, [supplier.kd_PLZ, supplier.kd_Ort].filter(Boolean).join(' '), supplier.kd_LK].filter(Boolean).join(', '), contact?.name || null,
    payment.paymentConditionChanged ? 1 : 0, payment.paymentConditionId, payment.paymentConditionText || null, incoterm.id, incoterm.text, packaging.text, packaging.id,
    loading.source, loading.id, loading.text, Number(loading.changed), asText(req.body?.comment) || null, user, now, user, now,
    contact?.id ?? null, loading.warehouseId, loading.customerId, loading.id, reference, currency]);
  const id = result.rows[0].id;
  await insertPurchasePositions(query, id, positions, currency, user, now);
  if (reserveOrderPosition) {
    await reservePurchaseOrderPosition(query, { companyId, user, purchaseId: id, position: positions[0] });
  }
  const saved = await query(`${orderSelectSql()} WHERE [tb_id]=?`, [id]);
  const order = mapOrder(saved.rows[0], await loadPositions(id, query));
  if (sources.size) await syncPurchaseOptionPdf(query, { order, sources, user, now });
  await savePurchaseOrderAttachments(query, { orderId: id, ...attachmentInput, user, now });
  return withPurchaseOrderAttachments(order, query);
}

router.post('/temp-purchase-orders', requirePurchaseOrders, requireMandant, attachmentUploadMiddleware, asyncHandler(async (req, res) => {
  parsePurchaseBody(req);
  const reserveOrderPosition = req.body?.reserveOrderPosition === true || req.body?.reserveOrderPosition === 'true';
  if (reserveOrderPosition) {
    assertProcurementAccess(req.userIdentity);
    if (!isUuid(req.body?.clientRequestId) || req.body?.positions?.length !== 1) {
      throw createHttpError(400, 'Für die vorgezogene Bestellung ist eine einzelne Auftragsposition erforderlich.', {
        code: 'PURCHASE_RESERVATION_INVALID',
      });
    }
    if (!await procurementSchemaReady()) {
      throw createHttpError(503, 'Die Auftragsverknüpfung steht noch nicht zur Verfügung.', { code: 'PROCUREMENT_SCHEMA_MISSING' });
    }
  }
  const scope = await getCustomerAccessScope(req.userIdentity, req.database);
  const supplierId = asText(req.body?.supplierId);
  const supplier = await assertSupplier(req.database, supplierId, scope);
  const companyId = Number(req.database?.firmaId || 0);
  const user = asText(req.userIdentity?.shortCode) || asText(req.userEmail) || 'APP';
  const clientRequestId = isUuid(req.body?.clientRequestId) ? asText(req.body.clientRequestId) : crypto.randomUUID();
  const prior = await runSQLQuerySqlServer(config.sql.database, `${orderSelectSql()} WHERE [tb_company_id]=? AND [tb_client_request_id]=?`, [companyId, clientRequestId]);
  if (prior[0]) {
    if (asText(prior[0].createdBy).toLowerCase() !== user.toLowerCase()) throw createHttpError(409, 'Anfragekennung bereits verwendet.');
    sendEnvelope(res, { data: await withPurchaseOrderAttachments(mapOrder(prior[0], await loadPositions(prior[0].id))), meta: { alreadyCreated: true } });
    return;
  }
  const draft = { ...await preparePurchase(req, supplierId, req.body?.positions), supplier, supplierId, companyId, user, clientRequestId,
    reserveOrderPosition, now: new Date().toISOString() };
  if (reserveOrderPosition && (!Number.isSafeInteger(draft.positions[0].amount) || draft.positions[0].amount > 2147483647
    || Math.round(draft.positions[0].purchasePrice) <= 0)) {
    throw createHttpError(400, 'Für die Auftragsverknüpfung sind eine Menge in ganzen Kilogramm und ein positiver Einkaufspreis erforderlich.', {
      code: 'PURCHASE_RESERVATION_INVALID',
    });
  }
  const created = await withSqlTransaction(config.sql.database, async ({ query }) => {
    const retry = await query(`${orderSelectSql()} WITH (UPDLOCK, HOLDLOCK) WHERE [tb_company_id]=? AND [tb_client_request_id]=?`, [companyId, clientRequestId]);
    if (retry.rows[0]) {
      if (asText(retry.rows[0].createdBy).toLowerCase() !== user.toLowerCase()) throw createHttpError(409, 'Anfragekennung bereits verwendet.');
      return withPurchaseOrderAttachments(mapOrder(retry.rows[0], await loadPositions(retry.rows[0].id, query)), query);
    }
    return savePurchaseDraft(query, req, draft);
  });
  sendEnvelope(res, { status: 201, data: created, meta: { mandant: req.mandant } });
}));

router.put('/temp-purchase-orders/:id', requirePurchaseOrders, requireMandant, attachmentUploadMiddleware, asyncHandler(async (req, res) => {
  parsePurchaseBody(req);
  const scope = await getCustomerAccessScope(req.userIdentity, req.database);
  const id = Number(req.params.id);
  const companyId = Number(req.database?.firmaId || 0);
  const user = asText(req.userIdentity?.shortCode) || asText(req.userEmail) || 'APP';
  const existing = await loadOrderForUser(id, companyId, user, scope.isFullAccess);
  if (!existing) throw createHttpError(404, 'Bestellung nicht gefunden.', { code: 'RESOURCE_NOT_FOUND' });
  if (!isEditable(normalizeStatus(existing.status))) throw createHttpError(409, 'Diese Bestellung ist nicht mehr bearbeitbar.', { code: 'PURCHASE_ORDER_LOCKED' });
  if (req.body?.supplierId && asText(req.body.supplierId) !== existing.supplierId) throw createHttpError(400, 'Der Lieferant einer Bestellung kann nicht geändert werden.');
  if (Array.isArray(req.body?.positions) && req.body.positions.length === 0) {
    const deleted = await deletePurchaseForUser(id, companyId, user, scope.isFullAccess);
    sendEnvelope(res, { data: deleted, meta: { mandant: req.mandant } });
    return;
  }
  await assertSupplier(req.database, existing.supplierId, scope);
  const storedPositions = await loadPositions(id);
  const { positions, loading, packaging, incoterm, payment, currency, reference, contact } =
    await preparePurchase(req, existing.supplierId, req.body?.positions, existing, storedPositions);
  const attachmentInput = normalizeAttachmentInput(req);
  const now = new Date().toISOString();
  const checkProcurement = await procurementSchemaReady();
  const updated = await withSqlTransaction(config.sql.database, async ({ query }) => {
    const locked = await query(`SELECT [tb_status] AS status FROM ${TEMP_PURCHASE_ORDER_TABLE} WITH (UPDLOCK,HOLDLOCK) WHERE [tb_id]=? AND [tb_company_id]=?`, [id, companyId]);
    if (!locked.rows[0] || !isEditable(normalizeStatus(locked.rows[0].status))) throw createHttpError(409, 'Diese Bestellung ist nicht mehr bearbeitbar.', { code: 'PURCHASE_ORDER_LOCKED' });
    const sources = await assertOptionQuantities(query,positions,id,packaging.text,req.userIdentity);
    const linked = checkProcurement ? await linkedPurchasePositions(query, id) : [];
    if (linked.length && currency !== (asText(existing.currency || storedPositions[0]?.currency) || 'EUR')) {
      throw createHttpError(409, 'Die Währung einer bereits mit einem Auftrag verknüpften Bestellung kann nicht geändert werden.', { code: 'PURCHASE_CURRENCY_LINKED' });
    }
    await query(`UPDATE ${TEMP_PURCHASE_ORDER_TABLE} SET [tb_supplier_contact]=?,[tb_payment_condition_changed]=?,[tb_payment_condition_id]=?,[tb_payment_condition_text]=?,[tb_delivery_term_id]=?,[tb_delivery_term_text]=?,
      [tb_packaging_type]=?,[tb_packaging_type_id]=?,[tb_loading_location_source]=?,[tb_loading_location_id]=?,[tb_loading_location_text]=?,[tb_loading_location_changed]=?,[tb_comment]=?,[tb_last_modified_by]=?,[tb_last_modified_date]=?,
      [tb_supplier_contact_id]=?,[tb_warehouse_id]=?,[tb_address_customer_id]=?,[tb_address_id]=?,[tb_reference]=?,[tb_currency]=?
      WHERE [tb_id]=? AND [tb_company_id]=?`, [contact?.name || null, payment.paymentConditionChanged ? 1 : 0,
      payment.paymentConditionId, payment.paymentConditionText || null, incoterm.id, incoterm.text, packaging.text, packaging.id,
      loading.source, loading.id, loading.text, Number(loading.changed), asText(req.body?.comment) || null, user, now,
      contact?.id ?? null, loading.warehouseId, loading.customerId, loading.id, reference, currency, id, companyId]);
    if (linked.length) {
      assertProcurementAccess(req.userIdentity);
      const byId = new Map(positions.map((position) => [Number(position.id), position]));
      if (byId.size !== linked.length || positions.length !== linked.length || linked.some((saved) => {
        const edited = byId.get(Number(saved.id));
        return !edited || Number(saved.amount) !== edited.amount || asText(saved.articleIndex) !== edited.articleIndex;
      })) {
        throw createHttpError(409, 'Artikel und Menge der verknüpften Bestellung bleiben erhalten.', { code: 'PURCHASE_ORDER_LINKED' });
      }
      for (const position of positions) {
        await query(`UPDATE ${TEMP_PURCHASE_POSITION_TABLE} SET tbp_article=?,tbp_purchase_price=?,
          tbp_requested_delivery_date=?,tbp_reserved_for=?,tbp_comment=?,tbp_packaging_type_changed=?,
          tbp_option_mfi_acknowledged=?,tbp_last_modified_by=?,tbp_last_modified_date=?,
          tbp_currency=?,tbp_place_at_supplier=?,tbp_pickup_reference=?,tbp_availability_note=?
          WHERE tbp_id=? AND tbp_tb_id=?`,
        [position.article, position.purchasePrice, position.requestedDeliveryDate, position.reservedFor,
          position.comment, position.packagingTypeChanged ? 1 : 0, position.acknowledgeUnverifiedMfi ? 1 : 0, user, now,
          currency, position.placeAtSupplier, position.pickupReference, position.availabilityNote, position.id, id]);
      }
    } else {
      await query(`DELETE FROM ${TEMP_PURCHASE_POSITION_TABLE} WHERE [tbp_tb_id]=?`, [id]);
      await insertPurchasePositions(query, id, positions, currency, user, now, existing.createdBy, existing.createdAt);
    }
    await savePurchaseOrderAttachments(query, { orderId: id, ...attachmentInput, user, now });
    const saved = await query(`${orderSelectSql()} WHERE [tb_id]=?`, [id]);
    const order = mapOrder(saved.rows[0], await loadPositions(id, query));
    await syncPurchaseOptionPdf(query, { order, sources, user, now });
    return withPurchaseOrderAttachments(order, query);
  });
  sendEnvelope(res, { data: updated, meta: { mandant: req.mandant } });
}));

router.delete('/temp-purchase-orders/:id', requirePurchaseOrders, requireMandant, asyncHandler(async (req, res) => {
  const accessScope = await getCustomerAccessScope(req.userIdentity, req.database);
  const id = Number(req.params.id);
  const companyId = Number(req.database?.firmaId || 0);
  const userShortCode = asText(req.userIdentity?.shortCode);
  await deletePurchaseForUser(id, companyId, userShortCode, accessScope.isFullAccess);
  res.status(204).end();
}));

async function finalizePurchase(req, id, { draftOnly = false, linkedOnly = false } = {}) {
  const accessScope = await getCustomerAccessScope(req.userIdentity, req.database);
  const companyId = Number(req.database?.firmaId || 0);
  const userShortCode = asText(req.userIdentity?.shortCode) || asText(req.userEmail) || 'APP';
  const mailValidation = validateOrderMailConfig(config.orderMail, config.mailService);
  if (!mailValidation.ok) throw createHttpError(503, 'CS-Mail-Konfiguration fehlt.', { code: 'PURCHASE_CS_MAIL_CONFIG_MISSING', missing: mailValidation.missing || [] });
  const csRecipient = resolveOrderMailRecipient(companyId, config.orderMail);
  if (!csRecipient.ok) throw createHttpError(422, 'Kein CS-Mail-Empfänger für den Mandanten konfiguriert.', { code: 'PURCHASE_CS_MAIL_RECIPIENT_MISSING' });
  const now = new Date().toISOString();
  const checkProcurement = await procurementSchemaReady();
  const finalized = await withSqlTransaction(config.sql.database, async ({ query }) => {
    const ownerSql = accessScope.isFullAccess ? '' : ' AND [tb_created_by]=?';
    const ownerParams = accessScope.isFullAccess ? [id, companyId] : [id, companyId, userShortCode];
    const current = await query(`${orderSelectSql()} WITH (UPDLOCK,HOLDLOCK) WHERE [tb_id]=? AND [tb_company_id]=?${ownerSql}`, ownerParams);
    const row = current.rows[0];
    if (!row) throw createHttpError(404, 'Bestellung nicht gefunden.', { code: 'RESOURCE_NOT_FOUND' });
    const positions = await loadPositions(id, query);
    const linked = checkProcurement ? await linkedPurchasePositions(query, id) : [];
    if (linked.length) assertProcurementAccess(req.userIdentity);
    if (linkedOnly && !linked.length) return { mapped: mapOrder(row, positions), alreadyFinalized: true };
    if ((draftOnly && normalizeStatus(row.status) !== STATUS.DRAFT)
      || [STATUS.APP_FINALIZED, STATUS.CS_ACCEPTED].includes(normalizeStatus(row.status))) return { mapped: await withPurchaseOrderAttachments(mapOrder(row, positions), query), alreadyFinalized: true };
    const currency = purchaseCurrency(row.currency || positions[0]?.currency);
    const loading = await resolvePurchaseAddress(req, row, accessScope);
    if (row.supplierContactId) {
      resolveSupplierContact(await loadSupplierTerms(req.database, row.supplierId), row.supplierContactId);
    }
    for (const articleIndex of new Set(positions.map(position => position.articleIndex))) {
      await assertPurchaseArticle(req.database, articleIndex);
    }
    for (const position of positions.filter(line => line.optionId!=null)) {
      const source = await loadOptionPosition(position.optionId,position.optionPositionId,null,{identity:req.userIdentity});
      await validateOptionSupplier(req.database,source,row.supplierId);
      await validateOptionArticle(req.database,source,{...position,acknowledgeUnverifiedMfi:Boolean(position.acknowledgeUnverifiedMfi)});
      position.optionSourceChanged=source.sourceVersion;
    }
    const sources = await assertOptionQuantities(query,positions,id,row.packagingType,req.userIdentity);
    const namedPositions = await enrichPurchaseArticleNames(req.database, row.supplierId, positions);
    applyPurchaseLogistics(namedPositions, loading);
    for (const position of namedPositions) {
      position.article = purchaseArticleText(position.article);
      const stored = positions.find(item => item.id === position.id);
      if (stored.article !== position.article || asText(stored.placeAtSupplier) !== asText(position.placeAtSupplier)) {
        await query(`UPDATE ${TEMP_PURCHASE_POSITION_TABLE} SET [tbp_article]=?,[tbp_place_at_supplier]=?,[tbp_last_modified_by]=?,[tbp_last_modified_date]=? WHERE [tbp_id]=? AND [tbp_tb_id]=?`,
          [position.article, position.placeAtSupplier, userShortCode, now, position.id, id]);
      }
      Object.assign(stored, position);
    }
    normalizePositions(positions);
    await validateWorkingDates(positions, loading.address);
    const order = mapOrder({ ...row, currency, loadingLocationText: loading.text, status: STATUS.APP_FINALIZED, returnComment: '', completedBy: userShortCode, closingDate: now, lastModifiedBy: userShortCode, lastModifiedAt: now }, positions);
    if (sources.size) await syncPurchaseOptionPdf(query, { order, sources, user: userShortCode, now });
    await query(`UPDATE ${TEMP_PURCHASE_ORDER_TABLE} SET [tb_status]=1,[tb_return_comment]=NULL,[tb_completed_by]=?,[tb_closing_date]=?,[tb_last_modified_by]=?,[tb_last_modified_date]=?,[tb_currency]=?,[tb_loading_location_text]=? WHERE [tb_id]=? AND [tb_company_id]=? AND [tb_status] IN (0,3)`,
      [userShortCode, now, userShortCode, now, currency, loading.text, id, companyId]);
    return { mapped: await withPurchaseOrderAttachments(order, query), alreadyFinalized: false };
  });
  const mapped = finalized.mapped;
  const updatedPositions = mapped.positions;
  if (finalized.alreadyFinalized && (draftOnly || mapped.status !== STATUS.APP_FINALIZED)) {
    return { data: mapped, meta: { alreadyFinalized: true } };
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
  if (finalized.alreadyFinalized) {
    return { data: { ...mapped, csMail }, meta: { alreadyFinalized: true } };
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
          optionId:position.optionId,
          optionPositionId:position.optionPositionId,
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
  return { status: 200, data: { ...mapped, csMail }, meta: { alreadyFinalized: false }, error: null };
}

router.post('/temp-purchase-orders/:id/finalize', requirePurchaseOrders, requireMandant, asyncHandler(async (req, res) => {
  sendEnvelope(res, await finalizePurchase(req, Number(req.params.id)));
}));

module.exports = router;
module.exports.STATUS = STATUS;
module.exports.preparePurchaseDraft = preparePurchaseDraft;
module.exports.finalizePurchase = finalizePurchase;
module.exports.savePurchaseDraft = savePurchaseDraft;
module.exports.normalizePositions = normalizePositions;
module.exports.getNextWorkingDate = getNextWorkingDate;
module.exports.buildPurchaseCreatedPeriodFilter = buildPurchaseCreatedPeriodFilter;
