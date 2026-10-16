const test = require('node:test');
const assert = require('node:assert/strict');
const planningModule = require('../src/db/temp-order-planning');

const databases = [{ firmaId: 3, name: 'Frupack' }, { firmaId: 10, name: 'FrupackNordic' },
  { firmaId: 11, name: 'FrupackBeNeLux' }, { firmaId: 12, name: 'FrupackFrance' }, { firmaId: 19, name: 'FrupackSweden' }];
let queries;
let failedTenant;
let permitted;
const row = (id, mfi) => ({ Artikel: 'Shared PP', Lagerort: 'Warehouse', 'Bestell-Pos': `${id}-01-26-001-01`,
  Kunststoff: 'PP', Kunststoff_Untergruppe: 'Copo', beP_Artikelindex: '100', masterArticleName: 'Shared PP',
  beP_MFI: mfi, Menge: 30, bePR_Anzahl: 2, bePL_LagerID: 'L1' });
const rows = { 3: [row(3, 10)], 10: [row(10, 2)], 11: [], 12: [], 19: [] };

require.cache[require.resolve('../src/db/access')] = { exports: {
  runSQLQueryAccess: async (database, sql, params) => {
    queries.push({ id: database.firmaId, sql, params });
    if (failedTenant === database.firmaId) throw new Error('Unavailable');
    if (sql.includes('tblBest_Pos_WPZ')) return [{ bePZ_ID: 79, bePZ_BEposID: `${database.firmaId}-01-26-001-01` }];
    if (sql.includes('COUNT(*)')) return [{ total: rows[database.firmaId].length }];
    return rows[database.firmaId];
  },
} };
require.cache[require.resolve('../src/db/databases')] = { exports: {
  getMandantsForIdentity: async () => permitted,
  getDatabaseConnectionForCompanyId: async (id) => databases.find((database) => database.firmaId === Number(id)),
  getDatabaseConnectionForIdentityById: async (identity, id) => {
    const match = permitted.find((database) => database.firmaId === Number(id));
    if (!match) throw Object.assign(new Error('Forbidden tenant'), { status: 403 });
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
const employee = { shortCode: 'DRE', userId: 'employee', mainCompanyId: 3, active: true };

function reset() { queries = []; failedTenant = null; permitted = databases; }
function request(path, query = {}, identity = pilot, method = 'get', body = {}) {
  const route = router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]).route;
  return new Promise((resolve, reject) => {
    const req = { query, params: { id: 'Shared PP||Warehouse||10-01-26-001-01||PP||Copo' }, body, userIdentity: identity, mandant: 'Frupack', database: databases[0] };
    const res = { status: () => res, json: resolve };
    route.stack.at(-1).handle(req, res, reject);
  });
}

test('both list routes reject other companies and inactive Frupack employees before any tenant query', async () => {
  reset();
  for (const path of ['/products', '/products/grouped']) {
    for (const identity of [{ mainCompanyId: 2, active: true }, { mainCompanyId: 3, active: false }]) {
      await assert.rejects(request(path, { vlScope: 'frupack-group' }, identity), { status: 403 });
    }
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
  assert.deepEqual(page1.meta.viewMandants.map((mandant) => mandant.id), [3, 10, 11, 12, 19]);
});

test('grouped lists preserve both tenants and share the parsed search', async () => {
  reset();
  const response = await request('/products/grouped', { vlScope: 'frupack-group', q: 'Shared' });
  assert.equal(response.meta.totalGroups, 2);
  assert.equal(response.meta.totalPositions, 2);
  assert.deepEqual(response.data.map((group) => group.positions[0].availableAmount), [23, 20]);
  assert.deepEqual(queries.map((query) => query.id), [3, 10, 11, 12, 19]);
  assert.equal(response.meta.search.conditions[0].value, 'Shared');
  const filtered = await request('/products/grouped', { vlScope: 'frupack-group', q: 'shared mfi 1 to 3' });
  assert.equal(filtered.meta.totalGroups, 1);
  assert.equal(filtered.meta.totalPositions, 1);
  assert.equal(filtered.data[0].positions[0].sourceMandantId, 10);
  assert.equal(filtered.data[0].positions[0].searchMatch.matches[0].min, 2);
});

test('classic and grouped searches filter all positions before totals and pagination in every scope', async () => {
  reset();
  for (const scope of [{}, { vlMandantId: '3' }, { vlScope: 'frupack-group' }]) {
    for (const path of ['/products', '/products/grouped']) {
      const result = await request(path, { ...scope, q: 'shared mfi 9-11', pageSize: 1 });
      assert.equal(result.meta.total, 1);
      const item = path.endsWith('grouped') ? result.data[0].positions[0] : result.data[0];
      assert.equal(item.sourceMandantId, 3);
      assert.equal(item.availableAmount, 23);
    }
  }
});

test('a matching position beyond the first unfiltered page remains findable', async () => {
  reset();
  const original = rows[3];
  rows[3] = Array.from({ length: 130 }, (_, index) => ({ ...row(3, index), 'Bestell-Pos': `3-${index}`, beP_Artikelindex: String(index), masterArticleName: `Article ${index}` }));
  try {
    for (const path of ['/products', '/products/grouped']) {
      const response = await request(path, { q: 'mfi 120-125', page: 2, pageSize: 2 });
      assert.equal(response.meta.total, 6);
      assert.equal(response.data.length, 2);
    }
    const response = await request('/products', { q: 'mfi 120-125', sort: 'vl', page: 2, pageSize: 2 });
    assert.deepEqual(response.data.map((item) => item.mfi), [122, 123]);
  } finally { rows[3] = original; }
});

test('a tenant outage fails the group as a whole without the generic tenant-switch error', async () => {
  reset(); failedTenant = 10;
  await assert.rejects(request('/products', { vlScope: 'frupack-group' }), (error) =>
    error.status === 503 && error.details.code === 'FRUPACK_GROUP_UNAVAILABLE');
});

test('Frupack employees see the full group even with only their own ordinary tenant assignment', async () => {
  reset(); permitted = [databases[0]];
  const group = await request('/products', { vlScope: 'frupack-group' }, employee);
  assert.equal(group.meta.total, 2);
  assert.deepEqual(queries.map((query) => query.id), [3, 10, 11, 12, 19]);
  await assert.rejects(request('/products', { vlMandantId: '10' }, employee), { status: 403 });
  const single = await request('/products', { vlMandantId: '3', sort: 'vl' });
  assert.equal(single.meta.viewMandantId, 3);
  assert.equal(single.data[0].sourceMandantId, 3);
});

test('group details require a concrete source and foreign reservations stay blocked', async () => {
  reset();
  await assert.rejects(request('/products/:id', { vlScope: 'frupack-group' }), { status: 400 });
  await assert.rejects(request('/products/reserve', { vlScope: 'frupack-group' }, employee, 'post', {
    beNumber: '10-01-26-001-01', warehouseId: 'L1', amount: 1,
    reservationEndDate: '2026-11-01', sourceMandantId: 10,
  }), (error) => error.status === 403 && error.details.code === 'FOREIGN_VL_READ_ONLY');
  assert.equal(queries.length, 0);
});

test('group detail and WPZ reads include unassigned Frupacks without opening other companies or unscoped reads', async () => {
  reset(); permitted = [databases[0]];
  const source = { vlScope: 'frupack-group', vlMandantId: '10' };
  const detail = await request('/products/:id', source, employee);
  assert.equal(detail.data.sourceMandantId, 10);
  const wpz = await request('/products/:id/wpz', source, employee);
  assert.equal(wpz.data.wpzId, 79);
  assert.equal(wpz.meta.viewMandantId, 10);
  assert.deepEqual(queries.map((query) => query.id), [10, 10]);
  await assert.rejects(request('/products/:id', { vlMandantId: '10' }, employee), { status: 403 });
  await assert.rejects(request('/products/:id', { ...source, vlMandantId: '2' }, employee), { status: 403 });
  await assert.rejects(request('/products/:id/wpz', source, { active: true, mainCompanyId: 2 }), { status: 403 });
  await assert.rejects(request('/products/:id', source, { active: false, mainCompanyId: 3 }), { status: 403 });
  assert.equal(queries.length, 2);
});
