const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ACTIVE_TEMP_ORDER_STATUSES,
  buildTempOrderPlanningQuery,
  getTempOrderPlanningEntry,
  mapTempOrderPlanningRows,
  normalizePlanningKeys,
} = require('../src/db/temp-order-planning');

test('temp planning only includes status 0 and 1, not already booked status 2', () => {
  const query = buildTempOrderPlanningQuery({
    companyId: 7,
    excludeOrderId: 42,
    keys: [
      { beNumber: 'BE-1', warehouseId: 'L-1' },
      { beNumber: 'BE-1', warehouseId: 'L-1' },
      { beNumber: 'BE-2', warehouseId: 'L-2' },
    ],
  });

  assert.deepEqual(ACTIVE_TEMP_ORDER_STATUSES, [0, 1]);
  assert.equal(ACTIVE_TEMP_ORDER_STATUSES.includes(2), false);
  assert.match(query.sql, /COALESCE\(o\.\[ta_Status\], 0\) IN \(0, 1\)/);
  assert.doesNotMatch(query.sql, /COALESCE\(o\.\[ta_Status\], 0\) IN \(0, 1, 2\)/);
  assert.match(query.sql, /o\.\[ta_id\] <> \?/);
  assert.match(query.sql, /FROM \(VALUES \(\?, \?\), \(\?, \?\)\)/);
  assert.deepEqual(query.params, [7, 42, 'BE-1', 'L-1', 'BE-2', 'L-2']);
  assert.deepEqual(normalizePlanningKeys(query.keys), [
    { beNumber: 'BE-1', warehouseId: 'L-1' },
    { beNumber: 'BE-2', warehouseId: 'L-2' },
  ]);
});

test('temp planning mapping aggregates owners and identifies other employees', () => {
  const planning = mapTempOrderPlanningRows([
    { beNumber: 'BE-1', warehouseId: 'L-1', ownerShortCode: 'ABC', amountInKg: 20 },
    { beNumber: 'BE-1', warehouseId: 'L-1', ownerShortCode: 'abc', amountInKg: 5 },
    { beNumber: 'BE-1', warehouseId: 'L-1', ownerShortCode: 'DEF', amountInKg: 10 },
  ], 'ABC');

  const entry = getTempOrderPlanningEntry(planning, 'BE-1', 'L-1');
  assert.equal(entry.totalAmountKg, 35);
  assert.equal(entry.otherAmountKg, 10);
  assert.deepEqual(entry.otherOwners.map((owner) => [owner.shortCode, owner.amountInKg]), [['DEF', 10]]);
});
