import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { addPurchaseCartItems, clearPurchaseCart, duplicatePurchaseCartItem, getPurchaseCartContext, getPurchaseCartItems, getPurchaseRequestId, purchaseMissingFields, purchaseTotals, savePurchaseCartContext, updatePurchaseCartItem } from '../src/utils/purchaseCart.js';

const storage = new Map();
global.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: (key) => storage.delete(key) };
beforeEach(() => { storage.clear(); localStorage.setItem('bms.mandant', 'FRU'); });
const item = (id, packaging = 'Sackware') => ({ supplierId: '42', articleIndex: id, article: `Artikel ${id}`, originalPackagingType: packaging });

test('new purchase lines start empty and use the packaging load, with one article per ID', () => {
  addPurchaseCartItems([item('A', 'Siloware'), item('B'), { ...item('A'), article: 'Alter Name' }]);
  const rows = getPurchaseCartItems();
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((p) => p.amount), [25000, 24750]);
  rows.forEach((p) => ['purchasePrice', 'requestedDeliveryDate', 'reservedFor', 'comment'].forEach((key) => assert.equal(p[key], '')));
});

test('re-adding preserves edits and independent copies instead of collapsing them', () => {
  addPurchaseCartItems([item('A')]);
  const id = getPurchaseCartItems()[0].lineId;
  updatePurchaseCartItem(id, { amount: '11000', purchasePrice: '850', requestedDeliveryDate: '2026-11-05', reservedFor: 'Kunde', comment: 'Hinweis' });
  duplicatePurchaseCartItem(id);
  const before = getPurchaseCartItems();
  assert.notEqual(before[0].lineId, before[1].lineId);
  assert.equal(before[1].purchasePrice, '850');
  addPurchaseCartItems([item('A')]);
  assert.deepEqual(getPurchaseCartItems(), before);
  updatePurchaseCartItem(before[1].lineId, { amount: '9000' });
  assert.equal(getPurchaseCartItems()[0].amount, '11000');
});

test('supplier changes are atomic, and new additions follow the selected header packaging', () => {
  addPurchaseCartItems([item('A')]);
  const before = getPurchaseCartItems();
  assert.throws(() => addPurchaseCartItems([item('B'), { ...item('C'), supplierId: 'other' }]));
  assert.deepEqual(getPurchaseCartItems(), before);
  savePurchaseCartContext({ header: { packagingType: 'Siloware' } });
  addPurchaseCartItems([item('B')]);
  assert.equal(getPurchaseCartItems()[1].amount, 25000);
});

test('counts every copied line and calculates the net amount from EUR per tonne', () => {
  assert.deepEqual(purchaseTotals([{ amount: 25000, purchasePrice: 900 }, { amount: 24750, purchasePrice: 800 }]), { count: 2, amount: 49750, sum: 42300 });
  assert.equal(purchaseTotals([{ amount: 25000, purchasePrice: '' }]).sum, null);
  assert.equal(purchaseTotals([{ amount: 25000, purchasePrice: 0 }]).sum, 0);
  assert.ok(purchaseMissingFields({ packagingTypeId: 79, deliveryTermId: 1, loadingLocationText: 'Ort', positions: [{ amount: 1, purchasePrice: '', requestedDeliveryDate: '2026-02-31' }] }).includes('EK Position 1'));
  assert.ok(purchaseMissingFields({ positions: [{ amount: 1, purchasePrice: 0, requestedDeliveryDate: '2026-02-31' }] }).includes('Liefertermin Position 1'));
});

test('request identity survives retries; successful clearing keeps only the shopping return', () => {
  const target = { pathname: '/customers/42', state: { detailView: 'supplier', supplierArticleState: { query: 'PP', scrollTop: 400 } } };
  addPurchaseCartItems([item('A')], target);
  const requestId = getPurchaseRequestId();
  savePurchaseCartContext({ pendingPayload: { positions: [item('A')] } });
  assert.equal(getPurchaseRequestId(), requestId);
  clearPurchaseCart();
  assert.deepEqual(getPurchaseCartContext().returnTo, target);
  assert.equal(getPurchaseCartContext().pendingPayload, undefined);
  assert.notEqual(getPurchaseRequestId(), requestId);
});
