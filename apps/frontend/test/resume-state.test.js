import assert from 'node:assert/strict';
import test from 'node:test';
import { checkResumeSession } from '../src/utils/resumeSession.js';
import { getLastRoute, rememberLastRoute } from '../src/utils/resumeNavigation.js';
import { clearTempOrderDraft, loadTempOrderDraft, saveTempOrderDraft } from '../src/utils/tempOrderDraft.js';

function response({ status = 200, body = {}, redirected = false, contentType = 'application/json' } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    redirected,
    headers: { get: (name) => name === 'content-type' ? contentType : null },
    json: async () => body,
  };
}

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('resume check keeps the page for a failed request or BMS identity lookup', async () => {
  assert.deepEqual(await checkResumeSession(() => Promise.reject(new Error('offline'))), { status: 'unavailable' });
  assert.deepEqual(await checkResumeSession(() => response({ status: 503 })), { status: 'unavailable' });
  assert.deepEqual(await checkResumeSession(() => response({
    body: { samAccountName: 'MUSTER', identityResolved: false },
  })), { status: 'unavailable' });
});

test('resume check distinguishes an authenticated identity from missing SSO identity', async () => {
  assert.deepEqual(await checkResumeSession(() => response({
    body: { samAccountName: 'MUSTER', identityResolved: true },
  })), { status: 'authenticated', userId: 'MUSTER' });
  assert.deepEqual(await checkResumeSession(() => response({ status: 401 })), { status: 'unauthenticated' });
  assert.deepEqual(await checkResumeSession(() => response({ body: { identityResolved: false } })), { status: 'unauthenticated' });
});

test('last route is restored only for the same user and an allowed mandant', () => {
  const store = storage();
  rememberLastRoute({ userId: 'MUSTER', mandant: 'Frupack', route: '/temp-orders/new', storage: store, now: 1000 });
  assert.deepEqual(getLastRoute({
    userId: 'muster', allowedMandants: [{ name: 'Frupack' }], storage: store, now: 2000,
  }), { route: '/temp-orders/new', mandant: 'Frupack' });
  assert.equal(getLastRoute({ userId: 'OTHER', allowedMandants: [{ name: 'Frupack' }], storage: store, now: 2000 }), null);
  assert.equal(getLastRoute({ userId: 'MUSTER', allowedMandants: [{ name: 'Other' }], storage: store, now: 2000 }), null);
  assert.equal(getLastRoute({ userId: 'MUSTER', allowedMandants: [{ name: 'Frupack' }], storage: store, now: 90000000 }), null);
  rememberLastRoute({ userId: 'MUSTER', mandant: 'Frupack', route: '//outside.example', storage: store, now: 3000 });
  assert.deepEqual(getLastRoute({
    userId: 'MUSTER', allowedMandants: [{ name: 'Frupack' }], storage: store, now: 4000,
  }), { route: '/temp-orders/new', mandant: 'Frupack' });
});

test('order draft is isolated by user and mandant, expires, and clears after saving', () => {
  const store = storage();
  const context = { userId: 'MUSTER', mandant: 'Frupack', orderId: 'new' };
  const data = { form: { clientName: 'Kunde' }, positions: [{ beNumber: '3-02-26-00001-01' }] };
  saveTempOrderDraft(context, data, { storage: store, now: 1000 });
  assert.deepEqual(loadTempOrderDraft(context, { storage: store, now: 2000 })?.form, data.form);
  assert.equal(loadTempOrderDraft({ ...context, userId: 'OTHER' }, { storage: store, now: 2000 }), null);
  assert.equal(loadTempOrderDraft({ ...context, mandant: 'Other' }, { storage: store, now: 2000 }), null);
  assert.equal(loadTempOrderDraft(context, { storage: store, now: 8 * 24 * 60 * 60 * 1000 }), null);
  saveTempOrderDraft(context, data, { storage: store, now: 1000 });
  clearTempOrderDraft(context, { storage: store });
  assert.equal(loadTempOrderDraft(context, { storage: store, now: 2000 }), null);
});
