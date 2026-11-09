import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { refreshOrderCartAvailability } from '../src/utils/orderCartAvailability.js';
import {
  addOrderCartItemsWithDefaults, addOrderCartRemainder, getOrderCartItems,
  updateOrderCartQuantity, updateOrderCartSalePrice, updateOrderCartDeliveryDate, removeOrderCartItem,
} from '../src/utils/orderCart.js';

const values = new Map();
global.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
beforeEach(() => { values.clear(); localStorage.setItem('bms.mandant', 'BMS.FRU'); });
const product = { id: '7060', beNumber: '3-02-26-00884-01', warehouseId: 'LG0345', availableAmount: 12375, wpzId: 4, wpzComment: 'Original verwenden' };

test('refresh replaces the stale 12375 kg limit with 23375 kg while preserving user inputs', async () => {
  addOrderCartItemsWithDefaults([product]);
  updateOrderCartQuantity(product.id, 23375);
  updateOrderCartSalePrice(product.id, 1480);
  updateOrderCartDeliveryDate(product.id, '2026-11-25');
  const previous = getOrderCartItems()[0];
  const updated = await refreshOrderCartAvailability(async (path, options) => {
    assert.equal(path, '/products/availability');
    assert.equal(options.method, 'POST');
    return { data: JSON.parse(options.body).positions.map((position) => ({ ...position, availableAmount: 23375 })) };
  });
  assert.deepEqual(updated[0], { ...previous, availableAmount: 23375 });
});

test('split rows refresh once per source and keep edits made while the request is running', async () => {
  addOrderCartItemsWithDefaults([{ ...product, availableAmount: 23375 }]);
  updateOrderCartQuantity(product.id, 11000);
  addOrderCartRemainder(product.id);
  const updated = await refreshOrderCartAvailability(async (path, options) => {
    const positions = JSON.parse(options.body).positions;
    assert.equal(positions.length, 1);
    updateOrderCartSalePrice(product.id, 1480);
    return { data: positions.map((position) => ({ ...position, availableAmount: 12375 })) };
  });
  assert.deepEqual(updated.map((item) => item.availableAmount), [12375, 12375]);
  assert.deepEqual(updated.map((item) => item.quantityKg), [11000, 12375]);
  assert.equal(updated[0].salePrice, 1480);
});

test('sold-out positions update to zero without removing the draft quantity', async () => {
  addOrderCartItemsWithDefaults([product]);
  const updated = await refreshOrderCartAvailability(async () => ({ data: [{ ...product, availableAmount: 0 }] }));
  assert.equal(updated[0].availableAmount, 0);
  assert.equal(updated[0].quantityKg, 12375);
});

test('failed refresh keeps saved values and does not pretend they were refreshed', async () => {
  addOrderCartItemsWithDefaults([product]);
  const previous = getOrderCartItems();
  await assert.rejects(refreshOrderCartAvailability(async () => { throw new Error('offline'); }));
  assert.deepEqual(getOrderCartItems(), previous);
  await assert.rejects(refreshOrderCartAvailability(async () => ({ data: [] })));
  assert.deepEqual(getOrderCartItems(), previous);
});

test('a late response neither recreates removed rows nor writes into another mandant cart', async () => {
  addOrderCartItemsWithDefaults([product]);
  await refreshOrderCartAvailability(async () => {
    removeOrderCartItem(product.id);
    return { data: [{ ...product, availableAmount: 23375 }] };
  });
  assert.deepEqual(getOrderCartItems(), []);
  addOrderCartItemsWithDefaults([product]);
  await assert.rejects(refreshOrderCartAvailability(async () => {
    localStorage.setItem('bms.mandant', 'BMS.PLA');
    return { data: [{ ...product, availableAmount: 23375 }] };
  }));
  assert.deepEqual(getOrderCartItems(), []);
});
