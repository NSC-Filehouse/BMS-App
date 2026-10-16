const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCustomerInvoiceTimeline, getCustomerInvoicePaymentStatus } = require('../src/customer-invoice-ordering');

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

function invoice(overrides = {}) {
  return { customerId: '42', invoiceNumber: 'INV', invoiceDate: '2026-01-01',
    documentStatus: 'Rechnung', grossEu: 100, currency: 'EUR', paidFlag: 3, matchesDateFilter: 1, ...overrides };
}

function credit(overrides = {}) {
  return invoice({ invoiceNumber: 'GS', invoiceDate: '2026-06-01', documentStatus: 'Gutschrift',
    referenceInvoiceNumber: 'INV', grossEu: -20, ...overrides });
}

test('keeps all related credits outside the date filter below their selected invoice', () => {
  for (const scope of ['3m', '6m', 'year']) {
    const result = buildCustomerInvoiceTimeline([
      invoice(), credit({ matchesDateFilter: 0 }),
      credit({ invoiceNumber: 'GS-2', matchesDateFilter: 0, grossEu: -30 }),
    ], { scope });
    assert.deepEqual(result.map((row) => row.invoiceNumber), ['INV', 'GS-2', 'GS']);
    assert.ok(result.slice(1).every((row) => row.isAttachedCredit && row.creditKind === 'partial'));
  }
});

test('hides a credit whose existing invoice is outside the date filter', () => {
  assert.deepEqual(buildCustomerInvoiceTimeline([
    invoice({ matchesDateFilter: 0 }), credit(),
  ], { scope: 'year' }), []);
});

test('filters only genuinely unassigned credits by their own dates', () => {
  const result = buildCustomerInvoiceTimeline([
    credit({ referenceInvoiceNumber: 'MISSING' }),
    credit({ invoiceNumber: 'OLD-GS', referenceInvoiceNumber: '', matchesDateFilter: 0 }),
  ], { scope: '3m' });
  assert.equal(result.length, 1);
  assert.equal(result[0].invoiceAssignment, 'missing');
  assert.equal(result[0].isAttachedCredit, false);
});

test('uses ERP status 1 as paid, keeps 0/2/3 open and does not guess missing flags', () => {
  assert.equal(getCustomerInvoicePaymentStatus({ paidFlag: 1 }), 'paid');
  for (const paidFlag of [0, 2, 3, '3']) assert.equal(getCustomerInvoicePaymentStatus({ paidFlag }), 'open');
  for (const paidFlag of [null, undefined, '', 'invalid']) {
    assert.equal(getCustomerInvoicePaymentStatus({ paidFlag }), 'unknown');
  }
  const result = buildCustomerInvoiceTimeline([
    invoice(), invoice({ invoiceNumber: 'PART', paidFlag: 2, partialAmount: 10 }),
    invoice({ invoiceNumber: 'PAID', paidFlag: 1 }),
    credit({ referenceInvoiceNumber: 'MISSING', paidFlag: 1 }),
  ], { scope: 'open' });
  assert.deepEqual(result.map((row) => row.invoiceNumber), ['PART', 'INV']);
});

test('retains a paid invoice as the anchor for an open customer credit', () => {
  const result = buildCustomerInvoiceTimeline([
    invoice({ paidFlag: 1, paidDate: '2026-02-01' }), credit({ grossEu: -100 }),
  ], { scope: 'open' });
  assert.deepEqual(result.map((row) => row.invoiceNumber), ['INV', 'GS']);
  assert.equal(result[1].creditKind, 'full');
});

test('keeps full reversals in history and removes only the entirely unpaid zero-balance group from open', () => {
  const documents = [invoice(), credit({ grossEu: -60 }), credit({ invoiceNumber: 'GS-2', grossEu: -40 })];
  assert.deepEqual(buildCustomerInvoiceTimeline(documents, { scope: 'open' }), []);
  const history = buildCustomerInvoiceTimeline(documents, { scope: 'year' });
  assert.equal(history.length, 3);
  assert.equal(history[0].isFullyCredited, true);
  assert.ok(history.slice(1).every((row) => row.creditKind === 'partial'));
  // A payment/refund already recorded on one document changes the cash balance.
  for (const overrides of [{ partialAmount: 10 }, { paidFlag: 1 }, { paidFlag: 2 }, { partialAmount: 'invalid' }, { paidDate: '2026-02-01' }]) {
    assert.equal(buildCustomerInvoiceTimeline([invoice(overrides), credit({ grossEu: -100 })], { scope: 'open' }).length, 2);
  }
  assert.equal(buildCustomerInvoiceTimeline([invoice(), credit({ grossEu: -100, paidFlag: 1 })], { scope: 'open' }).length, 2);
  assert.equal(buildCustomerInvoiceTimeline([invoice(), credit({ grossEu: -100, paidFlag: 2 })], { scope: 'open' }).length, 2);
});

test('compares complete/partial corrections in the same original currency with cent precision', () => {
  const result = buildCustomerInvoiceTimeline([
    invoice({ currency: 'DKK', grossEu: 13.4, grossDm: 100 }),
    credit({ currency: 'DKK', grossEu: -13.5, grossDm: -100 }),
  ]);
  assert.equal(result[0].isFullyCredited, true);
  assert.equal(result[1].creditKind, 'full');
  for (const correction of [credit({ currency: 'USD', grossDm: -100 }), credit({ grossEu: null }), credit({ grossEu: -101 })]) {
    const rows = buildCustomerInvoiceTimeline([invoice(), correction], { scope: 'open' });
    assert.equal(rows.length, 2);
    assert.equal(rows[1].creditKind, 'unknown');
    assert.equal(rows[0].isFullyCredited, false);
  }
  assert.equal(buildCustomerInvoiceTimeline([invoice({ grossEu: 0.3 }), credit({ grossEu: -(0.1 + 0.2) })])[1].creditKind, 'full');
});

const positions = (...pairs) => pairs.map(([invoiceNumber, orderPositionId]) => ({ customerId: '42', invoiceNumber, orderPositionId }));

test('uses the calculation position relationship only when all credit positions identify one invoice', () => {
  const rows = [invoice(), credit({ referenceInvoiceNumber: '' })];
  const result = buildCustomerInvoiceTimeline(rows, { positionRows: positions(['INV', 'P1'], ['INV', 'P2'], ['GS', 'P1'], ['GS', 'P2']) });
  assert.equal(result[1].relatedInvoiceNumber, 'INV');
  assert.equal(result[1].isAttachedCredit, true);
  const incomplete = buildCustomerInvoiceTimeline(rows, { positionRows: positions(['INV', 'P1'], ['GS', 'P1'], ['GS', 'P2']) });
  assert.equal(incomplete.find((row) => row.isCreditNote).isAttachedCredit, false);
});

test('never guesses between invoices sharing a position, nor overrides an explicit missing reference', () => {
  const positionRows = positions(['INV', 'P1'], ['INV-2', 'P1'], ['GS', 'P1']);
  const result = buildCustomerInvoiceTimeline([invoice(), invoice({ invoiceNumber: 'INV-2' }), credit({ referenceInvoiceNumber: '' })], { positionRows });
  assert.equal(result.find((row) => row.isCreditNote).invoiceAssignment, 'ambiguous');
  const missing = buildCustomerInvoiceTimeline([invoice(), credit({ referenceInvoiceNumber: 'OTHER' })], { positionRows });
  assert.equal(missing.find((row) => row.isCreditNote).invoiceAssignment, 'missing');
});

test('keeps conflicting positions and foreign-customer references unassigned', () => {
  const conflicting = buildCustomerInvoiceTimeline([invoice(), credit()], { positionRows: positions(['INV', 'P1'], ['GS', 'P2']) });
  assert.equal(conflicting.find((row) => row.isCreditNote).invoiceAssignment, 'ambiguous');
  const foreign = buildCustomerInvoiceTimeline([invoice({ customerId: 'OTHER' }), credit()]);
  assert.equal(foreign.find((row) => row.isCreditNote).isAttachedCredit, false);
});
