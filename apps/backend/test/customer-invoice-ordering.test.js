const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCustomerInvoiceTimeline } = require('../src/customer-invoice-ordering');

function summarize(rows) {
  return rows.map((row) => ({
    number: row.invoiceNumber,
    type: row.documentType,
    attached: row.isAttachedCredit,
    related: row.relatedInvoiceNumber || null,
  }));
}

test('puts referenced credit notes directly below their invoice', () => {
  const result = buildCustomerInvoiceTimeline([
    { customerId: '42', invoiceNumber: 'INV-1', invoiceDate: '2026-09-10', documentStatus: 'Rechnung' },
    { customerId: '42', invoiceNumber: 'INV-2', invoiceDate: '2026-09-15', documentStatus: 'Rechnung' },
    {
      customerId: '42',
      invoiceNumber: 'GS-1',
      referenceInvoiceNumber: ' INV-1 ',
      invoiceDate: '2026-09-20',
      documentStatus: 'Gutschrift',
    },
    {
      customerId: '42',
      invoiceNumber: 'GS-2',
      referenceInvoiceNumber: 'INV-1',
      invoiceDate: '2026-09-11',
      documentStatus: 'Gutschrift',
    },
  ]);

  assert.deepEqual(summarize(result), [
    { number: 'INV-2', type: 'invoice', attached: undefined, related: null },
    { number: 'INV-1', type: 'invoice', attached: undefined, related: null },
    { number: 'GS-1', type: 'creditNote', attached: true, related: 'INV-1' },
    { number: 'GS-2', type: 'creditNote', attached: true, related: 'INV-1' },
  ]);
});

test('inserts unassigned credit notes into the date sequence', () => {
  const result = buildCustomerInvoiceTimeline([
    { customerId: '42', invoiceNumber: 'INV-1', invoiceDate: '2026-09-10', documentStatus: 'Rechnung' },
    { customerId: '42', invoiceNumber: 'INV-2', invoiceDate: '2026-09-15', documentStatus: 'Rechnung' },
    {
      customerId: '42',
      invoiceNumber: 'GS-1',
      referenceInvoiceNumber: 'MISSING',
      invoiceDate: '2026-09-14',
      documentStatus: 'Gutschrift',
    },
  ]);

  assert.deepEqual(summarize(result), [
    { number: 'INV-2', type: 'invoice', attached: undefined, related: null },
    { number: 'GS-1', type: 'creditNote', attached: false, related: 'MISSING' },
    { number: 'INV-1', type: 'invoice', attached: undefined, related: null },
  ]);
});

test('does not attach a credit note to an ambiguous invoice number', () => {
  const result = buildCustomerInvoiceTimeline([
    { customerId: '42', invoiceNumber: 'INV-1', invoiceDate: '2026-09-10', documentStatus: 'Rechnung' },
    { customerId: '42', invoiceNumber: 'INV-1', invoiceDate: '2026-09-09', documentStatus: 'Rechnung' },
    {
      customerId: '42',
      invoiceNumber: 'GS-1',
      referenceInvoiceNumber: 'INV-1',
      invoiceDate: '2026-09-11',
      documentStatus: 'Gutschrift',
    },
  ]);

  assert.equal(result.find((row) => row.invoiceNumber === 'GS-1').isAttachedCredit, false);
  assert.equal(result.find((row) => row.invoiceNumber === 'GS-1').relatedInvoiceNumber, 'INV-1');
});

test('recognizes the ERP status fields used by tblRechnung', () => {
  const result = buildCustomerInvoiceTimeline([
    {
      re_KdNr: '42',
      re_RgNummer: 'INV-1',
      re_RgDatum: '2026-09-10',
      re_Auftragsstatus: 'Rechnung',
    },
    {
      re_KdNr: '42',
      re_RgNummer: 'GS-1',
      re_RefRGNr: 'INV-1',
      re_RgDatum: '2026-09-11',
      re_Auftragsstatus: 'Gutschrift',
    },
  ]);

  assert.deepEqual(summarize(result), [
    { number: 'INV-1', type: 'invoice', attached: undefined, related: null },
    { number: 'GS-1', type: 'creditNote', attached: true, related: 'INV-1' },
  ]);
});
