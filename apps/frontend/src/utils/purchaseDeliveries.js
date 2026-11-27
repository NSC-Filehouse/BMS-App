import { createPurchaseLineId, defaultPurchaseAmount, planPurchaseTruckLoads, splitPurchaseTruckPositions } from './purchaseCart.js';

export const purchaseTruckLoadChoices = [25000, 24750, 23375];

export function defaultPurchaseTruckLoad(order, packaging) {
  const pickup = !order.deliveryTermText || /^(FCA|EXW)\b/i.test(order.deliveryTermText);
  const country = pickup ? String(order.loadingLocationCountryCode || '').trim() : '';
  const location = pickup ? order.loadingLocationText || order.optionLoadingLocationText : order.optionLoadingLocationText;
  const parts = String(location || '').split(/[\r\n,;]+/).map(value => value.trim());
  const france = country ? /^(?:FR|FRA)$/i.test(country) : parts.some(part =>
    /^(?:FR(?:A)?(?:\s*[-—–]\s*(?:France|Frankreich))?|France|Frankreich)$/i.test(part)
    || /\b(?:FR[-\s]|F-)\d{5}\b/i.test(part)
    || /(?:^|\s)(?:France|Frankreich)\s*$/i.test(part));
  return france ? 23375 : defaultPurchaseAmount(packaging);
}

function grams(value) {
  const scaled = Number(value) * 1000;
  const rounded = Math.round(scaled);
  return Number.isSafeInteger(rounded) && rounded >= 0 && Math.abs(scaled - rounded) <= 0.00001 ? rounded : NaN;
}

export function purchaseDeliveryAmounts(positions, deliveries) {
  const total = positions.reduce((sum, position) => sum + grams(position.amount), 0);
  const additional = deliveries.slice(1).map(delivery => grams(delivery.amount));
  const allocated = additional.reduce((sum, amount) => sum + amount, 0);
  const first = Number.isSafeInteger(total) && Number.isSafeInteger(allocated) ? total - allocated : NaN;
  return [first, ...additional];
}

export function planPurchaseDeliveries(positions, deliveries, loadKg) {
  const amounts = purchaseDeliveryAmounts(positions, deliveries);
  if (!positions.length || positions.some(position => !(grams(position.amount) > 0) || (position.unit && position.unit !== 'kg'))
    || !purchaseTruckLoadChoices.includes(loadKg)
    || amounts.some((amount, index) => !Number.isSafeInteger(amount) || amount < 0 || (index > 0 && amount === 0))) return null;
  let sourceIndex = 0;
  let remaining = grams(positions[0].amount);
  return deliveries.map((delivery, index) => {
    let needed = amounts[index];
    const lines = [];
    while (needed > 0) {
      const source = positions[sourceIndex];
      const amount = Math.min(remaining, needed);
      const isCopy = remaining !== grams(source.amount);
      lines.push({ isCopy, position: { ...source, amount: amount / 1000, amountTouched: true, requestedDeliveryDate: delivery.date,
        availabilityNote: delivery.note || '', reservedFor: '', comment: '',
        skipTruckSplit: Boolean(delivery.skipTruckSplit) } });
      remaining -= amount;
      needed -= amount;
      if (remaining === 0) remaining = grams(positions[++sourceIndex]?.amount);
    }
    return { lines, skipTruckSplit: Boolean(delivery.skipTruckSplit),
      plan: delivery.skipTruckSplit ? null : planPurchaseTruckLoads(lines.map(line => line.position), null, loadKg, true) };
  });
}

export function allocatePurchaseDeliveries(planned, newLineId = createPurchaseLineId) {
  const result = [];
  const encoder = new TextEncoder();
  let bytes = 2;
  for (const { lines, plan, skipTruckSplit } of planned) {
    if (!lines.length) continue;
    const positions = lines.map(({ position, isCopy }) => {
      if (!isCopy) return position;
      const { id, ...values } = position;
      return { ...values, copyOfPositionId: id || values.copyOfPositionId, lineId: newLineId() };
    });
    const split = skipTruckSplit ? positions : splitPurchaseTruckPositions(positions, plan, newLineId);
    if (!split) return null;
    bytes += encoder.encode(JSON.stringify(split)).length - (result.length ? 1 : 2);
    if (bytes >= 1024 * 1024) return null;
    result.push(...split);
  }
  return result;
}
