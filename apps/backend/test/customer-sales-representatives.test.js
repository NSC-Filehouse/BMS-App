const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSalesRepresentativeList } = require('../src/db/customer-sales-representatives');

test('puts the local main outside-sales code first and removes duplicate codes', () => {
  const result = buildSalesRepresentativeList(' bdo ', [
    { MandantID: 7, MandantKuerzel: 'CHG', MandantName: 'CHG', Aussendienst: 'TLA' },
    { MandantID: 16, MandantKuerzel: 'CPD', MandantName: 'MLCompound', Aussendienst: 'BDO' },
    { MandantID: 6, MandantKuerzel: 'CON', MandantName: 'MLConnect', Aussendienst: ' aki ' },
    { MandantID: 6, MandantKuerzel: 'CON', MandantName: 'MLConnect', Aussendienst: 'AKI' },
    { Aussendienst: null },
  ], { MandantID: 2, MandantKuerzel: 'PLA', MandantName: 'MLPlastics' });

  assert.deepEqual(result, [
    {
      shortCode: 'BDO',
      primary: true,
      mandants: [
        { id: 2, shortCode: 'PLA', name: 'MLPlastics' },
        { id: 16, shortCode: 'CPD', name: 'MLCompound' },
      ],
    },
    {
      shortCode: 'TLA',
      primary: false,
      mandants: [{ id: 7, shortCode: 'CHG', name: 'CHG' }],
    },
    {
      shortCode: 'AKI',
      primary: false,
      mandants: [{ id: 6, shortCode: 'CON', name: 'MLConnect' }],
    },
  ]);
});

test('ignores blank TVF codes and handles an empty primary code', () => {
  assert.deepEqual(buildSalesRepresentativeList('', [
    { Aussendienst: ' ' },
    { aussendienst: 'DME' },
  ]), [
    { shortCode: 'DME', primary: false, mandants: [] },
  ]);
});
