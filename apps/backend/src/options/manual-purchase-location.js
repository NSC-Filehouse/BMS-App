const { createHttpError } = require('../utils');

function manualPurchaseLocation(text, city, deliveryTerm) {
  const addressText = String(text ?? '').trim();
  const addressCity = String(city ?? '').trim();
  const [company, street, locality, country] = addressText.split(/\r?\n/);
  const countryCode = country?.trim().match(/^([A-Z]{2})(?:\s+[—-]\s+.+)?$/)?.[1];
  if (!/^(FCA|EXW)\b/i.test(deliveryTerm || '') || addressText.length > 1000
    || !company?.trim() || !street?.trim() || !/^\S+\s+\S/.test(locality?.trim() || '') || !countryCode
    || (addressCity && (addressCity.length > 50 || !locality.trim().endsWith(` ${addressCity}`)))) {
    throw createHttpError(400, 'Bitte einen vollständigen Ladeort für die Abholung eingeben.', { code: 'PURCHASE_MANUAL_LOCATION_INVALID' });
  }
  return { text: addressText, city: addressCity, countryCode };
}

module.exports = { manualPurchaseLocation };
