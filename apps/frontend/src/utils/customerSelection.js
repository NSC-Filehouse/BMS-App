import { getMandant } from './mandant.js';
import { clearOrderCart } from './orderCart.js';

const PREFIX = 'bms.selectedCustomer';
export const CUSTOMER_SELECTION_CHANGED = 'bms:selected-customer-changed';

function key() {
  const mandant = getMandant() || 'default';
  return `${PREFIX}.${mandant}`;
}

function normalizeCustomer(customer) {
  if (!customer) return null;
  const id = String(customer.id ?? customer.kd_KdNR ?? customer.clientReferenceId ?? '').trim();
  const name = String(customer.name ?? customer.kd_Name1 ?? customer.kd_Name2 ?? customer.clientName ?? '').trim();
  const address = String(customer.address ?? customer.clientAddress ?? '').trim();
  const representative = String(customer.representative ?? customer.clientRepresentative ?? '').trim();
  if (!id) return null;
  return { id, name, address, representative };
}

function dispatchChanged(customer) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CUSTOMER_SELECTION_CHANGED, { detail: customer || null }));
}

export function getSelectedCustomer() {
  try {
    const raw = localStorage.getItem(key());
    if (!raw) return null;
    return normalizeCustomer(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function setSelectedCustomer(customer) {
  const next = normalizeCustomer(customer);
  if (!next) {
    clearSelectedCustomer();
    return null;
  }

  const prev = getSelectedCustomer();
  try {
    localStorage.setItem(key(), JSON.stringify(next));
  } catch {
    // ignore
  }

  if (!prev || String(prev.id) !== String(next.id)) {
    clearOrderCart();
  }
  dispatchChanged(next);
  return next;
}

export function clearSelectedCustomer() {
  const hadCustomer = Boolean(getSelectedCustomer());
  try {
    localStorage.removeItem(key());
  } catch {
    // ignore
  }
  if (hadCustomer) {
    clearOrderCart();
  }
  dispatchChanged(null);
}
