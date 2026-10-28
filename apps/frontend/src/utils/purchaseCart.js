import { getMandant } from './mandant.js';
import { createCustomerOperationId } from './customerCreation.js';

export const createPurchaseLineId = createCustomerOperationId;

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
  return createPurchaseLineId();
}

function supplierKey(item) {
  return String(item?.supplierId || '').trim().toLowerCase();
}

export function getPurchaseCartItems() { return read(); }
export function getPurchaseCartCount() { return read().length; }
export function clearPurchaseCart() { write([]); localStorage.removeItem(contextKey()); return []; }

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

export function purchaseArticleKey(item) {
  return String(item?.articleIndex || item?.article || '').trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' ');
}

export function addPurchaseCartItems(items, returnTo = null) {
  const current = read();
  const context = getPurchaseCartContext();
  if (context.pendingPayload) throw new Error('Bitte zuerst den Speicherstatus im Bestellwarenkorb prüfen.');
  const incoming = Array.isArray(items) ? items : [];
  const supplier = supplierKey(current[0] || incoming[0]);
  if (!supplier || incoming.some((item) => supplierKey(item) !== supplier)) {
    throw new Error('Der Bestellwarenkorb kann nur Artikel eines Lieferanten enthalten.');
  }
  if (!current.length && context.header?.supplierId && supplierKey(context.header) !== supplier) {
    savePurchaseCartContext({ header: null, clientRequestId: null });
  }
  const known = new Set(current.map(purchaseArticleKey));
  const chosenPackaging = getPurchaseCartContext().header?.packagingType;
  const additions = incoming.filter((item) => {
    const id = purchaseArticleKey(item);
    if (known.has(id)) return false;
    known.add(id);
    return true;
  }).map((item) => ({ ...item, lineId: newId(), supplierId: String(item.supplierId),
    amount: packagingKey(chosenPackaging || item.originalPackagingType) === 'silo' ? 25000 : 24750,
    amountTouched: false, unit: 'kg', currency: 'EUR', purchasePrice: '', requestedDeliveryDate: '', reservedFor: '', comment: '',
  }));
  const next = [...current, ...additions];
  write(next);
  if (returnTo) savePurchaseCartContext({ returnTo });
  return next;
}

export function addPurchaseCartItem(item) { return addPurchaseCartItems([item]); }

export function duplicatePurchaseCartItem(lineId) {
  const current = read();
  const index = current.findIndex((item) => item.lineId === lineId);
  if (index < 0) return current;
  current.splice(index + 1, 0, { ...current[index], lineId: newId(), amountTouched: true });
  write(current);
  return current;
}

function contextKey() { return `${key()}.context`; }
export function getPurchaseCartContext() {
  try {
    const context = JSON.parse(localStorage.getItem(contextKey()) || '{}') || {};
    return { returnTo: JSON.parse(localStorage.getItem(`${key()}.shoppingReturnTo`) || 'null'), ...context };
  } catch { return {}; }
}
export function savePurchaseCartContext(patch) {
  const next = { ...getPurchaseCartContext(), ...patch };
  localStorage.setItem(contextKey(), JSON.stringify(next));
  if (patch.returnTo) localStorage.setItem(`${key()}.shoppingReturnTo`, JSON.stringify(patch.returnTo));
  return next;
}
export function getPurchaseRequestId() {
  const current = getPurchaseCartContext();
  if (current.clientRequestId) return current.clientRequestId;
  const id = createPurchaseLineId();
  savePurchaseCartContext({ clientRequestId: id });
  return id;
}
export function replacePurchaseCartItems(items) { write(items); return items; }
export function packagingKey(value) {
  const text = String(value || '').trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' ');
  if (['siloware', 'silo/bulk', 'silo', 'bulk'].includes(text)) return 'silo';
  if (['sackware', 'bags'].includes(text)) return 'bags';
  if (['octa', 'octabins'].includes(text)) return 'octabins';
  return text;
}

export function purchaseTotals(items) {
  const positions = Array.isArray(items) ? items : [];
  const complete = positions.every((item) => String(item.purchasePrice ?? '').trim() !== '' && Number.isFinite(Number(item.purchasePrice)) && Number(item.purchasePrice) >= 0 && Number.isFinite(Number(item.amount)) && Number(item.amount) > 0);
  return { count: positions.length, amount: positions.reduce((total, item) => total + (Number(item.amount) || 0), 0),
    sum: complete ? positions.reduce((total, item) => total + (Number(item.amount) / 1000) * Number(item.purchasePrice), 0) : null };
}

export function purchaseMissingFields(order) {
  const missing = [];
  if (!order.packagingTypeId) missing.push('Verpackungsart');
  if (!order.deliveryTermId) missing.push('Incoterm');
  if (!String(order.loadingLocationText || '').trim()) missing.push('Ladeort');
  if (!order.positions?.length) missing.push('Positionen');
  (order.positions || []).forEach((item, index) => {
    if (!Number.isFinite(Number(item.amount)) || !(Number(item.amount) > 0)) missing.push(`Menge Position ${index + 1}`);
    if (String(item.purchasePrice ?? '').trim() === '' || !Number.isFinite(Number(item.purchasePrice)) || Number(item.purchasePrice) < 0) missing.push(`EK Position ${index + 1}`);
    const date = String(item.requestedDeliveryDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) missing.push(`Liefertermin Position ${index + 1}`);
  });
  return missing;
}

export function supplierReturnTo(supplierId, state = null) {
  return { pathname: `/customers/${encodeURIComponent(supplierId)}`, state: { ...(state || {}), detailView: 'supplier' } };
}
