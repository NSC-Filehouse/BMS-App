const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ORDER_MAIL_SUBJECT,
  UNFINALIZED_ORDER_REMINDER_SUBJECT,
  formatOrderMailBody,
  formatUnfinalizedOrderReminderBody,
  parseMandantAddressMap,
  resolveOrderMailRecipient,
  sendOrderMail,
  cleanEwsText,
  shouldUseEwsFallback,
  validateMailServiceConfig,
  validateOrderMailConfig,
} = require('../src/mail/order-mail');
const { MailServiceClientError } = require('@filehouse/mailservice-client');

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

test('MailService configuration is sufficient without requiring EWS', () => {
  const mailService = validateMailServiceConfig({
    enabled: true,
    baseAddress: 'https://db03.example.test:3300/',
    apiKey: 'fhm-test-key',
  });
  assert.deepEqual(mailService, { ok: true });

  const combined = validateOrderMailConfig(
    { enabled: true, ewsFallback: true, ews: {} },
    { enabled: true, baseAddress: 'https://db03.example.test:3300/', apiKey: 'fhm-test-key' },
  );
  assert.equal(combined.ok, true);
  assert.equal(combined.mailService.ok, true);
  assert.equal(combined.ews.ok, false);
});

test('BMS sends the mail-service request with the shared contract', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 202,
      text: async () => JSON.stringify({ Id: 123, ClientMessageId: 'bms-app:test:1', Status: 'Pending' }),
    };
  };

  try {
    const result = await sendOrderMail({
      orderMailConfig: { enabled: true, ewsFallback: true, ews: {} },
      mailServiceConfig: {
        enabled: true,
        baseAddress: 'https://db03.example.test:3300/',
        apiKey: 'fhm-test-key',
        timeoutMs: 1000,
      },
      recipient: 'user@example.com',
      subject: 'Test subject',
      body: 'Test body',
      clientMessageId: 'bms-app:test:1',
    });

    assert.equal(result.transport, 'mailservice');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://db03.example.test:3300/api/mails');
    assert.equal(requests[0].options.headers['X-Api-Key'], 'fhm-test-key');
    const requestBody = JSON.parse(requests[0].options.body);
    assert.equal(requestBody.ClientMessageId, 'bms-app:test:1');
    assert.equal(requestBody.To[0].Address, 'user@example.com');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('EWS fallback is restricted to transient MailService failures', () => {
  assert.equal(shouldUseEwsFallback(new MailServiceClientError('server error', { statusCode: 503 })), true);
  assert.equal(shouldUseEwsFallback(new MailServiceClientError('rate limited', { statusCode: 429 })), true);
  assert.equal(shouldUseEwsFallback(new MailServiceClientError('bad request', { statusCode: 400 })), false);
  assert.equal(shouldUseEwsFallback(new Error('network failure')), true);
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

test('unfinalized order reminder contains the current count', () => {
  assert.equal(
    UNFINALIZED_ORDER_REMINDER_SUBJECT,
    'BMS-App: offene Aufträge noch nicht an BMS übertragen',
  );
  assert.match(
    formatUnfinalizedOrderReminderBody({ count: 3 }),
    /Du hast aktuell 3 eigene Aufträge, die noch nicht final an BMS übertragen wurden\./,
  );
  assert.match(
    formatUnfinalizedOrderReminderBody({ count: 1 }),
    /Du hast aktuell 1 eigenen Auftrag, der noch nicht final an BMS übertragen wurde\./,
  );
});
