const test = require('node:test');
const assert = require('node:assert/strict');

const calls = [];
require.cache[require.resolve('../src/db/access')] = { exports: {
  runSQLQueryAccess: async (_database, sql) => {
    assert.match(sql, /SELECT.*[\s\S]*(dbo.tblKunden|dbo.tblBest_Position)/);
    return sql.includes('dbo.tblKunden') ? [{ id: '100', street: 'Werkstraße', paymentId: 8 }] : [{ packaging: 'Sackware' }];
  },
  runSQLQuerySqlServer: async (database, sql, params) => {
    calls.push({ sql, params, transaction: false });
    if (sql.includes('tblSprachenTexte')) return [{ id: 34, de: 'Sackware', en: 'Bags' }];
    if (sql.includes('tblZahltext_Sprachen')) return [{ id: 8, language: 'de', text: '30 Tage netto' }];
    if (sql.includes('tbl_Temp_Ang_Position')) return [
      { articleIndex: 'A', article: 'A & B', quantity: 1000, unit: 'KG', price: 1320, priceBasis: 1000 },
      { articleIndex: 'B', article: 'B', quantity: 2, unit: 'ST', price: 20, priceBasis: 1 },
    ];
    return [];
  },
  withSqlTransaction: async (database, work) => work({
    query: async (sql, params) => {
      calls.push({ sql, params, transaction: true });
      if (sql.includes('COL_LENGTH')) return { rows: [{ ready: 1 }] };
      if (sql.includes('WITH (UPDLOCK')) return { rows: [] };
      if (sql.includes('INSERT INTO [BMSApp].[tbl_Temp_Angebot]')) return { rows: [{ tag_id: 81 }] };
      if (sql.includes('OUTPUT inserted.Id AS id')) return { rows: [{ id: 42 }] };
      return { rows: [{ Id: 42 }] };
    },
  }),
} };

require.cache[require.resolve('../src/db/users')] = { exports: {
  getUserIdentityByShortCode: async (code, companyId) => {
    assert.equal(companyId, 3);
    return code === 'ERI' ? { email: 'eris@example.invalid' } : null;
  },
} };

const { deliverOffer, claimOffer, queueOptionOffers } = require('../src/db/option-offer-outbox');
const offer = {
  messageKey: '42-key', senderCode: 'AD', senderEmail: 'ad@example.invalid', senderName: 'Vertrieb',
  recipientEmail: 'customer@example.invalid', contactName: 'Muster', language: 'de',
  article: 'PPC 7600 OG', validUntil: '2099-12-31', quantityKg: 24750, salePrice: 1320,
  availableQuantityKg: 49500, incotermCode: 'CFR',
};
const bmsDocument = {
  messageKey: offer.messageKey, source: 'bms', number: 'AN-42', subject: 'BMS-Angebot',
  body: 'BMS-Originaltext', isBodyHtml: false, pdfBase64: Buffer.from('%PDF-1.6\nTest-only').toString('base64'),
};
const pdf = Buffer.from('%PDF-1.7\nExact ERP bytes');
const row = { id: 42, tempOfferId: 81, attempt: 1, erpStatus: 2, createdBy: 'AD', offerNumber: 'AN-42', pdf, issueDate: '2026-11-23', sellerName: 'Musterverkäufer',
  offerJson: JSON.stringify(offer), documentJson: JSON.stringify(bmsDocument) };
test.beforeEach(() => { calls.length = 0; });

test('accepted mail keeps its MailService ID and creates no ERP activity yet', async () => {
  await deliverOffer({
    submitMail: async request => {
      assert.equal(request.clientMessageId, 'bms-app:offer-preview:42-key');
      assert.deepEqual(request.to, [{ address: offer.senderEmail }]);
      assert.deepEqual(request.attachments[0].content, pdf);
      assert.equal(request.attachments[1].contentType, 'application/xml');
      assert.equal(request.attachments.length, 2);
      assert.match(request.body, /freibleibendes Angebot AN-42/);
      assert.doesNotMatch(request.body, /BMS-Originaltext/);
      return { id: 'mail-123', status: 'Pending' };
    },
  }, { ...row, status: 'sending' });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].params, ['submitted', 'mail-123', null, 42, 1]);
  assert.equal(calls[1].transaction, false);
});

test('when another user releases a draft, only the original creator receives the mail', async () => {
  const draft = { ...row, status: 'sending', createdBy: 'eri ', offerJson: JSON.stringify({ ...offer, kind: 'app', companyId: 3 }) };
  await deliverOffer({ submitMail: async request => {
    assert.deepEqual(request.to, [{ address: 'eris@example.invalid' }]);
    assert.equal(request.fromAddress, offer.senderEmail);
    return { id: 'mail-123', status: 'Pending' };
  } }, draft);
  assert.equal(calls.at(-1).params[0], 'submitted');

  await deliverOffer({ submitMail: async () => assert.fail('No recipient fallback') }, { ...draft, createdBy: 'XXX' });
  assert.equal(calls.at(-1).params[0], 'failed');
  assert.match(calls.at(-1).params[2], /Angebotsersteller/);
});

test('the worker never submits a customer mail without the linked status-2 offer and a PDF', async () => {
  const client = { submitMail: async () => assert.fail('Must wait for BMS') };
  for (const overrides of [
    { tempOfferId: null }, { erpStatus: 0 }, { erpStatus: 1 }, { erpStatus: 3 },
    { pdf: null }, { pdf: Buffer.from('not a PDF') }, { offerNumber: '' },
  ]) {
    await deliverOffer(client, { ...row, ...overrides, status: 'sending' });
  }
  assert.ok(calls.every(call => call.params[0] === 'failed'));
  assert.equal(calls.length, 7);

  await claimOffer();
  assert.match(calls.at(-1).sql, /h\.tag_status=2[\s\S]*SUBSTRING\(h\.tag_offer_pdf,1,5\)=0x255044462D/);
  assert.doesNotMatch(calls.at(-1).sql, /BmsDocumentJson IS NOT NULL/);
});

test('a manual offer preview includes the ERP PDF and XML for every linked position', async () => {
  await deliverOffer({ submitMail: async request => {
    assert.equal(request.subject, 'Ihr Angebot AN-42');
    assert.equal(request.attachments.length, 2);
    assert.deepEqual(request.attachments[0].content, pdf);
    assert.match(request.attachments[1].content.toString(), /A &amp; B[\s\S]*<cbc:Quantity unitCode="C62">2\.000<\/cbc:Quantity>[\s\S]*<cbc:PriceAmount currencyID="EUR">20\.0000<\/cbc:PriceAmount>[\s\S]*<cbc:ID>B<\/cbc:ID>/);
    return { id: 'mail-123', status: 'Pending' };
  } }, { ...row, status: 'sending', documentJson: null, offerJson: JSON.stringify({ ...offer, kind: 'app', companyId: 3 }) });
  assert.deepEqual(calls[0].params, [81, 3]);
  assert.equal(calls[1].params[0], 'submitted');
});

test('submitting an option or a VL position creates a temp offer, one line and one linked mail job together', async () => {
  for (const source of [{ positionId: 17, packagingId: 34 }, { stockPositionKey: 'stock-key', stockOrderPosition: 'BE-2', stockStorageId: 'L1' }]) {
    calls.length = 0;
    await queueOptionOffers({ firmaId: 3 }, [{
      ...offer, ...source, companyId: 3, messageKey: '0e1b73bb-c7fa-4690-a2cc-26509408d076',
      customerId: '100', customerName: 'Test GmbH', contactId: 11, senderCode: 'NSC',
      incotermId: 7, incotermText: 'CFR', articleIndex: 'A', batch: 'CH01',
    }]);
    const inserts = calls.filter(call => call.sql.includes('INSERT INTO'));
    assert.ok(inserts.every(call => call.transaction));
    assert.equal(inserts.length, 4);
    assert.match(inserts[0].sql, /tbl_Temp_Angebot.*\[tag_status\]/);
    assert.match(inserts[1].sql, /tbl_Temp_Ang_Position/);
    const positionColumns = inserts[1].sql.split('OUTPUT')[0].match(/\[tagp_\w+\]/g);
    assert.equal(inserts[1].params[positionColumns.indexOf('[tagp_source_be_number]')], source.stockOrderPosition ?? null);
    assert.equal(inserts[1].params[positionColumns.indexOf('[tagp_be_number]')], null);
    assert.deepEqual(inserts[2].params.slice(0, 5), [3, source.positionId ?? null, source.stockPositionKey ?? null, 81, '100']);
    assert.match(inserts[3].sql, /OptionOfferDocument/);
  }
});

test('confirmation marks only the outbox for an internal preview', async () => {
  for (const status of ['Sent', 2, '2']) {
    calls.length = 0;
    await deliverOffer({
      submitMail: async () => assert.fail('Already submitted'),
      getMail: async id => {
        assert.equal(id, 'mail-123');
        return { Status: status, SentAt: '2026-11-23T13:40:00Z' };
      },
    }, { ...row, status: 'submitted', mailServiceId: 'mail-123' });
    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /Status = N'sent'/);
  }
});

test('an ambiguous final failure only tracks the old provider ID', async () => {
  await deliverOffer({ getMail: async () => ({ status: 'Failed' }) },
    { ...row, status: 'submitted', mailServiceId: 'mail-123' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params[0], 'unknown');
  assert.equal(calls[0].params[1], 'mail-123');
});
