import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { addPurchaseCartItems, clearPurchaseCart, duplicatePurchaseCartItem, getPurchaseCartContext, getPurchaseCartItems, getPurchaseRequestId, purchaseFieldErrors, purchaseMissingFields, purchaseTotals, savePurchaseCartContext, updatePurchaseCartItem } from '../src/utils/purchaseCart.js';

const storage = new Map();
global.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: (key) => storage.delete(key) };
beforeEach(() => { storage.clear(); localStorage.setItem('bms.mandant', 'FRU'); });
const item = (id, packaging = 'Sackware') => ({ supplierId: '42', articleIndex: id, article: `Artikel ${id}`, originalPackagingType: packaging });

test('supplier name remains primary and the separate internal name survives shopping and independent copies', () => {
  addPurchaseCartItems([{ ...item('A'), article: 'Supplier grade', masterArticleName: 'Our material name' }]);
  const [first] = getPurchaseCartItems();
  duplicatePurchaseCartItem(first.lineId);
  for (const row of getPurchaseCartItems()) {
    assert.equal(row.article, 'Supplier grade');
    assert.equal(row.masterArticleName, 'Our material name');
  }
});

test('new purchase lines start empty and use the packaging load, with one article per ID', () => {
  addPurchaseCartItems([item('A', 'Siloware'), { ...item('A'), article: 'Alter Name', purchasePrice: 900, requestedDeliveryDate: '2025-01-01', amount: 123 }]);
  const rows = getPurchaseCartItems();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 25000);
  rows.forEach((p) => ['purchasePrice', 'requestedDeliveryDate', 'reservedFor', 'comment'].forEach((key) => assert.equal(p[key], '')));
  clearPurchaseCart(); addPurchaseCartItems([item('B')]);
  assert.equal(getPurchaseCartItems()[0].amount, 24750);
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

test('rejects different suppliers and article types atomically while retaining same-article copies', () => {
  addPurchaseCartItems([item('A')]);
  const before = getPurchaseCartItems();
  assert.throws(() => addPurchaseCartItems([item('B'), { ...item('C'), supplierId: 'other' }]));
  assert.deepEqual(getPurchaseCartItems(), before);
  assert.throws(() => addPurchaseCartItems([item('B')]), /nur eine Artikelart/);
  assert.deepEqual(getPurchaseCartItems(), before);
  clearPurchaseCart();
  savePurchaseCartContext({ header: { packagingType: 'Siloware' } });
  addPurchaseCartItems([item('B')]);
  assert.equal(getPurchaseCartItems()[0].amount, 24750);
  assert.equal(getPurchaseCartContext().header, null);
});

test('counts every copied line and calculates the net amount from EUR per tonne', () => {
  assert.deepEqual(purchaseTotals([{ amount: 25000, purchasePrice: 900 }, { amount: 24750, purchasePrice: 800 }]), { count: 2, amount: 49750, sum: 42300 });
  assert.equal(purchaseTotals([{ amount: 25000, purchasePrice: '' }]).sum, null);
  assert.equal(purchaseTotals([{ amount: 25000, purchasePrice: 0 }]).sum, 0);
  assert.ok(purchaseMissingFields({ packagingTypeId: 79, deliveryTermId: 1, loadingLocationText: 'Ort', positions: [{ amount: 1, purchasePrice: '', requestedDeliveryDate: '2026-02-31' }] }).includes('EK Position 1'));
  assert.ok(purchaseMissingFields({ positions: [{ amount: 1, purchasePrice: 0, requestedDeliveryDate: '2026-02-31' }] }).includes('Liefertermin Position 1'));
  const errors = purchaseFieldErrors({ positions: [{ articleIndex: 'A', amount: '', purchasePrice: '', requestedDeliveryDate: '' }] });
  assert.deepEqual(errors.positions[0], { amount: true, purchasePrice: true, requestedDeliveryDate: true });
  assert.equal(purchaseFieldErrors({ positions: [item('A'), item('B')] }).articleType, true);
});

test('clears historical defaults in an older browser cart once and keeps subsequent manual edits', () => {
  localStorage.setItem('bms.purchaseCart.FRU', JSON.stringify([{ ...item('A', 'Siloware'), lineId: 'old', amount: 123, purchasePrice: 900, requestedDeliveryDate: '2025-01-01', reservedFor: 'Alt', comment: 'Alt' }]));
  savePurchaseCartContext({ header: { comment: 'Alter Bestelltext' } });
  const [migrated] = getPurchaseCartItems();
  assert.equal(migrated.amount, 25000);
  assert.equal(migrated.purchasePrice, '');
  assert.equal(migrated.requestedDeliveryDate, '');
  assert.equal(migrated.reservedFor, '');
  assert.equal(migrated.comment, '');
  assert.equal(getPurchaseCartContext().header.comment, '');
  updatePurchaseCartItem('old', { amount: 5000, purchasePrice: 800, requestedDeliveryDate: '2026-11-05' });
  assert.equal(getPurchaseCartItems()[0].purchasePrice, 800);
  assert.equal(getPurchaseCartItems()[0].amount, 5000);
});

test('never rewrites historical-looking values during an uncertain save retry', () => {
  const row = { ...item('A'), amount: 123, purchasePrice: 900, requestedDeliveryDate: '2025-01-01' };
  localStorage.setItem('bms.purchaseCart.FRU', JSON.stringify([row]));
  savePurchaseCartContext({ pendingPayload: { positions: [row] } });
  assert.deepEqual(getPurchaseCartItems(), [row]);
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
