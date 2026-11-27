const { createHttpError } = require('../utils');

function parsePurchaseLocation(text, city, deliveryTerm) {
  const addressText = String(text ?? '').trim();
  const addressCity = String(city ?? '').trim();
  const [company, street, locality, country] = addressText.split(/\r?\n/);
  const countryCode = country?.trim().match(/^([A-Z]{2})(?:\s+[—-]\s+.+)?$/)?.[1];
  if (!/^(FCA|EXW)\b/i.test(deliveryTerm || '') || addressText.length > 1000
    || !company?.trim() || !street?.trim() || !/^\S+\s+\S/.test(locality?.trim() || '') || !countryCode
    || (addressCity && (addressCity.length > 50 || !locality.trim().endsWith(` ${addressCity}`)))) {
    return null;
  }
  const cityFromAddress = locality.trim().replace(/^\S+\s+/, '');
  return { text: addressText, city: addressCity || (cityFromAddress.length <= 50 ? cityFromAddress : ''), countryCode };
}

function manualPurchaseLocation(text, city, deliveryTerm) {
  const address = parsePurchaseLocation(text, city, deliveryTerm);
  if (!address) {
    throw createHttpError(400, 'Bitte einen vollständigen Ladeort für die Abholung eingeben.', { code: 'PURCHASE_MANUAL_LOCATION_INVALID' });
  }
  return address;
}

module.exports = { manualPurchaseLocation, parsePurchaseLocation };
