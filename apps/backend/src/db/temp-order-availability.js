const config = require('../config');
const { createHttpError } = require('../utils');
const { runSQLQueryAccess, withSqlTransaction } = require('./access');
const { productAvailabilitySource } = require('./product-availability');
const { buildTempPlanningKey, getTempOrderPlanningEntry, loadTempOrderPlanning } = require('./temp-order-planning');

const VIEW_SQL = productAvailabilitySource('availability');
const asText = (value) => String(value ?? '').trim();

async function loadProductContext(database, beNumber, warehouseId, { allowMissing = false } = {}) {
  const sqlByStorageId = `
    SELECT TOP 1
      [beP_Artikelindex] AS articleIndex,
      [Artikel] AS article,
      [Lagerort] AS warehouse,
      [Menge] AS amount,
      [bePR_Anzahl] AS reserved,
      [bePR_reserviertVon] AS reservedBy,
      [bePL_LagerID] AS storageId,
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
        [beP_Artikelindex] AS articleIndex,
        [Artikel] AS article,
        [Lagerort] AS warehouse,
        [Menge] AS amount,
        [bePR_Anzahl] AS reserved,
        [bePR_reserviertVon] AS reservedBy,
        [bePL_LagerID] AS storageId,
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

  if (!row && allowMissing) return { amount: 0, reserved: 0, storageId: warehouseId };
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
    articleIndex: asText(row.articleIndex),
    article: asText(row.article),
    warehouse: asText(row.warehouse),
    amount: Number(row.amount) || 0,
    reserved: Number(row.reserved) || 0,
    reservedBy: asText(row.reservedBy),
    storageId: asText(row.storageId) || warehouseId,
    about: asText(row.about),
    packaging: asText(row.packaging),
    mfi,
  };
}

function calculateTempOrderAvailableAmount(position, reservationInKg = 0, plannedAmount = 0) {
  const baseAmount = Math.max(
    (Number(position?.productContext?.amount) || 0)
      - (Number(position?.productContext?.reserved) || 0),
    0,
  ) + Math.max(Number(reservationInKg) || 0, 0);
  return Math.max(baseAmount - (Number(plannedAmount) || 0), 0);
}

async function assertTempOrderPositionsAvailable({ companyId, positions, excludeOrderId = null, query = null }) {
  const normalizedPositions = Array.isArray(positions) ? positions : [];
  if (!normalizedPositions.length) return;

  const planning = await loadTempOrderPlanning({
    companyId,
    excludeOrderId,
    keys: normalizedPositions,
    query,
  });
  const requestedByKey = new Map();

  for (const position of normalizedPositions) {
    const key = buildTempPlanningKey(position.beNumber, position.warehouseId);
    const current = requestedByKey.get(key) || { position, amountInKg: 0, reservationInKg: 0 };
    current.amountInKg += Number(position.amountInKg) || 0;
    current.reservationInKg += Math.max(Number(position.reservationInKg) || 0, 0);
    requestedByKey.set(key, current);
  }

  for (const { position, amountInKg, reservationInKg } of requestedByKey.values()) {
    const productReserved = Number(position.productContext?.reserved);
    const reservationCredit = Math.min(reservationInKg, Math.max(productReserved || 0, 0));
    const plannedAmount = getTempOrderPlanningEntry(
      planning,
      position.beNumber,
      position.warehouseId,
    ).totalAmountKg;
    const availableAmount = calculateTempOrderAvailableAmount(position, reservationCredit, plannedAmount);
    if (amountInKg > availableAmount + 0.000001) {
      throw createHttpError(409, `Die gewünschte Menge ist nicht mehr verfügbar. Aktuell verfügbar: ${availableAmount.toLocaleString('de-DE')} kg.`, {
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

// All App hand-offs for a company share the same transaction-owned SQL lock.
// It spans the stock check and claim, including retries in the mail worker.
async function lockTempOrderAvailability(query, companyId) {
  const result = await query(`
    DECLARE @lockResult int;
    EXEC @lockResult = sys.sp_getapplock
      @Resource = ?, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
    SELECT @lockResult AS lockResult;
  `, [`BMSApp:order-availability:${Number(companyId)}`]);
  if (!(Number(result.rows?.[0]?.lockResult) >= 0)) {
    throw createHttpError(409, 'Die Verfügbarkeit wird gerade geprüft. Bitte erneut versuchen.', {
      code: 'TEMP_ORDER_AVAILABILITY_BUSY',
    });
  }
}

async function withTempOrderAvailabilityLock(companyId, work) {
  return withSqlTransaction(config.sql.database, async (context) => {
    await lockTempOrderAvailability(context.query, companyId);
    return work(context);
  });
}

async function loadCurrentOrderPositions(database, positions, ownerShortCode, { allowAnyReservation = false } = {}) {
  const contexts = new Map();
  const result = [];
  for (const position of positions) {
    const warehouseId = asText(position.warehouseId ?? position.warehouse);
    const key = buildTempPlanningKey(position.beNumber, warehouseId);
    if (!contexts.has(key)) {
      contexts.set(key, await loadProductContext(database, position.beNumber, warehouseId, { allowMissing: true }));
    }
    const productContext = contexts.get(key);
    const ownsReservation = asText(productContext.reservedBy).toLowerCase() === asText(ownerShortCode).toLowerCase();
    result.push({
      ...position,
      warehouseId: productContext.storageId,
      productContext,
      // Saved order reservations have already passed the create/edit permission
      // check, which also permits full-access users to use another owner's row.
      reservationInKg: ownsReservation || allowAnyReservation ? position.reservationInKg : 0,
    });
  }
  return result;
}

module.exports = {
  loadProductContext,
  calculateTempOrderAvailableAmount,
  assertTempOrderPositionsAvailable,
  loadCurrentOrderPositions,
  lockTempOrderAvailability,
  withTempOrderAvailabilityLock,
};
