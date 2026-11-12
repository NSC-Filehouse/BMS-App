const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

function offeredQuantityKg(position) {
  const stock = number(position.stockKg ?? position.opp_ChargenbestandKg);
  if (stock != null && stock > 0) return stock;
  const kind = position.quantityKind ?? position.opp_Mengenart;
  if (kind === 'minimum-and-stock') return null;
  const maximum = number(position.quantityMaxKg ?? position.opp_MengeBisKg);
  const minimum = number(position.quantityMinKg ?? position.opp_MengeVonKg);
  return maximum > 0 ? maximum : minimum > 0 ? minimum : null;
}

function quantityAvailability(position, orderedKg = 0) {
  const offeredKg = offeredQuantityKg(position);
  return { offeredKg, orderedKg: Number(orderedKg) || 0,
    remainingKg: offeredKg == null ? null : Math.max(0, Math.round((offeredKg - orderedKg) * 1000) / 1000) };
}

function fitsQuantity(offeredKg, orderedKg, requestedKg) {
  return offeredKg != null && Math.round(orderedKg * 1000) + Math.round(requestedKg * 1000) <= Math.round(offeredKg * 1000);
}

module.exports = { offeredQuantityKg, quantityAvailability, fitsQuantity };
