const { appTableDisplayName, appTableSql } = require('../db/app-tables');
const { runSQLQueryAccess } = require('../db/access');
const { productAvailabilitySource } = require('../db/product-availability');
const { buildTempPlanningKey, getTempOrderPlanningEntry, loadTempOrderPlanning } = require('../db/temp-order-planning');
const { parseMandantIdFromBeNumber } = require('../mandant-prefix');
const { pilotFeaturesForIdentity } = require('../pilot-features');
const { hasExecutiveAccess } = require('../executive-access');
const { createHttpError } = require('../utils');
const { H, P, read } = require('./storage');

const orderPositions = appTableSql('tempOrderPosition');
const offerMail = 'BMSApp.OptionOfferMailOutbox';
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
  if (offer.status === 1) {
    throw createHttpError(409, 'Bitte zuerst die BMS-Übernahme des Angebots abwarten.', {
      code: 'OFFER_ORDER_WAITING_FOR_BMS',
    });
  }
  if (offer.status === 5) {
    throw createHttpError(409, 'Dieses Angebot wurde als „Kunde hat kein Interesse“ markiert.', {
      code: 'OFFER_ORDER_NOT_INTERESTED',
    });
  }
  const linked = await linkedOfferPositions(query, offer.id);
  const positions = offer.positions.filter((position) => !linked.has(Number(position.id)));
  const [schema] = (await query(`SELECT CASE WHEN COL_LENGTH(?, 'tagp_option_position_id') IS NOT NULL
    AND COL_LENGTH(?, 'TempOfferId') IS NOT NULL THEN 1 ELSE 0 END AS sourcesReady`,
  [appTableDisplayName('tempOfferPosition'), offerMail])).rows;
  if (Number(schema?.sourcesReady) === 1 && positions.length) {
    const rows = (await query(`
      SELECT p.tagp_id AS id, COALESCE(p.tagp_option_position_id, legacy.optionPositionId) AS optionPositionId,
             op.opp_op_id AS optionId, stock.beNumber AS stockSourceBeNumber
      FROM ${P} p
      OUTER APPLY (
        SELECT CASE WHEN COUNT(DISTINCT m.OptionPositionId)=1 THEN MIN(m.OptionPositionId) END AS optionPositionId
        FROM ${offerMail} m
        WHERE m.TempOfferId=p.tagp_offer_id AND m.CompanyId=? AND m.ArticleIndex=p.tagp_article_index
        AND (SELECT COUNT(*) FROM ${P} x WHERE x.tagp_offer_id=p.tagp_offer_id)=1
      ) legacy
      OUTER APPLY (
        SELECT CASE WHEN COUNT(DISTINCT JSON_VALUE(d.OfferJson, '$.stockOrderPosition'))=1
          THEN MIN(JSON_VALUE(d.OfferJson, '$.stockOrderPosition')) END AS beNumber
        FROM ${offerMail} m
        JOIN BMSApp.OptionOfferDocument d ON d.OptionOfferMailId=m.Id
        WHERE m.TempOfferId=p.tagp_offer_id AND m.CompanyId=? AND m.ArticleIndex=p.tagp_article_index
          AND m.StockPositionKey IS NOT NULL
          AND (SELECT COUNT(*) FROM ${P} x WHERE x.tagp_offer_id=p.tagp_offer_id)=1
      ) stock
      LEFT JOIN ${appTableSql('optionPositions')} op ON op.opp_id=COALESCE(p.tagp_option_position_id,legacy.optionPositionId)
      WHERE p.tagp_offer_id=?
    `, [req.database.firmaId, req.database.firmaId, offer.id])).rows;
    const sources = new Map(rows.map((row) => [Number(row.id), row]));
    for (const position of positions) {
      const source = sources.get(Number(position.id));
      if (source?.optionId) Object.assign(position, { optionId: source.optionId, optionPositionId: source.optionPositionId });
      if (!position.sourceBeNumber && source?.stockSourceBeNumber) position.sourceBeNumber = source.stockSourceBeNumber;
    }
  }
  return { ...offer, positions };
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

async function resolveOfferSuppliers(database, sources) {
  if (!sources.length) return new Map();
  const rows = await runSQLQueryAccess(database, `
    SELECT DISTINCT src.id AS positionId, k.kd_KdNR AS id,
      COALESCE(NULLIF(k.kd_Name1,N''), NULLIF(k.kd_Name2,N''), k.kd_KdNR) AS name, k.kd_Ort AS city
    FROM OPENJSON(?) WITH (id int, articleIndex nvarchar(50), beNumber nvarchar(17), sourceSupplierId nvarchar(50)) src
    JOIN dbo.tblBest_Position p ON p.beP_Artikelindex=src.articleIndex
      AND (src.sourceSupplierId IS NOT NULL OR p.beP_BEposID=src.beNumber)
    JOIN dbo.tblBestellung b ON b.be_Bestellindex=p.beP_Bestellindex
      AND (src.sourceSupplierId IS NULL OR b.be_KdNr=src.sourceSupplierId)
    JOIN dbo.tblKunden k ON k.kd_KdNR=b.be_KdNr
    WHERE CONCAT(k.kd_Name1,N' ',k.kd_Name2) NOT LIKE N'%gelöscht%'
  `, [JSON.stringify(sources)]);
  const matches = new Map();
  for (const { positionId, id, name, city } of rows) {
    const key = Number(positionId);
    matches.set(key, matches.has(key) ? null : { id: text(id), name, city });
  }
  return matches;
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
      || !offerKilogramsPerUnit(source.unit)
      || (position.purchaseDraft && source.optionPositionId && Number(source.optionPositionId) !== Number(position.optionPositionId))
      || (position.savedPurchasePositionId && Number(source.optionPositionId || 0) !== Number(position.optionPositionId || 0))) {
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

async function markOfferConverted(query, offerId, companyId, userShortCode) {
  await query(`
    UPDATE offer SET tag_status=4,tag_modified_at=SYSUTCDATETIME(),tag_modified_by=?
    FROM ${H} offer
    WHERE offer.tag_id=? AND offer.tag_company_id=? AND offer.tag_status<>4
      AND NOT EXISTS (SELECT 1 FROM ${P} WHERE tagp_offer_id=offer.tag_id AND tagp_order_position_id IS NULL)
  `, [userShortCode, offerId, companyId]);
}

async function unlinkOfferPositions(query, orderId, retainedIds = []) {
  const result = await query(`
    UPDATE p SET p.tagp_order_position_id=NULL
    OUTPUT DELETED.tagp_offer_id AS id
    FROM ${P} p JOIN ${orderPositions} o ON o.tap_id=p.tagp_order_position_id
    WHERE o.tap_ta_id=? ${retainedIds.length ? `AND o.tap_id NOT IN (${retainedIds.map(() => '?').join(',')})` : ''}
  `, [orderId, ...retainedIds]);
  const affected = [...new Set(result.rows.map((row) => Number(row.id)))];
  if (affected.length) {
    await query(`UPDATE ${H}
      SET tag_status=CASE WHEN NULLIF(tag_bms_offer_number,'') IS NULL THEN 0 ELSE 2 END,tag_modified_at=SYSUTCDATETIME()
      WHERE tag_status=4 AND tag_id IN (${affected.map(() => '?').join(',')})
    `, affected);
  }
}

async function loadOfferOrderIds(query, offerId, companyId) {
  const result = await query(`
    SELECT DISTINCT o.ta_id AS id FROM ${P} p
      JOIN ${orderPositions} op ON op.tap_id=p.tagp_order_position_id AND op.tap_offer_position_id=p.tagp_id
      JOIN ${appTableSql('tempOrder')} o ON o.ta_id=op.tap_ta_id
    WHERE p.tagp_offer_id=? AND o.ta_company_id=?
    ORDER BY o.ta_id
  `, [offerId, companyId]);
  return result.rows.map((row) => Number(row.id));
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
      optionId: position.optionId, optionPositionId: position.optionPositionId,
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
      requiresPurchase: Boolean(text(position.articleIndex)) && Number.isSafeInteger(amountInKg) && amountInKg > 0 && sufficient.length === 0,
    };
  });
  const purchaseSources = new Set(positions.filter((position) => position.requiresPurchase && !position.optionPositionId)
    .map((position) => Number(position.offerPositionId)));
  const suppliers = await resolveOfferSuppliers(req.database, offer.positions.filter((position) =>
    purchaseSources.has(Number(position.id)) && (position.sourceSupplierId || position.sourceBeNumber || position.beNumber))
    .map(({ id, articleIndex, sourceSupplierId, sourceBeNumber, beNumber }) =>
      ({ id, articleIndex, sourceSupplierId, beNumber: sourceBeNumber || beNumber })));
  for (const position of positions) {
    const supplier = suppliers.get(Number(position.offerPositionId));
    if (supplier) position.optionSupplier = supplier;
  }
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
  linkOfferPosition, markOfferConverted, unlinkOfferPositions, prepareOfferOrder, loadOfferOrderIds, hasOfferOrderSchema,
};
