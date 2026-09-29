const PREFIX = 'bms.tempOrderDraft.v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function storageOrNull(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage || null; } catch { return null; }
}

function draftKey({ userId, mandant, orderId }) {
  const parts = [userId, mandant, orderId || 'new']
    .map((value) => encodeURIComponent(String(value || '').trim().toLowerCase()));
  return parts[0] && parts[1] && parts[2] ? `${PREFIX}.${parts.join('.')}` : '';
}

export function loadTempOrderDraft(context, { storage, now = Date.now() } = {}) {
  const store = storageOrNull(storage);
  const key = draftKey(context);
  if (!store || !key) return null;
  try {
    const draft = JSON.parse(store.getItem(key) || 'null');
    if (!draft) return null;
    const age = now - Number(draft.savedAt);
    if (draft.version !== 1 || !draft.form || !Array.isArray(draft.positions)
      || !Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) {
      store.removeItem(key);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function saveTempOrderDraft(context, data, { storage, now = Date.now() } = {}) {
  const store = storageOrNull(storage);
  const key = draftKey(context);
  if (!store || !key) return;
  try {
    store.setItem(key, JSON.stringify({ version: 1, savedAt: now, ...data }));
  } catch {
    // Full or unavailable local storage must not block order editing.
  }
}

export function clearTempOrderDraft(context, { storage } = {}) {
  const store = storageOrNull(storage);
  const key = draftKey(context);
  if (!store || !key) return;
  try { store.removeItem(key); } catch { /* Storage is optional. */ }
}
