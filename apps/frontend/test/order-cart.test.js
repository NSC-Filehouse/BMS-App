import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  addOrderCartItemsWithDefaults,
  getOrderCartItems,
  updateOrderCartQuantity,
  updateOrderCartSalePrice,
  updateOrderCartArticle,
  updateOrderCartItem,
} from '../src/utils/orderCart.js';
import { nextWeekday } from '../src/utils/deliveryDate.js';

const values = new Map();
global.localStorage = {
  getItem(key) {
    return values.has(key) ? values.get(key) : null;
  },
  setItem(key, value) {
    values.set(key, String(value));
  },
  removeItem(key) {
    values.delete(key);
  },
};

beforeEach(() => {
  values.clear();
  localStorage.setItem('bms.mandant', 'BMS.FRU');
});

test('new positions use the available maximum and empty per-position inputs', () => {
  addOrderCartItemsWithDefaults([{
    id: 'product-1',
    article: 'Artikel 1',
    beNumber: 'BE-1',
    warehouse: 'Lager Nord',
    storageId: 'L1',
    unit: 'kg',
    amount: 1200,
    reserved: 100,
    availableAmount: 850,
    acquisitionPrice: 0.7,
    wpzId: 17,
  }]);

  const [item] = getOrderCartItems();
  assert.equal(item.quantityKg, 850);
  assert.equal(item.warehouse, 'Lager Nord');
  assert.equal(item.warehouseId, 'L1');
  assert.equal(item.salePrice, null);
  assert.equal(item.deliveryDate, nextWeekday());
  assert.equal(item.deliveryDateAuto, true);
  assert.equal(item.wpzId, 17);
  assert.equal(item.wpzOriginal, true);
  assert.equal(item.wpzComment, 'Original verwenden');
});

test('adding an existing position keeps every user-edited cart value', () => {
  addOrderCartItemsWithDefaults([{
    id: 'product-1',
    article: 'Artikel 1',
    availableAmount: 850,
    wpzId: 17,
  }]);
  updateOrderCartQuantity('product-1', 400);
  updateOrderCartSalePrice('product-1', 1.25);
  updateOrderCartItem('product-1', {
    deliveryDate: '2030-05-17',
    wpzOriginal: false,
    wpzComment: 'Kundenetikett verwenden',
  });

  addOrderCartItemsWithDefaults([{
    id: 'product-1',
    article: 'Artikel 1 neu geladen',
    availableAmount: 900,
    wpzId: 18,
  }]);

  const [item] = getOrderCartItems();
  assert.equal(item.quantityKg, 400);
  assert.equal(item.salePrice, 1.25);
  assert.equal(item.deliveryDate, '2030-05-17');
  assert.equal(item.deliveryDateAuto, false);
  assert.equal(item.wpzOriginal, false);
  assert.equal(item.wpzComment, 'Kundenetikett verwenden');
  assert.equal(item.availableAmount, 900);
});

test('temporarily empty cart inputs are persisted instead of restoring stale values', () => {
  addOrderCartItemsWithDefaults([{ id: 'product-1', availableAmount: 100 }]);
  updateOrderCartQuantity('product-1', '');
  updateOrderCartSalePrice('product-1', '');

  const [item] = getOrderCartItems();
  assert.equal(item.quantityKg, '');
  assert.equal(item.salePrice, '');
});

test('edited cart article names persist and survive a product refresh', () => {
  addOrderCartItemsWithDefaults([{
    id: 'product-1',
    article: 'ERP-Artikelname',
    availableAmount: 100,
  }]);
  updateOrderCartArticle('product-1', 'Eigener Warenkorbname');

  addOrderCartItemsWithDefaults([{
    id: 'product-1',
    article: 'ERP-Artikelname aktualisiert',
    availableAmount: 90,
  }]);

  const [item] = getOrderCartItems();
  assert.equal(item.article, 'Eigener Warenkorbname');
  assert.equal(item.articleOriginal, 'ERP-Artikelname');
  assert.equal(item.articleChanged, true);
  assert.equal(item.availableAmount, 90);
});

test('returning the cart article name to its original value clears the marker', () => {
  addOrderCartItemsWithDefaults([{
    id: 'product-1',
    article: 'ERP-Artikelname',
    availableAmount: 100,
  }]);
  updateOrderCartArticle('product-1', 'Eigener Warenkorbname');
  updateOrderCartArticle('product-1', 'ERP-Artikelname');

  const [item] = getOrderCartItems();
  assert.equal(item.article, 'ERP-Artikelname');
  assert.equal(item.articleOriginal, null);
  assert.equal(item.articleChanged, false);
});

test('multiple new positions are stored with their individual maxima', () => {
  addOrderCartItemsWithDefaults([
    { id: 'product-1', availableAmount: 100 },
    { id: 'product-2', amount: 300, reserved: 25 },
  ]);

  assert.deepEqual(
    getOrderCartItems().map((item) => [item.id, item.quantityKg]),
    [['product-1', 100], ['product-2', 275]],
  );
});
