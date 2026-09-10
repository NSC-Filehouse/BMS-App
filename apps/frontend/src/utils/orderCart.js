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

function normalizeDraftNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

function getAvailableAmount(item, existing = null) {
  const hasBackendAvailableAmount = item?.availableAmount !== null
    && item?.availableAmount !== undefined
    && item?.availableAmount !== '';
  const backendAvailableAmount = hasBackendAvailableAmount ? Number(item.availableAmount) : Number.NaN;
  const hasAmount = item?.amount !== null && item?.amount !== undefined && item?.amount !== '';
  const calculatedAvailableAmount = hasAmount
    ? Number(item.amount) - Number(item.reserved || 0)
    : Number.NaN;
  if (Number.isFinite(backendAvailableAmount)) return Math.max(backendAvailableAmount, 0);
  if (Number.isFinite(calculatedAvailableAmount)) return Math.max(calculatedAvailableAmount, 0);
  const hasExistingAvailableAmount = existing?.availableAmount !== null
    && existing?.availableAmount !== undefined
    && existing?.availableAmount !== '';
  const existingAvailableAmount = hasExistingAvailableAmount ? Number(existing.availableAmount) : Number.NaN;
  return Number.isFinite(existingAvailableAmount) ? Math.max(existingAvailableAmount, 0) : null;
}

function buildCartPayload(item, quantityKg, existing = null) {
  const id = String(item?.id || '');
  const availableAmount = getAvailableAmount(item, existing);
  const wpzId = item?.wpzId !== undefined ? item.wpzId : (existing?.wpzId ?? null);
  const existingArticleChanged = Boolean(existing?.articleChanged);
  const article = existingArticleChanged
    ? (existing?.article || '')
    : (item?.article || existing?.article || '');
  const articleOriginal = existingArticleChanged
    ? (existing?.articleOriginal || existing?.article || '')
    : (item?.articleOriginal || null);
  return {
    id,
    article,
    articleOriginal,
    articleChanged: existingArticleChanged || Boolean(item?.articleChanged),
    beNumber: item?.beNumber || existing?.beNumber || '',
    warehouse: item?.warehouse || existing?.warehouse || '',
    warehouseId: item?.storageId || item?.warehouseId || existing?.warehouseId || '',
    unit: item?.unit || existing?.unit || 'kg',
    availableAmount,
    amountTotal: item?.amount ?? existing?.amountTotal ?? null,
    acquisitionPrice: item?.acquisitionPrice ?? existing?.acquisitionPrice ?? null,
    // A sales price must be entered explicitly; never use the acquisition price as VK.
    salePrice: item?.salePrice ?? existing?.salePrice ?? null,
    deliveryDate: item?.deliveryDate || existing?.deliveryDate || tomorrow(),
    quantityKg,
    wpzId,
    wpzOriginal: item?.wpzOriginal !== undefined
      ? item.wpzOriginal
      : (existing?.wpzOriginal ?? (wpzId ? true : null)),
    wpzComment: item?.wpzComment !== undefined
      ? item.wpzComment
      : (existing?.wpzComment || 'Original verwenden'),
    originalPackagingType: item?.originalPackagingType ?? existing?.originalPackagingType ?? '',
  };
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
  const qty = normalizeDraftNumber(quantityKg);
  const next = read().map((x) => (
    String(x.id || '') === String(productId || '')
      ? { ...x, quantityKg: qty }
      : x
  ));
  write(next);
  return next;
}

export function updateOrderCartSalePrice(productId, salePrice) {
  const price = normalizeDraftNumber(salePrice);
  const next = read().map((x) => (
    String(x.id || '') === String(productId || '')
      ? { ...x, salePrice: price }
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

export function updateOrderCartArticle(productId, article) {
  const nextArticle = String(article || '').trim();
  const next = read().map((x) => {
    if (String(x.id || '') !== String(productId || '')) return x;
    const originalArticle = String(x.articleOriginal || x.article || '').trim();
    const changed = Boolean(originalArticle) && nextArticle !== originalArticle;
    return {
      ...x,
      article: nextArticle,
      articleOriginal: changed ? originalArticle : null,
      articleChanged: changed,
    };
  });
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
  const payload = buildCartPayload(item, qty, existing);
  if (idx >= 0) {
    current[idx] = payload;
    write(current);
    return current;
  }
  const next = [...current, payload];
  write(next);
  return next;
}

export function addOrderCartItemsWithDefaults(items) {
  const current = read();
  const indexById = new Map(current.map((item, index) => [String(item.id || ''), index]));

  for (const item of Array.isArray(items) ? items : []) {
    const id = String(item?.id || '');
    if (!id) continue;
    const existingIndex = indexById.get(id);
    if (existingIndex !== undefined) {
      const existing = current[existingIndex];
      current[existingIndex] = buildCartPayload({
        ...item,
        salePrice: existing.salePrice,
        deliveryDate: existing.deliveryDate,
        wpzId: item.wpzId !== undefined ? item.wpzId : (existing.wpzId ?? null),
        wpzOriginal: existing.wpzOriginal ?? item.wpzOriginal,
        wpzComment: existing.wpzComment || item.wpzComment,
      }, existing.quantityKg, existing);
      continue;
    }

    const availableAmount = getAvailableAmount(item);
    if (!Number.isFinite(availableAmount) || availableAmount <= 0) continue;
    current.push(buildCartPayload(item, availableAmount));
    indexById.set(id, current.length - 1);
  }

  write(current);
  return current;
}
