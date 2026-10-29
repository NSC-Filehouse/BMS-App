const test = require('node:test');
const assert = require('node:assert/strict');
let calls = [];
require.cache[require.resolve('../src/db/access')] = { exports: {
  runSQLQuerySqlServer: async (database, sql, params) => {
    calls.push({ sql, params });
    assert.equal((sql.match(/\?/g) || []).length, params.length);
    if (sql.includes('AS sourceMandantId')) return [
      { id: 1, sourceMandantId: 3, supplierName: 'Total Petrochemicals & Refining SA/NV' },
      { id: 2, sourceMandantId: 19, supplierName: 'TotalEnergies' },
    ];
    return [{ id: 10, optionId: 1 }, { id: 20, optionId: 2 }];
  },
} };
const { loadOffers } = require('../src/options/read');
test.beforeEach(() => { calls = []; });
test('shared pool returns different sources with canonical suppliers and applies status/date filters to both reads', async () => {
  const offers = await loadOffers(null, { optionId: 1 });
  assert.deepEqual(offers.map(offer => offer.sourceMandantId), [3, 19]);
  assert.ok(offers.every(offer => offer.supplierKey === 'totalenergies'));
  for (const { sql } of calls) {
    assert.doesNotMatch(sql, /WHERE o\.op_MandantID IN/);
    assert.match(sql, /o\.op_GeloeschtAm IS NULL/);
    assert.match(sql, /o\.op_GueltigAb<=\?/);
    assert.match(sql, /o\.op_id=\?/);
    assert.match(sql, /o\.op_Geschaeftsstatus=N'open'/);
  }
  assert.match(calls[1].sql, /COALESCE\(p\.opp_GueltigBis,o\.op_GueltigBis\)>=\?/);
});
test('an explicit source scope still binds IDs; empty scopes never become global', async () => {
  await loadOffers([3, 19], { includeExpired: true });
  assert.deepEqual(calls[0].params.slice(0, 2), [3, 19]);
  assert.match(calls[0].sql, /WHERE o\.op_MandantID IN \(\?,\?\)/);
  assert.doesNotMatch(calls[1].sql, /COALESCE\(p\.opp_GueltigBis,o\.op_GueltigBis\)>=\?/);
  calls = [];
  assert.deepEqual(await loadOffers([]), []);
  assert.deepEqual(await loadOffers(), []);
  assert.equal(calls.length, 0);
});
