const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDeliveryAddressText } = require('../src/delivery-address');
const { mapDeliveryAddressRow } = require('../src/db/delivery-addresses');
const { parseDeliveryAddressId } = require('../src/routes/temp-orders.routes');

test('formats delivery addresses consistently for selection and persistence', () => {
  const row = {
    kdL_KdNR: '38201',
    kdL_Lieferanschrift_Nr: 0,
    kdL_Name1: 'Karl Schoengen KG',
    kdL_Name2: 'Werk',
    kdL_Strasse: 'Carl Zeiss Weg 8',
    kdL_PLZ: '38239',
    kdL_Ort: 'Salzgitter-Watenstedt',
    kdL_LK: 'D',
  };

  assert.equal(
    buildDeliveryAddressText(row),
    'Karl Schoengen KG, Werk, Carl Zeiss Weg 8, 38239 Salzgitter-Watenstedt, D',
  );
  assert.deepEqual(mapDeliveryAddressRow(row), {
    id: '0',
    customerId: '38201',
    text: 'Karl Schoengen KG, Werk, Carl Zeiss Weg 8, 38239 Salzgitter-Watenstedt, D',
    short: '',
    name1: 'Karl Schoengen KG',
    name2: 'Werk',
  });
});

test('accepts delivery address id zero and rejects invalid ids', () => {
  assert.deepEqual(parseDeliveryAddressId(0), { provided: true, id: 0 });
  assert.deepEqual(parseDeliveryAddressId('1'), { provided: true, id: 1 });
  assert.deepEqual(parseDeliveryAddressId(''), { provided: false, id: null });
  assert.throws(() => parseDeliveryAddressId('-1'), /Invalid delivery address id/);
  assert.throws(() => parseDeliveryAddressId('1.5'), /Invalid delivery address id/);
  assert.throws(() => parseDeliveryAddressId('40000'), /Invalid delivery address id/);
});
