import { getMandant } from './mandant.js';

const PREFIX = 'bms.recentCustomers';
export const RECENT_CUSTOMERS_LIMIT = 25;
const MAX_RECENT_CUSTOMERS = RECENT_CUSTOMERS_LIMIT;
export const RECENT_CUSTOMERS_CHANGED = 'bms:recent-customers-changed';

function key(scope = 'customers') {
  const mandant = getMandant() || 'default';
  return scope === 'suppliers'
    ? `${PREFIX}.suppliers.${mandant}`
    : `${PREFIX}.${mandant}`;
}

export function getRecentCustomersStorageKey(scope = 'customers') {
  return key(scope);
}

function normalizeCustomer(customer) {
  if (!customer) return null;

  const id = String(customer.id ?? customer.kd_KdNR ?? '').trim();
  const name = String(
    customer.name
      ?? customer.kd_Name1
      ?? customer.kd_Name2
      ?? '',
  ).trim();
  if (!id || !name) return null;

  return {
    id,
    name,
    address: String(customer.address ?? '').trim(),
    representative: String(
      customer.representative ?? customer.kd_Aussendienst ?? '',
    ).trim(),
    lastViewedAt: String(customer.lastViewedAt ?? customer.viewedAt ?? '').trim()
      || new Date().toISOString(),
  };
}

function readStoredCustomers(scope = 'customers') {
  try {
    const storageKey = key(scope);
    let raw = localStorage.getItem(storageKey);
    if (!raw && scope === 'suppliers') {
      raw = localStorage.getItem(key('customers'));
      if (raw) {
        try {
          localStorage.setItem(storageKey, raw);
        } catch {
          // Keep the legacy history usable if migration storage is unavailable.
        }
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const byId = new Map();
    parsed.forEach((entry) => {
      const customer = normalizeCustomer(entry);
      if (!customer || byId.has(customer.id)) return;
      byId.set(customer.id, customer);
    });
    return Array.from(byId.values())
      .sort((a, b) => String(b.lastViewedAt).localeCompare(String(a.lastViewedAt)))
      .slice(0, MAX_RECENT_CUSTOMERS);
  } catch {
    return [];
  }
}

function dispatchChanged(customers, scope) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(RECENT_CUSTOMERS_CHANGED, {
    detail: { customers, scope },
  }));
}

export function getRecentCustomers(scope = 'customers') {
  return readStoredCustomers(scope);
}

export function recordRecentCustomer(customer, scope = 'customers') {
  const normalized = normalizeCustomer(customer);
  if (!normalized) return readStoredCustomers(scope);

  const next = [
    { ...normalized, lastViewedAt: new Date().toISOString() },
    ...readStoredCustomers(scope).filter((entry) => entry.id !== normalized.id),
  ].slice(0, MAX_RECENT_CUSTOMERS);

  try {
    localStorage.setItem(key(scope), JSON.stringify(next));
  } catch {
    // Ignore unavailable or full browser storage.
  }
  dispatchChanged(next, scope);
  return next;
}

export function clearRecentCustomers(scope = 'customers') {
  try {
    if (scope === 'suppliers') {
      localStorage.setItem(key(scope), '[]');
    } else {
      localStorage.removeItem(key(scope));
    }
  } catch {
    // Ignore unavailable browser storage.
  }
  dispatchChanged([], scope);
}
