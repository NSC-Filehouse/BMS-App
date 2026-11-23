const test = require('node:test');
const assert = require('node:assert/strict');

const calls = [];
require.cache[require.resolve('../src/db/access')] = { exports: {
  runSQLQueryAccess: async () => assert.fail('The worker should only write to BMSApp'),
  runSQLQuerySqlServer: async (database, sql, params) => {
    calls.push({ sql, params, transaction: false });
    return [];
  },
  withSqlTransaction: async (database, work) => work({
    query: async (sql, params) => {
      calls.push({ sql, params, transaction: true });
      return { rows: [{ Id: 42 }] };
    },
  }),
} };

const { deliverOffer } = require('../src/db/option-offer-outbox');
const offer = {
  messageKey: '42-key', senderEmail: 'ad@example.invalid', senderName: 'Vertrieb',
  recipientEmail: 'customer@example.invalid', contactName: 'Muster', language: 'de',
  article: 'PPC 7600 OG', validUntil: '2099-12-31', quantityKg: 24750, salePrice: 1320,
  availableQuantityKg: 49500, incotermCode: 'CFR',
};
const bmsDocument = {
  messageKey: offer.messageKey, source: 'bms', number: 'AN-42', subject: 'BMS-Angebot',
  body: 'BMS-Originaltext', isBodyHtml: false, pdfBase64: Buffer.from('%PDF-1.6\nTest-only').toString('base64'),
};
const row = { id: 42, attempt: 1, offerJson: JSON.stringify(offer), documentJson: JSON.stringify(bmsDocument) };
test.beforeEach(() => { calls.length = 0; });

test('accepted mail keeps its MailService ID and creates no ERP activity yet', async () => {
  await deliverOffer({
    submitMail: async request => {
      assert.equal(request.clientMessageId, 'bms-app:option-offer:42-key');
      assert.equal(request.to.length, 1);
      return { id: 'mail-123', status: 'Pending' };
    },
  }, { ...row, status: 'sending' });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, ['submitted', 'mail-123', null, 42, 1]);
  assert.equal(calls[0].transaction, false);
});

test('confirmation marks the outbox and records the customer activity atomically', async () => {
  await deliverOffer({
    submitMail: async () => assert.fail('Already submitted'),
    getMail: async id => {
      assert.equal(id, 'mail-123');
      return { Status: 'Sent', SentAt: '2026-11-23T13:40:00Z' };
    },
  }, { ...row, status: 'submitted', mailServiceId: 'mail-123' });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.transaction));
  assert.match(calls[0].sql, /Status = N'sent'/);
  assert.match(calls[1].sql, /INSERT INTO BMSApp\.tbl_Temp_Aktivitaet/);
  assert.match(calls[1].params[0], /AN-42.*VK 1\.320,00\s€\/t, Incoterm CFR/);
});

test('an ambiguous final failure only tracks the old provider ID', async () => {
  await deliverOffer({ getMail: async () => ({ status: 'Failed' }) },
    { ...row, status: 'submitted', mailServiceId: 'mail-123' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params[0], 'unknown');
  assert.equal(calls[0].params[1], 'mail-123');
});
