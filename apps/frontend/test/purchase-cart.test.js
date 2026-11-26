import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { addPurchaseCartItems, clearPurchaseCart, duplicatePurchaseCartItem, getPurchaseCartContext, getPurchaseCartItems, getPurchaseRequestId, planPurchaseTruckLoads, purchaseFieldErrors, purchaseMissingFields, purchaseTotals, savePurchaseCartContext, splitPurchaseTruckPositions, updatePurchaseCartItem } from '../src/utils/purchaseCart.js';

const storage = new Map();
global.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: (key) => storage.delete(key) };
beforeEach(() => { storage.clear(); localStorage.setItem('bms.mandant', 'FRU'); });
const item = (id, packaging = 'Sackware') => ({ supplierId: '42', articleIndex: id, article: `Artikel ${id}`, originalPackagingType: packaging });

test('an option pickup fills a cart without a chosen address and preserves an existing different pickup', () => {
  addPurchaseCartItems([item('A')]);
  const header = { deliveryTermId: 1, deliveryTermText: 'FCA', loadingLocationSource: 'manual', loadingLocationChanged: true,
    loadingLocationText: 'Neues Werk\nStraße 1\n2030 Antwerpen\nBE — Belgien', loadingLocationCity: 'Antwerpen' };
  const option = { ...item('A'), optionId: 1, optionPositionId: 10, amount: 10000 };
  addPurchaseCartItems([option], null, header);
  assert.equal(getPurchaseCartContext().header.loadingLocationText, header.loadingLocationText);
  assert.equal(getPurchaseCartContext().header.loadingLocationCity, 'Antwerpen');
  assert.throws(() => addPurchaseCartItems([{ ...option, optionPositionId: 11 }], null, { ...header, loadingLocationText: 'Anderer Ladeort' }),
    error => error.code === 'PURCHASE_CART_LOCATION_CONFLICT');
  assert.equal(getPurchaseCartItems().length, 2);
  assert.equal(getPurchaseCartContext().header.loadingLocationText, header.loadingLocationText);
});

test('truck loads split and regroup the same order without losing amounts or line details', () => {
  const source = { ...item('A'), id: 15, lineId: 'existing', amount: 1400000, purchasePrice: 1100,
    requestedDeliveryDate: '2026-12-01', comment: 'Hinweis', optionId: 8, optionPositionId: 9 };
  let nextId = 0;
  const split = (positions, packaging) => splitPurchaseTruckPositions(positions, planPurchaseTruckLoads(positions, packaging), () => `new-${++nextId}`);
  const bags = split([source], 'Sackware');
  assert.deepEqual(bags.map(line => line.amount), [...Array(56).fill(24750), 14000]);
  assert.equal(bags[0].id, 15);
  assert.ok(bags.slice(1).every(line => line.id == null && line.copyOfPositionId === 15));
  assert.equal(new Set(bags.map(line => line.lineId)).size, 57);
  assert.ok(bags.every(line => line.amountTouched && line.optionPositionId === 9 && line.comment === 'Hinweis'));
  assert.deepEqual(purchaseTotals(bags), { count: 57, amount: 1400000, sum: 1540000 });
  assert.equal(planPurchaseTruckLoads(bags, 'Sackware').changes.length, 0);

  const silo = split(bags, 'Silo/Bulk');
  assert.deepEqual(silo.map(line => line.amount), Array(56).fill(25000));
  assert.deepEqual(purchaseTotals(silo), { count: 56, amount: 1400000, sum: 1540000 });
});

test('truck planning separates delivery dates and option sources and preserves fractional kilograms', () => {
  const base = { ...item('A'), amount: 24750.005, purchasePrice: 900, requestedDeliveryDate: '2026-12-01', optionId: 8 };
  const positions = [{ ...base, lineId: 'one', optionPositionId: 9 },
    { ...base, lineId: 'two', amount: 10, requestedDeliveryDate: '2026-12-02', optionPositionId: 9 },
    { ...base, lineId: 'three', amount: 10, optionPositionId: 10 }];
  const plan = planPurchaseTruckLoads(positions, 'Big Bags');
  assert.equal(plan.count, 4);
  const result = splitPurchaseTruckPositions(positions, plan, () => 'split');
  assert.deepEqual(result.map(line => line.amount), [24750, 0.005, 10, 10]);
  assert.equal(result[2], positions[1]);
  assert.equal(result[3], positions[2]);
  assert.equal(planPurchaseTruckLoads([{ ...base, amount: '' }], 'Sackware'), null);
});

test('supplier name remains primary and the separate internal name survives shopping and independent copies', () => {
  addPurchaseCartItems([{ ...item('A'), article: 'Supplier grade', masterArticleName: 'Our material name' }]);
  const [first] = getPurchaseCartItems();
  duplicatePurchaseCartItem(first.lineId);
  for (const row of getPurchaseCartItems()) {
    assert.equal(row.article, 'Supplier grade');
    assert.equal(row.masterArticleName, 'Our material name');
  }
});

test('options retain confirmed source, quantity and EK and distinct offers for the same article never collapse',()=>{
  const option={...item('A'),optionId:1,optionPositionId:10,amount:10000,purchasePrice:900,supplierConfirmed:true,articleConfirmed:true};
  addPurchaseCartItems([option],null,{loadingLocationText:'Neues Werk',loadingLocationSource:'manual'});
  const first=getPurchaseCartItems()[0];
  assert.equal(first.amount,10000);assert.equal(first.purchasePrice,900);assert.equal(first.amountTouched,true);
  assert.equal(getPurchaseCartContext().header.loadingLocationSource,'manual');
  addPurchaseCartItems([{...option,optionId:2,optionPositionId:20},item('A')]);
  assert.equal(getPurchaseCartItems().length,3);
  duplicatePurchaseCartItem(first.lineId);
  const copied=getPurchaseCartItems()[1];
  assert.equal(copied.optionId,1);assert.equal(copied.optionPositionId,10);assert.equal(copied.supplierConfirmed,true);
});
test('truck packaging transfers to the order and does not silently overwrite an existing cart choice',()=>{
  const row={...item('A'),optionId:1,optionPositionId:10,optionPackagingTypeId:79,amount:25000,purchasePrice:900};
  addPurchaseCartItems([row],null,{packagingTypeId:79,packagingType:'Siloware'});
  assert.equal(getPurchaseCartContext().header.packagingTypeId,79);assert.equal(getPurchaseCartItems()[0].amount,25000);
  clearPurchaseCart();addPurchaseCartItems([item('A')]);
  savePurchaseCartContext({header:{packagingTypeId:78,packagingType:'Sackware',comment:'Behalten'}});
  const before=getPurchaseCartItems();
  assert.throws(()=>addPurchaseCartItems([row],null,{packagingTypeId:79,packagingType:'Siloware'}),/Verpackungsart/);
  assert.deepEqual(getPurchaseCartItems(),before);assert.equal(getPurchaseCartContext().header.comment,'Behalten');
  savePurchaseCartContext({header:{comment:'Behalten'}});
  addPurchaseCartItems([row],null,{packagingTypeId:79,packagingType:'Siloware'});
  assert.equal(getPurchaseCartContext().header.packagingTypeId,79);assert.equal(getPurchaseCartContext().header.comment,'Behalten');
});

test('adding an option fills an empty cart Incoterm and preserves an existing choice', () => {
  const row = { ...item('A'), optionId: 1, optionPositionId: 10, amount: 25000, purchasePrice: 900 };
  const fca = { deliveryTermId: 29, deliveryTermText: 'FCA / Frei Frachtführer' };
  const dap = { deliveryTermId: 24, deliveryTermText: 'DAP / Geliefert Benannter Ort' };
  addPurchaseCartItems([row]);
  savePurchaseCartContext({ header: { comment: 'Behalten' } });
  addPurchaseCartItems([row], null, fca);
  assert.deepEqual(getPurchaseCartContext().header, { comment: 'Behalten', ...fca });
  assert.equal(getPurchaseCartItems().length, 1);

  savePurchaseCartContext({ header: dap });
  addPurchaseCartItems([{ ...row, optionId: 2, optionPositionId: 20 }], null, fca);
  assert.deepEqual(getPurchaseCartContext().header, dap);
  assert.equal(getPurchaseCartItems().length, 2);
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
  addPurchaseCartItems([{...item('A'),supplierName:'Borealis'}]);
  const before = getPurchaseCartItems();
  assert.throws(() => addPurchaseCartItems([item('B'), { ...item('C'), supplierId: 'other' }]),error=>{
    assert.equal(error.code,'PURCHASE_CART_SUPPLIER_CONFLICT');
    assert.match(error.message,/bereits Artikel des Lieferanten „Borealis“ \(42\).*abschließen oder den Warenkorb leeren/);
    return true;
  });
  assert.deepEqual(getPurchaseCartItems(), before);
  assert.throws(() => addPurchaseCartItems([item('B')]), /nur eine Artikelart/);
  assert.deepEqual(getPurchaseCartItems(), before);
  clearPurchaseCart();
  assert.throws(()=>addPurchaseCartItems([item('A'),{...item('A'),supplierId:'other'}]),/verschiedenen Lieferanten/);
  assert.deepEqual(getPurchaseCartItems(),[]);
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
  assert.deepEqual(errors.positions[0], { articleIndex: false, amount: true, purchasePrice: true, requestedDeliveryDate: true });
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
