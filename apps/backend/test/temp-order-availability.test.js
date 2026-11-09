const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const beNumber = '3-02-26-00884-01';
const warehouseId = 'LG0345';
const database = { firmaId: 3, databaseName: 'BMS.FRU' };
let orders;
let stock;
let stockReads;
let lockTail = Promise.resolve();
let lockQueries;

function planningRows(sql, params) {
  const statuses = sql.match(/COALESCE\(o\.\[ta_Status\], 0\) IN \(([^)]+)\)/)[1].split(',').map(Number);
  const excluded = sql.includes('o.[ta_id] <> ?') ? params[1] : null;
  return orders.filter((order) => statuses.includes(order.status) && order.id !== excluded
    && (order.status === 3 || !order.failed || order.sentAt))
    .map((order) => ({ beNumber, warehouseId, ownerShortCode: order.owner, amountInKg: order.amount }));
}

require.cache[require.resolve('../src/db/access')] = { exports: {
  runSQLQueryAccess: async (db, sql, params) => {
    stockReads++;
    assert.equal(db.databaseName, 'BMS.FRU');
    return stock && params[0] === beNumber && [warehouseId, '3583 Paal'].includes(params[1]) ? [stock] : [];
  },
  runSQLQuerySqlServer: async (db, sql, params) => planningRows(sql, params),
  withSqlTransaction: async (db, work) => {
    let release;
    const query = async (sql, params) => {
      if (sql.includes('sp_getapplock')) {
        lockQueries.push({ sql, params });
        const previous = lockTail;
        lockTail = new Promise((resolve) => { release = resolve; });
        await previous;
        return { rows: [{ lockResult: 0 }] };
      }
      return { rows: planningRows(sql, params) };
    };
    try { return await work({ query }); } finally { release?.(); }
  },
} };

const {
  assertTempOrderPositionsAvailable,
  loadCurrentOrderPositions,
  lockTempOrderAvailability,
  withTempOrderAvailabilityLock,
} = require('../src/db/temp-order-availability');

beforeEach(() => {
  orders = [];
  stock = { amount: 23375, reserved: 0, storageId: warehouseId };
  stockReads = 0;
  lockQueries = [];
  lockTail = Promise.resolve();
});

async function check(amount, excludeOrderId = null, query = null, extra = {}) {
  return assertTempOrderPositionsAvailable({
    companyId: 3, excludeOrderId, query,
    positions: await loadCurrentOrderPositions(database, [{ beNumber, warehouseId, amountInKg: amount, ...extra }], 'MLE'),
  });
}

test('an 11000 kg MBÜ draft leaves the full 23375 kg available to MLE', async () => {
  orders.push({ id: 1, status: 0, owner: 'MBÜ', amount: 11000 });
  await check(23375);
});

test('returned and sent quantities block other orders, including failed returned orders', async () => {
  for (const status of [1, 3]) {
    orders = [{ id: 1, status, owner: 'MBÜ', amount: 11000, failed: status === 3 }];
    await check(12375);
    await assert.rejects(check(23375), (error) => error.status === 409
      && error.details.code === 'TEMP_ORDER_AMOUNT_EXCEEDS_AVAILABLE'
      && error.details.availableAmount === 12375);
  }
});

test('a returned order can correct its full own quantity without subtracting itself', async () => {
  orders.push({ id: 403, status: 3, owner: 'MLE', amount: 23375 });
  await check(23375, 403);
});

test('failed unsent mails release the claim, while already booked BMS orders are not counted twice', async () => {
  orders.push({ id: 1, status: 1, failed: true, owner: 'MBÜ', amount: 11000 });
  await check(23375);
  orders = [{ id: 1, status: 2, owner: 'MBÜ', amount: 11000 }];
  stock.amount = 12375;
  await check(12375);
  await assert.rejects(check(23375), (error) => error.details.availableAmount === 12375);
});

test('a previously sent order still claims stock if a later notification retry failed', async () => {
  orders.push({ id: 1, status: 1, failed: true, sentAt: '2026-11-09', owner: 'MBÜ', amount: 11000 });
  await assert.rejects(check(23375), (error) => error.details.availableAmount === 12375);
});

test('two simultaneous hand-offs cannot both claim the same stock', async () => {
  orders = [{ id: 1, status: 0, owner: 'MLE', amount: 23375 }, { id: 2, status: 0, owner: 'MBÜ', amount: 11000 }];
  const send = (order) => withTempOrderAvailabilityLock(3, async ({ query }) => {
    await check(order.amount, order.id, query);
    order.status = 1;
  });
  const result = await Promise.allSettled(orders.map(send));
  assert.deepEqual(result.map((entry) => entry.status), ['fulfilled', 'rejected']);
  assert.equal(result[1].reason.details.availableAmount, 0);
  assert.deepEqual(orders.map((order) => order.status), [1, 0]);
  assert.equal(lockQueries.length, 2);
  assert.equal(lockQueries[0].params[0], lockQueries[1].params[0]);
  assert.match(lockQueries[0].sql, /@LockOwner = 'Transaction'/);
});

test('sold-out stock rejects sending, and missing positions are not treated as unlimited', async () => {
  stock = null;
  await assert.rejects(check(11000), (error) => error.details.availableAmount === 0);
});

test('split deliveries are checked together against the same source', async () => {
  const positions = await loadCurrentOrderPositions(database, [
    { beNumber, warehouseId, amountInKg: 15000 },
    { beNumber, warehouseId, amountInKg: 10000 },
  ], 'MLE');
  assert.equal(stockReads, 1);
  await assert.rejects(assertTempOrderPositionsAvailable({ companyId: 3, positions }),
    (error) => error.details.requestedAmount === 25000 && error.details.availableAmount === 23375);
});

test('carried reservations only credit the live quantity belonging to the order owner', async () => {
  stock.reserved = 11000;
  stock.reservedBy = 'MLE';
  await check(23375, null, null, { reservationInKg: 11000 });
  stock.reservedBy = 'MBÜ';
  await assert.rejects(check(23375, null, null, { reservationInKg: 11000 }),
    (error) => error.details.availableAmount === 12375);
  stock.reserved = 0;
  stock.reservedBy = 'MLE';
  await assert.rejects(check(30000, null, null, { reservationInKg: 11000 }),
    (error) => error.details.availableAmount === 23375);
});

test('an unavailable lock stops the hand-off', async () => {
  await assert.rejects(lockTempOrderAvailability(async () => ({ rows: [{ lockResult: -1 }] }), 3),
    (error) => error.details.code === 'TEMP_ORDER_AVAILABILITY_BUSY');
});

test('saved reservations retain the full-access permission already checked at create or edit', async () => {
  stock.reserved = 11000;
  stock.reservedBy = 'MBÜ';
  const positions = await loadCurrentOrderPositions(database,
    [{ beNumber, warehouseId, amountInKg: 23375, reservationInKg: 11000 }], 'NSC', { allowAnyReservation: true });
  await assertTempOrderPositionsAvailable({ companyId: 3, positions });
});
