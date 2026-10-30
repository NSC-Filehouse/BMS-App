const test = require('node:test');
const assert = require('node:assert/strict');

const row = {
  beNumber: '3-02-26-123-01', warehouseId: 'LG0031', articleIndex: 'A-123',
  article: 'PPR 10232 natur Total', warehouse: 'Hamburg', plastic: 'PP', plasticSubCategory: 'Random',
  price: 1250, unit: 'kg', amount: 24750, reserved: 12000, reserveAmount: 10000,
  reservationDate: '2026-11-10T00:00:00.000Z', reservedBy: 'NSC',
};
require.cache[require.resolve('../src/db/access')] = { exports: {
  runSQLQueryFx: async () => { throw new Error('Unexpected FX query'); },
  runSQLQueryAccess: async (database, sql, params) => {
    assert.equal(database.firmaId, 3);
    assert.match(sql, /v\.\[beP_Artikelindex\] AS articleIndex/);
    assert.deepEqual(params, [row.beNumber, row.warehouseId]);
    return [{ ...row }];
  },
} };
require.cache[require.resolve('../src/db/databases')] = { exports: {
  getDatabaseConnectionForIdentity: async () => { throw new Error('Unexpected mandant middleware lookup'); },
  getDatabaseConnectionForIdentityById: async () => { throw new Error('Unexpected source database switch'); },
} };
require.cache[require.resolve('../src/db/customer-access')] = { exports: {
  getCustomerAccessScope: async () => ({ isFullAccess: false }),
} };
const router = require('../src/routes/orders.routes');
const handler = router.stack.find(layer => layer.route?.path === '/orders/:id' && layer.route.methods.get).route.stack.at(-1).handle;

test('reservation detail supplies the BE, article and warehouse keys needed by the order cart', async () => {
  const result = await new Promise((resolve, reject) => handler({
    params: { id: `${row.beNumber}||${row.warehouseId}` }, query: {},
    userIdentity: { shortCode: 'NSC' }, mandant: 'Frupack', database: { firmaId: 3 },
  }, { status() { return this; }, json: resolve }, reject));
  const item = result.data;
  assert.equal(item.beNumber, row.beNumber);
  assert.equal(item.orderNumber, row.beNumber);
  assert.equal(item.articleIndex, row.articleIndex);
  assert.equal(item.warehouseId, row.warehouseId);
  assert.equal(item.productId, `${row.article}||${row.warehouse}||${row.beNumber}||PP||Random`);
  assert.equal(item.reserveAmount, row.reserveAmount);
  assert.equal(item.reservationDate, row.reservationDate);
  assert.equal(item.amount, row.amount);
  assert.equal(item.reserved, row.reserved);
  assert.equal(item.price, row.price);
  assert.equal(item.canEdit, true);
});
