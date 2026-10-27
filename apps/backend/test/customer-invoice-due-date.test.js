const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateCustomerInvoiceDueDate: calculate } = require('../src/customer-invoice-due-date');

test('uses the net period rather than the discount period for the reported invoice', () => {
  const term = { netDays: 30, discountDays: 14, basis: 1 };
  assert.equal(calculate('2026-10-26T00:00:00.000Z', term), '2026-11-25');
  assert.equal(calculate(new Date('2026-10-26T00:00:00.000Z'), term), '2026-11-25');
});

test('adds calendar days across leap days, year changes and daylight-saving changes', () => {
  const term = { netDays: 1, basis: 1 };
  assert.equal(calculate('2028-02-28', term), '2028-02-29');
  assert.equal(calculate('2026-12-31', term), '2027-01-01');
  assert.equal(calculate('2026-03-28', { netDays: 2, basis: 1 }), '2026-03-30');
  assert.equal(calculate('2026-10-24', { netDays: 2, basis: 1 }), '2026-10-26');
  assert.equal(calculate('2026-10-26', { netDays: 0, basis: 1 }), '2026-10-26');
});

test('distinguishes counting from Ultimo from rounding the resulting due date to month end', () => {
  assert.equal(calculate('2026-10-26', { netDays: 45, basis: 2 }), '2026-12-15');
  assert.equal(calculate('2026-10-26', { netDays: 45, basis: 1, monthEnd: true }), '2026-12-31');
  assert.equal(calculate('2028-01-20', { netDays: 30, basis: 1, monthEnd: true }), '2028-02-29');
});

test('rounds half-month payment terms to the next 15th or actual last day of the month', () => {
  const term = { netDays: 45, basis: 1, halfMonthEnd: true };
  assert.equal(calculate('2026-10-26', term), '2026-12-15');
  assert.equal(calculate('2026-10-31', term), '2026-12-15');
  assert.equal(calculate('2026-11-01', term), '2026-12-31');
  assert.equal(calculate('2028-01-05', { ...term, netDays: 45 }), '2028-02-29');
});

test('leaves unavailable or invalid dates and payment terms uncalculated', () => {
  const term = { netDays: 30, basis: 1 };
  for (const date of [null, '', 'invalid', '2026-02-30', '2026-13-01', new Date(NaN)]) {
    assert.equal(calculate(date, term), null);
  }
  for (const invalid of [null, {}, { ...term, netDays: null }, { ...term, netDays: '' },
    { ...term, netDays: -1 }, { ...term, netDays: 1.5 }, { ...term, basis: 3 }]) {
    assert.equal(calculate('2026-10-26', invalid), null);
  }
});
