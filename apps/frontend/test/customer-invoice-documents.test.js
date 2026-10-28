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

function render(items, isSupplier = false) {
  return renderToStaticMarkup(React.createElement(CustomerInvoiceDocuments, {
    items, isSupplier, t: (key) => key, formatDate: (value) => value || '-', formatMoney: (value) => String(value),
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

test('customer invoices display the due date supplied by the invoice table', () => {
  const html = render([{ id: 'INV', dueDate: '2026-11-25' }]);
  assert.match(html, /due_date_label: 2026-11-25/);
});
