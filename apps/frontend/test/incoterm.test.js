import test from 'node:test';
import assert from 'node:assert/strict';
import { isFcaIncoterm, normalizePickupFormAddress, applyPickupSuggestion, switchOrderIncoterm } from '../src/utils/incoterm.js';

const delivery = { clientReferenceId: 'customer1', incotermId: 1, incotermText: 'CPT', deliveryAddress: 'Customer warehouse', deliveryAddressId: '51', deliveryAddressManual: false, deliveryAddressNewlyCreated: false };
const fca = { id: 99, text: 'FCA / Free Carrier' };

test('FCA detection accepts the configured label and rejects partial matches', () => {
  assert.equal(isFcaIncoterm(' fca / Free Carrier'), true);
  assert.equal(isFcaIncoterm('FCAfoo'), false);
});

test('switching to FCA clears the customer FK and switching back restores the selected delivery address', () => {
  const pickup = switchOrderIncoterm(delivery, fca, {}, 'customer1|BE1');
  assert.equal(pickup.form.deliveryAddress, '');
  assert.equal(pickup.form.deliveryAddressId, '');
  assert.equal(pickup.form.deliveryAddressManual, true);
  const edited = { ...pickup.form, deliveryAddress: 'Edited pickup address' };
  const back = switchOrderIncoterm(edited, { id: 1, text: 'CPT' }, pickup.cache, 'customer1|BE1');
  assert.deepEqual(back.form, delivery);
  assert.equal(switchOrderIncoterm(back.form, fca, back.cache, 'customer1|BE1').form.deliveryAddress, 'Edited pickup address');
  assert.equal(switchOrderIncoterm(back.form, fca, back.cache, 'customer1|BE2').form.deliveryAddress, '');
});

test('changing the customer cannot restore another customer delivery address', () => {
  const pickup = switchOrderIncoterm(delivery, fca, {}, 'customer1|BE1');
  const back = switchOrderIncoterm({ ...pickup.form, clientReferenceId: 'customer2' }, { id: 1, text: 'CPT' }, pickup.cache, 'customer2|BE1');
  assert.equal(back.form.deliveryAddress, '');
  assert.equal(back.form.deliveryAddressId, '');
});

test('loaded and restored FCA orders keep manual snapshots while legacy customer address IDs are cleared', () => {
  assert.equal(normalizePickupFormAddress({ ...delivery, incotermText: 'FCA' }).deliveryAddress, '');
  const saved = { ...delivery, incotermText: 'FCA', deliveryAddress: 'Saved pickup address', deliveryAddressId: '', deliveryAddressManual: true };
  assert.equal(normalizePickupFormAddress(saved).deliveryAddress, 'Saved pickup address');
  assert.equal(applyPickupSuggestion(saved, 'New proposal', '').deliveryAddress, 'Saved pickup address');
});

test('late suggestions preserve typed corrections and cannot overwrite the address after switching away from FCA', () => {
  const pickup = switchOrderIncoterm(delivery, fca, {}, 'customer1|BE1').form;
  const proposed = applyPickupSuggestion(pickup, 'Factory A', '');
  assert.equal(proposed.deliveryAddress, 'Factory A');
  assert.equal(applyPickupSuggestion(proposed, 'Factory B', 'Factory A').deliveryAddress, 'Factory B');
  assert.equal(applyPickupSuggestion({ ...proposed, deliveryAddress: 'Manual correction' }, 'Factory B', 'Factory A').deliveryAddress, 'Manual correction');
  assert.equal(applyPickupSuggestion(delivery, 'Factory A', ''), delivery);
});
