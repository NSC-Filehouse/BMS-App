export function calculatePositionSplit(totalValue, keptValue) {
  const total = Number(totalValue);
  const kept = Number(keptValue);
  const remainder = total - kept;

  if (!Number.isFinite(total) || total < 2) {
    return { ok: false, total, kept, remainder };
  }
  if (!Number.isFinite(kept) || kept < 1 || !Number.isFinite(remainder) || remainder < 1) {
    return { ok: false, total, kept, remainder };
  }

  return { ok: true, total, kept, remainder };
}

export function splitPositionValues(position, keptValue, amountField) {
  const split = calculatePositionSplit(position?.[amountField], keptValue);
  if (!split.ok) return null;

  const keptPosition = {
    ...position,
    [amountField]: split.kept,
  };
  const remainderPosition = {
    ...position,
    [amountField]: split.remainder,
  };

  const reservation = Number(position?.reservationInKg);
  if (position?.reservationInKg !== null
    && position?.reservationInKg !== undefined
    && position?.reservationInKg !== ''
    && Number.isFinite(reservation)) {
    const keptReservation = Math.round(reservation * (split.kept / split.total));
    keptPosition.reservationInKg = keptReservation;
    remainderPosition.reservationInKg = reservation - keptReservation;
  }

  return { keptPosition, remainderPosition, ...split };
}
