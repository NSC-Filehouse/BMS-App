const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ORDER_MAIL_SUBJECT,
  formatOrderMailBody,
  parseMandantAddressMap,
  resolveOrderMailRecipient,
  cleanEwsText,
} = require('../src/mail/order-mail');

test('test recipient overrides customer service and accounting recipients', () => {
  const result = resolveOrderMailRecipient(2, {
    testRecipient: 'n.schroeder@filehouse.net',
    customerServiceAddressMap: 'cs@mlplastics.de|2',
    accountingMailboxMap: 'buchhaltung@mlplastics.de|2',
  });

  assert.deepEqual(result, {
    ok: true,
    address: 'n.schroeder@filehouse.net',
    source: 'test_override',
  });
});

test('customer service is preferred and accounting is the fallback', () => {
  const config = {
    testRecipient: '',
    customerServiceAddressMap: 'cs@mlplastics.de|2',
    accountingMailboxMap: 'buchhaltung@mlplastics.de|2,buchhaltung@mlconnect.de|6',
  };

  assert.equal(resolveOrderMailRecipient(2, config).address, 'cs@mlplastics.de');
  assert.deepEqual(resolveOrderMailRecipient(6, config), {
    ok: true,
    address: 'buchhaltung@mlconnect.de',
    source: 'accounting',
  });
  assert.deepEqual(resolveOrderMailRecipient(18, config), {
    ok: false,
    reason: 'missing_recipient',
  });
});

test('quoted InvoiceReader mailbox lists are parsed', () => {
  const parsed = parseMandantAddressMap('"verwaltung@mlholding.org|1,buchhaltung@frupack.de|3"');
  assert.equal(parsed.get(1), 'verwaltung@mlholding.org');
  assert.equal(parsed.get(3), 'buchhaltung@frupack.de');
});

test('EWS text values are XML escaped after removing invalid control characters', () => {
  assert.equal(
    cleanEwsText('ER&GE <GmbH>\u0001'),
    'ER&amp;GE &lt;GmbH&gt;'
  );
});

test('mail body contains the complete structured order data', () => {
  const body = formatOrderMailBody({
    mandantName: 'MLPlastics',
    mandantShortName: 'PLA',
    finalizedBy: 'N. Schroeder / NS / n.schroeder@filehouse.net',
    finalizedAt: '2026-08-28T10:00:00.000Z',
    order: {
      id: 42,
      createdBy: 'NS',
      createdByEmail: 'n.schroeder@filehouse.net',
      createdAt: '2026-08-28T09:00:00.000Z',
      clientReferenceId: 'K-100',
      clientName: 'Testkunde',
      clientAddress: 'Musterstra\u00dfe 1, 80331 M\u00fcnchen',
      clientRepresentative: 'Max Mustermann',
      comment: 'Bitte beachten',
      deliveryType: 'DAP',
      packagingType: 'Palette',
      deliveryAddress: 'Werk 2',
      deliveryAddressChanged: true,
      specialPaymentCondition: false,
      specialPaymentText: '30 Tage netto',
      hasAttachment: true,
      attachmentFileName: 'auftrag.pdf',
    },
    positions: [{
      lineNo: 1,
      article: 'Artikel A',
      beNumber: 'BE-1',
      warehouse: 'Lager 1',
      amountInKg: 1000,
      price: 120,
      costPrice: 80,
      deliveryDate: '2026-09-01T00:00:00.000Z',
      reservationInKg: 500,
      reservationDate: '2026-09-10T00:00:00.000Z',
      mfi: '12',
      about: 'Chargenrein',
      wpzId: 77,
      wpzOriginal: true,
      wpzComment: 'Original verwenden',
    }],
  });

  assert.equal(ORDER_MAIL_SUBJECT, 'BMS-App es liegt ein neuer Auftrag vor');
  for (const expected of [
    'Mandant: MLPlastics (PLA)',
    'Kundennummer: K-100',
    'Kundenanschrift: Musterstra\u00dfe 1, 80331 M\u00fcnchen',
    'Position 1',
    'BE-Nummer: BE-1',
    'VK: 120,00 EUR/kg',
    'EP: 80,00 EUR/kg',
    'WPZ-ID: 77',
    'Anhang: auftrag.pdf',
  ]) {
    assert.match(body, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
