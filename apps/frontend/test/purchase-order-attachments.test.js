import test from 'node:test';
import assert from 'node:assert/strict';
import { purchaseOrderRequestBody } from '../src/utils/purchaseOrderAttachments.js';
import { addPurchaseCartItems, clearPurchaseCart, getPurchaseCartAttachmentFiles, getPurchaseCartItems, removePurchaseCartItem, savePurchaseCartAttachmentFiles } from '../src/utils/purchaseCart.js';

test('multipart purchase requests retain file bytes and serialize positions and removals without browser metadata', async () => {
  const file = new File(['%PDF-example'], 'Prüfung.pdf', { type: 'application/pdf' });
  const values = { supplierId: '42', positions: [{ articleIndex: 'A', amount: 1000 }], removeAttachmentIds: [2],
    pendingAttachmentFiles: [file], attachments: [{ id: 2 }], hadPendingAttachments: false, supplierContact: null };
  const body = purchaseOrderRequestBody(values);
  assert.deepEqual(JSON.parse(body.get('positions')), values.positions);
  assert.deepEqual(JSON.parse(body.get('removeAttachmentIds')), [2]);
  assert.equal(body.get('supplierContact'), '');
  assert.equal(body.get('attachmentCount'), '1');
  assert.equal(body.get('attachment').name, 'Prüfung.pdf');
  assert.equal(await body.get('attachment').text(), '%PDF-example');
  for (const key of ['pendingAttachmentFiles', 'attachments', 'hadPendingAttachments']) assert.equal(body.has(key), false);
});

test('retry after a reload retains the expected upload count so missing files cannot silently disappear', () => {
  const body = purchaseOrderRequestBody({ clientRequestId: 'stable-request-id', attachmentCount: 2 }, []);
  assert.equal(body.get('attachmentCount'), '2');
  assert.equal(body.getAll('attachment').length, 0);
});

test('files survive continued shopping, stay isolated by mandant and clear with the cart', () => {
  const storage = new Map();
  global.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: (key) => storage.delete(key) };
  localStorage.setItem('bms.mandant', 'FRU');
  clearPurchaseCart();
  const item = { supplierId: '42', articleIndex: 'A', article: 'Material' };
  addPurchaseCartItems([item]);
  const file = new File(['data'], 'Foto.jpg');
  savePurchaseCartAttachmentFiles([file]);
  addPurchaseCartItems([item]);
  assert.equal(getPurchaseCartAttachmentFiles()[0], file);
  localStorage.setItem('bms.mandant', 'TES');
  assert.deepEqual(getPurchaseCartAttachmentFiles(), []);
  localStorage.setItem('bms.mandant', 'FRU');
  assert.equal(getPurchaseCartAttachmentFiles()[0], file);
  removePurchaseCartItem(getPurchaseCartItems()[0].lineId);
  assert.deepEqual(getPurchaseCartAttachmentFiles(), []);
  addPurchaseCartItems([item]); savePurchaseCartAttachmentFiles([file]); clearPurchaseCart();
  assert.deepEqual(getPurchaseCartAttachmentFiles(), []);
});
