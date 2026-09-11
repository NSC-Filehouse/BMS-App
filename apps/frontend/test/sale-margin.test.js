import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateSaleMarginAmount } from '../src/utils/saleMargin.js';

test('calculates the total margin for a kilogram quantity and tonne prices', () => {
  assert.equal(calculateSaleMarginAmount(23500, 1200, 1000), 4700);
});

test('supports positive and negative total margins', () => {
  assert.equal(calculateSaleMarginAmount(2500, 900, 1000), -250);
  assert.equal(calculateSaleMarginAmount(1000, 1200, 1000), 200);
});

test('does not calculate a margin with incomplete or invalid values', () => {
  assert.equal(calculateSaleMarginAmount('', 1200, 1000), null);
  assert.equal(calculateSaleMarginAmount(23500, '', 1000), null);
  assert.equal(calculateSaleMarginAmount(23500, 1200, 0), null);
});
