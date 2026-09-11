const test = require('node:test');
const assert = require('node:assert/strict');

const { getDefaultMandantForIdentity } = require('../src/db/databases');

const mandants = [
  { firmaId: 2, name: 'MLPolymer', shortName: 'MLP' },
  { firmaId: 3, name: 'Frupack', shortName: 'FRU' },
  { firmaId: 10, name: 'FrupackNordic', shortName: 'FNO' },
];

test('uses ma_FirmaID for the normal default mandant', () => {
  const result = getDefaultMandantForIdentity({
    shortCode: 'DRE',
    fullName: 'Daniel Rehder',
    mainCompanyId: 2,
  }, mandants);

  assert.equal(result?.name, 'MLPolymer');
});

test('uses Frupack as the default mandant for AKI', () => {
  const result = getDefaultMandantForIdentity({
    shortCode: 'AKI',
    fullName: 'Alexander Kimaz',
    mainCompanyId: 2,
  }, mandants);

  assert.equal(result?.firmaId, 3);
  assert.equal(result?.shortName, 'FRU');
});

test('does not apply the AKI override to another identity with the same short code', () => {
  const result = getDefaultMandantForIdentity({
    shortCode: 'AKI',
    fullName: 'Another Person',
    mainCompanyId: 2,
  }, mandants);

  assert.equal(result?.firmaId, 2);
});

test('returns no default when the normal main mandant is not permitted', () => {
  const result = getDefaultMandantForIdentity({ mainCompanyId: 99 }, mandants);

  assert.equal(result, null);
});
