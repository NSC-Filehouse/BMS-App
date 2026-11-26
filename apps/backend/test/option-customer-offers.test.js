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
let mandants;
let foreignInvoices;
let nameRule;
let recordedAccounts;

require.cache[require.resolve('../src/db/access')] = { exports: {
  withSqlTransaction: async () => assert.fail('Customer offer lookup must be read-only'),
  runSQLQueryAccess: async (database, sql, params) => {
    calls.push({ database, sql, params });
    if (sql.includes('dbo.tblRechnung')) {
      assert.match(sql, /COALESCE\(k\.kd_InterCompany, 0\) = 0/);
      return (database.databaseName === 'BMS.POL' ? foreignInvoices : invoices).filter(row => !row.interCompany);
    }
    if (sql.includes('dbo.tblKun_Ansprech')) return [{ customerId: 'B', id: 71, name: 'Musterkontakt', email: 'b@example.invalid', language: 'de' }];
    if (sql.includes('dbo.tblLieferbedingungen')) return [{ id: 29, text: 'FCA / Frei Frachtführer' }];
    if (sql.includes('j.[value]=k.kd_KdNR')) return [...invoices, ...recordedAccounts].filter(row => JSON.parse(params[0]).includes(row.id));
    if (sql.includes('OPENJSON')) return candidates;
    if (sql.includes("ESCAPE N'~'")) return candidates;
    assert.match(sql, /a\.agA_Artikelindex=\?/);
    return target?.articleIndex === params[0] ? [target] : [];
  },
  runSQLQuerySqlServer: async (database, sql, params) => {
    calls.push({ database, sql, params });
    if (sql.includes('[md_FirmaName]')) return mandants;
    if (sql.includes('OptionArticleNameRule')) return nameRule ? [nameRule] : [];
    if (sql.includes('tblOptionenArtikelKandidaten')) {
      return stored ? [{ oak_DatenJson: JSON.stringify(stored), oak_oab_id: 25 }] : [];
    }
    assert.match(sql, /m\.CustomerNumber, m\.Status/);
    return accepted;
  },
} };
require.cache[require.resolve('../src/db/customer-access')] = { exports: {
  getCustomerAccessScope: async () => customerScope,
  buildCustomerScopeFilter: () => ({ whereSql: '', params: [] }),
} };
const { resolveOfferArticle, loadOptionOfferCustomers, loadCustomerOfferAudience } = require('../src/options/customer-offers');
const { buildOfferSubmissions, buildCustomerOfferSubmissions } = require('../src/options/offer-submission');

const owner = { sourceMandantId: 3 };
const sameDatabase = { firmaId: 3 };
const foreignDatabase = { firmaId: 8 };
const position = {
  id: 41, articleName: 'PPC 7600 OG', mfi: 12.3, snapshotId: '25',
  singleCandidateIndex: 'A-PP', matchProcessingStatus: 'ready',
};

test.beforeEach(() => {
  calls.length = 0;
  nameRule = null;
  target = catalogArticle;
  candidates = [];
  stored = { ...catalogArticle, articleHash: articleHash(catalogArticle) };
  customerScope = { shortCode: 'ADM', isMainTenant: true, isFullAccess: true };
  invoices = [{ id: 'A', name: 'Kunde A', salesCode: 'ADM' }, { id: 'B', name: 'Kunde B', salesCode: 'ADM' }];
  accepted = [{ CustomerNumber: 'a', Status: 'sent' }, { CustomerNumber: 'b', Status: 'submitted' }];
  mandants = [];
  foreignInvoices = [];
  recordedAccounts = [];
});

test('a global name rule resolves the catalog ID of the active mandant even before its snapshot', async () => {
  nameRule = { articleName: catalogArticle.articleName, articleIndex: null };
  candidates = [{ ...catalogArticle, articleIndex: 'OTHER-MANDANT' }];
  const unresolved = { ...position, matchProcessingStatus: 'pending' };
  assert.equal((await resolveOfferArticle(foreignDatabase, owner, unresolved)).articleIndex, 'OTHER-MANDANT');
  assert.equal(calls.find(call => call.sql.includes('OptionArticleNameRule')).params[0], 8);
  candidates.push({ ...catalogArticle, articleIndex: 'DUPLICATE' });
  assert.equal(await resolveOfferArticle(foreignDatabase, owner, unresolved), null);

  nameRule.articleIndex = 'LOCAL-OVERRIDE';
  target = { ...catalogArticle, articleIndex: 'LOCAL-OVERRIDE', articleName: 'PP Copo NT MFI 10 - 14,9 natur Sondername' };
  assert.equal((await resolveOfferArticle(foreignDatabase, owner, unresolved)).articleIndex, 'LOCAL-OVERRIDE');
  assert.equal(await resolveOfferArticle(foreignDatabase, owner, { ...unresolved, mfi: 50 }), null);
});

test('group buyers require a selected identity, merge matching buyers and keep foreign accounts read-only', async () => {
  mandants = [{ firmaId: 3, shortName: 'FRU' }, { firmaId: 5, shortName: 'POL' }];
  invoices[0].vat = 'DE123456789';
  foreignInvoices = [{ id: 'B', name: 'Kunde A GmbH', vat: 'DE123456789', salesCode: 'TPR' },
    { id: 'A', name: 'Kunde C', salesCode: 'HZI' },
    { id: 'B', name: 'Kunde B', name2: 'Wareneingang', salesCode: 'HZI' }];
  const identity = { active: true, personNumber: 130, shortCode: 'MFR', userId: 'm.frank' };
  const result = await loadCustomerOfferAudience(sameDatabase, identity, catalogArticle, 41, { group: true });
  assert.deepEqual(result.customers.map(({ id }) => id), ['A', 'B', 'POL:A']);
  assert.deepEqual(result.customers[0].assignments, [{ salesCode: 'ADM', mandant: 'FRU' }, { salesCode: 'TPR', mandant: 'POL' }]);
  assert.equal(result.customers[0].readOnly, false);
  assert.deepEqual(result.customers[1].assignments, [{ salesCode: 'ADM', mandant: 'FRU' }, { salesCode: 'HZI', mandant: 'POL' }]);
  assert.equal(result.customers[2].readOnly, true);
  assert.deepEqual(calls.find(call => call.database.databaseName === 'BMS.POL').params, [catalogArticle.articleName]);
  calls.length = 0;
  const restricted = await loadCustomerOfferAudience(sameDatabase, { ...identity, personNumber: 1 }, catalogArticle, 41, { group: true });
  assert.equal(restricted.customers.length, 2);
  assert.equal(calls.some(call => call.database.databaseName === 'BMS.POL'), false);
});

test('a stock offer uses the exact stock key and the same customer scope without option matching', async () => {
  const stockPositionKey = 'a'.repeat(64);
  const result = await loadCustomerOfferAudience(sameDatabase, {}, catalogArticle, stockPositionKey);
  assert.equal(result.article.index, 'A-PP');
  assert.equal(result.customers[0].sent, true);
  assert.equal(result.customers[1].queued, true);
  assert.equal(calls.length, 3);
  const buyerQuery = calls.find(call => call.sql.includes('dbo.tblRechnung'));
  const statusQuery = calls.find(call => call.sql.includes('m.CustomerNumber, m.Status'));
  assert.match(buyerQuery.sql, /k.kd_Aussendienst/);
  assert.deepEqual(buyerQuery.params, ['A-PP', 'ADM']);
  assert.match(statusQuery.sql, /m\.OptionPositionId IS NULL AND m\.StockPositionKey/);
  assert.deepEqual(statusQuery.params, [3, stockPositionKey]);
});

test('an existing option offer is merged with another mandant buyer after switching articles', async () => {
  mandants = [{ firmaId: 3, shortName: 'FRU' }, { firmaId: 5, shortName: 'POL' }];
  const identity = { active: true, personNumber: 130, shortCode: 'MFR', userId: 'm.frank' };
  invoices = [{ id: 'Z', name: 'Zeta', salesCode: 'ADM' }];
  recordedAccounts = [{ id: 'B', name: 'Beta', vat: 'DE123456789', salesCode: 'ADM' }];
  foreignInvoices = [{ id: 'FOREIGN', name: 'Beta GmbH', vat: 'DE123456789', salesCode: 'TPR' }];
  accepted = [{ CustomerNumber: 'B', Status: 'sent', OfferId: 101, OfferOwner: 'MFR' }];
  const { customers } = await loadCustomerOfferAudience(sameDatabase, identity, catalogArticle, 41, { group: true });
  assert.deepEqual(customers.map(customer => customer.id), ['B', 'Z']);
  assert.equal(customers[0].offerId, 101);
  assert.equal(customers[0].readOnly, true);
  assert.deepEqual(customers[0].assignments, [{ salesCode: 'ADM', mandant: 'FRU' }, { salesCode: 'TPR', mandant: 'POL' }]);
  assert.equal(Object.hasOwn(customers[0], 'vat'), false);
});

test('options and stock exclude intercompany customers and exact company names from the full mandant directory', async () => {
  mandants = [
    { name: 'Frupack', legalName: 'Frupack Plastic GmbH' },
    { name: 'Nordpoly', legalName: 'Nordpoly GmbH' },
    { name: 'Elbpolymer', legalName: 'Elbpolymer GmbH' },
  ];
  invoices.push(
    { id: 'I', name: 'Anderer Name im Kundenstamm', interCompany: true },
    { id: 'F', name: 'FRUPACK-Plastic', name2: 'GmbH' },
    { id: 'N', name: 'Nordpoly GmbH', name2: 'Rechnungsabteilung' },
    { id: 'E', name: 'Elbpolymer' },
    { id: 'C', name: 'Kunde C', name2: 'Siehe Frupack', salesCode: 'ADM' },
    { id: 'D', name: 'Frupack', name2: 'Trading Ltd', salesCode: 'ADM' },
  );
  const option = await loadOptionOfferCustomers(sameDatabase, {}, owner, position);
  const stock = await loadCustomerOfferAudience(sameDatabase, {}, catalogArticle, 'a'.repeat(64));
  assert.deepEqual(option.customers.map(customer => customer.id), ['A', 'B', 'C', 'D']);
  assert.deepEqual(stock.customers.map(customer => customer.id), ['A', 'B', 'C', 'D']);

  const req = {
    database: sameDatabase,
    userIdentity: { email: 'ad@example.invalid', fullName: 'Vertrieb', shortCode: 'ADM' },
    body: { customers: [{ customerId: 'E' }] },
  };
  await assert.rejects(() => buildOfferSubmissions(req, owner, position), /nicht verfügbar/);
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

test('the option audience exposes converted and declined offers for the matching customer', async () => {
  accepted[0].OfferStatus = 4;
  accepted[1].OfferStatus = 5;
  const { customers } = await loadOptionOfferCustomers(sameDatabase, {}, owner, position);
  assert.deepEqual(customers.map(({ id, offerStatus }) => [id, offerStatus]), [['A', 4], ['B', 5]]);
  assert.match(calls.find(call => call.sql.includes('OptionOfferMailOutbox')).sql,
    /h\.tag_id=m\.TempOfferId AND h\.tag_company_id=m\.CompanyId/);
});

test('option history exposes an offer link only with the offer detail permissions', async () => {
  Object.assign(accepted[0], { OfferId: 101, OfferOwner: 'NSC' });
  Object.assign(accepted[1], { OfferId: 102, OfferOwner: 'MFR' });
  const list = async (user) => (await loadOptionOfferCustomers(sameDatabase, { active: true, ...user }, owner,
    { ...position, singleCandidateIndex: null })).customers.map(customer => customer.offerId);
  assert.deepEqual(await list({ shortCode: 'NSC', personNumber: 227, userId: 'n.schroeder' }), [101, 102]);
  assert.deepEqual(await list({ shortCode: 'MFR', personNumber: 130, userId: 'm.frank' }), [undefined, 102]);
  assert.deepEqual(await list({ shortCode: 'KMU', personNumber: 126, userId: 'musah' }), [undefined, undefined]);
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
  accepted = [];
  const empty = { article: null, customers: [] };
  assert.deepEqual(await loadOptionOfferCustomers(sameDatabase, {}, owner, { ...position, matchProcessingStatus: 'updating' }), empty);
  assert.equal(calls.some(call => call.sql.includes('dbo.tblRechnung')), false);
  target = { ...catalogArticle, description: 'Updated catalog record' };
  assert.deepEqual(await loadOptionOfferCustomers(sameDatabase, {}, owner, position), empty);
  target = { ...catalogArticle, articleName: 'PP Copo NT MFI 1 - 2 natur' };
  assert.deepEqual(await loadOptionOfferCustomers(sameDatabase, {}, owner, { ...position, articleIndex: 'A-PP' }), empty);
  assert.equal(calls.some(call => call.sql.includes('dbo.tblRechnung')), false);
});

test('a removed name rule cannot match through an earlier OptionReader snapshot', async () => {
  stored = { ...stored, reason: 'Artikelname manuell bestätigt' };
  assert.equal(await resolveOfferArticle(sameDatabase, owner, position), null);
});

test('existing option offers are visible without any article match', async () => {
  accepted[0].OfferStatus = 5;
  const result = await loadOptionOfferCustomers(sameDatabase, {}, owner, { ...position, singleCandidateIndex: null });
  assert.equal(result.article, null);
  assert.deepEqual(result.customers.map(({ id, offerStatus, queued, readOnly }) => [id, offerStatus, queued, readOnly]),
    [['A', 5, false, true], ['B', undefined, true, true]]);
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
  accepted = [];
  assert.deepEqual(await loadOptionOfferCustomers(foreignDatabase, {}, owner, position), { article: null, customers: [] });
  target = candidates.at(-1);
  const selected = await loadOptionOfferCustomers(foreignDatabase, {}, owner, position, 'D-PP');
  assert.equal(selected.article.index, 'D-PP');
  assert.equal(selected.matched, false);
  assert.equal(calls.findLast(call => call.sql.includes('dbo.tblRechnung')).database, foreignDatabase);
});

test('option offers validate the buyer, contact and FCA location independently of ordered quantities', async () => {
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
  for (const remainingKg of [20000, 0]) {
    const [unrestricted] = await buildOfferSubmissions(req, owner, { ...position, remainingKg });
    assert.equal(unrestricted.quantityKg, 24750);
    assert.equal(unrestricted.availableQuantityKg, undefined);
  }
  await assert.rejects(() => buildCustomerOfferSubmissions(req, { stockPositionKey: 'stock', remainingKg: 20000 },
    () => loadCustomerOfferAudience(sameDatabase, userIdentity, catalogArticle, 'stock')), /Angebotsmenge/);
  await assert.rejects(() => buildOfferSubmissions({ ...req, body: { customers: [{ ...draft, pickup: '' }] } }, owner, position), /Ladeort/);
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
