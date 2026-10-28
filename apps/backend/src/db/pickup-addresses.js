const { runSQLQueryAccess } = require('./access');
const { createHttpError } = require('../utils');

const text = (value) => String(value ?? '').trim();
const normalized = (value) => text(value).replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');

function mapPickupAddress(row) {
  const isStrecke = Boolean(row.isStrecke);
  const prefix = isStrecke ? 'pickup' : 'warehouse';
  const name1 = text(row[`${prefix}Name1`]);
  const name2 = text(row[`${prefix}Name2`]);
  const street = text(row[`${prefix}Street`]);
  const postalCode = text(row[`${prefix}PostalCode`]);
  const city = text(row[`${prefix}City`]);
  const country = text(row.countryCode || row[`${prefix}Country`]);
  // A generic Strecke warehouse is never an address fallback. Its address
  // belongs to the trading company, not necessarily to the physical stock.
  const complete = Boolean(name1 && street && postalCode && city && country);
  return {
    warehouseId: text(row.warehouseId),
    locationHint: text(row.locationHint),
    source: isStrecke ? 'purchase_order' : 'warehouse',
    text: complete ? [name1, name2, street, `${postalCode} ${city}`, country].filter(Boolean).join(', ') : '',
    key: complete ? [name1, street, postalCode, city, country].map(normalized).join('|') : '',
  };
}

async function loadPositionPickupAddress(database, position, query = runSQLQueryAccess) {
  const rows = await query(database, `
    SELECT
      w.[kdLa_LagerID] AS warehouseId, w.[kdLa_Strecke] AS isStrecke,
      w.[kdLa_Name1] AS warehouseName1, w.[kdLa_Name2] AS warehouseName2,
      w.[kdLa_Strasse] AS warehouseStreet, w.[kdLa_PLZ] AS warehousePostalCode,
      w.[kdLa_Ort] AS warehouseCity, w.[kdLa_LK] AS warehouseCountry,
      p.[beP_LagerBeiStrecke] AS locationHint,
      d.[kdL_Name1] AS pickupName1, d.[kdL_Name2] AS pickupName2,
      d.[kdL_Strasse] AS pickupStreet, d.[kdL_PLZ] AS pickupPostalCode,
      d.[kdL_Ort] AS pickupCity, d.[kdL_LK] AS pickupCountry,
      land.[la_ISOalpha2] AS countryCode
    FROM [dbo].[tblBest_Position] p
    INNER JOIN [dbo].[tblBestellung] b ON b.[be_Bestellindex] = p.[beP_Bestellindex]
    INNER JOIN [dbo].[tblKun_Lager] w ON EXISTS (
      SELECT 1 FROM [dbo].[tblBest_Pos_Lager] stock
      WHERE stock.[bePL_BEposID] = p.[beP_BEposID] AND stock.[bePL_LagerID] = w.[kdLa_LagerID]
    )
    LEFT JOIN [dbo].[tblKun_LiefAdress] d
      ON d.[kdL_ID] = b.[be_KdNrLI] AND d.[kdL_KdNR] = b.[be_KundenNrKunde]
    LEFT JOIN [BMS].[dbo].[tblLand] land
      ON land.[la_LandISO] = CASE WHEN w.[kdLa_Strecke] = 1 THEN d.[kdL_LK] ELSE w.[kdLa_LK] END
    WHERE p.[beP_BEposID] = ?
  `, [text(position.beNumber)]);
  const warehouseId = text(position.warehouseId || position.warehouse);
  let matches = (rows || []).filter((row) => text(row.warehouseId) === warehouseId);
  if (!matches.length) {
    // Old temporary orders can contain the VL location text instead of its ID.
    // Accept that legacy key only when it identifies exactly one warehouse.
    matches = (rows || []).filter((row) => {
      const legacyLocation = row.isStrecke
        ? `Strecke${text(row.locationHint) ? `/${text(row.locationHint)}` : ''}`
        : [text(row.warehousePostalCode), text(row.warehouseCity)].filter(Boolean).join(' ');
      return legacyLocation === warehouseId;
    });
  }
  return matches.length === 1 ? mapPickupAddress(matches[0]) : null;
}

async function loadPickupAddresses({ positions, resolveDatabase, query = runSQLQueryAccess }) {
  const addresses = new Map();
  const unresolved = [];
  const seen = new Set();
  for (const position of positions || []) {
    const beNumber = text(position?.beNumber);
    const warehouseId = text(position?.warehouseId || position?.warehouse);
    if (!beNumber || !warehouseId) {
      throw createHttpError(400, 'BE-Position und Lager fehlen für die Abholadresse.', { code: 'MISSING_RESERVATION_KEYS' });
    }
    const positionKey = `${beNumber}\u001f${warehouseId}`;
    if (seen.has(positionKey)) continue;
    seen.add(positionKey);
    const database = await resolveDatabase(beNumber);
    const address = await loadPositionPickupAddress(database, { beNumber, warehouseId }, query);
    if (!address?.text) {
      unresolved.push({ beNumber, warehouseId, locationHint: address?.locationHint || '' });
      continue;
    }
    const entry = addresses.get(address.key) || { ...address, positions: [] };
    entry.positions.push({ beNumber, warehouseId });
    addresses.set(address.key, entry);
  }
  return { addresses: [...addresses.values()], unresolved, conflict: addresses.size > 1 };
}

function assertSinglePickupAddress(summary) {
  if (summary.conflict) {
    throw createHttpError(400, 'Die Positionen haben unterschiedliche Abholadressen. Bitte separate FCA-Aufträge je Abholort erstellen.', {
      code: 'TEMP_ORDER_PICKUP_ADDRESS_CONFLICT', addresses: summary.addresses,
    });
  }
}

function normalizePickupAddressInput(body, summary) {
  assertSinglePickupAddress(summary);
  const changed = body.deliveryAddressChanged ?? body.deliveryAddressManual;
  const manual = changed === true || changed === 1 || changed === '1' || changed === 'true';
  const hasCustomerAddressId = text(body.deliveryAddressId) !== '';
  const submitted = manual && !hasCustomerAddressId ? text(body.deliveryAddress) : '';
  const address = submitted || (summary.unresolved.length ? '' : summary.addresses[0]?.text);
  if (!address) {
    throw createHttpError(400, 'Bitte eine vollständige Abholadresse eingeben. Für mindestens eine Position fehlt eine eindeutige Adresse.', {
      code: 'TEMP_ORDER_PICKUP_ADDRESS_REQUIRED', unresolved: summary.unresolved,
    });
  }
  if (address.length > 500) {
    throw createHttpError(400, 'Die Abholadresse darf höchstens 500 Zeichen enthalten. Bitte den Adresstext kürzen.', {
      code: 'TEMP_ORDER_PICKUP_ADDRESS_TOO_LONG', maxLength: 500,
    });
  }
  // The customer delivery-address FK cannot identify a supplier's pickup
  // address or a warehouse. Persist a text snapshot using the existing fields.
  return { deliveryAddress: address, deliveryAddressId: null, deliveryAddressChanged: 1 };
}

module.exports = { mapPickupAddress, loadPositionPickupAddress, loadPickupAddresses, assertSinglePickupAddress, normalizePickupAddressInput };
