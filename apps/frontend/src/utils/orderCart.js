import { getMandant } from './mandant.js';

export const ORDER_CART_CHANGED = 'bms-order-cart-changed';

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

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
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(ORDER_CART_CHANGED));
    }
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

export function updateOrderCartDeliveryDate(productId, deliveryDate) {
  const next = read().map((x) => (
    String(x.id || '') === String(productId || '')
      ? { ...x, deliveryDate: String(deliveryDate || '').trim() }
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
  const existing = idx >= 0 ? current[idx] : null;
  const hasBackendAvailableAmount = item.availableAmount !== null && item.availableAmount !== undefined && item.availableAmount !== '';
  const backendAvailableAmount = hasBackendAvailableAmount ? Number(item.availableAmount) : Number.NaN;
  const hasAmount = item.amount !== null && item.amount !== undefined && item.amount !== '';
  const calculatedAvailableAmount = hasAmount
    ? Number(item.amount) - Number(item.reserved || 0)
    : Number.NaN;
  const payload = {
    id,
    article: item.article || existing?.article || '',
    beNumber: item.beNumber || existing?.beNumber || '',
    warehouseId: item.storageId || item.warehouseId || existing?.warehouseId || '',
    unit: item.unit || existing?.unit || 'kg',
    availableAmount: Number.isFinite(backendAvailableAmount)
      ? Math.max(backendAvailableAmount, 0)
      : (Number.isFinite(calculatedAvailableAmount)
        ? Math.max(calculatedAvailableAmount, 0)
        : (existing?.availableAmount ?? null)),
    amountTotal: item.amount ?? existing?.amountTotal ?? null,
    acquisitionPrice: item.acquisitionPrice ?? existing?.acquisitionPrice ?? null,
    // A sales price must be entered explicitly; never use the acquisition price as VK.
    salePrice: item.salePrice ?? existing?.salePrice ?? null,
    deliveryDate: item.deliveryDate || existing?.deliveryDate || tomorrow(),
    quantityKg: qty,
    wpzId: item.wpzId !== undefined ? item.wpzId : (existing?.wpzId ?? null),
    wpzOriginal: item.wpzOriginal !== undefined ? item.wpzOriginal : (existing?.wpzOriginal ?? null),
    wpzComment: item.wpzComment !== undefined ? item.wpzComment : (existing?.wpzComment || ''),
    originalPackagingType: item.originalPackagingType ?? existing?.originalPackagingType ?? '',
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
