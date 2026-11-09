const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const beNumber = '3-02-26-00884-01';
const warehouseId = 'LG0345';
let stock;
let planning;
let stockReads;
let isFullAccess;

require.cache[require.resolve('../src/db/access')] = { exports: {
  runSQLQueryAccess: async (database, sql, params) => {
    stockReads++;
    return stock && params[0] === beNumber && params[1] === warehouseId ? [stock] : [];
  },
  runSQLQuerySqlServer: async () => planning,
} };
require.cache[require.resolve('../src/db/databases')] = { exports: {} };
require.cache[require.resolve('../src/db/timeline')] = { exports: { appendTimelineEntries: async () => {} } };
require.cache[require.resolve('../src/db/customer-access')] = { exports: { getCustomerAccessScope: async () => ({ isFullAccess }) } };
const router = require('../src/routes/products.routes');
const route = router.stack.find((layer) => layer.route?.path === '/products/availability').route;
function request(positions) {
  return new Promise((resolve, reject) => {
    const res = { status: () => res, json: resolve };
    route.stack.at(-1).handle({ body: { positions }, database: { firmaId: 3 }, userIdentity: { shortCode: 'MLE' } }, res, reject);
  });
}
beforeEach(() => { stock = { amount: 23375, reserved: 0, storageId: warehouseId }; planning = []; stockReads = 0; isFullAccess = false; });

test('cart refresh returns current availability and zero for positions no longer on the VL', async () => {
  const result = await request([{ beNumber, warehouseId }, { beNumber: '3-02-26-00999-01', warehouseId }]);
  assert.deepEqual(result.data.map((position) => position.availableAmount), [23375, 0]);
});

test('cart refresh reflects a blocking returned order using the same planning source', async () => {
  planning = [{ beNumber, warehouseId, amountInKg: 11000, ownerShortCode: 'MBÜ' }];
  const result = await request([{ beNumber, warehouseId }]);
  assert.equal(result.data[0].availableAmount, 12375);
});

test('cart refresh credits a live carried reservation only to its owner and caps the quantity', async () => {
  stock.reserved = 11000;
  stock.reservedBy = 'MLE';
  assert.equal((await request([{ beNumber, warehouseId, reservationInKg: 999999 }])).data[0].availableAmount, 23375);
  stock.reservedBy = 'MBÜ';
  assert.equal((await request([{ beNumber, warehouseId, reservationInKg: 11000 }])).data[0].availableAmount, 12375);
  isFullAccess = true;
  assert.equal((await request([{ beNumber, warehouseId, reservationInKg: 11000 }])).data[0].availableAmount, 23375);
});

test('cart refresh rejects foreign tenant keys and malformed batches before reading stock', async () => {
  await assert.rejects(request([{ beNumber: '10-02-26-00884-01', warehouseId }]),
    (error) => error.status === 403 && error.details.code === 'FOREIGN_VL_READ_ONLY');
  for (const positions of [null, [null], [{ beNumber }], Array(101).fill({ beNumber, warehouseId })]) {
    await assert.rejects(request(positions), (error) => error.status === 400);
  }
  assert.equal(stockReads, 0);
});
