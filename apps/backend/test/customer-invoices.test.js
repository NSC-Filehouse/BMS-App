const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCustomerInvoiceTimeline, loadCustomerInvoicePaymentTerms } = require('../src/db/customer-invoices');
const config = require('../src/config');

test('loads customer history and position evidence before selecting the invoice period', async () => {
  const calls = [];
  const data = [
    { customerId: '42', invoiceNumber: 'INV', documentStatus: 'Rechnung', matchesDateFilter: 1, paidFlag: 3 },
    { customerId: '42', invoiceNumber: 'GS', documentStatus: 'Gutschrift', referenceInvoiceNumber: 'INV', matchesDateFilter: 0, paidFlag: 1 },
  ];
  const result = await loadCustomerInvoiceTimeline({ databaseName: 'BMS.FRU' }, '42', {
    scope: 'year', dateFilter: { sql: 'AND [re_RgDatum] >= DATEFROMPARTS(?, 1, 1) AND [re_RgDatum] < DATEFROMPARTS(?, 1, 1)', params: [2026, 2027] },
  }, async (database, sql, params) => {
    calls.push({ database, sql, params });
    return calls.length === 1 ? data : [
      { customerId: '42', invoiceNumber: 'INV', orderPositionId: 'P1' },
      { customerId: '42', invoiceNumber: 'GS', orderPositionId: 'P1' },
    ];
  });
  assert.deepEqual(result.map((row) => row.invoiceNumber), ['INV', 'GS']);
  assert.equal(result[1].paymentStatus, 'paid');
  assert.deepEqual(calls[0].params, [2026, 2027, '42']);
  assert.match(calls[0].sql, /CASE WHEN 1 = 1[\s\S]*AS matchesDateFilter/);
  assert.match(calls[0].sql, /WHERE \[re_KdNr\] = \?/);
  assert.deepEqual(calls[1].params, ['42']);
  assert.match(calls[1].sql, /WHERE \[r\]\.\[re_KdNr\] = \?/);
  assert.equal(calls[1].database.databaseName, 'BMS.FRU');
});

test('loads unique invoice payment-term IDs from the shared master database', async () => {
  let calls = 0;
  const terms = await loadCustomerInvoicePaymentTerms([17, '17', 141, null, 0, -1, 'invalid'], async (database, sql, params) => {
    calls += 1;
    assert.equal(database, config.sql.database);
    assert.deepEqual(params, [17, 141]);
    assert.match(sql, /FROM \[dbo\]\.\[tblZahlText\]/);
    return [{ id: 17, netDays: 30, basis: 1 }, { id: 141, netDays: 30, basis: 1, monthEnd: true }];
  });
  assert.equal(calls, 1);
  assert.equal(terms.get(17).netDays, 30);
  assert.equal(terms.get(141).monthEnd, true);
  assert.equal((await loadCustomerInvoicePaymentTerms([], async () => assert.fail('Unexpected query'))).size, 0);
});
