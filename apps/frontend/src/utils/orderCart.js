import { getMandant } from './mandant.js';

function cartKey() {
  const mandant = getMandant() || 'default';
  return `bms.orderCart.${mandant}`;
}

function read() {
  try {
    const raw = localStorage.getItem(cartKey());
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(items) {
  try {
    localStorage.setItem(cartKey(), JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function getOrderCartItems() {
  return read();
}

export function getOrderCartCount() {
  return read().length;
}

export function clearOrderCart() {
  write([]);
}

export function removeOrderCartItem(productId) {
  const next = read().filter((x) => String(x.id || '') !== String(productId || ''));
  write(next);
  return next;
}

export function updateOrderCartQuantity(productId, quantityKg) {
  const qty = Number(quantityKg);
  const next = read().map((x) => (
    String(x.id || '') === String(productId || '')
      ? { ...x, quantityKg: Number.isFinite(qty) ? qty : x.quantityKg }
      : x
  ));
  write(next);
  return next;
}

export function updateOrderCartSalePrice(productId, salePrice) {
  const price = Number(salePrice);
  const next = read().map((x) => (
    String(x.id || '') === String(productId || '')
      ? { ...x, salePrice: Number.isFinite(price) ? price : x.salePrice }
      : x
  ));
  write(next);
  return next;
}

export function updateOrderCartItem(productId, patch) {
  const next = read().map((x) => (
    String(x.id || '') === String(productId || '')
      ? { ...x, ...(patch || {}) }
      : x
  ));
  write(next);
  return next;
}

export function addOrderCartItem(item, quantityKg) {
  const qty = Number(quantityKg);
  if (!item || !Number.isFinite(qty) || qty <= 0) return read();
  const current = read();
  const id = String(item.id || '');
  const idx = current.findIndex((x) => String(x.id || '') === id);
  const payload = {
    id,
    article: item.article || '',
    beNumber: item.beNumber || '',
    warehouseId: item.storageId || item.warehouseId || '',
    unit: item.unit || 'kg',
    availableAmount: Number(item.amount || 0) - Number(item.reserved || 0),
    amountTotal: item.amount ?? null,
    acquisitionPrice: item.acquisitionPrice ?? null,
    salePrice: item.acquisitionPrice ?? null,
    quantityKg: qty,
    specialPaymentCondition: Boolean(item.specialPaymentCondition),
    specialPaymentText: item.specialPaymentText || '',
    specialPaymentId: item.specialPaymentId ?? '',
    incotermText: item.incotermText || '',
    incotermId: item.incotermId ?? '',
    packagingType: item.packagingType || '',
    deliveryDate: item.deliveryDate || '',
    deliveryAddress: item.deliveryAddress || '',
    wpzId: item.wpzId ?? null,
    wpzOriginal: item.wpzOriginal ?? true,
    wpzComment: item.wpzComment || '',
  };
  if (idx >= 0) {
    current[idx] = payload;
    write(current);
    return current;
  }
  const next = [...current, payload];
  write(next);
  return next;
}
