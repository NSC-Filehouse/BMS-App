const test = require('node:test');
const assert = require('node:assert/strict');
const calls = [];
require.cache[require.resolve('../src/db/access')] = { exports: {
  runSQLQueryAccess: async (_database, sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('AS supplierNumber')) return [{ supplierNumber: '42' }];
    if (sql.includes('AS purchasePricePerTonneEu')) return [
      { articleIndex: 'A', article: 'Neuster Einkaufsname', amount: 100, unit: 'kg', orderDate: '2026-10-28', deliveryDate: '2026-11-05', purchasePricePerTonneEu: 900 },
      { articleIndex: 'A', article: 'Alter Name', amount: 200, unit: 'kg', orderDate: '2025-01-01', purchasePricePerTonneEu: 700 },
      { articleIndex: 'B', article: 'Weiterer Artikel', amount: 300, unit: 'kg', orderDate: '2026-10-27', purchasePricePerTonneEu: 800 },
    ];
    if (sql.includes('AS masterArticleName') && !sql.includes('FROM (')) return [{ articleIndex: 'A', masterArticleName: 'Unsere Artikelbezeichnung', supplierArticleName: 'Lieferantenbezeichnung' }];
    if (sql.includes('AS [supplierOrder]')) {
      assert.match(sql, /\[supplierPosition\]\.\[beP_BEposID\] = \[availability\]\.\[Bestell-Pos\]/);
      assert.match(sql, /WHERE \[supplierOrder\]\.\[be_KdNr\] IN/);
      assert.deepEqual(params, ['42']);
      return [{ articleIndex: 'A', article: 'Alter Name', amount: 1000, unit: 'kg', reserved: 50, warehouse: 'Hamburg', warehouseId: '1', beNumber: 'BE-AKTUELL', plastic: '', plasticSubCategory: '' }];
    }
    throw new Error(`Unexpected supplier query ${sql}`);
  },
  runSQLQuerySqlServer: async () => [], runSQLQueryFx: async () => [], canConnectToDatabase: async () => false, withSqlTransaction: async () => { throw new Error('Unexpected write'); },
} };
require.cache[require.resolve('../src/db/customer-access')] = { exports: {
  getCustomerAccessScope: async () => ({}), loadVisibleCustomer: async () => ({ kd_KdNR: '42' }), loadVisibleSupplierCustomer: async () => null,
} };
require.cache[require.resolve('../src/db/temp-order-planning')] = { exports: {
  loadTempOrderPlanning: async () => ({}), getTempOrderPlanningEntry: () => ({ totalAmountKg: 25, otherAmountKg: 0, byOwner: [] }),
} };
const router = require('../src/routes/customers.routes');
const handler = router.stack.find((layer) => layer.route?.path === '/customers/:id/procured-articles').route.stack.at(-1).handle;

test('deduplicates historical spellings before grouping and links the actual supplier VL stock', async () => {
  const result = await new Promise((resolve, reject) => handler({ params: { id: '42' }, query: {}, database: { firmaId: 1 }, userIdentity: {} }, { status() { return this; }, json: resolve }, reject));
  const articles = result.data.flatMap((group) => group.articles);
  assert.equal(articles.length, 2);
  const article = articles.find((item) => item.articleIndex === 'A');
  assert.equal(article.article, 'Unsere Artikelbezeichnung');
  assert.equal(article.lastPurchaseArticle, 'Neuster Einkaufsname');
  assert.equal(article.supplierArticleName, 'Lieferantenbezeichnung');
  assert.equal(article.amount, 300);
  assert.equal(article.purchasePricePerTonne, 900);
  assert.equal(article.availablePositions.length, 1);
  assert.equal(article.availablePositions[0].beNumber, 'BE-AKTUELL');
  assert.equal(article.availablePositions[0].availableAmount, 925);
  assert.equal(articles.find((item) => item.articleIndex === 'B').availablePositions.length, 0);
  assert.equal(calls.filter((call) => call.sql.includes('AS [supplierOrder]')).length, 1);
});
