const test = require('node:test');
const assert = require('node:assert/strict');
const { assembleOfferMail, offerXml, readBmsOfferDocument, sampleOfferEml } = require('../src/options/offer-documents');
const { classifyServiceStatus } = require('../src/db/option-offer-outbox');

const offer = {
  messageKey: 'unique-offer', senderEmail: 'ad@example.invalid', senderName: 'A. Vertrieb',
  recipientEmail: 'einkauf@example.invalid', contactName: 'Einkauf', language: 'de', customerId: 'K123',
  customerName: 'Musterkunde', articleIndex: '0417', article: 'PPC <7600> & Co.', batch: 'M-001', quantityKg: 24750,
  availableQuantityKg: 49500, salePrice: 1320, incotermCode: 'FCA', incotermText: 'FCA / Frei Frachtführer',
  pickup: 'Hamburg', validUntil: '2099-12-31',
};
const pdf = Buffer.from('%PDF-1.7\nDummy for attachment test');
const original = {
  source: 'bms', messageKey: offer.messageKey, number: 'AN-123', subject: 'Das freibleibende Angebot',
  body: '<html><body>Originaltext aus BMS.</body></html>', isBodyHtml: true, pdfBase64: pdf.toString('base64'),
};

test('one mail carries unchanged wording and three separate reply drafts for a single customer', () => {
  const request = assembleOfferMail(offer, readBmsOfferDocument(JSON.stringify(original), offer.messageKey));
  assert.equal(request.fromAddress, 'ad@example.invalid');
  assert.deepEqual(request.to, [{ address: 'einkauf@example.invalid', displayName: 'Einkauf' }]);
  assert.equal(request.cc, undefined);
  assert.equal(request.bcc, undefined);
  assert.equal(request.subject, original.subject);
  assert.match(request.body, /^<html><body>Originaltext aus BMS\./);
  const actions = [...request.body.matchAll(/<a href="(mailto:[^"]+)"[^>]*>([^<]+)<\/a>/g)];
  assert.deepEqual(actions.map(action => action[2]), ['Angebot annehmen', 'Gegenangebot machen', 'Angebot nicht interessant']);
  const drafts = actions.map(action => new URL(action[1].replaceAll('&amp;', '&')));
  assert.ok(drafts.every(draft => draft.pathname === 'ad@example.invalid' && draft.searchParams.get('subject').startsWith('AN-123')));
  assert.match(drafts[0].searchParams.get('body'), /Wir nehmen das Angebot an\./);
  assert.match(drafts[1].searchParams.get('body'), /Wunschpreis/);
  assert.match(drafts[2].searchParams.get('body'), /nicht interessant/);
  assert.equal((request.body.match(/<tr aria-hidden="true"><td height="12"/g) || []).length, 2);
  assert.match(request.body, /<td bgcolor="#245078"[^>]*><a[^>]*>Angebot annehmen<\/a>/);
  assert.match(request.body, /kurzfristige Rückantwort/);
  assert.deepEqual(request.attachments[0].content, pdf);
  assert.match(request.attachments[1].content.toString(), /<Incoterm>FCA<\/Incoterm>/);
  assert.equal(request.clientMessageId, 'bms-app:option-offer:unique-offer');
});

test('XML escapes customer-visible fields and communicates only known batch limits', () => {
  assert.match(offerXml(offer, 'AN-123'), /PPC &lt;7600&gt; &amp; Co\./);
  assert.match(offerXml(offer, 'AN-123'), /AvailableBatchQuantity unit="KGM">49500\.000/);
  assert.doesNotMatch(offerXml({ ...offer, batch: '', availableQuantityKg: 49500 }, 'AN-123'), /AvailableBatchQuantity/);
});

test('dummy output and stale BMS output cannot be passed to the production sender', async () => {
  assert.throws(() => readBmsOfferDocument(JSON.stringify({ ...original, source: 'sample' }), offer.messageKey));
  assert.throws(() => readBmsOfferDocument(JSON.stringify(original), 'old-request'));
  assert.throws(() => assembleOfferMail({ ...offer, recipientEmail: 'first@example.invalid,second@example.invalid' }, original));
  const fixture = await sampleOfferEml({ ...offer, senderEmail: 'real@company.example', recipientEmail: 'real@customer.example' });
  assert.match(fixture, /To: kunde@example\.invalid/);
  assert.match(fixture, /filename="Angebot-MUSTER-001\.pdf"/);
  assert.match(fixture, /filename="Angebot-MUSTER-001\.xml"/);
  assert.doesNotMatch(fixture, /real@customer\.example/);
});

test('MailService acceptance is not a confirmed dispatch', () => {
  assert.equal(classifyServiceStatus({ Status: 'Pending' }), 'submitted');
  assert.equal(classifyServiceStatus({ status: 'Sent' }), 'sent');
  assert.equal(classifyServiceStatus({ status: 'Failed' }), 'unknown');
  assert.equal(classifyServiceStatus({ status: 'Rejected' }), 'failed');
});
