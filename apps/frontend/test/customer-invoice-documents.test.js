import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let server;
let CustomerInvoiceDocuments;
before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  ({ default: CustomerInvoiceDocuments } = await server.ssrLoadModule('/src/components/CustomerInvoiceDocuments.jsx'));
});
after(async () => { await server?.close(); });

function render(items, isSupplier = false, formatDate = (value) => value || '-') {
  return renderToStaticMarkup(React.createElement(CustomerInvoiceDocuments, {
    items, isSupplier, t: (key) => key, formatDate, formatMoney: (value) => String(value),
  }));
}

test('attached credits start as individual collapsed buttons rather than full cards or document links', () => {
  const html = render([
    { id: 'GS1', invoiceNumber: 'GS1', isCreditNote: true, isAttachedCredit: true, creditKind: 'partial', invoiceDate: '2026-09-01' },
    { id: 'GS2', invoiceNumber: 'GS2', isCreditNote: true, isAttachedCredit: true, creditKind: 'full', invoiceDate: '2026-10-01' },
  ]);
  assert.equal((html.match(/aria-expanded="false"/g) || []).length, 2);
  assert.match(html, /credit_note_partial_label: GS1/);
  assert.match(html, /credit_note_label: GS2/);
  assert.doesNotMatch(html, /credit_note_date_label|2026-09-01|2026-10-01|href=|<iframe/);
});

test('unassigned credit cards distinguish a missing invoice from an ambiguous relationship and show open status', () => {
  const missing = render([{ id: 'GS', invoiceNumber: 'GS', isCreditNote: true, invoiceAssignment: 'missing', paymentStatus: 'open' }]);
  assert.match(missing, /credit_note_invoice_missing/);
  assert.match(missing, /credit_note_status_open/);
  assert.doesNotMatch(missing, /aria-expanded/);
  const ambiguous = render([{ id: 'GS', isCreditNote: true, invoiceAssignment: 'ambiguous', paymentStatus: 'paid' }]);
  assert.match(ambiguous, /credit_note_invoice_ambiguous/);
  assert.match(ambiguous, /invoice_status_paid/);
});

test('supplier receipts retain their ordinary card display', () => {
  const html = render([{ id: 'SUP', invoiceNumber: 'SUP', supplierNumber: '123', invoiceType: 1, isPaid: true }], true);
  assert.match(html, /supplier_number_label/);
  assert.match(html, /invoice_status_paid/);
  assert.doesNotMatch(html, /credit_note_invoice_missing|aria-expanded/);
});

test('customer invoices display only the calculated calendar date, including in a timezone west of UTC', () => {
  const originalTimezone = process.env.TZ;
  try {
    process.env.TZ = 'America/Los_Angeles';
    const html = render([{ id: 'INV', invoiceDate: '2026-10-26', dueDate: '2030-01-01', displayDueDate: '2026-11-25' }],
      false, (value) => value ? new Date(value).toLocaleDateString('de-DE') : '-');
    assert.match(html, /due_date_label: 25\.11\.2026/);
    assert.doesNotMatch(html, /2030/);
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

test('missing calculated customer dates fall back to the stored due date; suppliers keep theirs', () => {
  const invoice = { id: 'INV', dueDate: '2030-01-01', displayDueDate: null };
  const customer = render([invoice]);
  assert.match(customer, /due_date_label: 2030-01-01/);
  assert.match(render([{ ...invoice, dueDate: null }]), /due_date_label: -/);
  assert.match(render([{ ...invoice, displayDueDate: '2026-11-25' }], true), /due_date_label: 2030-01-01/);
});
