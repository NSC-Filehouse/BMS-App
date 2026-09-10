const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSalesRepresentativeList } = require('../src/db/customer-sales-representatives');

test('puts the local main outside-sales code first and removes duplicate codes', () => {
  const result = buildSalesRepresentativeList(' bdo ', [
    { MandantID: 7, MandantKuerzel: 'CHG', MandantName: 'CHG', Aussendienst: 'TLA' },
    { MandantID: 9, MandantKuerzel: 'FNO', MandantName: 'FrupackNordic', Aussendienst: 'BDO' },
    { MandantID: 2, MandantKuerzel: 'PLA', MandantName: 'MLPlastics', Aussendienst: ' aki ' },
    { MandantID: 2, MandantKuerzel: 'PLA', MandantName: 'MLPlastics', Aussendienst: 'AKI' },
    { Aussendienst: null },
  ], { MandantID: 2, MandantKuerzel: 'PLA', MandantName: 'MLPlastics' });

  assert.deepEqual(result, [
    {
      shortCode: 'BDO',
      primary: true,
      mandants: [
        { id: 2, shortCode: 'PLA', name: 'MLPlastics' },
        { id: 9, shortCode: 'FNO', name: 'FrupackNordic' },
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
      mandants: [{ id: 2, shortCode: 'PLA', name: 'MLPlastics' }],
    },
  ]);
});

test('ignores blank TVF codes and drops representatives without visible mandants', () => {
  assert.deepEqual(buildSalesRepresentativeList('', [
    { Aussendienst: ' ' },
    { aussendienst: 'DME' },
  ]), []);
});

test('hides Elbpolymer and Just4Today from responsible mandants', () => {
  assert.deepEqual(buildSalesRepresentativeList(' EPO ', [
    { MandantID: 17, MandantKuerzel: 'J4T', MandantName: 'Just4Today', Aussendienst: 'EPO' },
    { MandantID: 18, MandantKuerzel: 'EPO', MandantName: 'Elbpolymer', Aussendienst: 'TLA' },
    { MandantID: 2, MandantKuerzel: 'PLA', MandantName: 'MLPlastics', Aussendienst: 'EPO' },
    { MandantID: 7, MandantKuerzel: 'CHG', MandantName: 'CHG', Aussendienst: 'TLA' },
  ], { MandantID: 18, MandantKuerzel: 'EPO', MandantName: 'Elbpolymer' }), [
    {
      shortCode: 'EPO',
      primary: true,
      mandants: [{ id: 2, shortCode: 'PLA', name: 'MLPlastics' }],
    },
    {
      shortCode: 'TLA',
      primary: false,
      mandants: [{ id: 7, shortCode: 'CHG', name: 'CHG' }],
    },
  ]);
});

test('hides Test for other viewers but keeps it for MFR and NSC', () => {
  const rows = [
    { MandantID: 0, MandantKuerzel: 'TES', MandantName: 'Test', Aussendienst: 'EPO' },
    { MandantID: 2, MandantKuerzel: 'PLA', MandantName: 'MLPlastics', Aussendienst: 'EPO' },
  ];
  const primaryMandant = { MandantID: 0, MandantKuerzel: 'TES', MandantName: 'Test' };

  const hiddenForOtherViewer = buildSalesRepresentativeList('EPO', rows, primaryMandant, { shortCode: 'AKI' });
  assert.deepEqual(hiddenForOtherViewer, [{
    shortCode: 'EPO',
    primary: true,
    mandants: [{ id: 2, shortCode: 'PLA', name: 'MLPlastics' }],
  }]);

  for (const shortCode of ['MFR', 'NSC']) {
    const visibleForException = buildSalesRepresentativeList('EPO', rows, primaryMandant, { shortCode });
    assert.deepEqual(visibleForException, [{
      shortCode: 'EPO',
      primary: true,
      mandants: [
        { id: 0, shortCode: 'TES', name: 'Test' },
        { id: 2, shortCode: 'PLA', name: 'MLPlastics' },
      ],
    }]);
  }
});

test('hides every mandant from the configured customer-detail exclusion list', () => {
  const rows = [0, 1, 6, 8, 13, 14, 15, 16, 17, 18].map((id) => ({
    MandantID: id,
    MandantKuerzel: `M${id}`,
    MandantName: `Mandant ${id}`,
    Aussendienst: 'EPO',
  }));

  assert.deepEqual(
    buildSalesRepresentativeList('EPO', rows, rows[rows.length - 1], { shortCode: 'AKI' }),
    [],
  );
});
