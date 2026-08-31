const test = require('node:test');
const assert = require('node:assert/strict');

const { calculateAvailableCredit } = require('../src/credit-limit');

test('calculates available credit from unpaid invoices and open orders', () => {
  assert.deepEqual(calculateAvailableCredit({
    amount: 10000,
    unpaidInvoicesAmount: 1250.5,
    openOrdersAmount: 3000,
  }), {
    amount: 10000,
    unpaidInvoicesAmount: 1250.5,
    openOrdersAmount: 3000,
    availableAmount: 5749.5,
  });
});

test('keeps negative available credit negative', () => {
  assert.equal(calculateAvailableCredit({
    amount: 1000,
    unpaidInvoicesAmount: 900,
    openOrdersAmount: 200,
  }).availableAmount, -100);
});

test('returns no available amount when no credit limit is configured', () => {
  assert.deepEqual(calculateAvailableCredit({
    amount: null,
    unpaidInvoicesAmount: 100,
    openOrdersAmount: 200,
  }), {
    amount: null,
    unpaidInvoicesAmount: 100,
    openOrdersAmount: 200,
    availableAmount: null,
  });
});
