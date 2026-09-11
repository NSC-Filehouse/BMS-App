import { getMandant } from './mandant.js';
import { nextWeekday } from './deliveryDate.js';

export const ORDER_CART_CHANGED = 'bms-order-cart-changed';

function cartKey() {
  const mandant = getMandant() || 'default';
  return `bms.orderCart.${mandant}`;
}

function read() {
  try {
    const raw = localStorage.getItem(cartKey());
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.map((item, index) => {
      const productId = String(item?.productId || item?.id || '');
      const lineId = String(item?.lineId || item?.id || `${productId || 'cart-line'}-${index}`);
      return {
        ...item,
        id: productId,
        productId,
        lineId,
      };
    });
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

function getProductId(item) {
  return String(item?.productId || item?.id || '');
}

function matchesLine(item, lineId) {
  return String(item?.lineId || item?.id || '') === String(lineId || '');
}

function createSplitLineId(productId) {
  if (globalThis.crypto?.randomUUID) return `${productId || 'cart-line'}--split--${globalThis.crypto.randomUUID()}`;
  return `${productId || 'cart-line'}--split--${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getSourceKey(item) {
  const beNumber = String(item?.beNumber || '').trim();
  const warehouseId = String(item?.warehouseId || '').trim();
  if (beNumber || warehouseId) return `${beNumber}\u001f${warehouseId}`;
  return `product\u001f${getProductId(item)}`;
}

function getSplitRemainder(items, lineId) {
  const list = Array.isArray(items) ? items : [];
  const item = list.find((entry) => matchesLine(entry, lineId));
  if (!item) return null;

  const sourceKey = getSourceKey(item);
  const sourceEntries = list.filter((candidate) => getSourceKey(candidate) === sourceKey);
  const availableAmounts = sourceEntries
    .map((entry) => Number(entry.availableAmount))
    .filter((amount) => Number.isFinite(amount));
  if (availableAmounts.length === 0) return null;
  const availableAmount = Math.min(...availableAmounts);

  let totalQuantity = 0;
  for (const entry of sourceEntries) {
    const quantity = Number(entry.quantityKg);
    if (!Number.isFinite(quantity) || quantity < 1) return null;
    totalQuantity += quantity;
  }

  const remainder = availableAmount - totalQuantity;
  return Number.isFinite(remainder) && remainder >= 1 ? remainder : null;
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
  const id = getProductId(item) || getProductId(existing);
  const availableAmount = getAvailableAmount(item, existing);
  const wpzId = item?.wpzId !== undefined ? item.wpzId : (existing?.wpzId ?? null);
  const existingArticleChanged = Boolean(existing?.articleChanged);
  const article = existingArticleChanged
    ? (existing?.article || '')
    : (item?.article || existing?.article || '');
  const articleOriginal = existingArticleChanged
    ? (existing?.articleOriginal || existing?.article || '')
    : (item?.articleOriginal || null);
  const incomingDeliveryDate = String(item?.deliveryDate || '').trim();
  const existingDeliveryDate = String(existing?.deliveryDate || '').trim();
  const deliveryDate = incomingDeliveryDate || existingDeliveryDate || nextWeekday();
  const deliveryDateAuto = item?.deliveryDateAuto !== undefined
    ? Boolean(item.deliveryDateAuto)
    : existing?.deliveryDateAuto !== undefined
      ? Boolean(existing.deliveryDateAuto)
      : !incomingDeliveryDate && !existingDeliveryDate;
  return {
    id,
    productId: id,
    lineId: String(item?.lineId || existing?.lineId || id),
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
    deliveryDate,
    deliveryDateAuto,
    quantityKg,
    splitPending: item?.splitPending !== undefined
      ? Boolean(item.splitPending)
      : Boolean(existing?.splitPending),
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

export function removeOrderCartItem(lineId) {
  const identifier = String(lineId || '');
  const current = read();
  const hasExactLine = current.some((item) => matchesLine(item, identifier));
  const next = hasExactLine
    ? current.filter((item) => !matchesLine(item, identifier))
    : current.filter((item) => getProductId(item) !== identifier);
  write(next);
  return next;
}

export function removeOrderCartProduct(productId) {
  const identifier = String(productId || '');
  const next = read().filter((item) => getProductId(item) !== identifier);
  write(next);
  return next;
}

export function updateOrderCartQuantity(lineId, quantityKg) {
  const qty = normalizeDraftNumber(quantityKg);
  const current = read();
  const index = current.findIndex((item) => matchesLine(item, lineId));
  if (index < 0) return current;

  const sourceKey = getSourceKey(current[index]);
  const next = current.map((item, itemIndex) => (
    getSourceKey(item) === sourceKey
      ? { ...item, ...(itemIndex === index ? { quantityKg: qty } : {}), splitPending: false }
      : item
  ));
  if (getSplitRemainder(next, lineId) !== null) {
    next[index] = { ...next[index], splitPending: true };
  }
  write(next);
  return next;
}

export function updateOrderCartSalePrice(lineId, salePrice) {
  const price = normalizeDraftNumber(salePrice);
  const next = read().map((x) => (
    matchesLine(x, lineId)
      ? { ...x, salePrice: price }
      : x
  ));
  write(next);
  return next;
}

export function updateOrderCartDeliveryDate(lineId, deliveryDate) {
  const next = read().map((x) => (
    matchesLine(x, lineId)
      ? { ...x, deliveryDate: String(deliveryDate || '').trim(), deliveryDateAuto: false }
      : x
  ));
  write(next);
  return next;
}

export function updateOrderCartArticle(lineId, article) {
  const nextArticle = String(article || '').trim();
  const next = read().map((x) => {
    if (!matchesLine(x, lineId)) return x;
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

export function updateOrderCartItem(lineId, patch) {
  const nextPatch = patch && Object.prototype.hasOwnProperty.call(patch, 'deliveryDate')
    && !Object.prototype.hasOwnProperty.call(patch, 'deliveryDateAuto')
    ? { ...patch, deliveryDateAuto: false }
    : patch;
  const next = read().map((x) => (
    matchesLine(x, lineId)
      ? { ...x, ...(nextPatch || {}) }
      : x
  ));
  write(next);
  return next;
}

export function getOrderCartSplitRemainder(items, lineId) {
  return getSplitRemainder(items, lineId);
}

export function addOrderCartRemainder(lineId) {
  const current = read();
  const index = current.findIndex((item) => matchesLine(item, lineId));
  if (index < 0) return current;

  const remainder = current[index].splitPending ? getSplitRemainder(current, lineId) : null;
  if (remainder === null) return current;

  const productId = getProductId(current[index]);
  const sourceKey = getSourceKey(current[index]);
  const sourcePosition = { ...current[index], splitPending: false };
  const remainderPosition = {
    ...sourcePosition,
    id: productId,
    productId,
    lineId: createSplitLineId(productId),
    quantityKg: remainder,
  };
  const next = current.map((item) => (
    getSourceKey(item) === sourceKey ? { ...item, splitPending: false } : item
  ));
  next.splice(index, 1, sourcePosition, remainderPosition);
  write(next);
  return next;
}

export function addOrderCartItem(item, quantityKg) {
  const qty = Number(quantityKg);
  if (!item || !Number.isFinite(qty) || qty <= 0) return read();
  const current = read();
  const id = getProductId(item);
  const idx = current.findIndex((x) => getProductId(x) === id);
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

  for (const item of Array.isArray(items) ? items : []) {
    const id = getProductId(item);
    if (!id) continue;
    const existingIndexes = current
      .map((existing, index) => (getProductId(existing) === id ? index : -1))
      .filter((index) => index >= 0);
    if (existingIndexes.length) {
      for (const existingIndex of existingIndexes) {
        const existing = current[existingIndex];
        current[existingIndex] = buildCartPayload({
          ...item,
          lineId: existing.lineId,
          salePrice: existing.salePrice,
          deliveryDate: existing.deliveryDate,
          wpzId: item.wpzId !== undefined ? item.wpzId : (existing.wpzId ?? null),
          wpzOriginal: existing.wpzOriginal ?? item.wpzOriginal,
          wpzComment: existing.wpzComment || item.wpzComment,
        }, existing.quantityKg, existing);
      }
      continue;
    }

    const availableAmount = getAvailableAmount(item);
    if (!Number.isFinite(availableAmount) || availableAmount <= 0) continue;
    current.push(buildCartPayload(item, availableAmount));
  }

  write(current);
  return current;
}
