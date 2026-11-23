const { appTableDisplayName, appTableSql } = require('../db/app-tables');
const { runSQLQueryAccess } = require('../db/access');
const { productAvailabilitySource } = require('../db/product-availability');
const { buildTempPlanningKey, getTempOrderPlanningEntry, loadTempOrderPlanning } = require('../db/temp-order-planning');
const { parseMandantIdFromBeNumber } = require('../mandant-prefix');
const { pilotFeaturesForIdentity } = require('../pilot-features');
const { hasExecutiveAccess } = require('../executive-access');
const { createHttpError } = require('../utils');
const { P, read } = require('./storage');

const orderPositions = appTableSql('tempOrderPosition');
const text = (value) => String(value ?? '').trim();

async function hasOfferOrderSchema(query) {
  const result = await query(`
    SELECT CASE WHEN COL_LENGTH(?, N'tap_offer_position_id') IS NOT NULL
      AND COL_LENGTH(?, N'tagp_order_position_id') IS NOT NULL THEN 1 ELSE 0 END AS ready
  `, [appTableDisplayName('tempOrderPosition'), appTableDisplayName('tempOfferPosition')]);
  return Number(result.rows[0]?.ready) === 1;
}

async function linkedOfferPositions(query, offerId) {
  const result = await query(`
    SELECT tagp_id AS id FROM ${P} WHERE tagp_offer_id=? AND tagp_order_position_id IS NOT NULL
  `, [offerId]);
  return new Set(result.rows.map((row) => Number(row.id)));
}

async function readOfferForOrder(query, req, offerId, owner, locked = false) {
  if (!await hasOfferOrderSchema(query)) {
    throw createHttpError(503, 'Die Datenbank muss für die Angebotsübernahme aktualisiert werden.', {
      code: 'OFFER_ORDER_SCHEMA_MISSING',
    });
  }
  const offer = await read(query, offerId, req.database.firmaId, owner, locked);
  if (!offer) {
    throw createHttpError(404, 'Angebot nicht gefunden.', { code: 'OFFER_NOT_FOUND' });
  }
  const linked = await linkedOfferPositions(query, offer.id);
  return { ...offer, positions: offer.positions.filter((position) => !linked.has(Number(position.id))) };
}

async function assertOfferPositionsEditable(query, offerId) {
  if (await hasOfferOrderSchema(query) && (await linkedOfferPositions(query, offerId)).size) {
    throw createHttpError(409, 'Mindestens eine Position dieses Angebots ist mit einem Auftrag verknüpft.', {
      code: 'OFFER_POSITIONS_LINKED',
    });
  }
}

function orderConversionInput(req, body, positions) {
  const offerId = text(body.offerSourceId);
  const ids = positions.map((position) => text(position?.offerPositionId));
  if (!offerId && !ids.some(Boolean)) return null;
  if (!pilotFeaturesForIdentity(req.userIdentity).offerToOrder) {
    throw createHttpError(403, 'Die Angebotsübernahme ist nicht freigeschaltet.', { code: 'PILOT_FEATURE_FORBIDDEN' });
  }
  const isId = (value) => /^[1-9]\d*$/.test(value) && Number(value) <= 2147483647;
  const version = text(body.offerSourceVersion);
  if (!isId(offerId) || !/^0x[0-9a-f]{16}$/i.test(version) || ids.some((id) => id && !isId(id))
    || new Set(ids.filter(Boolean)).size !== ids.filter(Boolean).length) {
    throw createHttpError(400, 'Ungültige Angebots- oder Positionsreferenz.', { code: 'INVALID_OFFER_ORDER_SOURCE' });
  }
  return { offerId: Number(offerId), version, positionIds: ids.map((id) => Number(id) || null) };
}

async function assertOrderConversion(query, req, conversion, customerId, positions) {
  const owner = hasExecutiveAccess(req.userIdentity) ? null : req.userIdentity.shortCode;
  const offer = await readOfferForOrder(query, req, conversion.offerId, owner, true);
  if (text(offer.version).toLowerCase() !== conversion.version.toLowerCase()) {
    throw createHttpError(409, 'Das Angebot wurde inzwischen geändert. Bitte neu laden.', { code: 'OFFER_VERSION_CONFLICT' });
  }
  if (text(offer.customerId) !== customerId) {
    throw createHttpError(400, 'Der Auftrag muss für den Kunden des Angebots erfasst werden.', { code: 'OFFER_ORDER_CUSTOMER_MISMATCH' });
  }
  const sources = new Map(offer.positions.map((position) => [Number(position.id), position]));
  positions.forEach((position, index) => {
    const sourceId = conversion.positionIds[index];
    if (!sourceId) return;
    const source = sources.get(sourceId);
    if (!source || text(source.articleIndex).toLowerCase() !== text(position.articleIndex).toLowerCase()
      || !offerKilogramsPerUnit(source.unit)) {
      throw createHttpError(409, 'Eine Angebotsposition wurde bereits übernommen oder passt nicht zum gewählten Artikel.', {
        code: 'OFFER_ORDER_POSITION_CONFLICT',
      });
    }
  });
}

async function linkOfferPosition(query, offerPositionId, orderPositionId) {
  const result = await query(`
    UPDATE ${P} SET tagp_order_position_id=?
    OUTPUT INSERTED.tagp_id AS id
    WHERE tagp_id=? AND tagp_order_position_id IS NULL
  `, [orderPositionId, offerPositionId]);
  if (!result.rows.length) {
    throw createHttpError(409, 'Die Angebotsposition wurde bereits übernommen.', { code: 'OFFER_ORDER_POSITION_CONFLICT' });
  }
}

async function unlinkOfferPositions(query, orderId, retainedIds = []) {
  await query(`
    UPDATE p SET p.tagp_order_position_id=NULL
    FROM ${P} p JOIN ${orderPositions} o ON o.tap_id=p.tagp_order_position_id
    WHERE o.tap_ta_id=? ${retainedIds.length ? `AND o.tap_id NOT IN (${retainedIds.map(() => '?').join(',')})` : ''}
  `, [orderId, ...retainedIds]);
}

function offerKilogramsPerUnit(unit) {
  const value = text(unit).toLowerCase();
  if (value === 'kg') return 1;
  if (['t', 'to', 'tonne', 'tonnen'].includes(value)) return 1000;
  return null;
}

async function prepareOfferOrder(req, offer) {
  const articleIndexes = [...new Set(offer.positions.map((position) => position.articleIndex))];
  if (!articleIndexes.length) {
    throw createHttpError(409, 'Alle Positionen dieses Angebots wurden bereits übernommen.', {
      code: 'OFFER_ORDER_NO_POSITIONS',
    });
  }
  const rows = await runSQLQueryAccess(req.database, `
    SELECT v.[beP_Artikelindex] AS articleIndex, v.[Bestell-Pos] AS beNumber,
      v.[bePL_LagerID] AS warehouseId, v.[Lagerort] AS warehouse, v.[EP] AS costPrice,
      v.[Menge] AS amount, v.[bePR_Anzahl] AS reserved,
      r.bePR_reserviertVon AS reservedBy, r.bePR_gueltigBis AS reservationDate,
      sys.fn_varbintohexstr(r.zz_rowver) AS reservationVersion, wpz.wpzId
    FROM ${productAvailabilitySource('v')}
    LEFT JOIN dbo.tblBest_Pos_Reserviert r ON r.bePR_BEposID=v.[Bestell-Pos] AND r.bePR_LagerID=v.[bePL_LagerID]
    OUTER APPLY (
      SELECT TOP (1) w.bePZ_ID AS wpzId FROM dbo.tblBest_Pos_WPZ w
      WHERE w.bePZ_BEposID=v.[Bestell-Pos] ORDER BY w.bePZ_ID DESC
    ) wpz
    WHERE v.[beP_Artikelindex] IN (${articleIndexes.map(() => '?').join(',')})
      AND UPPER(LTRIM(RTRIM(v.[Einheit])))=N'KG'
    ORDER BY v.[Bestell-Pos], v.[bePL_LagerID]
  `, articleIndexes);
  const stock = rows.filter((row) => text(row.beNumber) && text(row.warehouseId)
    && [null, Number(req.database.firmaId)].includes(parseMandantIdFromBeNumber(row.beNumber)));
  const planning = await loadTempOrderPlanning({ companyId: req.database.firmaId, keys: stock });
  const allocated = new Map();
  const positions = offer.positions.map((position) => {
    const kgPerUnit = offerKilogramsPerUnit(position.unit);
    const amountInKg = kgPerUnit ? Number((Number(position.quantity) * kgPerUnit).toFixed(3)) : null;
    const matches = kgPerUnit ? stock.filter((row) => text(row.articleIndex) === text(position.articleIndex)) : [];
    const candidates = matches.map((row) => {
      const key = buildTempPlanningKey(row.beNumber, row.warehouseId);
      const ownsReservation = position.reserve && text(row.beNumber) === text(position.beNumber)
        && text(row.warehouseId) === text(position.warehouseId)
        && text(row.reservedBy).toLowerCase() === text(offer.createdBy).toLowerCase()
        && new Date(row.reservationDate).getTime() >= Date.now()
        && Boolean(position.reservationVersion)
        && text(row.reservationVersion).toLowerCase() === text(position.reservationVersion).toLowerCase();
      const reserved = Number(row.reserved) || 0;
      const planned = getTempOrderPlanningEntry(planning, row.beNumber, row.warehouseId).totalAmountKg;
      return {
        key, beNumber: text(row.beNumber), warehouseId: text(row.warehouseId), warehouse: row.warehouse,
        costPrice: Number(row.costPrice) || null,
        wpzId: Number(row.wpzId) || null,
        available: Math.max(Math.max(Number(row.amount) - reserved, 0) + (ownsReservation ? reserved : 0) - planned, 0),
        reservationInKg: ownsReservation && reserved > 0 ? reserved : null,
        reservationDate: ownsReservation ? row.reservationDate : null,
      };
    }).filter((candidate) => candidate.available > 0);
    const sufficient = candidates.filter((candidate) => candidate.available - (allocated.get(candidate.key) || 0) >= amountInKg);
    const selected = sufficient.find((candidate) => candidate.reservationInKg)
      || (sufficient.length === 1 ? sufficient[0] : null);
    if (selected) allocated.set(selected.key, (allocated.get(selected.key) || 0) + amountInKg);
    return {
      offerPositionId: position.id, articleIndex: position.articleIndex, article: position.article,
      offerQuantity: position.quantity, offerUnit: position.unit, amountInKg,
      price: kgPerUnit ? (Number(position.price) * 1000) / (Number(position.priceBasis) * kgPerUnit) : null,
      costPrice: Number(position.costPrice) || selected?.costPrice || null,
      hasOfferCostPrice: Number(position.costPrice) > 0,
      deliveryDate: position.deliveryDate, valutaDate: position.valutaDate,
      wpzOriginal: position.wpzOriginal, wpzComment: position.wpzComment,
      wpzId: selected?.wpzId,
      beNumber: selected?.beNumber, warehouseId: selected?.warehouseId,
      reservationInKg: selected?.reservationInKg, reservationDate: selected?.reservationDate,
      selectedStockKey: selected?.key || '', candidates,
    };
  });
  return {
    version: offer.version,
    clientReferenceId: offer.customerId, clientName: offer.customerName, clientAddress: offer.customerAddress,
    clientRepresentative: offer.contact, clientRepresentativeId: offer.contactId,
    customerOrderNumber: offer.customerReference, comment: offer.internalNote,
    specialPaymentCondition: offer.specialPaymentCondition,
    specialPaymentText: offer.paymentText, specialPaymentId: offer.paymentId,
    deliveryType: offer.deliveryTerms, deliveryTypeId: offer.deliveryTermsId,
    packagingType: offer.packaging, packagingTypeId: offer.packagingId,
    deliveryAddress: offer.deliveryAddress, deliveryAddressId: offer.deliveryAddressId,
    deliveryAddressChanged: offer.deliveryAddressManual, positions,
  };
}

module.exports = {
  readOfferForOrder, assertOfferPositionsEditable, orderConversionInput, assertOrderConversion,
  linkOfferPosition, unlinkOfferPositions, prepareOfferOrder,
};
