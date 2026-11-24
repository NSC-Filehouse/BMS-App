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
    return target?.articleIndex === params[0] ? [target] : [];
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
const { loadOptionOfferCustomers, loadCustomerOfferAudience } = require('../src/options/customer-offers');
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

test('a stock offer uses the exact stock key and the same customer scope without option matching', async () => {
  const stockPositionKey = 'a'.repeat(64);
  const result = await loadCustomerOfferAudience(sameDatabase, {}, catalogArticle, stockPositionKey);
  assert.equal(result.article.index, 'A-PP');
  assert.equal(result.customers[0].sent, true);
  assert.equal(result.customers[1].queued, true);
  assert.equal(calls.length, 2);
  const buyerQuery = calls.find(call => call.sql.includes('dbo.tblRechnung'));
  const statusQuery = calls.find(call => call.sql.includes('CustomerNumber, Status'));
  assert.match(buyerQuery.sql, /k.kd_Aussendienst/);
  assert.deepEqual(buyerQuery.params, ['A-PP', 'ADM']);
  assert.match(statusQuery.sql, /OptionPositionId IS NULL AND StockPositionKey/);
  assert.deepEqual(statusQuery.params, [3, stockPositionKey]);
});

test('an eligible match returns scoped buyers and only the recorded sent status for this position', async () => {
  const result = await loadOptionOfferCustomers(sameDatabase, {}, owner, position);
  assert.deepEqual(result, {
    article: { index: 'A-PP', name: catalogArticle.articleName },
    salesFilter: { enabled: false, defaultCode: 'ADM' },
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
  customerScope.shortCode = ' adm ';
  invoices[1].salesCode = 'AD2';
  const result = await loadOptionOfferCustomers(sameDatabase, {}, owner, position);
  assert.deepEqual(result.customers.map(customer => customer.salesCode), ['ADM', 'AD2']);
  assert.deepEqual(result.salesFilter, { enabled: true, defaultCode: 'ADM' });
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

test('an explicit selection loads the buyers for that article even without a unique match', async () => {
  const unmatched = { ...position, singleCandidateIndex: null };
  const first = await loadOptionOfferCustomers(sameDatabase, {}, owner, unmatched, 'A-PP');
  assert.equal(first.matched, false);
  assert.deepEqual(first.customers.map(customer => customer.id), ['A', 'B']);

  target = { ...catalogArticle, articleIndex: 'B-PP' };
  invoices = [{ id: 'C', name: 'Kunde C', salesCode: 'ADM' }];
  const second = await loadOptionOfferCustomers(sameDatabase, {}, owner, unmatched, 'B-PP');
  assert.equal(second.article.index, 'B-PP');
  assert.equal(second.matched, false);
  assert.deepEqual(second.customers.map(customer => customer.id), ['C']);
  assert.deepEqual(calls.filter(call => call.sql.includes('dbo.tblRechnung')).map(call => call.params), [['A-PP', 'ADM'], ['B-PP', 'ADM']]);
});

test('the selected article keeps the automatic match indicator only when both indexes agree', async () => {
  const result = await loadOptionOfferCustomers(sameDatabase, {}, owner, position, 'A-PP');
  assert.equal(result.matched, true);
});

test('an invalid or incompatible selection never falls back to the automatic audience', async () => {
  await assert.rejects(() => loadOptionOfferCustomers(sameDatabase, {}, owner, position, ['A-PP', 'B-PP']), /Ungültiger Artikelindex/);
  target = null;
  await assert.rejects(() => loadOptionOfferCustomers(sameDatabase, {}, owner, position, 'B-PP'), /nicht aktiv oder nicht vorhanden/);
  target = { ...catalogArticle, articleIndex: 'B-PP', articleName: 'PP Copo NT MFI 1 - 2 natur' };
  await assert.rejects(() => loadOptionOfferCustomers(sameDatabase, {}, owner, position, 'B-PP'), /passt technisch nicht/);
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
  target = candidates.at(-1);
  const selected = await loadOptionOfferCustomers(foreignDatabase, {}, owner, position, 'D-PP');
  assert.equal(selected.article.index, 'D-PP');
  assert.equal(selected.matched, false);
  assert.equal(calls.findLast(call => call.sql.includes('dbo.tblRechnung')).database, foreignDatabase);
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

test('offer submission rechecks buyers and uses the selected article in the offer', async () => {
  accepted = [];
  target = { ...catalogArticle, articleIndex: 'B-PP', articleName: 'PP Copo NT MFI 11 - 15 natur' };
  invoices = [invoices[1]];
  const draft = { customerId: 'B', contactId: 71, incotermId: 29, quantityKg: 24750, salePrice: 1320, pickup: 'Hamburg' };
  const userIdentity = { email: 'ad@example.invalid', fullName: 'Vertrieb', shortCode: 'ADM' };
  const req = { database: sameDatabase, userIdentity, query: { articleIndex: 'B-PP' }, get: () => 'de', body: { customers: [draft] } };
  const [offer] = await buildOfferSubmissions(req, owner, { ...position, singleCandidateIndex: null });
  assert.equal(offer.articleIndex, 'B-PP');
  assert.equal(offer.article, target.articleName);
  assert.deepEqual(calls.find(call => call.sql.includes('dbo.tblRechnung')).params, ['B-PP', 'ADM']);
  await assert.rejects(() => buildOfferSubmissions({ ...req, body: { customers: [{ ...draft, customerId: 'A' }] } }, owner, position), /nicht verfügbar/);
});
