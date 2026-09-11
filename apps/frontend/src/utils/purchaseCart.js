import { getMandant } from './mandant.js';

export const PURCHASE_CART_CHANGED = 'bms-purchase-cart-changed';

function key() {
  return `bms.purchaseCart.${getMandant() || 'default'}`;
}

function read() {
  try {
    const value = JSON.parse(localStorage.getItem(key()) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function write(items) {
  try {
    localStorage.setItem(key(), JSON.stringify(items));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(PURCHASE_CART_CHANGED));
  } catch {
    // localStorage is optional in private browsing; the page will remain usable.
  }
}

function newId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function supplierKey(item) {
  return String(item?.supplierId || '').trim().toLowerCase();
}

export function getPurchaseCartItems() { return read(); }
export function getPurchaseCartCount() { return read().length; }
export function clearPurchaseCart() { write([]); return []; }

export function removePurchaseCartItem(lineId) {
  const next = read().filter((item) => String(item?.lineId || '') !== String(lineId || ''));
  write(next);
  return next;
}

export function updatePurchaseCartItem(lineId, patch) {
  const next = read().map((item) => (
    String(item?.lineId || '') === String(lineId || '') ? { ...item, ...(patch || {}) } : item
  ));
  write(next);
  return next;
}

export function addPurchaseCartItem(item) {
  const current = read();
  const nextSupplier = supplierKey(item);
  if (!nextSupplier) throw new Error('Für den Artikel ist kein Lieferant hinterlegt.');
  const existingSupplier = supplierKey(current[0]);
  if (existingSupplier && existingSupplier !== nextSupplier) {
    const error = new Error('Der Bestellwarenkorb kann nur Artikel eines Lieferanten enthalten.');
    error.code = 'PURCHASE_CART_SUPPLIER_MISMATCH';
    throw error;
  }
  const articleKey = `${String(item?.articleIndex || '')}|${String(item?.article || '')}`.toLowerCase();
  const existingIndex = current.findIndex((entry) => `${String(entry?.articleIndex || '')}|${String(entry?.article || '')}`.toLowerCase() === articleKey);
  const line = {
    ...item,
    lineId: String(item?.lineId || current[existingIndex]?.lineId || newId()),
    supplierId: String(item.supplierId),
    amount: Number(item?.amount) > 0 ? Number(item.amount) : 1,
    purchasePrice: item?.purchasePrice === null || item?.purchasePrice === undefined ? '' : item.purchasePrice,
    requestedDeliveryDate: String(item?.requestedDeliveryDate || '').slice(0, 10),
  };
  const next = existingIndex >= 0
    ? current.map((entry, index) => (index === existingIndex ? { ...entry, ...line } : entry))
    : [...current, line];
  write(next);
  return next;
}

