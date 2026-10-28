const test = require('node:test');
const assert = require('node:assert/strict');
const { formatPurchaseOrderMailBody, formatPurchaseOrderCsMailBody } = require('../src/mail/purchase-order-mail');

test('both mail paths use header packaging and current positions without old BE numbers', () => {
  const args = { order: { id: 10, packagingType: 'Siloware', loadingLocationText: 'Hamburg', paymentConditionText: '30 Tage' },
    positions: [{ article: 'Material', amount: 25000, purchasePrice: 900, requestedDeliveryDate: '2026-11-05', originalPackagingType: 'Sackware', packagingTypeChanged: true, sourceBestellindex: 'ALTE-BE' }] };
  for (const format of [formatPurchaseOrderMailBody, formatPurchaseOrderCsMailBody]) {
    const body = format(args);
    assert.match(body, /Verpackung: Siloware/);
    assert.match(body, /Ursprüngliche Verpackung: Sackware/);
    assert.match(body, /Verpackung geändert: Ja/);
    assert.doesNotMatch(body, /ALTE-BE|Vorherige BE/);
  }
});
