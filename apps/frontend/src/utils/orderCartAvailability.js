import { getOrderCartItems, updateOrderCartAvailability } from './orderCart.js';
import { getMandant } from './mandant.js';

export async function refreshOrderCartAvailability(request) {
  const mandant = getMandant();
  const bySource = new Map();
  for (const item of getOrderCartItems()) {
    if (!item.beNumber || !item.warehouseId) continue;
    const key = `${item.beNumber}\u001f${item.warehouseId}`;
    const position = bySource.get(key) || { beNumber: item.beNumber, warehouseId: item.warehouseId, reservationInKg: 0 };
    position.reservationInKg += Math.max(Number(item.reservationInKg) || 0, 0);
    bySource.set(key, position);
  }
  const positions = [...bySource.values()];
  const updated = [];
  for (let offset = 0; offset < positions.length; offset += 100) {
    const response = await request('/products/availability', {
      method: 'POST', body: JSON.stringify({ positions: positions.slice(offset, offset + 100) }),
    });
    if (!Array.isArray(response?.data) || response.data.length !== Math.min(100, positions.length - offset)
      || response.data.some((position) => !Number.isFinite(position?.availableAmount) || position.availableAmount < 0)) {
      throw new Error('Invalid availability response');
    }
    updated.push(...response.data);
  }
  // An in-flight refresh must never update a different company's cart.
  if (getMandant() !== mandant) throw new Error('Mandant changed during availability refresh');
  return updateOrderCartAvailability(updated);
}
