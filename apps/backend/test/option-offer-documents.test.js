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

test('ERP wording gets a non-binding notice and three separate reply drafts', () => {
  const request = assembleOfferMail(offer, readBmsOfferDocument(JSON.stringify(original), offer.messageKey));
  assert.equal(request.fromAddress, 'ad@example.invalid');
  assert.deepEqual(request.to, [{ address: 'einkauf@example.invalid', displayName: 'Einkauf' }]);
  assert.equal(request.cc, undefined);
  assert.equal(request.bcc, undefined);
  assert.equal(request.subject, original.subject);
  assert.match(request.body, /^<html><body>Originaltext aus BMS\./);
  assert.match(request.body, /Dieses Angebot ist freibleibend\./);
  const actions = [...request.body.matchAll(/<a href="(mailto:[^"]+)"[^>]*><span[^>]*>([^<]+)<\/span><\/a>/g)];
  assert.deepEqual(actions.map(action => action[2]), ['Angebot annehmen', 'Gegenangebot machen', 'Angebot nicht interessant']);
  const drafts = actions.map(action => new URL(action[1].replaceAll('&amp;', '&')));
  assert.ok(drafts.every(draft => draft.pathname === 'ad@example.invalid' && draft.searchParams.get('subject').startsWith('AN-123')));
  assert.match(drafts[0].searchParams.get('body'), /Wir nehmen das Angebot an\./);
  assert.match(drafts[1].searchParams.get('body'), /Wunschpreis/);
  assert.match(drafts[2].searchParams.get('body'), /nicht interessant/);
  assert.equal((request.body.match(/<tr aria-hidden="true"><td height="12"/g) || []).length, 2);
  assert.equal((request.body.match(/<td align="center" bgcolor=/g) || []).length, 3);
  assert.match(request.body, /bgcolor="#245078"[^>]*><a[^>]*><span[^>]*mso-style-textfill-fill-color:#FFFFFF">Angebot annehmen<\/span>/);
  assert.match(request.body, /antworten Sie bitte direkt auf diese E-Mail und nennen Sie AN-123/);
  assert.match(request.body, /kurzfristige Rückantwort/);
  assert.deepEqual(request.attachments[0].content, pdf);
  assert.match(request.attachments[1].content.toString(), /<Incoterm>FCA<\/Incoterm>/);
  assert.equal(request.clientMessageId, 'bms-app:option-offer:unique-offer');
});

test('standard offer mail uses the template and existing non-binding wording is kept once', () => {
  const document = { number: 'AN-123', pdf, subject: 'Ihr Angebot' };
  const de = assembleOfferMail(offer, document).body;
  assert.match(de, /Sehr geehrte Damen und Herren,[\s\S]*freibleibendes Angebot AN-123[\s\S]*Angebotsreferenz AN-123[\s\S]*Für Rückfragen[\s\S]*Mit freundlichen Grüßen<br>A\. Vertrieb/);
  assert.doesNotMatch(de, /Dieses Angebot ist freibleibend/);
  const en = assembleOfferMail({ ...offer, language: 'en' }, document).body;
  assert.match(en, /Dear Sir or Madam,[\s\S]*non-binding offer AN-123[\s\S]*Kind regards/);
  assert.doesNotMatch(en, /This offer is non-binding/);
  const erp = assembleOfferMail(offer, { ...document, isBodyHtml: true, body: '<body>Unser <b>freibleibendes</b> Angebot.</body>' }).body;
  assert.doesNotMatch(erp, /Dieses Angebot ist freibleibend/);
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
