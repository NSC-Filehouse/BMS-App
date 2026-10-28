import test from 'node:test';
import assert from 'node:assert/strict';
import { purchaseOrderListReturnTo, formatPurchaseNumber, formatPurchasePrice, formatPurchaseDate } from '../src/utils/purchaseOrderDisplay.js';

test('after deletion returns to the list even through edit/detail return chains', () => {
  const list = { pathname: '/temp-purchase-orders', state: { listState: { page: 2, q: 'PP', status: 'draft', ownerScope: 'mine', createdPeriod: 'week' } } };
  const detail = { pathname: '/temp-purchase-orders/42', state: { returnTo: list } };
  assert.deepEqual(purchaseOrderListReturnTo({ returnTo: detail }), list);
  assert.deepEqual(purchaseOrderListReturnTo({ afterSaveReturnTo: list }), list);
  assert.equal(purchaseOrderListReturnTo({ returnTo: { pathname: '/temp-purchase-orders/42' } }).pathname, '/temp-purchase-orders');
  assert.deepEqual(purchaseOrderListReturnTo({ listState: { page: 3 } }).state, { listState: { page: 3 } });
});

test('does not reopen a deleted detail and tolerates repeated return targets', () => {
  const detail = { pathname: '/temp-purchase-orders/42', state: {} };
  detail.state.returnTo = detail;
  assert.equal(purchaseOrderListReturnTo({ returnTo: detail }).pathname, '/temp-purchase-orders');
});

test('purchase amounts, prices and dates use the same compact units as orders', () => {
  assert.equal(formatPurchaseNumber(24750), '24.750');
  assert.equal(formatPurchasePrice(900), '900,00 EUR/t');
  assert.equal(formatPurchasePrice(0), '0,00 EUR/t');
  assert.equal(formatPurchasePrice(null), '–');
  assert.equal(formatPurchaseDate('2026-10-28'), '28.10.2026');
});
