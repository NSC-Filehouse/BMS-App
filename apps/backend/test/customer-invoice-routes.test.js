const test = require('node:test');
const assert = require('node:assert/strict');

let visible = true;
let calls = [];
let documents = [];
let paymentTerms = [];
const unexpectedQuery = async () => { throw new Error('Unexpected query outside the invoice route'); };
require.cache[require.resolve('../src/db/access')] = { exports: {
  runSQLQueryAccess: async (database, sql, params) => {
    calls.push({ database, sql, params });
    return sql.includes('AS matchesDateFilter') ? documents : [];
  },
  runSQLQuerySqlServer: async (database, sql) => sql.includes('[dbo].[tblZahlText]') ? paymentTerms : [],
  canConnectToDatabase: unexpectedQuery,
  runSQLQueryFx: unexpectedQuery,
  withSqlTransaction: unexpectedQuery,
} };
require.cache[require.resolve('../src/db/customer-access')] = { exports: {
  getCustomerAccessScope: async () => ({}),
  loadVisibleCustomer: async () => (visible ? { kd_KdNR: '42' } : null),
  loadVisibleSupplierCustomer: unexpectedQuery,
} };
const router = require('../src/routes/customers.routes');
const handler = router.stack.find((layer) => layer.route?.path === '/customers/:id/invoices').route.stack.at(-1).handle;

function request(query = {}) {
  return new Promise((resolve, reject) => {
    const req = { params: { id: '42' }, query, headers: {}, database: { databaseName: 'BMS.FRU' }, mandant: 'Frupack' };
    const res = { status() { return this; }, json: resolve };
    handler(req, res, reject);
  });
}

test('returns compact credit metadata and the correct paid state through the customer route', async () => {
  documents = [
    { customerId: '42', invoiceNumber: 'INV', documentStatus: 'Rechnung', paidFlag: 3, grossEu: 100, matchesDateFilter: 1 },
    { customerId: '42', invoiceNumber: 'GS', documentStatus: 'Gutschrift', referenceInvoiceNumber: 'INV', paidFlag: 1, grossEu: -20, matchesDateFilter: 0 },
  ];
  const response = await request({ scope: 'year', year: '2026' });
  assert.equal(response.meta.scope, 'year');
  assert.equal(response.meta.year, 2026);
  assert.equal(response.data.length, 2);
  assert.equal(response.data[0].isPaid, false);
  assert.equal(response.data[0].paymentStatus, 'open');
  assert.equal(response.data[1].isPaid, true);
  assert.equal(response.data[1].creditKind, 'partial');
  assert.equal(response.data[1].isAttachedCredit, true);
  assert.equal(response.data[1].relatedInvoiceNumber, 'INV');
  assert.equal(response.data.some((row) => row.pdfUrl), false);
});

test('checks customer visibility before reading invoices or position evidence', async () => {
  visible = false;
  calls = [];
  await assert.rejects(request(), (error) => error.status === 404);
  assert.equal(calls.length, 0);
  visible = true;
});

test('returns a separate calculated display date without changing the stored date or credit notes', async () => {
  paymentTerms = [{ id: 17, netDays: 30, basis: 1, monthEnd: false, halfMonthEnd: false }];
  documents = [
    { customerId: '42', invoiceNumber: '3-09-26-03826', invoiceDate: '2026-10-26', dueDate: '2026-10-26',
      paymentTextId: 17, documentStatus: 'Rechnung', paidFlag: 0, matchesDateFilter: 1 },
    { customerId: '42', invoiceNumber: 'UNKNOWN', invoiceDate: '2026-10-25', dueDate: '2030-01-01',
      paymentTextId: 999, documentStatus: 'Rechnung', paidFlag: 0, matchesDateFilter: 1 },
    { customerId: '42', invoiceNumber: 'GS', invoiceDate: '2026-10-24', dueDate: '2026-10-24',
      paymentTextId: 17, documentStatus: 'Gutschrift', paidFlag: 0, matchesDateFilter: 1 },
  ];
  const response = await request({ scope: 'all' });
  const invoice = response.data.find((row) => row.invoiceNumber === '3-09-26-03826');
  assert.equal(invoice.displayDueDate, '2026-11-25');
  assert.equal(invoice.dueDate, '2026-10-26');
  assert.equal(response.data.find((row) => row.invoiceNumber === 'UNKNOWN').displayDueDate, null);
  assert.equal(response.data.find((row) => row.invoiceNumber === 'GS').displayDueDate, null);
  assert.equal(documents[0].dueDate, '2026-10-26');
});
