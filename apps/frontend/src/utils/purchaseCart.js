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
    if (!Array.isArray(value)) return [];
    const context = JSON.parse(localStorage.getItem(contextKey()) || '{}') || {};
    // An uncertain save must always replay its original payload unchanged.
    if (context.pendingPayload || value.every((item) => item.defaultsVersion === 2)) return value;
    const next = value.map((item) => item.defaultsVersion === 2 ? item : {
      ...item, defaultsVersion: 2,
      originalPackagingType: item.originalPackagingType || item.packagingType || '',
      amount: defaultPurchaseAmount(context.header?.packagingType || item.originalPackagingType || item.packagingType),
      amountTouched: false, purchasePrice: '', requestedDeliveryDate: '', reservedFor: '', comment: '',
    });
    localStorage.setItem(key(), JSON.stringify(next));
    if (context.header) localStorage.setItem(contextKey(), JSON.stringify({ ...context, header: { ...context.header, comment: '' } }));
    return next;
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
  if (new Set([...current, ...incoming].map(purchaseArticleKey)).size > 1) {
    throw new Error('Pro Bestellung ist nur eine Artikelart möglich. Bitte die bestehende Bestellung zuerst abschließen oder den Warenkorb leeren.');
  }
  if (!current.length && (context.header || context.clientRequestId)) {
    savePurchaseCartContext({ header: null, clientRequestId: null });
  }
  const known = new Set(current.map(purchaseArticleKey));
  const chosenPackaging = getPurchaseCartContext().header?.packagingType;
  const additions = incoming.filter((item) => {
    const id = purchaseArticleKey(item);
    if (known.has(id)) return false;
    known.add(id);
    return true;
  }).map((item) => ({ ...item, lineId: newId(), defaultsVersion: 2, supplierId: String(item.supplierId),
    amount: defaultPurchaseAmount(chosenPackaging || item.originalPackagingType),
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

export function defaultPurchaseAmount(packaging) { return packagingKey(packaging) === 'silo' ? 25000 : 24750; }

export function purchaseFieldErrors(order) {
  return {
    packagingTypeId: !order.packagingTypeId,
    deliveryTermId: !order.deliveryTermId,
    loadingLocationText: !String(order.loadingLocationText || '').trim(),
    articleType: new Set((order.positions || []).map(purchaseArticleKey)).size > 1,
    positions: (order.positions || []).map((item) => {
      const date = String(item.requestedDeliveryDate || '').slice(0, 10);
      return {
        amount: !Number.isFinite(Number(item.amount)) || !(Number(item.amount) > 0),
        purchasePrice: String(item.purchasePrice ?? '').trim() === '' || !Number.isFinite(Number(item.purchasePrice)) || Number(item.purchasePrice) < 0,
        requestedDeliveryDate: !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date,
      };
    }),
  };
}

export function purchaseTotals(items) {
  const positions = Array.isArray(items) ? items : [];
  const complete = positions.every((item) => String(item.purchasePrice ?? '').trim() !== '' && Number.isFinite(Number(item.purchasePrice)) && Number(item.purchasePrice) >= 0 && Number.isFinite(Number(item.amount)) && Number(item.amount) > 0);
  return { count: positions.length, amount: positions.reduce((total, item) => total + (Number(item.amount) || 0), 0),
    sum: complete ? positions.reduce((total, item) => total + (Number(item.amount) / 1000) * Number(item.purchasePrice), 0) : null };
}

export function purchaseMissingFields(order) {
  const errors = purchaseFieldErrors(order);
  const missing = [];
  if (errors.packagingTypeId) missing.push('Verpackungsart');
  if (errors.deliveryTermId) missing.push('Incoterm');
  if (errors.loadingLocationText) missing.push('Ladeort');
  if (errors.articleType) missing.push('Nur eine Artikelart pro Bestellung');
  if (!order.positions?.length) missing.push('Positionen');
  errors.positions.forEach((item, index) => {
    if (item.amount) missing.push(`Menge Position ${index + 1}`);
    if (item.purchasePrice) missing.push(`EK Position ${index + 1}`);
    if (item.requestedDeliveryDate) missing.push(`Liefertermin Position ${index + 1}`);
  });
  return missing;
}

export function supplierReturnTo(supplierId, state = null) {
  return { pathname: `/customers/${encodeURIComponent(supplierId)}`, state: { ...(state || {}), detailView: 'supplier' } };
}
