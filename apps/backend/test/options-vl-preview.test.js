const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const databases = [3, 10, 11, 12, 19].map(firmaId => ({ firmaId, name: `Mandant ${firmaId}` }));
const pilot = { shortCode: 'NSC', personNumber: 227, userId: 'n.schroeder', active: true };
let identity = pilot, reads = [], allowed = [3], capturedOptions, writes = [], migrationAvailable = true;
const stock = (id, mfi) => ({ Artikel: 'LDPE stock', Kunststoff: 'PE', Kunststoff_Untergruppe: 'LDPE',
  Lagerort: 'A', 'Bestell-Pos': `3-01-26-${id}`, beP_MFI: mfi, Menge: 2000, bePR_Anzahl: 0 });
const articles = [{ articleIndex: '00417', articleName: 'LDPE MFI 2-3,99 natur', mfi: 2, polymerCategory: 'PE', polymerSubCategory: 'LDPE' }];
const { articleHash } = require('../src/options/matching-contract');
const position = { id: 602, articleName: 'LDPE near to prime', mfi: 3, expired: true, validUntil: '2026-09-01',
  plastic: 'PE', plasticSubCategory: 'LDPE', snapshotId: '1', candidateCount: 1,
  quantityMinKg: null, quantityMaxKg: null, quantityUnit: 'truckload', quantityMin: 1, quantityMax: 1 };
const currentPosition = { ...position, id: 604, articleName: 'LDPE current option', mfi: 4, expired: false, validUntil: '2026-12-01' };
const offers = [{ id: 197, sourceMandantId: 3, supplierName: 'Longfield', supplierKey: 'longfield', positions: [position, currentPosition] }];
require.cache[require.resolve('../src/middlewares/mandant.middleware')] = { exports: {
  requireMandant: (req, res, next) => { Object.assign(req, { userIdentity: identity, database: databases[0], mandant: 'Mandant 3' }); next(); },
} };
require.cache[require.resolve('../src/db/access')] = { exports: {
  runSQLQueryAccess: async (database, sql, params) => {
    reads.push(database.firmaId);
    if (sql.includes('FROM [dbo].[tblArt_Artikel]')) return articles.filter(article => article.articleIndex === params[0]);
    return database.firmaId === 3 ? [stock('1', 1), stock('2', 5)] : [];
  },
  runSQLQuerySqlServer: async (database, sql, params) => {
    if (sql.includes('SELECT p.opp_id AS id')) {
      const offer = offers.find(o => o.id === Number(params[0]) && o.sourceMandantId === Number(params[2]));
      const found = offer?.positions.find(p => p.id === Number(params[1]));
      return found ? [{ ...found, supplierName: offer.supplierName,
        originalChanged: '2026-10-19T08:00:00.0000000', snapshotChanged: '2026-10-19T08:00:00.0000000' }] : [];
    }
    if (sql.includes('COL_LENGTH')) return [{ available: migrationAvailable ? 1 : null }];
    return [];
  },
  withSqlTransaction: async (database, action) => action({ query: async (sql, params) => {
    assert.equal((sql.match(/\?/g) || []).length, params.length);
    writes.push({ sql, params }); return { rowsAffected: [1] };
  } }),
} };
require.cache[require.resolve('../src/db/databases')] = { exports: {
  getDatabaseConnectionForCompanyId: async id => databases.find(d => d.firmaId === Number(id)),
  getDatabaseConnectionForIdentityById: async (user, id) => {
    if (!allowed.includes(Number(id))) throw Object.assign(new Error('Forbidden'), { status: 403 });
    return databases.find(d => d.firmaId === Number(id));
  },
} };
const planning = require('../src/db/temp-order-planning');
require.cache[require.resolve('../src/db/temp-order-planning')] = { exports: { ...planning, loadTempOrderPlanning: async () => new Map() } };
require.cache[require.resolve('../src/options/read')] = { exports: {
  loadOffers: async (companyIds, options = {}) => {
    capturedOptions = { companyIds, ...options };
    return offers.filter(o => (!companyIds || companyIds.includes(o.sourceMandantId)) && (!options.optionId || o.id === options.optionId))
      .map(offer => ({ ...offer, positions: offer.positions.filter(item => options.includeExpired || !item.expired) }))
      .filter(offer => offer.positions.length);
  },
} };
require.cache[require.resolve('../src/options/matching-service')] = { exports: {
  candidatesFor: async () => ({ data: [], total: 0 }), articleByIndex: async (database, index) => articles.find(a => a.articleIndex === index),
  storedCandidate: async () => migrationAvailable ? { articleIndex: articles[0].articleIndex, articleHash: articleHash(articles[0]), conflicts: [], snapshotId: '1' } : null,
  requestRecalculation: async () => {},
} };
const app = express(); app.use(express.json());
app.use(require('../src/routes/products.routes'));
app.use(require('../src/routes/options.routes'));
app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
let server, base;
test.before(async () => { server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); }); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => new Promise(resolve => server.close(resolve)));
test.beforeEach(() => { identity = pilot; reads = []; allowed = [3]; writes = []; migrationAvailable = true; });

test('pilot union excludes expired options before pagination and returns current positions once', async () => {
  const first = await (await fetch(`${base}/vl/entries?pageSize=2`)).json();
  const second = await (await fetch(`${base}/vl/entries?pageSize=2&page=2`)).json();
  assert.equal(first.meta.total, 3);
  assert.deepEqual([...first.data, ...second.data].map(row => row.mfi), [1, 4, 5]);
  assert.equal(first.data[1].kind, 'option');
  assert.equal(first.data[1].optionPositionId, 604);
  assert.equal(first.data[1].option.expired, false);
  assert.equal(first.data[1].availableAmount, null);
  assert.equal(capturedOptions.includeExpired, false);
  assert.equal(first.meta.includeExpired, false);
});
test('ordinary users and reused pilot short codes cannot call the preview endpoint', async () => {
  for (const user of [{ shortCode: 'TST', active: true, mainCompanyId: 3 }, { ...pilot, userId: 'other' }, { ...pilot, active: false }]) {
    identity = user;
    assert.equal((await fetch(`${base}/vl/entries`)).status, 403);
  }
  assert.deepEqual(reads, []);
});
test('all three verified identities receive preview access', async () => {
  for (const [shortCode, personNumber, userId] of [['AKI',1,'kimaz'],['NSC',227,'n.schroeder'],['MFR',130,'m.frank']]) {
    identity = { shortCode, personNumber, userId, active: true };
    assert.equal((await fetch(`${base}/vl/entries`)).status, 200);
  }
});
test('search filters options with the same MFI parser as stock before computing totals', async () => {
  const response = await (await fetch(`${base}/vl/entries?q=${encodeURIComponent('ldpe mfi 2 to 4')}`)).json();
  assert.equal(response.meta.total, 1);
  assert.equal(response.data[0].optionPositionId, 604);
});
test('group preview scopes stocks while shared option details ignore the selected VL tenant', async () => {
  const response = await (await fetch(`${base}/vl/entries?vlScope=frupack-group`)).json();
  assert.equal(response.meta.viewMandants.length, 5);
  assert.equal(response.data.filter(row => row.kind === 'option').length, 1);
  assert.deepEqual(reads, [3,10,11,12,19]);
  assert.equal((await fetch(`${base}/options/197?preview=1&vlScope=frupack-group&vlMandantId=99`)).status, 200);
  assert.equal((await fetch(`${base}/options/197?preview=1&vlMandantId=10`)).status, 200);
});
test('preview can read expired positions from the shared pool', async () => {
  const response = await (await fetch(`${base}/options/197?preview=1&vlMandantId=3`)).json();
  assert.equal(response.data.positions[0].id, 602);
  assert.equal(response.data.readOnly, false);
  assert.equal(capturedOptions.includeExpired, true);
  assert.equal(capturedOptions.optionId, 197);
});

test('foreign group details are read only and cannot be assigned through an active-tenant write', async () => {
  offers.push({ id: 198, sourceMandantId: 10, supplierName: 'Longfield', positions: [{ ...position, id: 603 }] });
  try {
    const response = await (await fetch(`${base}/options/198?preview=1&vlMandantId=10&vlScope=frupack-group`)).json();
    assert.equal(response.data.readOnly, true);
    assert.equal(response.data.sourceMandantId, 10);
    assert.equal((await fetch(`${base}/options/198/positions/603/article`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ articleIndex: '00417' }) })).status, 404);
  } finally { offers.pop(); }
});

test('shared options appear once in every VL scope while stocks retain their authorized source', async () => {
  offers.push({ id: 199, sourceMandantId: 2, supplierName: 'Borealis', positions: [{ ...currentPosition, id: 605 }] });
  try {
    for (const suffix of ['', '?vlScope=frupack-group']) {
      reads = [];
      const result = await (await fetch(`${base}/vl/entries${suffix}`)).json();
      const shared = result.data.filter(row => row.kind === 'option' && row.optionId === 199);
      assert.equal(shared.length, 1);
      assert.equal(shared[0].sourceMandantId, 2);
      assert.equal(shared[0].id, 'option:2:199:605');
      assert.equal(capturedOptions.companyIds, null);
      assert.ok(!reads.includes(2));
    }
  } finally { offers.pop(); }
});

test('mLLDPE preserves its stored VL subgroup without loading the article catalog', () => {
  const { buildOptionEntries } = require('../src/options/vl-preview');
  const entries = buildOptionEntries([{ id: 1, supplierName: 'INEOS', positions: [{ id: 2, articleName: 'mLLDPE OG', articleIndex: '008', mfi: 17,
    plastic: 'PE', plasticSubCategory: 'mLLDPE' }] }], databases[0]);
  assert.equal(entries[0].plasticSubCategory, 'mLLDPE');
});

test('own assignment persists the decision and queues Reader learning in one transaction', async () => {
  const response = await fetch(`${base}/options/197/positions/602/article`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ articleIndex: '00417', acknowledgeUnverifiedMfi: true }) });
  assert.equal(response.status, 200);
  assert.equal(writes.length, 2);
  assert.match(writes[1].sql, /UPDLOCK,HOLDLOCK/);
  assert.match(writes[1].sql, /opp_LernenAngefordert=1/);
  assert.match(writes[0].sql, /tblOptionenAbgleichAuftrag/);
  assert.equal(writes[0].params[0], 3);
});

test('missing stored proposal queues recalculation before any assignment is saved', async () => {
  migrationAvailable = false;
  const response = await fetch(`${base}/options/197/positions/602/article`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ articleIndex: '00417' }) });
  assert.equal(response.status, 409);
  assert.equal(writes.length, 0);
});
