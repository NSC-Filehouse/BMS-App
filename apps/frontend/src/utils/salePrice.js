export function isValidSalePrice(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return false;
  if (String(value).trim() === '') return false;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0;
}
