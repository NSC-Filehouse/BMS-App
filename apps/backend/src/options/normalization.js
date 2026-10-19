const { optionPriceNeedsReview, optionPriceWarning } = require('./price-plausibility');

function qualityNorm(value) {
  const text = String(value || '').toLowerCase();
  if (/near\s*to\s*prime|near\s*prime|off\s*grade|offgrade|\bog\b|\bnt\b/.test(text)) return 'NT';
  if (/prime|\b1a\b/.test(text)) return '1A';
  return null;
}

function unit(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '').replace('€', 'eur');
}

function normalizePosition(line, rule = null) {
  const quantityUnit = unit(line.quantityUnit || rule?.quantityUnit);
  const priceUnit = unit(line.priceUnit || rule?.priceUnit);
  const quantityFactor = { kg: 1, kilogram: 1, kilograms: 1, t: 1000, mt: 1000,
    tonne: 1000, tonnes: 1000, metricton: 1000, metrictons: 1000 }[quantityUnit];
  const priceFactor = { 'eur/t': 1, 'eur/mt': 1, 'eur/tonne': 1, t: 1, mt: 1, tonne: 1,
    'eur/kg': 1000, kg: 1000 }[priceUnit];
  const quantityMinKg = quantityFactor && line.quantityMin != null ? line.quantityMin * quantityFactor : null;
  const quantityMaxKg = quantityFactor && line.quantityMax != null ? line.quantityMax * quantityFactor : null;
  const euroConfirmed = ['EUR', '€'].includes(String(line.currency || '').toUpperCase()) || priceUnit.startsWith('eur/');
  const calculatedPricePerTonne = priceFactor && euroConfirmed && line.price != null
    ? line.price * priceFactor : null;
  const priceNeedsReview = optionPriceNeedsReview(calculatedPricePerTonne);
  const pricePerTonne = priceNeedsReview ? null : calculatedPricePerTonne;
  const notes = [];
  const truckload = /truckload|lkw|ladung/i.test(`${line.quantityText || ''} ${line.quantityUnit || ''}`);
  if (!truckload && quantityMinKg == null && quantityMaxKg == null) notes.push('Mengeneinheit nicht bestätigt; Rohmenge anzeigen.');
  if (priceNeedsReview) notes.push(optionPriceWarning());
  else if (pricePerTonne == null) notes.push(!priceUnit
    ? 'Preiseinheit nicht angegeben; kein Preis pro Tonne berechnet.'
    : 'Währung oder Preiseinheit nicht bestätigt; kein Preis pro Tonne berechnet.');
  if (truckload) {
    notes.push('LKW-Menge ohne bestätigtes Ladegewicht; keine Umrechnung in kg.');
  }
  return {
    qualityNorm: qualityNorm(`${line.quality || ''} ${line.productName || ''}`),
    quantityMinKg, quantityMaxKg, pricePerTonne, priceNeedsReview,
    comment: notes.join(' '),
  };
}

module.exports = { normalizePosition, qualityNorm };
