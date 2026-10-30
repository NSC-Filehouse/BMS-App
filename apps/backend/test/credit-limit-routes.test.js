const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../src/config');
const calls = [];
const orderMailCalls = [];
let directoryError = false;
let concurrentCustomerId = '';
let order;
let customer;
let creditValues;
let pickupRows;
let originalPackagingLookupError;
const pickupQueries = [];
const position = {
  id: 1, lineNo: 1, beNumber: '3-02-26-001-01', article: 'Article',
  amountInKg: 100000, price: 2000, costPrice: 1000, warehouse: 'L1',
  deliveryDate: '2026-11-01', originalPackagingType: 'Sackware', originalPackagingTypeId: 1,
};
const positionColumns = ['tap_id', 'tap_ta_id', 'tap_line_no', 'tap_be_number', 'tap_article',
  'tap_amount_in_kg', 'tap_price', 'tap_ep', 'tap_warehouse', 'tap_delivery_date',
  'tap_Verpackungsart', 'tap_Verpackungsart_id'];

function reset(customerId = '14104', interCompany = true, companyId = 3, orderStatus = 0) {
  calls.length = 0;
  orderMailCalls.length = 0;
  directoryError = false;
  concurrentCustomerId = '';
  pickupQueries.length = 0;
  originalPackagingLookupError = false;
  position.originalPackagingType = 'Sackware';
  position.originalPackagingTypeId = 1;
  position.packagingTypeChanged = false;
  pickupRows = [{ warehouseId: 'L1', isStrecke: true, pickupName1: 'Factory', pickupStreet: 'Plant road 1', pickupPostalCode: '7190', pickupCity: 'Feluy', pickupCountry: 'B', countryCode: 'BE' }];
  order = {
    ta_id: 42, ta_company_id: companyId, ta_ClientReferenceId: customerId, ta_CreatedBy: 'NSC',
    ta_Status: orderStatus, ta_client_name: 'Customer', ta_client_address: 'Street 1, City',
    ta_delivery_type: 'DAP', ta_packaging_type: 'Sackware', ta_packaging_type_id: 1,
    ta_delivery_address: 'Street 1, City', ta_special_payment_text: '30 Tage',
  };
  customer = { customerId, interCompany, iban: 'DE123', insolvent: false };
  creditValues = { amount: 0, unpaidInvoicesAmount: 0 };
}

async function sqlQuery(database, sql, params = []) {
  calls.push({ database, sql, params });
  if (sql.includes('[INFORMATION_SCHEMA].[COLUMNS]')) {
    return (params[1] === 'tbl_Temp_Auftrag' ? Object.keys(order) : positionColumns).map((col) => ({ col }));
  }
  if (sql.includes('[md_KdNR]')) {
    if (directoryError) throw new Error('directory unavailable');
    return [{ mandantId: 7, customerId: '14104' }, { mandantId: 5, customerId: 'LF0400' }];
  }
  if (sql.includes('NULLIF(LTRIM(RTRIM(COALESCE(p.[tap_Verpackungsart]')) return position.originalPackagingType ? [] : [position];
  if (sql.includes('SUM(')) return [];
  if (sql.includes('INSERT INTO') && sql.includes('[OrderMailOutbox]')) return [{ id: 100 }];
  if (sql.includes('INSERT INTO') && sql.includes('[CreditLimitMailOutbox]')) return [{ id: 101 }];
  if (sql.includes('INSERT INTO') && sql.includes('[CreditLimitRequestState]')) return [{ id: 102 }];
  if (sql.includes('[CreditLimitRequestState]')) return [];
  if (sql.includes('[OrderMailOutbox]')) return [];
  if (sql.includes('[Timeline]')) return [{ ok: 1 }];
  if (sql.includes('[tbl_Temp_Auf_Position]')) return [position];
  if (sql.includes('[tbl_Temp_Auftrag]')) {
    if (sql.includes('UPDATE')) { order.ta_Status = 1; return []; }
    if (sql.includes('WITH (UPDLOCK, HOLDLOCK)') && concurrentCustomerId) {
      order.ta_ClientReferenceId = concurrentCustomerId;
    }
    return [{ ...order, customerId: order.ta_ClientReferenceId, createdBy: 'NSC' }];
  }
  return [];
}

require.cache[require.resolve('../src/db/access')] = { exports: {
  canConnectToDatabase: async () => { throw new Error('Unexpected database availability lookup'); },
  runSQLQueryFx: async () => { throw new Error('Unexpected FX query'); },
  runSQLQuerySqlServer: sqlQuery,
  runSQLQueryAccess: async (database, sql) => {
    if (sql.includes('AS packagingType')) {
      if (originalPackagingLookupError) throw new Error('Original packaging lookup unavailable');
      return [];
    }
    if (sql.includes('AS warehouseName1')) { pickupQueries.push(sql); return pickupRows; }
    if (sql.includes('FROM [dbo].[tblKunden]')) return [customer];
    if (sql.includes('tblKun_KreditLimit')) return [{ ...creditValues }];
    return [];
  },
  withSqlTransaction: async (database, work) => work({
    query: async (sql, params) => ({ rows: await sqlQuery(database, sql, params) }),
  }),
} };
require.cache[require.resolve('../src/db/customer-access')] = { exports: {
  getCustomerAccessScope: async () => ({ isFullAccess: true }),
  loadVisibleCustomer: async () => { throw new Error('Unexpected customer access lookup'); },
} };
require.cache[require.resolve('../src/db/users')] = { exports: {
  getUserIdentityByShortCode: async () => ({ email: 'ad@example.com', fullName: 'Test AD' }),
  getUserIdentityByEmail: async () => { throw new Error('Unexpected identity lookup'); },
  getUserIdentityFromRequestContext: async () => { throw new Error('Unexpected request authentication'); },
} };
require.cache[require.resolve('../src/db/customer-order-requirements')] = { exports: {
  loadCustomerOrderRequirements: async () => ({ customerFound: true, missingFields: [] }),
} };
require.cache[require.resolve('../src/db/order-mail-outbox')] = { exports: {
  processOrderMailOutboxById: async (id) => { orderMailCalls.push(id); return { status: 'sent' }; },
} };
const creditOutboxPath = require.resolve('../src/db/credit-limit-request-outbox');
const creditOutbox = require(creditOutboxPath);
require.cache[creditOutboxPath] = { exports: {
  ...creditOutbox,
  processCreditLimitMailOutboxById: async () => ({ status: 'sent' }),
} };
const mailPath = require.resolve('../src/mail/order-mail');
require.cache[mailPath] = { exports: {
  ...require(mailPath),
  validateOrderMailConfig: () => ({ ok: true }),
  resolveOrderMailRecipient: () => ({ ok: true, address: 'orders@example.com', source: 'test' }),
} };
config.creditLimitMail.enabled = true;
config.orderMail.enabled = true;
const router = require('../src/routes/temp-orders.routes');

function request(method, routePath, body = {}) {
  const route = router.stack.find((layer) => layer.route?.path === routePath && layer.route.methods[method]).route;
  return new Promise((resolve, reject) => {
    const req = {
      params: { id: '42' }, body, query: {}, userIdentity: { shortCode: 'NSC', fullName: 'Test AD' },
      userEmail: 'ad@example.com', mandant: 'Source',
      database: { firmaId: order.ta_company_id, databaseName: 'BMS.FRU', shortName: 'FRU' },
    };
    const res = { status: () => res, json: resolve };
    route.stack.at(-1).handle(req, res, reject);
  });
}

test('actual preview route hides credit prompt for Frupack/CHG and Plastics/Polymer', async () => {
  for (const [companyId, customerId] of [[3, '14104'], [2, 'LF0400']]) {
    reset(customerId, true, companyId);
    const response = await request('get', '/temp-orders/:id/credit-limit-preview');
    assert.equal(response.data.shouldPrompt, false);
  }
});

test('actual preview retains credit prompt for external customers, missing flags and directory failures', async () => {
  for (const [customerId, flag, failure] of [['external', true, false], ['14104', false, false], ['14104', true, true]]) {
    reset(customerId, flag);
    directoryError = failure;
    const response = await request('get', '/temp-orders/:id/credit-limit-preview');
    assert.equal(response.data.shouldPrompt, true);
    assert.equal(response.data.projectedExposure, 200000);
    assert.equal(Object.hasOwn(response.data, 'requestedLimit'), false);
  }
});

test('actual preview compares unpaid invoices plus the current order and returns both amounts', async () => {
  reset('external', false);
  creditValues = { amount: 220000, unpaidInvoicesAmount: 25000 };
  const response = await request('get', '/temp-orders/:id/credit-limit-preview');

  assert.equal(response.data.shouldPrompt, true);
  assert.equal(response.data.unpaidInvoicesAmount, 25000);
  assert.equal(response.data.currentOrderAmount, 200000);
  assert.equal(response.data.projectedExposure, 225000);
  assert.equal(response.data.availableCreditAmount, 195000);
});

test('direct finalize POST completes internal orders without credit inserts, including returned orders', async () => {
  for (const status of [0, 3]) {
    reset('14104', true, 3, status);
    const response = await request('post', '/temp-orders/:id/finalize', { sendCreditLimitRequest: true });
    assert.equal(response.data.orderStatus, 1);
    assert.equal(response.meta.creditLimitMail.creditRequest.status, 'suppressed_internal');
    assert.equal(calls.some((call) => call.sql.includes('INSERT INTO') && call.sql.includes('[CreditLimitMailOutbox]')), false);
    assert.deepEqual(orderMailCalls, [100]);
  }
});

test('finalization sends the selected order packaging even without an original packaging value', async () => {
  for (const lookupFails of [false, true]) {
    reset();
    position.originalPackagingType = null;
    position.originalPackagingTypeId = null;
    position.packagingTypeChanged = true;
    originalPackagingLookupError = lookupFails;
    const response = await request('post', '/temp-orders/:id/finalize');
    assert.equal(response.data.orderStatus, 1);
    assert.equal(position.packagingTypeChanged, false);
    const insert = calls.find(call => call.sql.includes('INSERT INTO') && call.sql.includes('[OrderMailOutbox]'));
    assert.ok(insert.params.some(value => typeof value === 'string' && value.includes('Verpackungsart: Sackware')));
    assert.deepEqual(orderMailCalls, [100]);
  }
});

test('direct finalize POST still queues credit for an external customer', async () => {
  reset('external', false);
  const response = await request('post', '/temp-orders/:id/finalize', {
    sendCreditLimitRequest: true,
    creditLimitAmount: 245000.75,
  });
  assert.equal(response.meta.creditLimitMail.creditRequest.status, 'queued');
  const creditInsert = calls.find((call) => call.sql.includes('INSERT INTO') && call.sql.includes('[CreditLimitMailOutbox]'));
  assert.ok(creditInsert);
  assert.equal(creditInsert.params[7], 'ad@example.com');
  assert.equal(creditInsert.params[8], 'Test AD');
  assert.match(creditInsert.params[10], /Kreditwunsch: 245\.000,75 EUR/);
  assert.deepEqual(orderMailCalls, [100]);
});

test('concurrent customer change cannot reuse the previously loaded internal exemption', async () => {
  reset();
  concurrentCustomerId = 'external';
  await assert.rejects(request('post', '/temp-orders/:id/finalize', { sendCreditLimitRequest: true }), (error) => (
    error.status === 409 && error.details.code === 'TEMP_ORDER_CUSTOMER_CHANGED'
  ));
  assert.equal(calls.some((call) => call.sql.includes('INSERT INTO')), false);
  assert.equal(orderMailCalls.length, 0);
});

test('pickup preview groups the same planned address and refuses foreign source positions before reading them', async () => {
  reset();
  const response = await request('post', '/temp-orders/pickup-addresses', { positions: [
    { beNumber: '3-02-26-001-01', warehouseId: 'L1' },
    { beNumber: '3-02-26-002-01', warehouseId: 'L1' },
  ] });
  assert.equal(response.data.addresses.length, 1);
  assert.equal(response.data.addresses[0].positions.length, 2);
  assert.equal(response.data.conflict, false);
  pickupQueries.length = 0;
  await assert.rejects(request('post', '/temp-orders/pickup-addresses', { positions: [{ beNumber: '2-02-26-001-01', warehouseId: 'L1' }] }), error => error.status === 403);
  assert.equal(pickupQueries.length, 0);
});

test('FCA finalization queues the persisted corrected pickup address in the mail', async () => {
  reset();
  order.ta_delivery_type = 'FCA / Free Carrier';
  order.ta_delivery_address_id = null;
  order.ta_delivery_address_changed = 1;
  order.ta_delivery_address = 'Corrected factory pickup address';
  const response = await request('post', '/temp-orders/:id/finalize');
  assert.equal(response.data.orderStatus, 1);
  assert.equal(pickupQueries.length, 1);
  const insert = calls.find(call => call.sql.includes('INSERT INTO') && call.sql.includes('[OrderMailOutbox]'));
  assert.ok(insert.params.some(value => typeof value === 'string' && value.includes('Abholadresse: Corrected factory pickup address')));
  assert.deepEqual(orderMailCalls, [100]);
});

test('legacy FCA orders with a customer delivery-address FK must be reviewed before any mail is queued', async () => {
  reset();
  order.ta_delivery_type = 'FCA';
  order.ta_delivery_address_id = 51;
  await assert.rejects(request('post', '/temp-orders/:id/finalize'), error => error.status === 409 && error.details.code === 'TEMP_ORDER_PICKUP_ADDRESS_REVIEW_REQUIRED');
  assert.equal(calls.some(call => call.sql.includes('INSERT INTO') && call.sql.includes('[OrderMailOutbox]')), false);
  assert.equal(orderMailCalls.length, 0);
});
