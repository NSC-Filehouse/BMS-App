import assert from 'node:assert/strict';
import test from 'node:test';
import { recoverOrderPositionSource } from '../src/utils/orderPositionSource.js';
import { loadTempOrderDraft, saveTempOrderDraft } from '../src/utils/tempOrderDraft.js';

const productId = 'PPR 10232 natur Total||Hamburg||3-02-26-123-01||PP||';

test('old draft recovers its BE without resetting edited order fields', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const context = { userId: 'NSC', mandant: 'Frupack', orderId: 'new' };
  const position = { productId, beNumber: '', warehouseId: 'LG0031', price: 1400, costPrice: 1200,
    deliveryDate: '2026-11-12', valutaDate: '2026-11-20', amountInKg: 10000,
    reservationInKg: 10000, reservationDate: '2026-11-10', wpzComment: 'Kundenetikett' };
  saveTempOrderDraft(context, { form: { packagingType: 'Sackware' }, positions: [position] }, { storage });
  const draft = loadTempOrderDraft(context, { storage });
  const restored = recoverOrderPositionSource(draft.positions[0]);
  assert.deepEqual(restored, { ...position, beNumber: '3-02-26-123-01' });
  assert.equal(draft.positions[0].beNumber, '');
});

test('fresh matching source fills missing technical keys but never overwrites draft edits', () => {
  const draft = { productId, clientKey: 'split-2', beNumber: '', warehouseId: '', articleIndex: '', price: 1400, deliveryDate: '2026-11-12' };
  const sources = [{ productId, beNumber: '3-02-26-123-01', warehouseId: 'LG0031', articleIndex: 'A-123', price: 9999, deliveryDate: '2027-01-01' }];
  assert.deepEqual(recoverOrderPositionSource(draft, sources), { ...draft,
    beNumber: '3-02-26-123-01', warehouseId: 'LG0031', articleIndex: 'A-123' });
});

test('same article at another BE or warehouse cannot supply missing keys', () => {
  const position = { productId, warehouseId: 'LG0031' };
  const recovered = recoverOrderPositionSource(position, [
    { productId: productId.replace('123-01', '456-01'), beNumber: '3-02-26-456-01', warehouseId: 'LG0546', articleIndex: 'Wrong BE' },
    { productId, beNumber: '3-02-26-123-01', warehouseId: 'LG0546', articleIndex: 'Wrong warehouse' },
  ]);
  assert.equal(recovered.beNumber, '3-02-26-123-01');
  assert.equal(recovered.articleIndex, undefined);
  assert.equal(recovered.warehouseId, 'LG0031');
});

test('warehouse labels and incomplete identifiers are never guessed as technical keys', () => {
  assert.deepEqual(recoverOrderPositionSource({ productId }), { productId, beNumber: '3-02-26-123-01' });
  for (const id of ['arbitrary-id', '3-02-26-123-01||LG0031', 'A||Hamburg||||PP||']) {
    const position = { productId: id };
    assert.equal(recoverOrderPositionSource(position), position);
  }
});

test('ambiguous source warehouses remain unresolved', () => {
  const recovered = recoverOrderPositionSource({ productId }, ['LG0031', 'LG0546'].map(warehouseId => ({
    productId, beNumber: '3-02-26-123-01', warehouseId,
  })));
  assert.equal(recovered.warehouseId, undefined);
});

test('known source keys remain unchanged', () => {
  const position = { productId, beNumber: 'existing-BE', warehouseId: 'existing-ID', articleIndex: 'existing-article' };
  assert.equal(recoverOrderPositionSource(position), position);
});
