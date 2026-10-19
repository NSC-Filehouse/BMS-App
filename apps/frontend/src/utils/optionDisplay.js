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

export function optionMfi(position) {
  if(position?.mfi==null)return '';
  return `${optionNumber(position.mfi)}${position.mfiTo!=null && position.mfiTo!==position.mfi ? `–${optionNumber(position.mfiTo)}`:''}${position.mfiTestCondition ? ` (${position.mfiTestCondition})`:''}`;
}

export function optionQuantity(position, t) {
  if(position?.quantityKind==='minimum-and-stock' && (position.minimumOrderKg!=null || position.stockKg!=null)) {
    return [position.minimumOrderKg!=null ? `Mindestabnahme ${optionNumber(position.minimumOrderKg)} kg` : null,
      position.stockKg!=null ? `Chargenbestand ${optionNumber(position.stockKg)} kg` : null].filter(Boolean).join(' · ');
  }
  if (position?.quantityMinKg !== null && position?.quantityMinKg !== undefined) {
    const minKg = optionNumber(position.quantityMinKg);
    const maxKg = optionNumber(position.quantityMaxKg);
    return `${minKg}${maxKg && maxKg !== minKg ? `–${maxKg}` : ''} kg`;
  }
  if(position?.quantityMaxKg!=null)return `${optionNumber(position.quantityMaxKg)} kg`;
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

export function optionPackaging(position) {
  return [position?.positionPackaging,
    position?.bagWeightKg!=null ? `${optionNumber(position.bagWeightKg)}-kg-Gebinde` : null,
    position?.palletWeightKg!=null ? `${optionNumber(position.palletWeightKg)}-kg-Paletten` : null,
    position?.normalization?.provenance?.packaging?.source==='history' ? '(aus Einkaufshistorie abgeleitet)' : null].filter(Boolean).join(' · ');
}

export function optionNormalizationNotes(position) {
  const p=position?.normalization?.provenance;
  return [p?.quantityUnit?.source==='rule' ? 'Mengeneinheit gemäß Geschäftsregel' : null,
    p?.priceUnit?.source==='rule' ? 'Preisbezug gemäß Lieferantenregel' : null,
    ...(position?.normalization?.notes || [])].filter(Boolean).join(' · ');
}

export function optionPrice(position, t) {
  if (position?.priceNeedsReview) {
    const raw = optionNumber(position.price, 2);
    return `${raw} ${position.currency === 'EUR' ? '€' : (position.currency || '')} (${t('option_price_needs_review')})`.trim();
  }
  if (position?.pricePerTonne !== null && position?.pricePerTonne !== undefined) {
    return `${optionNumber(position.pricePerTonne, 2)} €/t`;
  }
  const value = optionNumber(position?.price, 2);
  if (!value) return '';
  const currency = position?.currency === 'EUR' ? '€' : (position?.currency || '');
  return position?.priceUnit
    ? `${value} ${currency} / ${position.priceUnit}`.trim()
    : `${value} ${currency} (${t('option_price_unit_unconfirmed')})`.trim();
}
