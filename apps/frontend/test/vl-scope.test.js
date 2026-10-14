import test from 'node:test';
import assert from 'node:assert/strict';
import { getVlPositionKey, isVlPositionReadOnly, getProductSourceMandantId } from '../src/utils/vlScope.js';

test('the same product ID in different tenants has independent row and selection keys', () => {
  assert.notEqual(getVlPositionKey({ id: 'same', sourceMandantId: 3 }), getVlPositionKey({ id: 'same', sourceMandantId: 10 }));
  assert.equal(getVlPositionKey({ id: 'old' }), 'old');
});

test('only positions from the active tenant are actionable, including after a tenant switch', () => {
  const local = { sourceMandantId: 3 };
  const foreign = { sourceMandantId: 10 };
  assert.equal(isVlPositionReadOnly(local, 3), false);
  assert.equal(isVlPositionReadOnly(foreign, 3), true);
  assert.equal(isVlPositionReadOnly(local, 10), true);
  assert.equal(isVlPositionReadOnly(foreign, 10), false);
  assert.equal(isVlPositionReadOnly(local, 3, true), true);
  assert.equal(isVlPositionReadOnly({}, 3), true);
  assert.equal(isVlPositionReadOnly(local, undefined), true);
  assert.equal(isVlPositionReadOnly({ sourceMandantId: 0 }, 0), false);
});

test('product detail, WPZ and reservations receive the actual source rather than the group marker', () => {
  assert.equal(getProductSourceMandantId({ sourceMandantId: 10 }, 'frupack-group'), '10');
  assert.equal(getProductSourceMandantId({ sourceMandantId: 3 }, 'frupack-group'), '3');
  assert.equal(getProductSourceMandantId({ sourceMandantId: 0 }, 'frupack-group'), '0');
  assert.equal(getProductSourceMandantId({}, '3'), '3');
  assert.equal(getProductSourceMandantId({}, 'frupack-group'), '');
});
