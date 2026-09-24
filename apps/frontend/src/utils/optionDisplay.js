export function optionNumber(value, maxFractionDigits = 3) {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return number.toLocaleString('de-DE', { maximumFractionDigits: maxFractionDigits });
}

export function optionDate(value) {
  if (!value) return '';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('de-DE');
}

export function optionQuantity(position, t) {
  const min = optionNumber(position?.quantityMin);
  const max = optionNumber(position?.quantityMax);
  if (position?.quantityUnit) {
    const amount = min && max && min !== max ? `${min}–${max}` : (min || max);
    const unit = position.quantityUnit === 'truckload'
      ? t(min === '1' && max === '1' ? 'option_truckload' : 'option_truckloads')
      : position.quantityUnit;
    return `${amount} ${unit}`.trim();
  }
  if (min || max) return `${min || max} (${t('option_unit_unconfirmed')})`;
  return position?.quantityText || '';
}

export function optionPrice(position, t) {
  const value = optionNumber(position?.price, 2);
  if (!value) return '';
  const currency = position?.currency === 'EUR' ? '€' : (position?.currency || '');
  return `${value} ${currency} / ${position?.priceUnit || t('option_price_unit_unconfirmed')}`.trim();
}
