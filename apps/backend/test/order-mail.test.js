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
const {
  VL_COMPLETION_MAIL_SUBJECT,
  formatMargin,
  formatVlCompletionMailBody,
} = require('../src/mail/vl-completion-mail');
const { getVlMailRecipients } = require('../src/db/vl-completion-mail');
const {
  compareMfiValues,
  formatMfiValue,
  getMfiSortValue,
  sortVlItems,
} = require('../src/mfi-sort');

test('MFI sorting uses the first numeric bound and keeps text ranges readable', () => {
  assert.equal(getMfiSortValue('2-3,99'), 2);
  assert.equal(getMfiSortValue('3,5'), 3.5);
  assert.equal(formatMfiValue('2-3,99'), '2-3,99');
  assert.ok(compareMfiValues('2-3,99', '10-12') < 0);

  const sorted = sortVlItems([
    { plastic: 'PP', plasticSubCategory: 'GF', article: 'ten', mfi: '10-12' },
    { plastic: 'PP', plasticSubCategory: 'GF', article: 'two', mfi: '2-3,99' },
    { plastic: 'PP', plasticSubCategory: 'GF', article: 'empty', mfi: '' },
    { plastic: 'PP', plasticSubCategory: 'GF', article: 'three', mfi: '3,5' },
  ]);

  assert.deepEqual(sorted.map((item) => item.article), ['two', 'three', 'ten', 'empty']);
});

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

test('test mandant 0 sends order mail to the dedicated recipient', () => {
  const result = resolveOrderMailRecipient(0, {
    testRecipient: 'n.schroeder@filehouse.net',
    customerServiceAddressMap: 'cs@mlplastics.de|2',
    accountingMailboxMap: 'buchhaltung@mlplastics.de|2',
  });

  assert.deepEqual(result, {
    ok: true,
    address: 'm.frank@filehouse.net',
    source: 'test_mandant_override',
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

test('VL completion mail uses HTML and shows one margin per sold position', async () => {
  const body = formatVlCompletionMailBody({
    mandantName: 'Test',
    mandantShortName: 'TES',
    completedAt: '2026-09-08T12:00:00.000Z',
    order: {
      id: 65,
      clientName: 'Muster & Söhne <Kunde>',
      clientReferenceId: 'K-65',
      deliveryAddress: 'Werk 2',
      deliveryAddressId: 3,
      completedBy: 'CS',
    },
    positions: [{
      article: 'Artikel A',
      beNumber: 'BE-65',
      amountInKg: 1000,
      price: 1234,
      costPrice: 1035,
    }],
    vlItems: [
      {
        plastic: 'PA',
        plasticSubCategory: 'GF',
        amount: 500,
        unit: 'KG',
        article: 'VL 10',
        mfi: '10-12',
        mfiTestMethod: 'ISO',
        acquisitionPrice: 1040,
        warehouse: 'Hamburg',
        beNumber: 'BE-VL-1',
        about: 'Chargenrein',
      },
      {
        plastic: 'PA',
        plasticSubCategory: 'GF',
        amount: 500,
        unit: 'KG',
        article: 'VL 2',
        mfi: '2-3,99',
        mfiTestMethod: 'ISO',
        acquisitionPrice: 1040,
        warehouse: 'Hamburg',
        beNumber: 'BE-VL-2',
        about: 'Chargenrein',
      },
    ],
  });

  assert.equal(VL_COMPLETION_MAIL_SUBJECT, 'BMS-App Verkauf');
  assert.equal(formatMargin({ price: 1234, costPrice: 1035 }), '19.23 %');
  assert.match(body, /<strong>Customer:<\/strong>/);
  assert.match(body, /<strong>Delivery address ID:<\/strong> 3/);
  assert.match(body, /19\.23 %/);
  assert.match(body, /font-weight:700/);
  assert.match(body, /color:#d32f2f/);
  assert.match(body, /Aktuelle VL \(klassische Ansicht\)/);
  assert.match(body, /Übernahme des Verkaufs in BMS/);
  assert.doesNotMatch(body, /Übernahme des Verkaufs in das ERP/);
  assert.match(body, /Muster &amp; Söhne &lt;Kunde&gt;/);
  assert.ok(body.indexOf('VL 2') < body.indexOf('VL 10'));
});

test('BMS can send an HTML VL completion body through MailService', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 202,
      text: async () => JSON.stringify({ Id: 124, ClientMessageId: 'bms-app:vl-sale:test' }),
    };
  };

  try {
    await sendOrderMail({
      orderMailConfig: { enabled: true, ewsFallback: false, ews: {} },
      mailServiceConfig: {
        enabled: true,
        baseAddress: 'https://db03.example.test:3300/',
        apiKey: 'fhm-test-key',
        timeoutMs: 1000,
      },
      recipient: 'user@example.com',
      subject: VL_COMPLETION_MAIL_SUBJECT,
      body: '<strong>Sale completed</strong>',
      clientMessageId: 'bms-app:vl-sale:test',
      isBodyHtml: true,
    });

    const requestBody = JSON.parse(requests[0].options.body);
    assert.equal(requestBody.IsBodyHtml, true);
    assert.equal(requestBody.Body, '<strong>Sale completed</strong>');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('test mandant VL mail recipient list contains only MFR and NSC', async () => {
  assert.deepEqual(await getVlMailRecipients(0), [
    { address: 'm.frank@filehouse.net', source: 'test_mandant_override_mfr' },
    { address: 'n.schroeder@filehouse.net', source: 'test_mandant_override_nsc' },
  ]);
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
      deliveryAddressId: 3,
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
      originalPackagingType: 'Sackware',
      packagingTypeChanged: true,
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
    'Lieferadress-ID: 3',
    'VK: 120,00 EUR/kg',
    'EP: 80,00 EUR/kg',
    'Ursprüngliche Verpackungsart: Sackware',
    'Verpackungsart gewechselt: Ja',
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
