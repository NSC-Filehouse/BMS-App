import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidSalePrice } from '../src/utils/salePrice.js';

test('accepts explicit zero and positive sales prices', () => {
  for (const value of [0, '0', '0.00', ' 0 ', 1200, '1200', 0.25, '0.25']) {
    assert.equal(isValidSalePrice(value), true, String(value));
  }
});

test('rejects missing, negative, non-finite and non-numeric sales prices', () => {
  for (const value of [undefined, null, '', ' ', -1, '-0.01', NaN, Infinity,
    'NaN', 'Infinity', 'abc', false, true, [], [0], {}]) {
    assert.equal(isValidSalePrice(value), false, String(value));
  }
});
