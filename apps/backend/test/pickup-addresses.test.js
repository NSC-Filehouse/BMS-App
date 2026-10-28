const test = require('node:test');
const assert = require('node:assert/strict');
const { isFcaIncoterm } = require('../src/incoterm');
const { mapPickupAddress, loadPositionPickupAddress, loadPickupAddresses, normalizePickupAddressInput } = require('../src/db/pickup-addresses');
const { formatOrderMailBody } = require('../src/mail/order-mail');

const row = (overrides = {}) => ({
  warehouseId: 'LG0031', isStrecke: true, locationHint: 'B-Antwerpen',
  warehouseName1: 'Trading company', warehouseStreet: 'Office street 18', warehousePostalCode: '20095', warehouseCity: 'Hamburg', warehouseCountry: 'D',
  pickupName1: 'Factory Feluy', pickupStreet: 'Plant road 1', pickupPostalCode: '7190', pickupCity: 'Feluy', pickupCountry: 'B', countryCode: 'BE',
  ...overrides,
});

test('recognizes FCA terms independently of tenant IDs and language suffixes', () => {
  for (const value of ['FCA', ' FCA / Free Carrier ', 'fca - Ab Werk', 'FCA–Werk']) assert.equal(isFcaIncoterm(value), true);
  for (const value of ['', 'CPT / Frachtfrei', 'Not FCA', 'FCAfoo']) assert.equal(isFcaIncoterm(value), false);
});

test('Strecke uses the linked BE address even when the location hint names a different city', async () => {
  const address = await loadPositionPickupAddress({ firmaId: 3 }, { beNumber: '3-02-26-00968-01', warehouseId: 'LG0031' }, async (database, sql, params) => {
    assert.deepEqual(params, ['3-02-26-00968-01']);
    assert.match(sql, /d\.\[kdL_ID\] = b\.\[be_KdNrLI\]/);
    assert.match(sql, /d\.\[kdL_KdNR\] = b\.\[be_KundenNrKunde\]/);
    assert.match(sql, /stock\.\[bePL_LagerID\] = w\.\[kdLa_LagerID\]/);
    return [row()];
  });
  assert.equal(address.source, 'purchase_order');
  assert.match(address.text, /Factory Feluy, Plant road 1, 7190 Feluy, BE/);
  assert.doesNotMatch(address.text, /Hamburg|Office street|Antwerpen/);
});

test('a missing Strecke address never falls back to the trading company address', () => {
  assert.equal(mapPickupAddress(row({ pickupStreet: null })).text, '');
  const warehouse = mapPickupAddress(row({ isStrecke: false, countryCode: 'DE' }));
  assert.equal(warehouse.source, 'warehouse');
  assert.match(warehouse.text, /Trading company, Office street 18, 20095 Hamburg, DE/);
});

test('warehouse identity and legacy location text must identify a unique stock warehouse', async () => {
  const query = async () => [row(), row({ warehouseId: 'LG0032' })];
  assert.equal(await loadPositionPickupAddress({}, { beNumber: 'BE', warehouseId: 'not-assigned' }, query), null);
  assert.equal(await loadPositionPickupAddress({}, { beNumber: 'BE', warehouseId: 'Strecke/B-Antwerpen' }, query), null);
  assert.equal((await loadPositionPickupAddress({}, { beNumber: 'BE', warehouseId: 'LG0032' }, query)).warehouseId, 'LG0032');
});

test('multiple BE positions at the same address are grouped, distinct sites conflict even with the same Strecke ID', async () => {
  let calls = 0;
  const positions = [{ beNumber: 'BE1', warehouseId: 'LG0031' }, { beNumber: 'BE2', warehouseId: 'LG0031' }, { beNumber: 'BE1', warehouseId: 'LG0031' }];
  const resolveDatabase = async () => ({ name: 'BMS.FRU' });
  const same = await loadPickupAddresses({ positions, resolveDatabase, query: async () => { calls++; return [row()]; } });
  assert.equal(calls, 2);
  assert.equal(same.addresses.length, 1);
  assert.equal(same.addresses[0].positions.length, 2);
  assert.equal(same.conflict, false);
  const different = await loadPickupAddresses({ positions, resolveDatabase, query: async (database, sql, params) => [row(params[0] === 'BE2' ? { pickupStreet: 'Scheldelaan 4', pickupCity: 'Antwerpen', pickupPostalCode: '2030' } : {})] });
  assert.equal(different.conflict, true);
  assert.throws(() => normalizePickupAddressInput({ deliveryAddress: 'Chosen manually', deliveryAddressChanged: true }, different), error => error.details.code === 'TEMP_ORDER_PICKUP_ADDRESS_CONFLICT');
});

test('FCA uses the existing text fields with NULL customer FK and preserves a manually changed snapshot', () => {
  const summary = { addresses: [mapPickupAddress(row())], unresolved: [], conflict: false };
  const automaticallyResolved = normalizePickupAddressInput({ deliveryAddress: 'Sales customer address', deliveryAddressId: 42 }, summary);
  assert.equal(automaticallyResolved.deliveryAddress, summary.addresses[0].text);
  assert.equal(automaticallyResolved.deliveryAddressId, null);
  assert.equal(automaticallyResolved.deliveryAddressChanged, 1);
  assert.deepEqual(normalizePickupAddressInput({ deliveryAddress: 'Corrected pickup address', deliveryAddressChanged: 'true', deliveryAddressId: '' }, summary), {
    deliveryAddress: 'Corrected pickup address', deliveryAddressId: null, deliveryAddressChanged: 1,
  });
  const missing = { addresses: [], unresolved: [{ beNumber: 'BE1' }], conflict: false };
  assert.throws(() => normalizePickupAddressInput({ clientAddress: 'Sales customer address' }, missing), error => error.details.code === 'TEMP_ORDER_PICKUP_ADDRESS_REQUIRED');
  assert.equal(normalizePickupAddressInput({ deliveryAddress: 'Manual pickup address', deliveryAddressChanged: true }, missing).deliveryAddress, 'Manual pickup address');
  assert.throws(() => normalizePickupAddressInput({ deliveryAddress: 'a'.repeat(501), deliveryAddressChanged: true }, summary), error => error.details.code === 'TEMP_ORDER_PICKUP_ADDRESS_TOO_LONG');
});

test('invalid position keys fail before a SQL read', async () => {
  await assert.rejects(loadPickupAddresses({ positions: [null], resolveDatabase: async () => { throw new Error('Unexpected SQL read'); } }), error => error.status === 400);
});

test('the finalization mail labels the persisted FCA address as pickup and retains ordinary delivery labels for CPT', () => {
  const order = { deliveryType: 'FCA / Free Carrier', deliveryAddress: 'Factory, Plant road 1', deliveryAddressId: null, comment: 'Existing order note' };
  const fca = formatOrderMailBody({ order, positions: [] });
  assert.match(fca, /Abholadresse: Factory, Plant road 1/);
  assert.match(fca, /Bemerkung: Existing order note/);
  assert.doesNotMatch(fca, /Lieferadress-ID|Lieferadresse:/);
  assert.match(formatOrderMailBody({ order: { ...order, deliveryType: 'CPT' }, positions: [] }), /Lieferadresse: Factory, Plant road 1/);
});
