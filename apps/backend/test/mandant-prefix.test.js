const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMandantIdFromBeNumber } = require('../src/mandant-prefix');

test('parses the mandant id from current order-position numbers', () => {
  assert.equal(parseMandantIdFromBeNumber('3-02-26-00703-01'), 3);
  assert.equal(parseMandantIdFromBeNumber('4-02-26-00001-02'), 4);
});

test('keeps legacy and malformed order numbers without a source id', () => {
  assert.equal(parseMandantIdFromBeNumber('BE12000001'), null);
  assert.equal(parseMandantIdFromBeNumber(''), null);
  assert.equal(parseMandantIdFromBeNumber('3/02/26'), null);
});
