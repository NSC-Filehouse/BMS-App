import test from 'node:test';
import assert from 'node:assert/strict';
import { filterSupplierInvoices } from '../src/utils/supplierInvoices.js';
const invoices = [
  { invoiceNumber: 'RG-95993268', orderNumbers: ['3-02-26-00851'], positionNumbers: ['3-02-26-00851-03'],
    materials: [{ article: 'MDPE HR 515 natur Total', masterArticleName: 'Unser PE Artikel', articleIndex: 'A1' }] },
  { invoiceNumber: 'Other-2', orderNumbers: ['3-02-26-00852'], materials: [{ article: 'PPC 1640' }] },
  { invoiceNumber: 'Standalone', materials: [] },
];
test('supplier invoices can be filtered by complete or partial BE, RG number and material', () => {
  for (const query of ['00851', 'BE 3-02-26-00851', '95993268', 'RG 95993268', 'mdpe HR 515', 'unser pe', 'A1', '00851-03']) {
    assert.deepEqual(filterSupplierInvoices(invoices, query), [invoices[0]], query);
  }
  assert.deepEqual(filterSupplierInvoices(invoices, 'PPC 1640'), [invoices[1]]);
  assert.deepEqual(filterSupplierInvoices(invoices, 'not present'), []);
  assert.equal(filterSupplierInvoices(invoices, ''), invoices);
  assert.deepEqual(filterSupplierInvoices(invoices, 'Standalone'), [invoices[2]]);
});
