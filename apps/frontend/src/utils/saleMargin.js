export function calculateSaleMarginAmount(amountInKg, salePricePerTonne, costPricePerTonne) {
  const quantity = Number(amountInKg);
  const salePrice = Number(salePricePerTonne);
  const costPrice = Number(costPricePerTonne);

  if (
    !Number.isFinite(quantity)
    || quantity <= 0
    || !Number.isFinite(salePrice)
    || salePrice <= 0
    || !Number.isFinite(costPrice)
    || costPrice <= 0
  ) {
    return null;
  }

  return (salePrice - costPrice) * (quantity / 1000);
}
