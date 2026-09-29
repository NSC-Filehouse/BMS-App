const KEY = 'bms.lastRoute.v1';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SKIP_PATHS = new Set(['/', '/mandants/select', '/database-unavailable']);

function storageOrNull(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage || null; } catch { return null; }
}

function normalizeRoute(route) {
  const value = String(route || '').trim();
  if (!value.startsWith('/') || value.startsWith('//') || /[\r\n\\]/.test(value)) return '';
  const path = value.split(/[?#]/, 1)[0];
  return SKIP_PATHS.has(path) ? '' : value;
}

function normalizeIdentity(value) {
  return String(value || '').trim().toLowerCase();
}

export function rememberLastRoute({ userId, mandant, route, storage, now = Date.now() }) {
  const safeRoute = normalizeRoute(route);
  const safeUser = normalizeIdentity(userId);
  const safeMandant = normalizeIdentity(mandant);
  if (!safeRoute || !safeUser || !safeMandant) return;
  try {
    storageOrNull(storage)?.setItem(KEY, JSON.stringify({
      userId: safeUser,
      mandant: safeMandant,
      route: safeRoute,
      savedAt: now,
    }));
  } catch {
    // Browser storage is optional; normal navigation continues.
  }
}

export function getLastRoute({ userId, allowedMandants, storage, now = Date.now() }) {
  const store = storageOrNull(storage);
  if (!store) return null;
  try {
    const value = JSON.parse(store.getItem(KEY) || 'null');
    if (!value) return null;
    const route = normalizeRoute(value.route);
    const age = now - Number(value.savedAt);
    const mandant = (Array.isArray(allowedMandants) ? allowedMandants : [])
      .find((item) => normalizeIdentity(item?.name) === normalizeIdentity(value.mandant));
    if (!route || !mandant || normalizeIdentity(value.userId) !== normalizeIdentity(userId)
      || !Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) return null;
    return { route, mandant: mandant.name };
  } catch {
    return null;
  }
}
