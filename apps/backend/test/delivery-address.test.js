const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDeliveryAddressText } = require('../src/delivery-address');
const {
  getNextDeliveryAddressNumber,
  mapDeliveryAddressRow,
  normalizeDeliveryAddressInput,
} = require('../src/db/delivery-addresses');
const {
  parseDeliveryAddressId,
  normalizeCustomerOrderNumber,
} = require('../src/routes/temp-orders.routes');

test('formats delivery addresses consistently for selection and persistence', () => {
  const row = {
    kdL_KdNR: '38201',
    kdL_ID: 117,
    kdL_Lieferanschrift_Nr: 0,
    kdL_Name1: 'Karl Schoengen KG',
    kdL_Name2: 'Werk',
    kdL_Strasse: 'Carl Zeiss Weg 8',
    kdL_PLZ: '38239',
    kdL_Ort: 'Salzgitter-Watenstedt',
    kdL_LK: 'D',
    countryCode: 'DE',
  };

  assert.equal(
    buildDeliveryAddressText(row),
    'Karl Schoengen KG, Werk, Carl Zeiss Weg 8, 38239 Salzgitter-Watenstedt, DE',
  );
  assert.deepEqual(mapDeliveryAddressRow(row), {
    id: '117',
    addressNo: '0',
    customerId: '38201',
    text: 'Karl Schoengen KG, Werk, Carl Zeiss Weg 8, 38239 Salzgitter-Watenstedt, DE',
    short: '',
    name1: 'Karl Schoengen KG',
    name2: 'Werk',
    countryCode: 'DE',
    region: '',
  });
});

test('accepts delivery address id zero and rejects invalid ids', () => {
  assert.deepEqual(parseDeliveryAddressId(0), { provided: true, id: 0 });
  assert.deepEqual(parseDeliveryAddressId('1'), { provided: true, id: 1 });
  assert.deepEqual(parseDeliveryAddressId(''), { provided: false, id: null });
  assert.throws(() => parseDeliveryAddressId('-1'), /Invalid delivery address id/);
  assert.throws(() => parseDeliveryAddressId('1.5'), /Invalid delivery address id/);
  assert.deepEqual(parseDeliveryAddressId('40000'), { provided: true, id: 40000 });
  assert.throws(() => parseDeliveryAddressId('2147483648'), /Invalid delivery address id/);
});

test('normalizes optional customer order numbers and enforces the database limit', () => {
  assert.equal(normalizeCustomerOrderNumber('  PO-4711  '), 'PO-4711');
  assert.equal(normalizeCustomerOrderNumber(''), null);
  assert.equal(normalizeCustomerOrderNumber('12345678901234567890'), '12345678901234567890');
  assert.throws(
    () => normalizeCustomerOrderNumber('123456789012345678901'),
    (error) => error?.details?.code === 'INVALID_TEMP_ORDER_PAYLOAD'
      && error.details.field === 'customerOrderNumber'
      && error.details.maxLength === 20,
  );
});

test('normalizes a new delivery address from customer defaults', () => {
  assert.deepEqual(normalizeDeliveryAddressInput({
    street: 'Hafenstraße 12',
    postalCode: '20457',
    city: 'Hamburg',
    countryId: 'd',
    pickupTimes: 'Mo-Fr 08:00-16:00',
    contact: 'Max Mustermann',
  }, {
    kd_KdNR: '10001',
    kd_Kurz: 'Kunde kurz',
    kd_Name1: 'Kunde GmbH',
    kd_Name2: 'Werk 1',
    kd_Region: 'Nord',
  }), {
    resolvedCustomerId: '10001',
    short: 'Kunde kurz',
    name1: 'Kunde GmbH',
    name2: 'Werk 1',
    street: 'Hafenstraße 12',
    countryId: 'D',
    postalCode: '20457',
    city: 'Hamburg',
    region: 'Nord',
    contact: 'Max Mustermann',
    pickupTimes: 'Mo-Fr 08:00-16:00',
  });
});

test('requires a country type id and required address fields', () => {
  assert.throws(
    () => normalizeDeliveryAddressInput({ street: 'Hafenstraße 12', postalCode: '20457', city: 'Hamburg', countryId: '' }, { kd_KdNR: '10001' }),
    (error) => error?.details?.code === 'DELIVERY_ADDRESS_REQUIRED' && error.details.fields.includes('countryId'),
  );
  assert.throws(
    () => normalizeDeliveryAddressInput({ street: '', postalCode: '20457', city: 'Hamburg', countryId: 'D' }, { kd_KdNR: '10001' }),
    (error) => error?.details?.code === 'DELIVERY_ADDRESS_REQUIRED' && error.details.fields.includes('street'),
  );
});

test('assigns the next logical delivery address number', () => {
  assert.equal(getNextDeliveryAddressNumber([
    { addressNo: '0' },
    { addressNo: 2 },
    { addressNo: '4' },
    { addressNo: 'not-a-number' },
  ]), 5);
  assert.equal(getNextDeliveryAddressNumber([]), 1);
});
