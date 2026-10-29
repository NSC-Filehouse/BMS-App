const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { supplierKey } = require('../src/options/supplier-identity');
const pilot = { shortCode: 'NSC', personNumber: 227, userId: 'n.schroeder', active: true };
let identity = pilot, company = 2, visible = true, reads = [], deletes = [];
const offers = [
  { id: 1, supplierKey: 'totalenergies', supplierName: 'TotalEnergies', sourceMandantId: 3, positions: [{ id: 10 }] },
  { id: 2, supplierKey: 'totalenergies', supplierName: 'Total Petrochemicals', sourceMandantId: 19, positions: [{ id: 20 }] },
  { id: 3, supplierKey: 'borealis', supplierName: 'Borealis', sourceMandantId: 3, positions: [{ id: 30 }] },
];
require.cache[require.resolve('../src/middlewares/mandant.middleware')] = { exports: {
  requireMandant: (req, res, next) => { Object.assign(req, { userIdentity: identity, database: { firmaId: company }, mandant: String(company) }); next(); },
} };
require.cache[require.resolve('../src/db/customer-access')] = { exports: {
  getCustomerAccessScope: async () => ({}),
  loadVisibleCustomer: async (_db, id) => visible ? ({ kd_KdNR: id, kd_Name1: id === 'B' ? 'Borealis GmbH' : 'Total Petrochemicals & Refining SA/NV' }) : null,
  loadVisibleSupplierCustomer: async () => null,
} };
require.cache[require.resolve('../src/db/access')] = { exports: {
  runSQLQueryAccess: async () => { throw new Error('Unexpected ERP read'); },
  runSQLQuerySqlServer: async (_database, sql, params) => {
    if (sql.startsWith('UPDATE')) { deletes.push({ sql, params }); return [{ id: params[2] }]; }
    return [];
  }, runSQLQueryFx: async () => [], canConnectToDatabase: async () => false,
} };
require.cache[require.resolve('../src/options/read')] = { exports: {
  loadOffers: async (ids, options = {}) => {
    reads.push({ ids, options });
    return offers.filter(offer => (!ids || ids.includes(offer.sourceMandantId)) && (!options.optionId || offer.id === options.optionId));
  },
} };
const app = express();
app.use(require('../src/routes/customers.routes'));
app.use(require('../src/routes/options.routes'));
app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
let server, base;
test.before(async () => { server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); }); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => new Promise(resolve => server.close(resolve)));
test.beforeEach(() => { identity = pilot; company = 2; visible = true; reads = []; deletes = []; });

test('different Total account numbers and active mandants see all Total sources, never Borealis', async () => {
  for (const active of [0, 2, 3, 19]) {
    company = active;
    const response = await fetch(`${base}/customers/TOTAL-${active}/options`);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data.map(offer => offer.id), [1, 2]);
  }
  assert.ok(reads.every(read => read.ids === null));
  assert.deepEqual((await (await fetch(`${base}/customers/B/options`)).json()).data.map(offer => offer.id), [3]);
});
test('global list and direct detail work without access to the source ERP tenant', async () => {
  assert.equal((await (await fetch(`${base}/options`)).json()).data.length, 3);
  const response = await fetch(`${base}/options/2`);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.data.sourceMandantId, 19);
  assert.equal(result.data.readOnly, true); // Source-specific ERP article operations stay separate.
  assert.equal(result.meta.sharedOptions, true);
  assert.equal((await fetch(`${base}/options/999`)).status, 404);
});
test('supplier visibility and pilot access are still enforced before any shared read', async () => {
  visible = false;
  assert.equal((await fetch(`${base}/customers/T/options`)).status, 404);
  assert.equal(reads.length, 0);
  visible = true; identity = { ...pilot, userId: 'other' };
  for (const url of ['/options', '/options/2', '/customers/T/options']) assert.equal((await fetch(base + url)).status, 403);
  assert.equal(reads.length, 0);
});
test('removing a shared option does not depend on the currently selected mandant', async () => {
  assert.equal((await fetch(`${base}/options/2`, { method: 'DELETE' })).status, 204);
  assert.deepEqual(deletes[0].params.slice(2), [2]);
  assert.doesNotMatch(deletes[0].sql, /op_MandantID=/);
});
test('supplier identities normalize family names but do not confuse a reseller with the producer', () => {
  for (const name of ['Total', 'TotalEnergies', 'Total Petrochemicals & Refining SA/NV']) assert.equal(supplierKey(name), 'totalenergies');
  assert.equal(supplierKey('Acme Chemicals GmbH', 'sales@totalenergies.com'), 'acmechemicals');
  assert.equal(supplierKey('Frupack Plastic GmbH', 'employee@frupack.de'), 'unknown');
  assert.equal(supplierKey('Unbekannter Lieferant', 'sales@totalenergies.com'), 'totalenergies');
  assert.equal(supplierKey('Hanwha TotalEnergies Petrochemical Co., LTD'), 'hanwha-totalenergies');
  assert.equal(supplierKey('Hanwha Total Petrochemical Co., Ltd'), 'hanwha-totalenergies');
  assert.equal(supplierKey('', 'hanwha-totalenergies'), 'hanwha-totalenergies');
  assert.notEqual(supplierKey('Total-Chem Sp. z o.o.'), 'totalenergies');
  assert.equal(supplierKey('Müller Chemicals GmbH & Co. KG'), supplierKey('Müller Chemicals Ltd'));
});
