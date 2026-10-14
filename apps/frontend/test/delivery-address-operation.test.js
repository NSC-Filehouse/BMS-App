import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeliveryAddressDraft, deliveryAddressContextMatches, deliveryAddressStorageKey, keepDeliveryAddressPending, readDeliveryAddressPending, resolveDeliveryAddressSelection } from '../src/utils/deliveryAddressOperation.js';
import { getCreationFieldLimit } from '../src/utils/customerCreation.js';

test('pending delivery address requests are separated by identity, tenant and customer', () => {
  const key = deliveryAddressStorageKey('user', 'FRU', '10001');
  for (const parts of [['other', 'FRU', '10001'], ['user', 'PLA', '10001'], ['user', 'FRU', '10002']]) {
    assert.notEqual(key, deliveryAddressStorageKey(...parts));
  }
  const pending = { id: '44d1d586-c395-46b9-8b0b-8b3da41e6d64', body: { street: 'Frozen street', confirmed: true } };
  const storage = { getItem: (requested) => requested === key ? JSON.stringify(pending) : null };
  assert.deepEqual(readDeliveryAddressPending(storage, key), pending);
  assert.equal(readDeliveryAddressPending(storage, 'another key'), null);
  assert.equal(readDeliveryAddressPending({ getItem: () => '{broken' }, key), null);
  assert.equal(readDeliveryAddressPending({ getItem: () => '{"id":"invalid","body":{}}' }, key), null);
});

test('a changed tenant or customer cannot receive an asynchronous address result', () => {
  const scope = { customerId: '10001', mandant: 'FRU' };
  assert.equal(deliveryAddressContextMatches(scope, { ...scope }), true);
  assert.equal(deliveryAddressContextMatches(scope, { ...scope, customerId: '10002' }), false);
  assert.equal(deliveryAddressContextMatches(scope, { ...scope, mandant: 'PLA' }), false);
  assert.equal(deliveryAddressContextMatches(null, scope), false);
});

test('only an authoritative failed operation releases the frozen request', () => {
  for (const failure of [new Error('connection lost'), { status: 401 }, { status: 404 }, { payload: { error: { details: { state: 'created' } } } }, { payload: { error: { details: { state: 'unknown' } } } }]) {
    assert.equal(keepDeliveryAddressPending(failure), true);
  }
  assert.equal(keepDeliveryAddressPending({ payload: { error: { details: { state: 'failed' } } } }), false);
});

test('draft normalization keeps delivery-specific contact and pickup hours', () => {
  assert.deepEqual(buildDeliveryAddressDraft({ street: ' Straße 1 ', countryId: 'D', contact: ' Tor 2 ', pickupTimes: ' Mo-Fr ', unknown: true }), {
    street: 'Straße 1', postalCode: '', city: '', countryId: 'D', contact: 'Tor 2', pickupTimes: 'Mo-Fr',
  });
  assert.equal(getCreationFieldLimit('lieferanschriften[0].matchcode'), 100);
  assert.equal(getCreationFieldLimit('lieferanschriften[0].ansprechpartner'), 150);
  assert.equal(getCreationFieldLimit('lieferanschriften[0].abholzeiten'), 250);
});

test('identical address text cannot replace the technical id of a newly created or copied address', () => {
  const addresses = [{ id: '100', text: 'Same address' }, { id: '4711', text: 'Same address' }];
  assert.equal(resolveDeliveryAddressSelection(addresses, '4711', 'Same address'), addresses[1]);
  assert.equal(resolveDeliveryAddressSelection(addresses, '', 'Same address'), null);
  assert.equal(resolveDeliveryAddressSelection(addresses, '999', 'Same address'), null);
  assert.equal(resolveDeliveryAddressSelection([addresses[1]], '', 'Same address'), addresses[1]);
});
