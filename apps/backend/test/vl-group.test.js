const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertFrupackGroupAccess, selectFrupackMandants, getVlScope,
  sortGroupVlItems, combineVlGroups,
} = require('../src/vl-group');

test('group access stays limited to verified active AKI, MFR and NSC identities', () => {
  for (const [shortCode, personNumber, userId] of [['AKI', 1, 'kimaz'], ['MFR', 130, 'm.frank'], ['NSC', 227, 'n.schroeder']]) {
    assert.doesNotThrow(() => assertFrupackGroupAccess({ shortCode, personNumber, userId, active: true }));
    assert.throws(() => assertFrupackGroupAccess({ shortCode, personNumber, userId, active: false }), { status: 403 });
    assert.throws(() => assertFrupackGroupAccess({ shortCode, personNumber, userId: 'other', active: true }), { status: 403 });
  }
  assert.throws(() => assertFrupackGroupAccess({ shortCode: 'DRE', mainCompanyId: 3, active: true }), { status: 403 });
});

test('group membership uses only Frupack tenants already authorized for the user', () => {
  assert.deepEqual(selectFrupackMandants([{ firmaId: 0 }, { firmaId: 2 }, { firmaId: 3 }, { firmaId: 10 }, { firmaId: 19 }]),
    [{ firmaId: 3 }, { firmaId: 10 }, { firmaId: 19 }]);
  assert.deepEqual(selectFrupackMandants([{ firmaId: 2 }]), []);
});

test('a group scope cannot silently fall back to a single tenant', () => {
  assert.equal(getVlScope({ vlScope: 'frupack-group' }), 'frupack-group');
  assert.equal(getVlScope({ vlMandantId: '3' }), '');
  assert.throws(() => getVlScope({ vlScope: 'all' }), { status: 400 });
  assert.throws(() => getVlScope({ vlScope: 'frupack-group', vlMandantId: '3' }), { status: 400 });
});

test('shared products remain individual positions and are globally sorted before pagination', () => {
  const same = { id: 'same', article: 'Shared', plastic: 'PP', plasticSubCategory: 'Copo', mfi: 3 };
  const items = sortGroupVlItems([
    { ...same, sourceMandantId: 10 }, { ...same, sourceMandantId: 3 },
    { ...same, id: 'first', mfi: 1, sourceMandantId: 12 },
  ]);
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((item) => item.sourceMandantId), [12, 3, 10]);
  assert.deepEqual(items.slice(1, 2).map((item) => item.sourceMandantId), [3]);
});

test('tenant-local article groups and colliding position IDs stay separate', () => {
  const groups = combineVlGroups([3, 10].map((id) => ({
    database: { firmaId: id, name: `Frupack ${id}` },
    groups: [{ key: 'master-article:100', name: 'Shared', availableCount: 1,
      positions: [{ id: 'same', sourceMandantId: id, amount: 12 }] }],
  })));
  assert.equal(groups.length, 2);
  assert.notEqual(groups[0].key, groups[1].key);
  assert.notEqual(groups[0].positions[0].positionKey, groups[1].positions[0].positionKey);
  assert.equal(groups[0].positions[0].amount, 12);
  assert.equal(groups[1].positions[0].amount, 12);
});
