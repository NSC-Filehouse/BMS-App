import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getVlPositionKey, isVlPositionReadOnly, getProductSourceMandantId,
  isVlReturnStateForMandant, resolveInitialVlSelection, buildVlDropdownOptions,
  buildProductSourceQuery,
} from '../src/utils/vlScope.js';

const frupackMandantIds = [3, 10, 11, 12, 19];
const mandants = [
  { id: 7, name: 'CHG' }, { id: 3, name: 'Frupack' },
  { id: 11, name: 'FrupackBeNeLux' }, { id: 12, name: 'FrupackFrance' },
  { id: 10, name: 'FrupackNordic' }, { id: 19, name: 'FrupackSweden' },
  { id: 2, name: 'MLPlastics' }, { id: 9, name: 'Westpoly' }, { id: 0, name: 'Test' },
];
const select = (activeMandantName, canViewGroup = true, returnState = null) => resolveInitialVlSelection({
  mandants, activeMandantName, frupackMandantIds, canViewGroup, returnState,
});

test('group details and WPZ carry the explicit read scope and concrete source without changing ordinary reads', () => {
  assert.equal(buildProductSourceQuery('10', 'frupack-group'), '?vlMandantId=10&vlScope=frupack-group');
  assert.equal(buildProductSourceQuery('3'), '?vlMandantId=3');
  assert.equal(buildProductSourceQuery(0), '?vlMandantId=0');
  assert.equal(buildProductSourceQuery(''), '');
  assert.equal(buildProductSourceQuery('10', 'all'), '?vlMandantId=10');
});

test('every active Frupack tenant defaults to the group only when the user has group access', () => {
  for (const { id, name } of mandants.filter((mandant) => frupackMandantIds.includes(mandant.id))) {
    assert.deepEqual(select(name), { id: 'frupack-group', restore: false });
    assert.deepEqual(select(name, false), { id: String(id), restore: false });
  }
  assert.deepEqual(select('MLPlastics'), { id: '2', restore: false });
  assert.deepEqual(select('Test'), { id: '0', restore: false });
});

test('returning to the same active tenant preserves an explicit single VL or group choice', () => {
  assert.deepEqual(select('Frupack', true, { activeMandantName: 'FRUPACK', vlMandantId: '10' }), { id: '10', restore: true });
  assert.deepEqual(select('MLPlastics', true, { activeMandantName: 'mlplastics', vlMandantId: 'frupack-group' }),
    { id: 'frupack-group', restore: true });
});

test('a changed tenant, revoked group access or unavailable VL invalidates the old return state', () => {
  assert.deepEqual(select('FrupackNordic', true, { activeMandantName: 'frupack', vlMandantId: '3' }),
    { id: 'frupack-group', restore: false });
  assert.deepEqual(select('Frupack', false, { activeMandantName: 'frupack', vlMandantId: 'frupack-group' }),
    { id: '3', restore: false });
  assert.deepEqual(select('Frupack', true, { activeMandantName: 'frupack', vlMandantId: '99' }),
    { id: 'frupack-group', restore: false });
  assert.equal(isVlReturnStateForMandant({ activeMandantName: 'frupack', searchInput: 'old' }, 'FrupackNordic'), false);
  assert.equal(isVlReturnStateForMandant({ vlMandantId: '3' }, 'Frupack'), false);
});

test('individual Frupack tenants sort last while the group stays alphabetical among the other tenants', () => {
  const options = buildVlDropdownOptions(mandants, { frupackMandantIds, canViewGroup: true, groupLabel: 'Frupack Gruppe' });
  assert.deepEqual(options.map((option) => option.name), [
    'CHG', 'Frupack Gruppe', 'MLPlastics', 'Test', 'Westpoly',
    'Frupack', 'FrupackBeNeLux', 'FrupackFrance', 'FrupackNordic', 'FrupackSweden',
  ]);
  assert.equal(mandants[1].name, 'Frupack');
  assert.equal(mandants.length, 9);
  const restricted = buildVlDropdownOptions(mandants, { frupackMandantIds, canViewGroup: false, groupLabel: 'Frupack Gruppe' });
  assert.equal(restricted.some((option) => option.id === 'frupack-group'), false);
  assert.deepEqual(restricted.slice(-5).map((option) => option.id), [3, 11, 12, 10, 19]);
});

test('membership and defaults use technical IDs even when a Frupack name changes', () => {
  const renamed = [{ id: 10, name: 'Region Nord' }, { id: 2, name: 'MLPlastics' }];
  assert.equal(resolveInitialVlSelection({ mandants: renamed, activeMandantName: 'Region Nord', frupackMandantIds,
    canViewGroup: true }).id, 'frupack-group');
  assert.equal(buildVlDropdownOptions(renamed, { frupackMandantIds, canViewGroup: true, groupLabel: 'Frupack Gruppe' }).at(-1).id, 10);
});

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
