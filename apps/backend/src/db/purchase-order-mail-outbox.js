const config = require('../config');
const fs = require('fs');
const logger = require('../logger');
const { runSQLQuerySqlServer } = require('./access');
const { appTableSql } = require('./app-tables');
const { sendOrderMail, validateOrderMailConfig, resolveOrderMailRecipient } = require('../mail/order-mail');
const {
  formatPurchaseOrderMailBody,
  formatPurchaseOrderCsMailBody,
  PURCHASE_ORDER_MAIL_SUBJECT,
  PURCHASE_ORDER_CS_MAIL_SUBJECT,
} = require('../mail/purchase-order-mail');
const { resolveLatestPurchaseOrderPdf } = require('../order-pdf');

const ORDER_TABLE = appTableSql('tempPurchaseOrder');
const POSITION_TABLE = appTableSql('tempPurchaseOrderPosition');
const OUTBOX_TABLE = appTableSql('purchaseOrderMailOutbox');
const CS_OUTBOX_TABLE = appTableSql('purchaseOrderCsMailOutbox');

let workerTimer = null;
let workerRunning = false;

function asText(value) { return value === null || value === undefined ? '' : String(value).trim(); }
function isEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(asText(value)); }
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

async function loadSupplierRecipient(databaseName, supplierId, contact) {
  if (!databaseName) return null;
  const customerRows = await runSQLQuerySqlServer(databaseName, `
    SELECT TOP 1 [kd_eMail] AS email
    FROM [dbo].[tblKunden]
    WHERE LTRIM(RTRIM(COALESCE([kd_KdNR], ''))) = ?
  `, [supplierId]);
  const customerEmail = asText(customerRows?.[0]?.email).split(/[;,\s]+/).find(isEmail);
  if (customerEmail) return { address: customerEmail, source: 'supplier_customer' };
  const contactText = asText(contact).toLowerCase();
  const contactRows = await runSQLQuerySqlServer(databaseName, `
    SELECT [kdA_eMail] AS email, [kdA_Name] AS lastName, [kdA_Vorname] AS firstName
    FROM [dbo].[tblKun_Ansprech]
    WHERE LTRIM(RTRIM(COALESCE([kdA_KdNR], ''))) = ?
      AND NULLIF(LTRIM(RTRIM(COALESCE([kdA_eMail], ''))), '') IS NOT NULL
    ORDER BY [kdA_Ranking], [kdA_Name], [kdA_Vorname]
  `, [supplierId]);
  const matching = (contactRows || []).find((row) => contactText && `${asText(row.firstName)} ${asText(row.lastName)}`.toLowerCase().includes(contactText));
  const row = matching || contactRows?.[0];
  const email = asText(row?.email).split(/[;,\s]+/).find(isEmail);
  return email ? { address: email, source: matching ? 'supplier_contact' : 'supplier_contact_fallback' } : null;
}

async function loadOrder(orderId, acceptedOnly = true) {
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT [tb_id] AS id, [tb_company_id] AS companyId, [tb_supplier_id] AS supplierId,
      [tb_supplier_name] AS supplierName, [tb_supplier_contact] AS supplierContact,
      [tb_payment_condition_id] AS paymentConditionId, [tb_payment_condition_text] AS paymentConditionText,
      [tb_delivery_term_text] AS deliveryTermText, [tb_loading_location_text] AS loadingLocationText,
      [tb_packaging_type] AS packagingType, [tb_comment] AS comment, [tb_bestellindex] AS bmsPurchaseOrderNumber,
      [tb_status] AS status, [tb_supplier_mail_status] AS supplierMailStatus
    FROM ${ORDER_TABLE}
    WHERE [tb_id] = ? AND ${acceptedOnly ? '[tb_status] = 2' : '[tb_status] IN (1,2)'}
  `, [orderId]);
  const order = rows?.[0] || null;
  if (!order) return null;
  const positions = await runSQLQuerySqlServer(config.sql.database, `
    SELECT [tbp_id] AS id, [tbp_line_no] AS lineNo, [tbp_article_index] AS articleIndex,
      [tbp_article] AS article, [tbp_amount] AS amount, [tbp_unit] AS unit,
      [tbp_purchase_price] AS purchasePrice, [tbp_currency] AS currency,
      [tbp_requested_delivery_date] AS requestedDeliveryDate, [tbp_reserved_for] AS reservedFor,
      [tbp_comment] AS comment, [tbp_source_bestellindex] AS sourceBestellindex
    FROM ${POSITION_TABLE} WHERE [tbp_tb_id] = ? ORDER BY [tbp_line_no]
  `, [orderId]);
  return { order, positions: Array.isArray(positions) ? positions : [] };
}

async function queueOrder(orderId) {
  const data = await loadOrder(orderId);
  if (!data) return null;
  const tenant = await loadMandantDatabase(Number(data.order.companyId));
  const databaseName = tenant?.databaseName || '';
  const recipient = await loadSupplierRecipient(databaseName, asText(data.order.supplierId), data.order.supplierContact);
  if (!recipient) {
    await runSQLQuerySqlServer(config.sql.database, `UPDATE ${ORDER_TABLE} SET [tb_supplier_mail_status]=N'failed', [tb_supplier_mail_last_error]=?, [tb_last_modified_date]=SYSUTCDATETIME() WHERE [tb_id]=?`, ['Keine E-Mail-Adresse beim Lieferanten hinterlegt.', orderId]);
    return { queued: false, reason: 'missing_recipient' };
  }
  const body = formatPurchaseOrderMailBody({
    order: data.order,
    positions: data.positions,
    mandantName: tenant?.name || databaseName,
    mandantShortName: tenant?.shortName || '',
  });
  try {
    const rows = await runSQLQuerySqlServer(config.sql.database, `
      INSERT INTO ${OUTBOX_TABLE} ([pom_PurchaseOrderID],[pom_CompanyID],[pom_Recipient],[pom_RecipientSource],[pom_Subject],[pom_Body],[pom_Status],[pom_AttemptCount],[pom_CreateDate],[pom_LastModifiedDate])
      OUTPUT INSERTED.[pom_ID] AS id VALUES (?,?,?,?,?,? ,N'pending',0,SYSUTCDATETIME(),SYSUTCDATETIME())
    `, [orderId, data.order.companyId, recipient.address, recipient.source, PURCHASE_ORDER_MAIL_SUBJECT, body]);
    await runSQLQuerySqlServer(config.sql.database, `UPDATE ${ORDER_TABLE} SET [tb_supplier_mail_status]=N'queued', [tb_supplier_mail_last_error]=NULL, [tb_last_modified_date]=SYSUTCDATETIME() WHERE [tb_id]=?`, [orderId]);
    return { queued: true, outboxId: Number(rows?.[0]?.id || 0) };
  } catch (error) {
    // Unique(order) means a concurrent worker already queued it.
    if (String(error?.message || '').toLowerCase().includes('duplicate') || String(error?.message || '').toLowerCase().includes('unique')) return { queued: false, reason: 'already_queued' };
    throw error;
  }
}

async function claimOutbox(outboxId) {
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    UPDATE ${OUTBOX_TABLE} WITH (ROWLOCK, UPDLOCK, READPAST)
    SET [pom_Status]=N'sending', [pom_AttemptCount]=[pom_AttemptCount]+1, [pom_LockedAt]=SYSUTCDATETIME(), [pom_LastModifiedDate]=SYSUTCDATETIME()
    OUTPUT INSERTED.[pom_ID] AS id, INSERTED.[pom_PurchaseOrderID] AS orderId, INSERTED.[pom_CompanyID] AS companyId, INSERTED.[pom_Recipient] AS recipient, INSERTED.[pom_Subject] AS subject, INSERTED.[pom_Body] AS body, INSERTED.[pom_AttemptCount] AS attemptCount
    WHERE [pom_ID]=? AND [pom_AttemptCount] < ? AND ([pom_Status] IN (N'pending',N'failed') OR ([pom_Status]=N'sending' AND [pom_LockedAt] < DATEADD(MINUTE,-10,SYSUTCDATETIME()))) AND ([pom_NextAttemptAt] IS NULL OR [pom_NextAttemptAt] <= SYSUTCDATETIME())
  `, [outboxId, config.purchaseOrderMail.maxAttempts]);
  return rows?.[0] || null;
}

async function processPurchaseOrderMailOutboxById(outboxId) {
  const item = await claimOutbox(outboxId);
  if (!item) return { processed: false, status: 'not_claimed' };
  try {
    let attachment = null;
    const orderData = await loadOrder(item.orderId);
    const tenant = orderData ? await loadMandantDatabase(Number(orderData.order.companyId)) : null;
    const pdf = tenant?.name && orderData?.order?.bmsPurchaseOrderNumber
      ? await resolveLatestPurchaseOrderPdf({ companyName: tenant.name, orderNumber: orderData.order.bmsPurchaseOrderNumber })
      : null;
    if (pdf?.filePath) {
      try {
        attachment = { buffer: await fs.promises.readFile(pdf.filePath), fileName: pdf.fileName, mimeType: 'application/pdf' };
      } catch (attachmentError) {
        logger.warn(`Bestelldokument ${pdf.filePath} konnte nicht gelesen werden: ${attachmentError?.message || attachmentError}`);
      }
    }
    const delivery = await sendOrderMail({
      orderMailConfig: config.orderMail,
      mailServiceConfig: config.mailService,
      recipient: item.recipient,
      subject: item.subject,
      body: item.body,
      attachment,
      clientMessageId: `bms-app:purchase:${item.orderId}`,
    });
    await runSQLQuerySqlServer(config.sql.database, `UPDATE ${OUTBOX_TABLE} SET [pom_Status]=N'sent',[pom_SentAt]=SYSUTCDATETIME(),[pom_LockedAt]=NULL,[pom_LastError]=NULL,[pom_LastModifiedDate]=SYSUTCDATETIME() WHERE [pom_ID]=?`, [item.id]);
    await runSQLQuerySqlServer(config.sql.database, `UPDATE ${ORDER_TABLE} SET [tb_supplier_mail_status]=N'sent',[tb_supplier_mail_sent_at]=SYSUTCDATETIME(),[tb_supplier_mail_last_error]=NULL,[tb_last_modified_date]=SYSUTCDATETIME() WHERE [tb_id]=?`, [item.orderId]);
    return { processed: true, status: 'sent', transport: delivery.transport };
  } catch (error) {
    const message = asText(error?.message || error).slice(0, 2000);
    const next = new Date(Date.now() + Math.min(60, 2 ** Math.max(0, Number(item.attemptCount || 1) - 1)) * 60000).toISOString();
    await runSQLQuerySqlServer(config.sql.database, `UPDATE ${OUTBOX_TABLE} SET [pom_Status]=N'failed',[pom_NextAttemptAt]=?,[pom_LockedAt]=NULL,[pom_LastError]=?,[pom_LastModifiedDate]=SYSUTCDATETIME() WHERE [pom_ID]=?`, [next, message, item.id]);
    await runSQLQuerySqlServer(config.sql.database, `UPDATE ${ORDER_TABLE} SET [tb_supplier_mail_status]=N'failed',[tb_supplier_mail_last_error]=?,[tb_last_modified_date]=SYSUTCDATETIME() WHERE [tb_id]=?`, [message, item.orderId]);
    logger.error(`Einkaufsmail fuer Bestellung ${item.orderId} fehlgeschlagen`, error);
    return { processed: true, status: 'failed' };
  }
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
    OUTPUT INSERTED.[pcom_ID] AS id VALUES (?,?,?,?,?,? ,N'pending',0,SYSUTCDATETIME(),SYSUTCDATETIME())
  `, [order.id, companyId, recipient.address, recipient.source, PURCHASE_ORDER_CS_MAIL_SUBJECT, body]);
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
    const data = await loadOrder(Number(row.id), false);
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
    // Status 2 is the supplier-mail trigger. The BMS order number is useful
    // for the optional PDF attachment, but must not delay the e-mail itself.
    const rows = await runSQLQuerySqlServer(config.sql.database, `SELECT TOP 50 [tb_id] AS id FROM ${ORDER_TABLE} WHERE [tb_status]=2 AND COALESCE([tb_supplier_mail_status],N'not_queued') IN (N'not_queued',N'failed') ORDER BY [tb_id] ASC`, []);
    for (const row of (rows || []).slice(0, limit)) {
      const queued = await queueOrder(Number(row.id));
      if (queued?.outboxId) await processPurchaseOrderMailOutboxById(queued.outboxId);
    }
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
  processPurchaseOrderMailOutboxById,
  startPurchaseOrderMailWorker,
};
