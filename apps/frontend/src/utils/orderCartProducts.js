import { apiRequest } from '../api/client.js';
import { addOrderCartItemsWithDefaults } from './orderCart.js';

function getItemId(item) {
  return String(item?.id || item?.productId || '').trim();
}

async function loadWpz(item, vlMandantId) {
  const id = getItemId(item);
  if (!id || item?.wpzId !== undefined) return { ...item, id };

  try {
    const sourceQuery = vlMandantId ? `?vlMandantId=${encodeURIComponent(vlMandantId)}` : '';
    const response = await apiRequest(`/products/${encodeURIComponent(id)}/wpz${sourceQuery}`);
    const wpzId = Number(response?.data?.wpzId);
    const normalizedWpzId = Number.isFinite(wpzId) && wpzId > 0 ? wpzId : null;
    return {
      ...item,
      id,
      wpzId: normalizedWpzId,
      wpzOriginal: normalizedWpzId ? true : null,
      wpzComment: 'Original verwenden',
    };
  } catch {
    return {
      ...item,
      id,
      wpzId: null,
      wpzOriginal: null,
      wpzComment: 'Original verwenden',
    };
  }
}

export async function addProductsToOrderCart(items, { vlMandantId = '' } = {}) {
  const products = (Array.isArray(items) ? items : []).filter((item) => getItemId(item));
  const enrichedProducts = await Promise.all(products.map((item) => loadWpz(item, vlMandantId)));
  return addOrderCartItemsWithDefaults(enrichedProducts);
}
