const config = require('../config');
const logger = require('../logger');
const { runSQLQueryAccess, runSQLQuerySqlServer } = require('./access');
const { appTableDisplayName, appTableSql } = require('./app-tables');
const { getDatabaseConnectionForCompanyId } = require('./databases');
const { productAvailabilitySource } = require('./product-availability');
const { assertTempOrderPositionsAvailable, loadCurrentOrderPositions, withTempOrderAvailabilityLock } = require('./temp-order-availability');
const { getUserIdentityByShortCode } = require('./users');
const { sendDirectPushNotificationToUser } = require('./push');
const { validateOrderMailConfig, sendOrderMail } = require('../mail/order-mail');
const { pilotFeaturesForIdentity } = require('../pilot-features');
const { parseMandantIdFromBeNumber } = require('../mandant-prefix');
const { createHttpError } = require('../utils');

const orders = appTableSql('tempOrder');
const positions = appTableSql('tempOrderPosition');
const purchases = appTableSql('tempPurchaseOrder');
const purchasePositions = appTableSql('tempPurchaseOrderPosition');
const availability = productAvailabilitySource('v');
const text = (value) => String(value ?? '').trim();
const run = (sql, params) => runSQLQuerySqlServer(config.sql.database, sql, params);
let workerRunning = false;

async function procurementSchemaReady() {
  const [row] = await run(`
    SELECT CASE WHEN COL_LENGTH(?, 'ta_procurement_notified_at') IS NOT NULL
      AND COL_LENGTH(?, 'tbp_bms_position_id') IS NOT NULL
      AND COL_LENGTH(?, 'tap_purchase_position_id') IS NOT NULL
      AND COL_LENGTH(?, 'ta_procurement_request_id') IS NOT NULL
      AND COL_LENGTH(?, 'tbp_order_position_id') IS NOT NULL
      AND COL_LENGTH(?, 'tap_option_position_id') IS NOT NULL THEN 1 ELSE 0 END AS ready
  `, ['tempOrder', 'tempPurchaseOrderPosition', 'tempOrderPosition',
    'tempOrder', 'tempPurchaseOrderPosition', 'tempOrderPosition'].map(appTableDisplayName));
  return Number(row?.ready) === 1;
}

function assertProcurementAccess(identity) {
  if (!pilotFeaturesForIdentity(identity).linkedProcurement) {
    throw createHttpError(403, 'Dieser Bereich ist nicht freigeschaltet.', { code: 'PILOT_FEATURE_FORBIDDEN' });
  }
}

function procurementStatus(lines) {
  if (!lines.length) return null;
  if (lines.some((line) => Number(line.purchaseStatus) === 3)) return 'rework';
  if (lines.some((line) => Number(line.purchaseStatus) !== 2)) return 'purchase';
  if (lines.some((line) => !text(line.beNumber) || !text(line.warehouseId))) return 'stock';
  return 'ready';
}

const linksFromSql = `
  FROM ${positions} p
  JOIN ${purchasePositions} pp ON pp.tbp_id=p.tap_purchase_position_id AND pp.tbp_order_position_id=p.tap_id
  JOIN ${purchases} b WITH (HOLDLOCK) ON b.tb_id=pp.tbp_tb_id
  JOIN ${orders} o ON o.ta_id=p.tap_ta_id AND o.ta_company_id=b.tb_company_id
`;

const linkRowsSql = `
  SELECT p.tap_id AS id, p.tap_be_number AS beNumber, p.tap_warehouse AS warehouseId,
         p.tap_Artikelindex AS articleIndex, p.tap_amount_in_kg AS amountInKg,
         pp.tbp_id AS purchasePositionId, pp.tbp_bms_position_id AS bmsPositionId,
         pp.tbp_article_index AS purchaseArticleIndex, b.tb_id AS purchaseId,
         b.tb_status AS purchaseStatus, b.tb_bestellindex AS bmsPurchaseIndex, b.tb_supplier_id AS supplierId,
         COALESCE(b.tb_currency,pp.tbp_currency,N'EUR') AS purchaseCurrency,
         (SELECT COUNT(*) FROM ${purchasePositions} sibling WHERE sibling.tbp_tb_id=b.tb_id) AS purchaseLineCount
  ${linksFromSql}
  WHERE p.tap_ta_id=? AND o.ta_company_id=?
`;

async function loadOrderProcurementStatuses(orderIds, companyId) {
  if (!orderIds.length) return new Map();
  const rows = await run(`
    SELECT p.tap_ta_id AS orderId, p.tap_be_number AS beNumber, p.tap_warehouse AS warehouseId,
           b.tb_status AS purchaseStatus
    ${linksFromSql}
    WHERE p.tap_ta_id IN (${orderIds.map(() => '?').join(',')}) AND o.ta_company_id=?
  `, [...orderIds, companyId]);
  const grouped = new Map();
  for (const row of rows) {
    const id = Number(row.orderId);
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(row);
  }
  return new Map([...grouped].map(([id, lines]) => [id, procurementStatus(lines)]));
}

async function loadOrderProcurementLines(query, orderId, companyId) {
  return (await query(linkRowsSql, [orderId, companyId])).rows;
}

async function loadOrderProcurement(orderId, companyId) {
  const lines = await run(linkRowsSql, [orderId, companyId]);
  const status = procurementStatus(lines);
  return status ? {
    status,
    purchaseIds: [...new Set(lines.map((line) => Number(line.purchaseId)))],
    draftPurchaseIds: [...new Set(lines.filter((line) => Number(line.purchaseStatus) === 0).map((line) => Number(line.purchaseId)))],
  } : null;
}

async function loadPurchaseOrderLinks(purchaseId, companyId) {
  const rows = await run(`
    SELECT DISTINCT o.ta_id AS id FROM ${purchasePositions} pp
    JOIN ${positions} p ON p.tap_id=pp.tbp_order_position_id AND p.tap_purchase_position_id=pp.tbp_id
    JOIN ${orders} o ON o.ta_id=p.tap_ta_id
    JOIN ${purchases} b ON b.tb_id=pp.tbp_tb_id AND b.tb_company_id=o.ta_company_id
    WHERE b.tb_id=? AND b.tb_company_id=?
  `, [purchaseId, companyId]);
  return rows.map((row) => Number(row.id));
}

function selectBmsPosition(line, erpPositions) {
  const explicitId = text(line.bmsPositionId);
  const selected = explicitId
    ? erpPositions.find((row) => text(row.beNumber) === explicitId)
    : (Number(line.purchaseLineCount) === 1 && erpPositions.length === 1 ? erpPositions[0] : null);
  return selected && !selected.cancelled && text(selected.articleIndex).toLowerCase() === text(line.articleIndex).toLowerCase()
    && text(selected.articleIndex).toLowerCase() === text(line.purchaseArticleIndex).toLowerCase()
    ? selected.beNumber : null;
}

async function resolveStock(database, line) {
  if (!text(line.bmsPurchaseIndex) || !text(line.supplierId)) return [];
  const erp = await runSQLQueryAccess(database, `
    SELECT p.beP_BEposID AS beNumber, p.beP_Artikelindex AS articleIndex,
      p.beP_EK_EU AS euroCostPrice, COALESCE(p.beP_Storno,0) AS cancelled
    FROM dbo.tblBest_Position p JOIN dbo.tblBestellung b ON b.be_Bestellindex=p.beP_Bestellindex
    WHERE b.be_Bestellindex=? AND LTRIM(RTRIM(b.be_KdNr))=?
  `, [line.bmsPurchaseIndex, line.supplierId]);
  const beNumber = selectBmsPosition(line, erp);
  if (!beNumber) return [];
  const euroCostPrice = Math.round(Number(erp.find(row => text(row.beNumber) === beNumber)?.euroCostPrice));
  if (line.purchaseCurrency === 'USD' && (!Number.isFinite(euroCostPrice) || euroCostPrice <= 0)) return [];
  const mandant = parseMandantIdFromBeNumber(beNumber);
  if (mandant !== null && mandant !== Number(database.firmaId)) return [];
  const stock = await runSQLQueryAccess(database, `
    SELECT v.[Bestell-Pos] AS beNumber,v.bePL_LagerID AS warehouseId,v.Artikel AS article,
           v.beP_VLbemerkung AS about,v.beP_MFIgemessen AS mfiMeasured,v.beP_MFI AS mfi,
           b.be_Verpackung AS packaging, wpz.id AS wpzId
    FROM ${availability}
    JOIN dbo.tblBestellung b ON b.be_Bestellindex=?
    OUTER APPLY (SELECT TOP 1 bePZ_ID AS id FROM dbo.tblBest_Pos_WPZ
      WHERE bePZ_BEposID=v.[Bestell-Pos] ORDER BY bePZ_ID DESC) wpz
    WHERE v.[Bestell-Pos]=? AND UPPER(LTRIM(RTRIM(v.Einheit)))='KG' AND NULLIF(v.bePL_LagerID,'') IS NOT NULL
    ORDER BY v.bePL_LagerID
  `, [line.bmsPurchaseIndex, beNumber]);
  return stock.map(row => ({ ...row, euroCostPrice: line.purchaseCurrency === 'USD' ? euroCostPrice : null }));
}

async function reconcileOrder(database, orderId, userShortCode) {
  const companyId = Number(database.firmaId);
  return withTempOrderAvailabilityLock(companyId, async ({ query }) => {
    const [order] = (await query(`
      SELECT ta_packaging_type AS packaging,ta_Status AS orderStatus FROM ${orders} WITH (UPDLOCK,HOLDLOCK)
      WHERE ta_id=? AND ta_company_id=? AND ta_CreatedBy=? AND ta_Status IN (0,1,3)
    `, [orderId, companyId, userShortCode])).rows;
    if (!order) return null;
    const linked = await loadOrderProcurementLines(query, orderId, companyId);
    const stockRows = (await query(`
      SELECT tap_id AS id,tap_be_number AS beNumber,tap_warehouse AS warehouseId,
        tap_amount_in_kg AS amountInKg,tap_reservation_in_kg AS reservationInKg
      FROM ${positions} WHERE tap_ta_id=? AND NULLIF(tap_be_number,'') IS NOT NULL
    `, [orderId])).rows;
    for (const line of linked) {
      if (Number(line.purchaseStatus) !== 2 || text(line.beNumber)) continue;
      const candidates = await resolveStock(database, line);
      for (const stock of candidates) {
        const trial = [...stockRows, { ...stock, id: line.id, amountInKg: line.amountInKg }];
        try {
          await assertTempOrderPositionsAvailable({
            companyId, excludeOrderId: orderId, query,
            positions: await loadCurrentOrderPositions(database, trial, userShortCode),
          });
        } catch (error) {
          if (error?.details?.code === 'TEMP_ORDER_AMOUNT_EXCEEDS_AVAILABLE' || error?.status === 409) continue;
          throw error;
        }
        await query(`
          UPDATE ${positions} SET tap_be_number=?,tap_warehouse=?,tap_about=?,tap_mfi=?,tap_wpz_id=?,
            tap_wpz_original=?,tap_Verpackungsart=?,tap_Verpackungsart_Gewechselt=?,tap_ep=COALESCE(?,tap_ep),
            tap_LastModifiedDate=SYSUTCDATETIME(),tap_LastModifiedBy=?
          WHERE tap_id=? AND tap_purchase_position_id=? AND tap_be_number=''
        `, [stock.beNumber, stock.warehouseId, text(stock.about) || null, text(stock.mfiMeasured ?? stock.mfi),
          stock.wpzId || null, stock.wpzId ? 1 : null, text(stock.packaging) || null,
          text(stock.packaging) && text(stock.packaging).toLowerCase() !== text(order.packaging).toLowerCase() ? 1 : 0,
          stock.euroCostPrice, userShortCode, line.id, line.purchasePositionId]);
        Object.assign(line, { beNumber: stock.beNumber, warehouseId: stock.warehouseId });
        stockRows.push(trial.at(-1));
        break;
      }
    }
    if (Number(order.orderStatus) === 1 || procurementStatus(linked) !== 'ready') return null;
    const currentStock = await loadCurrentOrderPositions(database, stockRows, userShortCode, { allowAnyReservation: true });
    try {
      await assertTempOrderPositionsAvailable({ companyId, excludeOrderId: orderId, query, positions: currentStock });
    } catch (error) {
      if (error?.status === 409) return null;
      throw error;
    }
    return (await query(`
      UPDATE ${orders} SET ta_procurement_notified_at=SYSUTCDATETIME()
      OUTPUT CONVERT(varchar(33), INSERTED.ta_procurement_notified_at, 126) AS claimedAt
      WHERE ta_id=? AND ta_procurement_notified_at IS NULL
    `, [orderId])).rows[0] || null;
  });
}

async function notifyReady(identity, companyId, orderId) {
  const body = 'Die verknüpfte Bestellung ist verfügbar. Du kannst den Auftrag jetzt prüfen und absenden.';
  const push = await sendDirectPushNotificationToUser({
    email: identity.email, tag: 'linked-order-ready-' + orderId,
    titleByLanguage: (lang) => lang === 'en' ? 'Order ready' : 'Auftrag bereit',
    bodyByLanguage: (lang) => lang === 'en'
      ? 'The linked purchase is available. You can now review and send the sales order.' : body,
    data: { path: 'temp-orders/' + orderId },
  });
  if (push.delivered > 0) return;
  if (!identity.email || !validateOrderMailConfig(config.orderMail, config.mailService).ok) {
    throw new Error('Kein Benachrichtigungskanal für den Auftragsinhaber verfügbar.');
  }
  await sendOrderMail({
    orderMailConfig: config.orderMail, mailServiceConfig: config.mailService, recipient: identity.email,
    subject: 'BMS-App: Auftrag bereit', body,
    clientMessageId: 'bms-app:linked-order-ready:' + companyId + ':' + orderId,
  });
}

async function runLinkedProcurement(finalizePurchase) {
  if (workerRunning) return;
  workerRunning = true;
  try {
    if (!await procurementSchemaReady()) return;
    const pending = await run(`
      SELECT o.ta_id AS id,o.ta_company_id AS companyId,o.ta_CreatedBy AS owner,o.ta_Status AS orderStatus
      FROM ${orders} o
      WHERE o.ta_Status IN (0,1,3) AND o.ta_procurement_notified_at IS NULL
        AND EXISTS (SELECT 1 FROM ${positions} p JOIN ${purchasePositions} pp ON pp.tbp_id=p.tap_purchase_position_id
          JOIN ${purchases} b ON b.tb_id=pp.tbp_tb_id AND b.tb_company_id=o.ta_company_id
          WHERE p.tap_ta_id=o.ta_id AND (
            (o.ta_Status IN (0,3) AND b.tb_status IN (0,2))
            OR (o.ta_Status=1 AND b.tb_status=2 AND NULLIF(p.tap_be_number,'') IS NULL)))
      ORDER BY o.ta_id
    `, []);
    for (const row of pending) {
      try {
        const identity = await getUserIdentityByShortCode(row.owner, row.companyId);
        if (!pilotFeaturesForIdentity(identity).linkedProcurement) continue;
        const database = await getDatabaseConnectionForCompanyId(row.companyId);
        if (!database) continue;
        if (finalizePurchase && Number(row.orderStatus) !== 1) {
          const current = await loadOrderProcurement(row.id, row.companyId);
          for (const id of current?.draftPurchaseIds || []) {
            try {
              await finalizePurchase({ database, mandant: database.name, userIdentity: identity, userEmail: identity.email },
                id, { draftOnly: true, linkedOnly: true });
            } catch (error) {
              logger.warn('Bestellübergabe für Bestellung ' + id + ': ' + error.message);
            }
          }
        }
        const claim = await reconcileOrder(database, row.id, row.owner);
        if (!claim) continue;
        try {
          await notifyReady(identity, row.companyId, row.id);
        } catch (error) {
          await run(`UPDATE ${orders} SET ta_procurement_notified_at=NULL WHERE ta_id=? AND ta_procurement_notified_at=CONVERT(datetime2(7),?,126)`,
            [row.id, claim.claimedAt]);
          throw error;
        }
      } catch (error) {
        logger.warn('Beschaffungsabgleich für Auftrag ' + row.id + ': ' + error.message);
      }
    }
  } catch (error) {
    logger.warn('Beschaffungsabgleich: ' + error.message);
  } finally {
    workerRunning = false;
  }
}

function startLinkedProcurementWorker(finalizePurchase) {
  void runLinkedProcurement(finalizePurchase);
  const timer = setInterval(() => void runLinkedProcurement(finalizePurchase), 60_000);
  timer.unref();
}

module.exports = {
  assertProcurementAccess, procurementSchemaReady, loadOrderProcurement, loadPurchaseOrderLinks,
  loadOrderProcurementLines, loadOrderProcurementStatuses,
  runLinkedProcurement, startLinkedProcurementWorker, procurementStatus, selectBmsPosition,
};
