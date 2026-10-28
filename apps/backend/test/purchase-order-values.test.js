const test = require('node:test');
const assert = require('node:assert/strict');
const { commonLoadingLocations, findPackaging, packagingKey } = require('../src/db/purchase-order-values');

test('only offers common supplier/article locations without manufacturing an address PK', () => {
  const rows = [
    { articleIndex: 'A', loadingLocationText: 'Hamburg' },
    { articleIndex: 'B', loadingLocationText: ' HAMBURG ' },
    { articleIndex: 'A', loadingLocationText: 'Berlin' },
  ];
  const common = commonLoadingLocations(rows, ['A', 'B', 'A']);
  assert.equal(common.length, 1);
  assert.equal(common[0].text, 'Hamburg');
  assert.equal(common[0].source, 'supplier_order_history');
  assert.deepEqual(commonLoadingLocations(rows, ['A', 'C']), []);
  assert.deepEqual(commonLoadingLocations(rows, []), []);
});

test('packaging IDs and bilingual aliases resolve consistently with order choices', () => {
  const options = [{ id: 79, text: 'Silo/bulk', aliases: ['Siloware', 'Silo/bulk'] }, { id: 78, text: 'Bags', aliases: ['Sackware', 'Bags'] }];
  assert.equal(findPackaging(options, 'Siloware').id, 79);
  assert.equal(findPackaging(options, '', 78).id, 78);
  assert.equal(packagingKey('Silo/bulk'), packagingKey('Siloware'));
  assert.notEqual(packagingKey('Big Bags'), packagingKey('Sackware'));
});
