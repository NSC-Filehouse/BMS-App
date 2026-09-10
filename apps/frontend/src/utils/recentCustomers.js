import { getMandant } from './mandant.js';

const PREFIX = 'bms.recentCustomers';
const MAX_RECENT_CUSTOMERS = 20;
export const RECENT_CUSTOMERS_CHANGED = 'bms:recent-customers-changed';

function key() {
  const mandant = getMandant() || 'default';
  return `${PREFIX}.${mandant}`;
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

function readStoredCustomers() {
  try {
    const raw = localStorage.getItem(key());
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

function dispatchChanged(customers) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(RECENT_CUSTOMERS_CHANGED, {
    detail: customers,
  }));
}

export function getRecentCustomers() {
  return readStoredCustomers();
}

export function recordRecentCustomer(customer) {
  const normalized = normalizeCustomer(customer);
  if (!normalized) return readStoredCustomers();

  const next = [
    { ...normalized, lastViewedAt: new Date().toISOString() },
    ...readStoredCustomers().filter((entry) => entry.id !== normalized.id),
  ].slice(0, MAX_RECENT_CUSTOMERS);

  try {
    localStorage.setItem(key(), JSON.stringify(next));
  } catch {
    // Ignore unavailable or full browser storage.
  }
  dispatchChanged(next);
  return next;
}

export function clearRecentCustomers() {
  try {
    localStorage.removeItem(key());
  } catch {
    // Ignore unavailable browser storage.
  }
  dispatchChanged([]);
}
