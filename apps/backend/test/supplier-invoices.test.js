const test = require('node:test');
const assert = require('node:assert/strict');
const calls = [];
require.cache[require.resolve('../src/db/access')] = { exports: {
  runSQLQueryAccess: async (database, sql, params) => {
    calls.push({ sql, params });
    assert.equal((sql.match(/\?/g) || []).length, params.length);
    if (sql.includes('FROM [dbo].[tblKun_Lieferanten]')) return [{ supplierNumber: 'TOTAL' }];
    if (sql.includes('AS positionNumber')) return [
      { receiptId: 1, orderNumber: 'BE-1', positionNumber: 'BE-1-01', articleIndex: 'A', article: 'Old supplier name', supplierArticleName: 'Supplier grade', masterArticleName: 'Internal name' },
      { receiptId: 1, orderNumber: 'BE-1', positionNumber: 'BE-1-02', articleIndex: 'A', article: 'Old supplier name', supplierArticleName: 'Supplier grade', masterArticleName: 'Internal name' },
    ];
    if (sql.includes('AS receiptId')) return [{ receiptId: 1, invoiceNumber: 'RG-1', supplierNumber: 'TOTAL', invoiceDate: '2026-10-29', grossEu: 50 }];
    throw new Error(`Unexpected SQL ${sql}`);
  }, runSQLQuerySqlServer: async () => [], runSQLQueryFx: async () => [],
} };
require.cache[require.resolve('../src/db/customer-access')] = { exports: {
  getCustomerAccessScope: async () => ({}), loadVisibleCustomer: async () => ({ kd_KdNR: 'TOTAL' }), loadVisibleSupplierCustomer: async () => null,
} };
const router = require('../src/routes/customers.routes');
const handler = router.stack.find(layer => layer.route?.path === '/customers/:id/supplier-invoices').route.stack.at(-1).handle;
test('supplier invoices use incoming documents only and keep supplier/date/status boundaries on the BE/material links', async () => {
  const result = await new Promise((resolve, reject) => handler({ params: { id: 'TOTAL' }, query: { scope: 'year', year: '2026' }, database: { firmaId: 3 } },
    { status() { return this; }, json: resolve }, reject));
  const invoice = result.data[0];
  assert.deepEqual(invoice.orderNumbers, ['BE-1']);
  assert.deepEqual(invoice.positionNumbers, ['BE-1-01', 'BE-1-02']);
  assert.equal(invoice.materials.length, 1);
  assert.equal(invoice.materials[0].article, 'Supplier grade');
  assert.equal(invoice.invoiceNumber, 'RG-1');
  const links = calls.find(call => call.sql.includes('AS positionNumber'));
  assert.match(links.sql, /\[be_EinAus\]=2/);
  assert.match(links.sql, /\[b\]\.\[be_KdNr\]=\[x\]\.\[be_Firma_KdNR\]/);
  assert.match(links.sql, /beP_LiefRGnr/);
  assert.match(links.sql, /beP_LieferantRG/);
  assert.deepEqual(links.params, ['TOTAL', 2026, 2027]);
});
