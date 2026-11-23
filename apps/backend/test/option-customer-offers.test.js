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
let customerScope;

require.cache[require.resolve('../src/db/access')] = { exports: {
  withSqlTransaction: async () => assert.fail('Customer offer lookup must be read-only'),
  runSQLQueryAccess: async (database, sql, params) => {
    calls.push({ database, sql, params });
    if (sql.includes('dbo.tblRechnung')) return invoices;
    if (sql.includes('dbo.tblKun_Ansprech')) return [{ customerId: 'B', id: 71, name: 'Musterkontakt', email: 'b@example.invalid', language: 'de' }];
    if (sql.includes('dbo.tblLieferbedingungen')) return [{ id: 29, text: 'FCA / Frei Frachtführer' }];
    if (sql.includes('OPENJSON')) return candidates;
    assert.match(sql, /a\.agA_Artikelindex=\?/);
    return target ? [target] : [];
  },
  runSQLQuerySqlServer: async (database, sql, params) => {
    calls.push({ database, sql, params });
    if (sql.includes('tblOptionenArtikelKandidaten')) {
      return stored ? [{ oak_DatenJson: JSON.stringify(stored), oak_oab_id: 25 }] : [];
    }
    assert.match(sql, /CustomerNumber, Status/);
    return accepted;
  },
} };
require.cache[require.resolve('../src/db/customer-access')] = { exports: {
  getCustomerAccessScope: async () => customerScope,
  buildCustomerScopeFilter: () => ({ whereSql: '', params: [] }),
} };
const { loadOptionOfferCustomers } = require('../src/options/customer-offers');
const { buildOfferSubmissions } = require('../src/options/offer-submission');

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
  customerScope = { shortCode: 'ADM', isMainTenant: true, isFullAccess: true };
  invoices = [{ id: 'A', name: 'Kunde A', salesCode: 'ADM' }, { id: 'B', name: 'Kunde B', salesCode: 'ADM' }];
  accepted = [{ CustomerNumber: 'a', Status: 'sent' }, { CustomerNumber: 'b', Status: 'submitted' }];
});

test('an eligible match returns scoped buyers and only the recorded sent status for this position', async () => {
  const result = await loadOptionOfferCustomers(sameDatabase, {}, owner, position);
  assert.deepEqual(result, {
    article: { index: 'A-PP', name: catalogArticle.articleName },
    customers: [
      { id: 'A', name: 'Kunde A', salesCode: 'ADM', sent: true, queued: false, failed: false },
      { id: 'B', name: 'Kunde B', salesCode: 'ADM', sent: false, queued: true, failed: false },
    ],
  });
  const purchases = calls.find(call => call.sql.includes('dbo.tblRechnung'));
  assert.deepEqual(purchases.params, ['A-PP', 'ADM']);
  assert.match(purchases.sql, /p\.reP_Artikelindex = \?/);
  assert.match(purchases.sql, /r\.re_Auftragsstatus = N'Rechnung'/);
  assert.match(purchases.sql, /UPPER\(LTRIM\(RTRIM\(k\.kd_Aussendienst\)\)\) = \?/);
  assert.deepEqual(calls.find(call => call.sql.includes('OptionOfferMailOutbox')).params, [3, 41]);
});

test('explicit cross-sales access may display different representatives for filtering', async () => {
  customerScope.userGroup = 'GR04';
  invoices[1].salesCode = 'AD2';
  const result = await loadOptionOfferCustomers(sameDatabase, {}, owner, position);
  assert.deepEqual(result.customers.map(customer => customer.salesCode), ['ADM', 'AD2']);
  assert.deepEqual(calls.find(call => call.sql.includes('dbo.tblRechnung')).params, ['A-PP']);
});

test('a stale automatic match, an altered catalog article or an incompatible assignment has no audience', async () => {
  const empty = { article: null, customers: [] };
  assert.deepEqual(await loadOptionOfferCustomers(sameDatabase, {}, owner, { ...position, matchProcessingStatus: 'updating' }), empty);
  assert.equal(calls.length, 0);
  target = { ...catalogArticle, description: 'Updated catalog record' };
  assert.deepEqual(await loadOptionOfferCustomers(sameDatabase, {}, owner, position), empty);
  target = { ...catalogArticle, articleName: 'PP Copo NT MFI 1 - 2 natur' };
  assert.deepEqual(await loadOptionOfferCustomers(sameDatabase, {}, owner, { ...position, articleIndex: 'A-PP' }), empty);
  assert.equal(calls.some(call => call.sql.includes('dbo.tblRechnung')), false);
});

test('a shared option uses an unambiguous compatible article from the active catalog', async () => {
  candidates = [
    { ...catalogArticle, articleIndex: 'B-PP' },
    { ...catalogArticle, articleIndex: 'C-PP', articleName: 'PP Copo NT MFI 1 - 2 natur' },
  ];
  const result = await loadOptionOfferCustomers(foreignDatabase, {}, owner, { ...position, articleIndex: 'A-PP' });
  assert.equal(result.article.index, 'B-PP');
  const purchases = calls.find(call => call.sql.includes('dbo.tblRechnung'));
  assert.equal(purchases.database, foreignDatabase);
  assert.equal(purchases.params[0], 'B-PP');
  assert.deepEqual(calls.find(call => call.sql.includes('OptionOfferMailOutbox')).params, [8, 41]);
  candidates.push({ ...catalogArticle, articleIndex: 'D-PP' });
  assert.deepEqual(await loadOptionOfferCustomers(foreignDatabase, {}, owner, position), { article: null, customers: [] });
});

test('server validates the actual buyer, contact, remaining quantity and FCA location before preparing mail', async () => {
  accepted = [];
  const draft = { customerId: 'B', contactId: 71, incotermId: 29, quantityKg: 24750, salePrice: 1320, pickup: 'Hamburg' };
  const userIdentity = { email: 'ad@example.invalid', fullName: 'Vertrieb', shortCode: 'ADM' };
  const req = { database: sameDatabase, userIdentity, get: () => 'de', body: { customers: [draft] } };
  const [offer] = await buildOfferSubmissions(req, owner, { ...position, remainingKg: 49500 });
  assert.equal(offer.senderEmail, userIdentity.email);
  assert.equal(offer.recipientEmail, 'b@example.invalid');
  assert.equal(offer.incotermText, 'FCA / Frei Frachtführer');
  assert.equal(offer.incotermCode, 'FCA');
  assert.equal(offer.quantityKg, 24750);
  await assert.rejects(() => buildOfferSubmissions(req, owner, { ...position, remainingKg: 20000 }), /Angebotsmenge/);
  await assert.rejects(() => buildOfferSubmissions({ ...req, body: { customers: [{ ...draft, pickup: '' }] } }, owner, position), /Abholort/);
  await assert.rejects(() => buildOfferSubmissions({ ...req, body: { customers: [{ ...draft, customerId: 'X' }] } }, owner, position), /nicht verfügbar/);
  await assert.rejects(() => buildOfferSubmissions({ ...req, body: { customers: [{ ...draft, contactId: 72 }] } }, owner, position), /Ansprechpartner/);
});
