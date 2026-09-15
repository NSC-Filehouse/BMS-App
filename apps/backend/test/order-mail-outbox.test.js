const test = require('node:test');
const assert = require('node:assert/strict');

const { buildReservationReleaseKeys } = require('../src/db/order-mail-outbox');

test('builds unique reservation release keys only for carried reservations', () => {
  assert.deepEqual(
    buildReservationReleaseKeys([
      { beNumber: 'BE-100', warehouseId: 'L1', reservationInKg: 200 },
      { beNumber: 'BE-100', warehouseId: 'L1', reservationInKg: 200 },
      { beNumber: 'BE-200', warehouseId: 'L2', reservationInKg: 0 },
      { beNumber: '', warehouseId: 'L3', reservationInKg: 100 },
      { beNumber: 'BE-300', warehouseId: 'L3', reservationInKg: '50' },
    ]),
    [
      { beNumber: 'BE-100', warehouseId: 'L1' },
      { beNumber: 'BE-300', warehouseId: 'L3' },
    ],
  );
});
