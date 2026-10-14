const test = require('node:test');
const assert = require('node:assert/strict');
const planningModule = require('../src/db/temp-order-planning');

const databases = [{ firmaId: 3, name: 'Frupack' }, { firmaId: 10, name: 'FrupackNordic' }];
let queries;
let failedTenant;
let permitted;
const row = (id, mfi) => ({ Artikel: 'Shared PP', Lagerort: 'Warehouse', 'Bestell-Pos': `${id}-01-26-001-01`,
  Kunststoff: 'PP', Kunststoff_Untergruppe: 'Copo', beP_Artikelindex: '100', masterArticleName: 'Shared PP',
  beP_MFI: mfi, Menge: 30, bePR_Anzahl: 2, bePL_LagerID: 'L1' });
const rows = { 3: [row(3, 10)], 10: [row(10, 2)] };

require.cache[require.resolve('../src/db/access')] = { exports: {
  runSQLQueryAccess: async (database, sql, params) => {
    queries.push({ id: database.firmaId, sql, params });
    if (failedTenant === database.firmaId) throw new Error('Unavailable');
    if (sql.includes('COUNT(*)')) return [{ total: rows[database.firmaId].length }];
    return rows[database.firmaId];
  },
} };
require.cache[require.resolve('../src/db/databases')] = { exports: {
  getMandantsForIdentity: async () => permitted,
  getDatabaseConnectionForIdentityById: async (identity, id) => {
    const match = permitted.find((database) => database.firmaId === Number(id));
    if (!match) throw new Error('Forbidden tenant');
    return match;
  },
} };
require.cache[require.resolve('../src/db/temp-order-planning')] = { exports: {
  ...planningModule,
  loadTempOrderPlanning: async ({ companyId, keys }) => planningModule.mapTempOrderPlanningRows(keys.map((key) => ({
    ...key, amountInKg: companyId === 3 ? 5 : 8, ownerShortCode: 'NSC',
  })), 'NSC'),
} };
const router = require('../src/routes/products.routes');
const pilot = { shortCode: 'NSC', personNumber: 227, userId: 'n.schroeder', active: true };

function reset() { queries = []; failedTenant = null; permitted = databases; }
function request(path, query = {}, identity = pilot, method = 'get', body = {}) {
  const route = router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]).route;
  return new Promise((resolve, reject) => {
    const req = { query, params: { id: 'id' }, body, userIdentity: identity, mandant: 'Frupack', database: databases[0] };
    const res = { status: () => res, json: resolve };
    route.stack.at(-1).handle(req, res, reject);
  });
}

test('both actual list routes reject direct group requests from non-pilot users before any tenant query', async () => {
  reset();
  for (const path of ['/products', '/products/grouped']) {
    await assert.rejects(request(path, { vlScope: 'frupack-group' }, { shortCode: 'DRE', active: true }), { status: 403 });
  }
  assert.equal(queries.length, 0);
});

test('classic group pagination spans tenants and planning is charged to each source', async () => {
  reset();
  const page1 = await request('/products', { vlScope: 'frupack-group', pageSize: 1, page: 1 });
  const page2 = await request('/products', { vlScope: 'frupack-group', pageSize: 1, page: 2 });
  assert.equal(page1.meta.total, 2);
  assert.equal(page1.data[0].sourceMandantId, 10);
  assert.equal(page1.data[0].availableAmount, 20);
  assert.equal(page2.data[0].sourceMandantId, 3);
  assert.equal(page2.data[0].availableAmount, 23);
  assert.notEqual(page1.data[0].positionKey, page2.data[0].positionKey);
  assert.deepEqual(page1.meta.viewMandants.map((mandant) => mandant.id), [3, 10]);
});

test('grouped lists preserve both tenants and apply search to every source query', async () => {
  reset();
  const response = await request('/products/grouped', { vlScope: 'frupack-group', q: 'Shared' });
  assert.equal(response.meta.totalGroups, 2);
  assert.equal(response.meta.totalPositions, 2);
  assert.deepEqual(response.data.map((group) => group.positions[0].availableAmount), [23, 20]);
  assert.deepEqual(queries.map((query) => query.id), [3, 10]);
  assert.ok(queries.every((query) => query.params.includes('%Shared%')));
});

test('a tenant outage fails the group as a whole without the generic tenant-switch error', async () => {
  reset(); failedTenant = 10;
  await assert.rejects(request('/products', { vlScope: 'frupack-group' }), (error) =>
    error.status === 503 && error.details.code === 'FRUPACK_GROUP_UNAVAILABLE');
});

test('the group reads only authorized members and ordinary single-tenant VL still works', async () => {
  reset(); permitted = [databases[0]];
  const group = await request('/products', { vlScope: 'frupack-group' });
  assert.equal(group.meta.total, 1);
  assert.deepEqual(queries.map((query) => query.id), [3]);
  const single = await request('/products', { vlMandantId: '3', sort: 'vl' });
  assert.equal(single.meta.viewMandantId, 3);
  assert.equal(single.data[0].sourceMandantId, 3);
});

test('group markers cannot be used for product details and foreign reservations stay blocked', async () => {
  reset();
  await assert.rejects(request('/products/:id', { vlScope: 'frupack-group' }), { status: 400 });
  await assert.rejects(request('/products/reserve', {}, pilot, 'post', {
    beNumber: '10-01-26-001-01', warehouseId: 'L1', amount: 1,
    reservationEndDate: '2026-11-01', sourceMandantId: 10,
  }), (error) => error.status === 403 && error.details.code === 'FOREIGN_VL_READ_ONLY');
  assert.equal(queries.length, 0);
});
