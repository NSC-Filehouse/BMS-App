const test = require('node:test');
const assert = require('node:assert/strict');
const { articleHash } = require('../src/options/matching-contract');

const calls = [];
const catalogArticle = { articleIndex: 'A-PP', articleName: 'PP Copo NT MFI 10 - 14,9 natur' };
let target;
let candidates;
let stored;
let invoices;
let accepted;

require.cache[require.resolve('../src/db/access')] = { exports: {
  withSqlTransaction: async () => assert.fail('Customer offer lookup must be read-only'),
  runSQLQueryAccess: async (database, sql, params) => {
    calls.push({ database, sql, params });
    if (sql.includes('WITH purchases')) return invoices;
    if (sql.includes('OPENJSON')) return candidates;
    assert.match(sql, /a\.agA_Artikelindex=\?/);
    return target ? [target] : [];
  },
  runSQLQuerySqlServer: async (database, sql, params) => {
    calls.push({ database, sql, params });
    if (sql.includes('tblOptionenArtikelKandidaten')) {
      return stored ? [{ oak_DatenJson: JSON.stringify(stored), oak_oab_id: 25 }] : [];
    }
    assert.match(sql, /Status = N''sent''/);
    return accepted;
  },
} };
require.cache[require.resolve('../src/db/customer-access')] = { exports: {
  getCustomerAccessScope: async () => ({ shortCode: 'ADM' }),
  buildCustomerScopeFilter: ({ shortCode }) => ({ whereSql: '[k].[kd_Aussendienst] = ?', params: [shortCode] }),
} };
const { loadOptionOfferCustomers } = require('../src/options/customer-offers');

const owner = { sourceMandantId: 3 };
const sameDatabase = { firmaId: 3 };
const foreignDatabase = { firmaId: 8 };
const position = {
  id: 41, articleName: 'PPC 7600 OG', mfi: 12.3, snapshotId: '25',
  singleCandidateIndex: 'A-PP', matchProcessingStatus: 'ready',
};

test.beforeEach(() => {
  calls.length = 0;
  target = catalogArticle;
  candidates = [];
  stored = { ...catalogArticle, articleHash: articleHash(catalogArticle) };
  invoices = [{ id: 'A', name: 'Kunde A', lastIncoterm: 'FCA' }, { id: 'B', name: 'Kunde B' }];
  accepted = [{ CustomerNumber: 'a' }];
});

test('an eligible match returns scoped buyers and only the recorded sent status for this position', async () => {
  const result = await loadOptionOfferCustomers(sameDatabase, {}, owner, position);
  assert.deepEqual(result, {
    article: { index: 'A-PP', name: catalogArticle.articleName },
    customers: [
      { id: 'A', name: 'Kunde A', lastIncoterm: 'FCA', sent: true },
      { id: 'B', name: 'Kunde B', lastIncoterm: '', sent: false },
    ],
  });
  const purchases = calls.find(call => call.sql.includes('WITH purchases'));
  assert.deepEqual(purchases.params, ['A-PP', 'ADM']);
  assert.match(purchases.sql, /p\.reP_Artikelindex = \?/);
  assert.match(purchases.sql, /r\.re_Auftragsstatus = N'Rechnung'/);
  assert.match(purchases.sql, /p\.purchaseRank = 1/);
  assert.deepEqual(calls.find(call => call.sql.includes('OptionOfferMailOutbox')).params, [3, 41]);
});

test('a stale automatic match, an altered catalog article or an incompatible assignment has no audience', async () => {
  const empty = { article: null, customers: [] };
  assert.deepEqual(await loadOptionOfferCustomers(sameDatabase, {}, owner, { ...position, matchProcessingStatus: 'updating' }), empty);
  assert.equal(calls.length, 0);
  target = { ...catalogArticle, description: 'Updated catalog record' };
  assert.deepEqual(await loadOptionOfferCustomers(sameDatabase, {}, owner, position), empty);
  target = { ...catalogArticle, articleName: 'PP Copo NT MFI 1 - 2 natur' };
  assert.deepEqual(await loadOptionOfferCustomers(sameDatabase, {}, owner, { ...position, articleIndex: 'A-PP' }), empty);
  assert.equal(calls.some(call => call.sql.includes('WITH purchases')), false);
});

test('a shared option uses an unambiguous compatible article from the active catalog', async () => {
  candidates = [
    { ...catalogArticle, articleIndex: 'B-PP' },
    { ...catalogArticle, articleIndex: 'C-PP', articleName: 'PP Copo NT MFI 1 - 2 natur' },
  ];
  const result = await loadOptionOfferCustomers(foreignDatabase, {}, owner, { ...position, articleIndex: 'A-PP' });
  assert.equal(result.article.index, 'B-PP');
  const purchases = calls.find(call => call.sql.includes('WITH purchases'));
  assert.equal(purchases.database, foreignDatabase);
  assert.equal(purchases.params[0], 'B-PP');
  assert.deepEqual(calls.find(call => call.sql.includes('OptionOfferMailOutbox')).params, [8, 41]);
  candidates.push({ ...catalogArticle, articleIndex: 'D-PP' });
  assert.deepEqual(await loadOptionOfferCustomers(foreignDatabase, {}, owner, position), { article: null, customers: [] });
});
