const { runSQLQueryAccess } = require('./access');
const { buildDeliveryAddressText } = require('../delivery-address');
const { createHttpError } = require('../utils');

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

const DELIVERY_ADDRESS_COLUMNS = `
  [deliveryAddress].[kdL_KdNR],
  [deliveryAddress].[kdL_ID],
  [deliveryAddress].[kdL_Lieferanschrift_Nr],
  [deliveryAddress].[kdL_Kurz],
  [deliveryAddress].[kdL_Name1],
  [deliveryAddress].[kdL_Name2],
  [deliveryAddress].[kdL_Strasse],
  [deliveryAddress].[kdL_LK],
  [deliveryAddress].[kdL_PLZ],
  [deliveryAddress].[kdL_Ort],
  [deliveryAddress].[kdL_Region],
  [deliveryAddress].[kdL_Kontrakt],
  [deliveryAddress].[kdL_Abhol],
  [land].[la_ISOalpha2] AS [countryCode]
`;

const DELIVERY_ADDRESS_FIELD_LIMITS = Object.freeze({
  customerId: 10,
  short: 100,
  name1: 50,
  name2: 50,
  street: 50,
  countryId: 3,
  postalCode: 10,
  city: 50,
  region: 100,
  contact: 150,
  pickupTimes: 250,
});

function assertTextLength(value, field, maxLength) {
  if (String(value || '').length <= maxLength) return;
  throw createHttpError(400, `Delivery address field exceeds ${maxLength} characters: ${field}.`, {
    code: 'DELIVERY_ADDRESS_FIELD_TOO_LONG',
    field,
    maxLength,
  });
}

function normalizeDeliveryAddressInput(input, customer, customerId) {
  const resolvedCustomerId = asText(customerId || customer?.kd_KdNR);
  const street = asText(input?.street);
  const postalCode = asText(input?.postalCode);
  const city = asText(input?.city);
  const countryId = asText(input?.countryId).toUpperCase();
  const contact = asText(input?.contact);
  const pickupTimes = asText(input?.pickupTimes);
  const short = asText(customer?.kd_Kurz);
  const name1 = asText(customer?.kd_Name1);
  const name2 = asText(customer?.kd_Name2);
  const region = asText(customer?.kd_Region);

  const required = [
    ['customerId', resolvedCustomerId],
    ['street', street],
    ['postalCode', postalCode],
    ['city', city],
    ['countryId', countryId],
  ];
  const missing = required.filter(([, value]) => !value).map(([field]) => field);
  if (missing.length) {
    throw createHttpError(400, 'Required delivery address fields are missing.', {
      code: 'DELIVERY_ADDRESS_REQUIRED',
      fields: missing,
    });
  }
  const values = { resolvedCustomerId, short, name1, name2, street, countryId, postalCode, city, region, contact, pickupTimes };
  Object.entries(values).forEach(([field, value]) => {
    const maxLength = DELIVERY_ADDRESS_FIELD_LIMITS[field];
    if (maxLength) assertTextLength(value, field, maxLength);
  });

  return values;
}

function mapDeliveryAddressRow(row) {
  const countryCode = asText(row?.countryCode || row?.la_ISOalpha2 || row?.kdL_LK);
  return {
    id: row?.kdL_ID === null || row?.kdL_ID === undefined
      ? ''
      : String(row.kdL_ID).trim(),
    addressNo: row?.kdL_Lieferanschrift_Nr === null || row?.kdL_Lieferanschrift_Nr === undefined
      ? ''
      : String(row.kdL_Lieferanschrift_Nr).trim(),
    customerId: row?.kdL_KdNR === null || row?.kdL_KdNR === undefined
      ? ''
      : String(row.kdL_KdNR).trim(),
    text: buildDeliveryAddressText({ ...row, countryCode }),
    short: row?.kdL_Kurz === null || row?.kdL_Kurz === undefined ? '' : String(row.kdL_Kurz).trim(),
    name1: row?.kdL_Name1 === null || row?.kdL_Name1 === undefined ? '' : String(row.kdL_Name1).trim(),
    name2: row?.kdL_Name2 === null || row?.kdL_Name2 === undefined ? '' : String(row.kdL_Name2).trim(),
    countryCode,
    region: asText(row?.kdL_Region),
  };
}

async function loadCustomerDeliveryAddresses(database, customerId) {
  const rows = await runSQLQueryAccess(database, `
    SELECT
      ${DELIVERY_ADDRESS_COLUMNS}
    FROM [dbo].[tblKun_LiefAdress] AS [deliveryAddress]
    LEFT JOIN [BMS].[dbo].[tblLand] AS [land]
      ON [land].[la_LandISO] = [deliveryAddress].[kdL_LK]
    WHERE COALESCE([deliveryAddress].[kdL_KdNR], '') = ?
    ORDER BY [deliveryAddress].[kdL_Lieferanschrift_Nr] ASC
  `, [String(customerId ?? '').trim()]);
  return (Array.isArray(rows) ? rows : []).map(mapDeliveryAddressRow);
}

module.exports = {
  DELIVERY_ADDRESS_FIELD_LIMITS,
  loadCustomerDeliveryAddresses,
  mapDeliveryAddressRow,
  normalizeDeliveryAddressInput,
};
