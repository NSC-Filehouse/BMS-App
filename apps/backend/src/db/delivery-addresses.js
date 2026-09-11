const { runSQLQueryAccess, withSqlTransaction } = require('./access');
const { buildDeliveryAddressText } = require('../delivery-address');
const { createHttpError } = require('../utils');

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

const DELIVERY_ADDRESS_COLUMNS = `
  [kdL_KdNR],
  [kdL_ID],
  [kdL_Lieferanschrift_Nr],
  [kdL_Kurz],
  [kdL_Name1],
  [kdL_Name2],
  [kdL_Strasse],
  [kdL_LK],
  [kdL_PLZ],
  [kdL_Ort],
  [kdL_Region],
  [kdL_Kontrakt],
  [kdL_Abhol]
`;

const DELIVERY_ADDRESS_FIELD_LIMITS = Object.freeze({
  customerId: 10,
  short: 100,
  name1: 50,
  name2: 50,
  street: 50,
  countryCode: 3,
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
  const countryCode = asText(input?.countryCode).toUpperCase();
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
    ['countryCode', countryCode],
  ];
  const missing = required.filter(([, value]) => !value).map(([field]) => field);
  if (missing.length) {
    throw createHttpError(400, 'Required delivery address fields are missing.', {
      code: 'DELIVERY_ADDRESS_REQUIRED',
      fields: missing,
    });
  }
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw createHttpError(400, 'Country code must be a two-letter ISO Alpha-2 code.', {
      code: 'DELIVERY_ADDRESS_COUNTRY_CODE_INVALID',
      field: 'countryCode',
    });
  }

  const values = { resolvedCustomerId, short, name1, name2, street, countryCode, postalCode, city, region, contact, pickupTimes };
  Object.entries(values).forEach(([field, value]) => {
    const maxLength = DELIVERY_ADDRESS_FIELD_LIMITS[field];
    if (maxLength) assertTextLength(value, field, maxLength);
  });

  return values;
}

function getNextDeliveryAddressNumber(rows) {
  const highest = (Array.isArray(rows) ? rows : [])
    .map((row) => Number.parseInt(asText(row?.addressNo ?? row?.kdL_Lieferanschrift_Nr), 10))
    .filter((value) => Number.isInteger(value) && value >= 0)
    .reduce((max, value) => Math.max(max, value), 0);
  const next = highest + 1;
  if (next > 32767) {
    throw createHttpError(409, 'No delivery address number is available for this customer.', {
      code: 'DELIVERY_ADDRESS_NUMBER_EXHAUSTED',
    });
  }
  return next;
}

function mapDeliveryAddressRow(row) {
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
    text: buildDeliveryAddressText(row),
    short: row?.kdL_Kurz === null || row?.kdL_Kurz === undefined ? '' : String(row.kdL_Kurz).trim(),
    name1: row?.kdL_Name1 === null || row?.kdL_Name1 === undefined ? '' : String(row.kdL_Name1).trim(),
    name2: row?.kdL_Name2 === null || row?.kdL_Name2 === undefined ? '' : String(row.kdL_Name2).trim(),
    countryCode: asText(row?.kdL_LK),
    region: asText(row?.kdL_Region),
  };
}

async function loadCustomerDeliveryAddresses(database, customerId) {
  const rows = await runSQLQueryAccess(database, `
    SELECT
      ${DELIVERY_ADDRESS_COLUMNS}
    FROM [dbo].[tblKun_LiefAdress]
    WHERE COALESCE([kdL_KdNR], '') = ?
    ORDER BY [kdL_Lieferanschrift_Nr] ASC
  `, [String(customerId ?? '').trim()]);
  return (Array.isArray(rows) ? rows : []).map(mapDeliveryAddressRow);
}

async function createCustomerDeliveryAddress(database, customer, input, customerId) {
  const values = normalizeDeliveryAddressInput(input, customer, customerId);
  const result = await withSqlTransaction(database?.databaseName || database, async ({ query }) => {
    // Serialize address-number allocation per customer. The address table has no
    // unique constraint for kdL_Lieferanschrift_Nr, so locking the customer row
    // also covers the empty-address case where the address query locks no rows.
    await query(`
      SELECT [kd_KdNR]
      FROM [dbo].[tblKunden] WITH (UPDLOCK, HOLDLOCK)
      WHERE [kd_KdNR] = ?
    `, [values.resolvedCustomerId]);
    const existingRows = await query(`
      SELECT [kdL_Lieferanschrift_Nr] AS addressNo
      FROM [dbo].[tblKun_LiefAdress] WITH (UPDLOCK, HOLDLOCK)
      WHERE COALESCE([kdL_KdNR], '') = ?
    `, [values.resolvedCustomerId]);
    const addressNo = getNextDeliveryAddressNumber(existingRows.rows);
    const inserted = await query(`
      INSERT INTO [dbo].[tblKun_LiefAdress] (
        [kdL_KdNR], [kdL_Lieferanschrift_Nr], [kdL_Kurz], [kdL_Name1], [kdL_Name2],
        [kdL_Strasse], [kdL_LK], [kdL_PLZ], [kdL_Ort], [kdL_Region], [kdL_Kontrakt], [kdL_Abhol]
      )
      OUTPUT INSERTED.[kdL_KdNR], INSERTED.[kdL_ID], INSERTED.[kdL_Lieferanschrift_Nr],
             INSERTED.[kdL_Kurz], INSERTED.[kdL_Name1], INSERTED.[kdL_Name2], INSERTED.[kdL_Strasse],
             INSERTED.[kdL_LK], INSERTED.[kdL_PLZ], INSERTED.[kdL_Ort], INSERTED.[kdL_Region],
             INSERTED.[kdL_Kontrakt], INSERTED.[kdL_Abhol]
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      values.resolvedCustomerId,
      addressNo,
      values.short || null,
      values.name1 || null,
      values.name2 || null,
      values.street,
      values.countryCode,
      values.postalCode,
      values.city,
      values.region || null,
      values.contact || null,
      values.pickupTimes || null,
    ]);
    const row = Array.isArray(inserted.rows) ? inserted.rows[0] : null;
    if (!row) throw new Error('Delivery address insert returned no row.');
    return mapDeliveryAddressRow(row);
  });
  return result;
}

module.exports = {
  DELIVERY_ADDRESS_FIELD_LIMITS,
  createCustomerDeliveryAddress,
  getNextDeliveryAddressNumber,
  loadCustomerDeliveryAddresses,
  mapDeliveryAddressRow,
  normalizeDeliveryAddressInput,
};
