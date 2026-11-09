import { isValidSalePrice } from './salePrice.js';

export function calculateSaleMarginAmount(amountInKg, salePricePerTonne, costPricePerTonne) {
  const quantity = Number(amountInKg);
  const salePrice = Number(salePricePerTonne);
  const costPrice = Number(costPricePerTonne);

  if (
    !Number.isFinite(quantity)
    || quantity <= 0
    || !isValidSalePrice(salePricePerTonne)
    || !Number.isFinite(costPrice)
    || costPrice <= 0
  ) {
    return null;
  }

  return (salePrice - costPrice) * (quantity / 1000);
}
