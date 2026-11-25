const config = require('../config');
const logger = require('../logger');
const { runSQLQuerySqlServer } = require('./access');
const { appTableSql } = require('./app-tables');
const { loadPurchaseOrderAttachments } = require('./purchase-order-attachments');
const { sendOrderMail, validateOrderMailConfig, resolveOrderMailRecipient } = require('../mail/order-mail');
const {
  formatPurchaseOrderCsMailBody,
  PURCHASE_ORDER_CS_MAIL_SUBJECT,
} = require('../mail/purchase-order-mail');

const ORDER_TABLE = appTableSql('tempPurchaseOrder');
const POSITION_TABLE = appTableSql('tempPurchaseOrderPosition');
const CS_OUTBOX_TABLE = appTableSql('purchaseOrderCsMailOutbox');

let workerTimer = null;
let workerRunning = false;

function asText(value) { return value === null || value === undefined ? '' : String(value).trim(); }
function escIdentifier(value) { return `[${String(value || '').replace(/]/g, ']]')}]`; }

async function loadMandantDatabase(companyId) {
  const idColumn = escIdentifier(config.sql.columns.firmaId);
  const shortColumn = escIdentifier(config.sql.columns.firmaKurz);
  const nameColumn = escIdentifier(config.sql.columns.firma);
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT TOP 1 ${idColumn} AS companyId, ${shortColumn} AS shortName, ${nameColumn} AS name
    FROM [dbo].[${String(config.sql.tables.mandant || 'tblMandant').replace(/]/g, ']]')}]
    WHERE ${idColumn} = ?
  `, [companyId]);
  const shortName = asText(rows?.[0]?.shortName).toUpperCase().replace(/[^A-Z0-9_]/g, '');
  return shortName ? {
    databaseName: `BMS.${shortName}`,
    name: asText(rows?.[0]?.name) || shortName,
    shortName,
  } : null;
}

async function loadOrder(orderId) {
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT [tb_id] AS id, [tb_company_id] AS companyId, [tb_supplier_id] AS supplierId,
      [tb_supplier_name] AS supplierName, [tb_supplier_contact] AS supplierContact,
      [tb_supplier_contact_id] AS supplierContactId, [tb_warehouse_id] AS warehouseId,
      [tb_address_customer_id] AS addressCustomerId, [tb_address_id] AS addressId,
      [tb_reference] AS reference, [tb_currency] AS currency,
      [tb_payment_condition_id] AS paymentConditionId, [tb_payment_condition_text] AS paymentConditionText,
      [tb_delivery_term_text] AS deliveryTermText, [tb_loading_location_text] AS loadingLocationText,
      [tb_packaging_type] AS packagingType, [tb_comment] AS comment, [tb_bestellindex] AS bmsPurchaseOrderNumber,
      [tb_status] AS status
    FROM ${ORDER_TABLE}
    WHERE [tb_id] = ? AND [tb_status] IN (1,2)
  `, [orderId]);
  const order = rows?.[0] || null;
  if (!order) return null;
  const positions = await runSQLQuerySqlServer(config.sql.database, `
    SELECT [tbp_id] AS id, [tbp_line_no] AS [lineNo], [tbp_article_index] AS articleIndex,
      [tbp_article] AS article, [tbp_amount] AS amount, [tbp_unit] AS unit,
      [tbp_purchase_price] AS purchasePrice, [tbp_currency] AS currency,
      [tbp_place_at_supplier] AS placeAtSupplier, [tbp_pickup_reference] AS pickupReference,
      [tbp_availability_note] AS availabilityNote,
      [tbp_requested_delivery_date] AS requestedDeliveryDate, [tbp_reserved_for] AS reservedFor,
      [tbp_comment] AS comment, [tbp_original_packaging_type] AS originalPackagingType,
      [tbp_packaging_type_changed] AS packagingTypeChanged,
      [OptionID] AS optionId,[OptionPositionID] AS optionPositionId
    FROM ${POSITION_TABLE} WHERE [tbp_tb_id] = ? ORDER BY [tbp_line_no]
  `, [orderId]);
  order.attachments = await loadPurchaseOrderAttachments(orderId);
  return { order, positions: Array.isArray(positions) ? positions : [] };
}

async function claimCsOutbox(outboxId) {
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    UPDATE ${CS_OUTBOX_TABLE} WITH (ROWLOCK, UPDLOCK, READPAST)
    SET [pcom_Status]=N'sending', [pcom_AttemptCount]=[pcom_AttemptCount]+1, [pcom_LockedAt]=SYSUTCDATETIME(), [pcom_LastModifiedDate]=SYSUTCDATETIME()
    OUTPUT INSERTED.[pcom_ID] AS id, INSERTED.[pcom_PurchaseOrderID] AS orderId, INSERTED.[pcom_Recipient] AS recipient, INSERTED.[pcom_Subject] AS subject, INSERTED.[pcom_Body] AS body, INSERTED.[pcom_AttemptCount] AS attemptCount
    WHERE [pcom_ID]=? AND [pcom_AttemptCount] < ? AND ([pcom_Status] IN (N'pending',N'failed') OR ([pcom_Status]=N'sending' AND [pcom_LockedAt] < DATEADD(MINUTE,-10,SYSUTCDATETIME()))) AND ([pcom_NextAttemptAt] IS NULL OR [pcom_NextAttemptAt] <= SYSUTCDATETIME())
  `, [outboxId, config.orderMail.maxAttempts]);
  return rows?.[0] || null;
}

async function processPurchaseOrderCsMailOutboxById(outboxId) {
  const item = await claimCsOutbox(outboxId);
  if (!item) return { processed: false, status: 'not_claimed' };
  try {
    const delivery = await sendOrderMail({
      orderMailConfig: config.orderMail,
      mailServiceConfig: config.mailService,
      recipient: item.recipient,
      subject: item.subject,
      body: item.body,
      attachments: await loadPurchaseOrderAttachments(item.orderId, { includeContent: true }),
      clientMessageId: `bms-app:purchase-cs:${item.orderId}`,
    });
    await runSQLQuerySqlServer(config.sql.database, `UPDATE ${CS_OUTBOX_TABLE} SET [pcom_Status]=N'sent',[pcom_SentAt]=SYSUTCDATETIME(),[pcom_LockedAt]=NULL,[pcom_LastError]=NULL,[pcom_LastModifiedDate]=SYSUTCDATETIME() WHERE [pcom_ID]=?`, [item.id]);
    return { processed: true, status: 'sent', transport: delivery.transport };
  } catch (error) {
    const message = asText(error?.message || error).slice(0, 2000);
    const next = new Date(Date.now() + Math.min(60, 2 ** Math.max(0, Number(item.attemptCount || 1) - 1)) * 60000).toISOString();
    await runSQLQuerySqlServer(config.sql.database, `UPDATE ${CS_OUTBOX_TABLE} SET [pcom_Status]=N'failed',[pcom_NextAttemptAt]=?,[pcom_LockedAt]=NULL,[pcom_LastError]=?,[pcom_LastModifiedDate]=SYSUTCDATETIME() WHERE [pcom_ID]=?`, [next, message, item.id]);
    logger.error(`CS-Mail fuer Bestellung ${item.orderId} fehlgeschlagen`, error);
    return { processed: true, status: 'failed' };
  }
}

async function queuePurchaseOrderCsMail({ order, positions, mandantName, mandantShortName }) {
  const companyId = Number(order?.companyId || 0);
  const recipient = resolveOrderMailRecipient(companyId, config.orderMail);
  if (!recipient.ok) return { queued: false, reason: recipient.reason };
  const existing = await runSQLQuerySqlServer(config.sql.database, `SELECT TOP 1 [pcom_ID] AS id, [pcom_Status] AS status FROM ${CS_OUTBOX_TABLE} WHERE [pcom_PurchaseOrderID] = ?`, [order.id]);
  if (existing?.[0]) return { queued: false, alreadyQueued: true, outboxId: Number(existing[0].id), status: asText(existing[0].status) };
  const body = formatPurchaseOrderCsMailBody({ order, positions, mandantName, mandantShortName });
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    INSERT INTO ${CS_OUTBOX_TABLE} ([pcom_PurchaseOrderID],[pcom_CompanyID],[pcom_Recipient],[pcom_RecipientSource],[pcom_Subject],[pcom_Body],[pcom_Status],[pcom_AttemptCount],[pcom_CreateDate],[pcom_LastModifiedDate])
    OUTPUT INSERTED.[pcom_ID] AS id
    SELECT ?,?,?,?,?,?,N'pending',0,SYSUTCDATETIME(),SYSUTCDATETIME()
    WHERE NOT EXISTS (SELECT 1 FROM ${CS_OUTBOX_TABLE} WITH (UPDLOCK,HOLDLOCK) WHERE [pcom_PurchaseOrderID]=?)
  `, [order.id, companyId, recipient.address, recipient.source, PURCHASE_ORDER_CS_MAIL_SUBJECT, body, order.id]);
  if (!rows?.[0]) {
    const [concurrent] = await runSQLQuerySqlServer(config.sql.database, `SELECT TOP 1 [pcom_ID] AS id, [pcom_Status] AS status FROM ${CS_OUTBOX_TABLE} WHERE [pcom_PurchaseOrderID] = ?`, [order.id]);
    if (concurrent) return { queued: false, alreadyQueued: true, outboxId: Number(concurrent.id), status: asText(concurrent.status) };
    return { queued: false, reason: 'mail_not_queued' };
  }
  return { queued: true, outboxId: Number(rows?.[0]?.id || 0) };
}

async function queueMissingCsMails(limit = 5) {
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT TOP 50 o.[tb_id] AS id
    FROM ${ORDER_TABLE} o
    WHERE o.[tb_status] IN (1,2)
      AND NOT EXISTS (SELECT 1 FROM ${CS_OUTBOX_TABLE} c WHERE c.[pcom_PurchaseOrderID] = o.[tb_id])
    ORDER BY o.[tb_id] ASC
  `, []);
  for (const row of (rows || []).slice(0, limit)) {
    const data = await loadOrder(Number(row.id));
    if (!data) continue;
    const tenant = await loadMandantDatabase(Number(data.order.companyId));
    const result = await queuePurchaseOrderCsMail({
      order: { ...data.order, id: Number(data.order.id) },
      positions: data.positions,
      mandantName: tenant?.name || '',
      mandantShortName: tenant?.shortName || '',
    });
    if (result?.outboxId) await processPurchaseOrderCsMailOutboxById(result.outboxId);
  }
}

async function processPendingPurchaseOrderMails(limit = 5) {
  if (workerRunning || !config.purchaseOrderMail.enabled) return;
  workerRunning = true;
  try {
    await queueMissingCsMails(limit);
    const csRows = await runSQLQuerySqlServer(config.sql.database, `SELECT TOP 50 [pcom_ID] AS id FROM ${CS_OUTBOX_TABLE} WHERE [pcom_Status] IN (N'pending',N'failed') AND ([pcom_NextAttemptAt] IS NULL OR [pcom_NextAttemptAt] <= SYSUTCDATETIME()) ORDER BY [pcom_ID] ASC`, []);
    for (const row of (csRows || []).slice(0, limit)) await processPurchaseOrderCsMailOutboxById(Number(row.id));
  } catch (error) {
    logger.warn(`Einkaufsmail-Outbox konnte nicht verarbeitet werden: ${error?.message || error}`);
  } finally {
    workerRunning = false;
  }
}

function startPurchaseOrderMailWorker() {
  if (workerTimer || !config.purchaseOrderMail.enabled) return;
  const validation = validateOrderMailConfig(config.orderMail, config.mailService);
  if (!validation.ok) {
    logger.warn(`Einkaufsmail-Outbox nicht gestartet: ${validation.reason}.`);
    return;
  }
  const intervalMs = Math.max(10, config.purchaseOrderMail.intervalSeconds) * 1000;
  void processPendingPurchaseOrderMails();
  workerTimer = setInterval(() => void processPendingPurchaseOrderMails(), intervalMs);
  if (typeof workerTimer.unref === 'function') workerTimer.unref();
  logger.info(`Einkaufsmail-Outbox gestartet (Intervall ${Math.round(intervalMs / 1000)}s).`);
}

module.exports = {
  processPendingPurchaseOrderMails,
  queuePurchaseOrderCsMail,
  processPurchaseOrderCsMailOutboxById,
  startPurchaseOrderMailWorker,
};
