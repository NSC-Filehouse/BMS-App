const test = require('node:test');
const assert = require('node:assert/strict');
const planning = require('../src/db/temp-order-planning');

let order;
let savedPositions;
let writes;
let nextId = 42;
let pickupReads;
const positionColumns = ['tap_id', 'tap_ta_id', 'tap_line_no', 'tap_be_number', 'tap_Artikelindex', 'tap_article', 'tap_Artikelname_Original',
  'tap_Artikelname_Gewechselt', 'tap_amount_in_kg', 'tap_warehouse', 'tap_price', 'tap_ep', 'tap_delivery_date', 'tap_ValutaDatum',
  'tap_about', 'tap_mfi', 'tap_wpz_id', 'tap_wpz_original', 'tap_wpz_comment', 'tap_Verpackungsart', 'tap_Verpackungsart_id',
  'tap_Verpackungsart_Gewechselt', 'tap_CreatedBy', 'tap_CreateDate'];
const orderColumns = ['ta_id', 'ta_company_id', 'ta_ClientReferenceId', 'ta_KundenAuftragsnummer', 'ta_client_name', 'ta_client_address',
  'ta_client_representative', 'ta_client_representative_id', 'ta_comment', 'ta_special_payment_condition', 'ta_special_payment_text',
  'ta_special_payment_id', 'ta_delivery_type_id', 'ta_delivery_type', 'ta_packaging_type', 'ta_packaging_type_id', 'ta_delivery_address',
  'ta_delivery_address_id', 'ta_delivery_address_changed', 'ta_completed', 'ta_Status', 'ta_CreatedBy', 'ta_CreateDate', 'ta_LastModifiedBy', 'ta_LastModifiedDate'];

function reset() { order = null; savedPositions = []; writes = []; pickupReads = 0; }
function insertFields(sql, params) {
  const columns = sql.match(/INSERT INTO[^\n]+\(([\s\S]*?)\)\s*(?:OUTPUT|VALUES)/i)[1];
  return Object.fromEntries([...columns.matchAll(/\[([^\]]+)\]/g)].map((match, index) => [match[1], params[index]]));
}
function updateFields(sql, params) {
  return Object.fromEntries([...sql.split(/\bWHERE\b/i)[0].matchAll(/\[([^\]]+)\]\s*=\s*\?/g)].map((match, index) => [match[1], params[index]]));
}
function mappedPosition(row) {
  return {
    id: row.tap_id, lineNo: row.tap_line_no, beNumber: row.tap_be_number, articleIndex: row.tap_Artikelindex,
    article: row.tap_article, articleOriginal: row.tap_Artikelname_Original, articleChanged: row.tap_Artikelname_Gewechselt,
    amountInKg: row.tap_amount_in_kg, price: row.tap_price, costPrice: row.tap_ep,
    warehouse: row.tap_warehouse, warehouseId: row.tap_warehouse, deliveryDate: row.tap_delivery_date, valutaDate: row.tap_ValutaDatum,
    originalPackagingType: row.tap_Verpackungsart, originalPackagingTypeId: row.tap_Verpackungsart_id,
    about: row.tap_about, mfi: row.tap_mfi, createdBy: row.tap_CreatedBy, createdAt: row.tap_CreateDate,
  };
}
async function sqlQuery(database, sql, params = []) {
  if (sql.includes('[INFORMATION_SCHEMA].[COLUMNS]')) return (params[1] === 'tbl_Temp_Auftrag' ? orderColumns : positionColumns).map(col => ({ col }));
  if (sql.includes('[spT_ID]')) return [{ id: 1, text: 'Sackware' }];
  if (sql.includes('[tblZahltext_Sprachen]')) return [{ id: 1, text: '30 Tage' }];
  if (sql.includes('INSERT INTO') && sql.includes('[tbl_Temp_Auftrag]')) {
    writes.push(sql); order = { ...insertFields(sql, params), ta_id: nextId++ }; return [order];
  }
  if (sql.includes('INSERT INTO') && sql.includes('[tbl_Temp_Auf_Position]')) {
    writes.push(sql); savedPositions.push({ ...insertFields(sql, params), tap_id: savedPositions.length + 1 }); return [];
  }
  if (sql.includes('UPDATE') && sql.includes('[tbl_Temp_Auftrag]')) { writes.push(sql); Object.assign(order, updateFields(sql, params)); return []; }
  if (sql.includes('UPDATE') && sql.includes('[tbl_Temp_Auf_Position]')) { writes.push(sql); Object.assign(savedPositions[0], updateFields(sql, params)); return []; }
  if (sql.includes('DELETE FROM') && sql.includes('[tbl_Temp_Auf_Position]')) return [];
  if (sql.includes('FROM') && sql.includes('[tbl_Temp_Auf_Position]')) return savedPositions.filter(row => row.tap_ta_id === params[0]).map(mappedPosition);
  if (sql.includes('FROM') && sql.includes('[tbl_Temp_Auftrag]') && !sql.includes('[tbl_Temp_Auftrag_Anhang]')) {
    return order ? [{ ...order, id: order.ta_id, completed: false, orderStatus: 0 }] : [];
  }
  return [];
}

require.cache[require.resolve('../src/db/access')] = { exports: {
  canConnectToDatabase: async () => { throw new Error('Unexpected database availability query'); },
  runSQLQueryFx: async () => { throw new Error('Unexpected FX query'); },
  runSQLQuerySqlServer: sqlQuery,
  runSQLQueryAccess: async (database, sql, params) => {
    if (sql.includes('AS warehouseName1')) {
      pickupReads++;
      return [{ warehouseId: 'L1', isStrecke: true, pickupName1: 'Factory', pickupStreet: params[0].includes('002') ? 'Other road 2' : 'Plant road 1', pickupPostalCode: '7190', pickupCity: 'Feluy', countryCode: 'BE' }];
    }
    if (sql.includes('[tblLieferbedingungen]')) return [{ id: params[0], text: Number(params[0]) === 1 ? 'FCA / Free Carrier' : 'CPT / Frachtfrei' }];
    if (sql.includes('[tblKunden]')) return [{ paymentTextId: 1 }];
    if (sql.includes('AS packagingType')) return [{ packagingType: 'Sackware' }];
    if (sql.includes('AS mfiBase')) return [{ articleIndex: 'A1', article: 'Product', warehouse: 'Strecke/Feluy', amount: 1000, reserved: 0, mfiBase: 2 }];
    return [];
  },
  withSqlTransaction: async (database, work) => work({ query: async (sql, params) => ({ rows: await sqlQuery(database, sql, params), rowsAffected: [1] }) }),
} };
require.cache[require.resolve('../src/db/customer-access')] = { exports: {
  getCustomerAccessScope: async () => ({ isFullAccess: true }), loadVisibleCustomer: async () => ({ kd_KdNR: 'C1' }),
} };
require.cache[require.resolve('../src/db/delivery-addresses')] = { exports: {
  loadCustomerDeliveryAddresses: async () => [{ id: 51, text: 'Customer warehouse' }],
} };
require.cache[require.resolve('../src/db/temp-order-planning')] = { exports: { ...planning, loadTempOrderPlanning: async () => new Map() } };
const router = require('../src/routes/temp-orders.routes');

function payload(overrides = {}) {
  return { clientReferenceId: 'C1', clientName: 'Sales customer', clientAddress: 'Sales customer registered address',
    incotermId: 1, packagingTypeId: 1, specialPaymentId: 1,
    deliveryAddress: 'Customer warehouse', deliveryAddressId: 51,
    positions: [{ beNumber: '3-02-26-001-01', warehouseId: 'L1', article: 'Product', amountInKg: 100, salePricePerKg: 2000, costPricePerKg: 1000, deliveryDate: '2026-11-02' }],
    ...overrides };
}
function request(method, body) {
  const route = router.stack.find(layer => layer.route?.path === (method === 'post' ? '/temp-orders' : '/temp-orders/:id') && layer.route.methods[method]).route;
  return new Promise((resolve, reject) => {
    const req = { body, params: { id: String(order?.ta_id || 42) }, query: {}, files: [], userIdentity: { shortCode: 'NSC' }, mandant: 'Frupack', database: { firmaId: 3, databaseName: 'BMS.FRU' } };
    const res = { status: () => res, json: resolve };
    route.stack.at(-1).handle(req, res, reject);
  });
}

test('create, edit and copy persist FCA pickup text in the existing fields without the sales customer FK', async () => {
  reset();
  const created = await request('post', payload());
  assert.equal(order.ta_delivery_address, 'Factory, Plant road 1, 7190 Feluy, BE');
  assert.equal(order.ta_delivery_address_id, null);
  assert.equal(order.ta_delivery_address_changed, 1);
  assert.equal(savedPositions[0].tap_warehouse, 'L1');
  assert.equal(created.data.deliveryAddress, order.ta_delivery_address);
  assert.equal(created.data.deliveryAddressId, null);

  const edited = await request('put', payload({ deliveryAddress: 'Factory, corrected loading entrance', deliveryAddressId: '', deliveryAddressChanged: 'true', positions: [{ ...payload().positions[0], id: 1 }] }));
  assert.equal(order.ta_delivery_address, 'Factory, corrected loading entrance');
  assert.equal(order.ta_delivery_address_id, null);
  assert.equal(edited.data.deliveryAddress, 'Factory, corrected loading entrance');
  const previousId = edited.data.id;
  const copied = await request('post', payload({ deliveryAddress: edited.data.deliveryAddress, deliveryAddressId: edited.data.deliveryAddressId, deliveryAddressChanged: true }));
  assert.notEqual(copied.data.id, previousId);
  assert.equal(copied.data.deliveryAddress, 'Factory, corrected loading entrance');
  assert.equal(copied.data.deliveryAddressId, null);
  assert.equal(copied.data.positions.length, 1);
  assert.equal(copied.data.positions[0].warehouse, 'L1');
});

test('ordinary CPT orders retain the validated customer delivery-address ID', async () => {
  reset();
  const response = await request('post', payload({ incotermId: 2 }));
  assert.equal(response.data.deliveryAddress, 'Customer warehouse');
  assert.equal(response.data.deliveryAddressId, 51);
  assert.equal(pickupReads, 0);
});

test('different FCA source addresses reject the create before any SQL write', async () => {
  reset();
  await assert.rejects(request('post', payload({ positions: [payload().positions[0], { ...payload().positions[0], beNumber: '3-02-26-002-01' }] })), error => error.details.code === 'TEMP_ORDER_PICKUP_ADDRESS_CONFLICT');
  assert.equal(writes.length, 0);
});
