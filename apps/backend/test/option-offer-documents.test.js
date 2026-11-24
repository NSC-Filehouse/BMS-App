const test = require('node:test');
const { DOMParser } = require('@xmldom/xmldom');
const assert = require('node:assert/strict');
const { assembleOfferMail, offerXml, readBmsOfferDocument, sampleOfferEml } = require('../src/options/offer-documents');
const { classifyServiceStatus } = require('../src/db/option-offer-outbox');

const offer = {
  messageKey: 'unique-offer', senderEmail: 'ad@example.invalid', senderName: 'A. Vertrieb',
  recipientEmail: 'einkauf@example.invalid', contactName: 'Einkauf', language: 'de', customerId: 'K123',
  customerName: 'Musterkunde', articleIndex: '0417', article: 'PPC <7600> & Co.', batch: 'M-001', quantityKg: 24750,
  availableQuantityKg: 49500, salePrice: 1320, incotermCode: 'FCA', incotermText: 'FCA / Frei Frachtführer',
  pickup: 'Hamburg', validUntil: '2099-12-31',
  seller: { id: 'MLP', name: 'Verkäufer GmbH', street: 'Hauptstraße 1', city: 'Hamburg', postalCode: '20095', country: 'DE' },
  header: {
    issueDate: '2026-11-24', currency: 'EUR', customerAddress: 'Musterweg 1\n20095 Hamburg\nDE',
    paymentText: '30 Tage netto', customerReference: 'ANFR-1', deliveryTerms: 'FCA / Frei Frachtführer',
    packaging: 'Sackware', vatPercent: 19, discountPercent: 10,
  },
  positions: [{
    articleIndex: '0417', article: 'PPC <7600> & Co.', unit: 'KG', quantity: 24750, price: 1320, priceBasis: 1000,
    deliveryDate: '2026-12-01', valutaDate: '2026-12-02', deliveryText: 'Vormittags',
  }],
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
  assert.match(request.attachments[1].content.toString(), /<cac:DeliveryTerms>\s*<cbc:ID>FCA<\/cbc:ID>/);
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

test('German offer mail uses the selected contact and the weekday in Berlin', () => {
  const document = { number: 'AN-123', pdf, subject: 'Ihr Angebot' };
  const contact = { contactSalutation: 'Frau', contactLastName: 'von Berg', contactName: 'Frau Eva von Berg' };
  const bodyAt = (date, fields = contact) => assembleOfferMail({ ...offer, ...fields }, document, undefined, new Date(date)).body;

  assert.match(bodyAt('2026-11-22T23:05:00Z'), /Sehr geehrte Frau von Berg,<br><br>ich hoffe, Sie haben einen guten Start in die Woche\.<br><br>Anbei/);
  assert.match(bodyAt('2026-11-25T12:00:00Z', { contactSalutation: 'Herr', contactLastName: 'Koch' }),
    /Sehr geehrter Herr Koch,<br><br>ich hoffe, Ihre Woche ist bisher gut verlaufen\./);
  assert.match(bodyAt('2026-11-27T12:00:00Z', { contactName: 'Herrn Max Koch' }),
    /Sehr geehrter Herr Max Koch,<br><br>ich hoffe, Sie haben schon ein paar schöne Pläne fürs Wochenende\./);
  for (const day of [24, 26, 28, 29]) {
    assert.match(bodyAt(`2026-11-${day}T12:00:00Z`), /Sehr geehrte Frau von Berg,<br><br>anbei/);
  }
});

test('UBL quotation uses standard roles, terms, amounts and price units', () => {
  const xml = offerXml(offer, 'AN-123');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const root = document.documentElement;
  assert.equal(root.localName, 'Quotation');
  assert.equal(root.namespaceURI, 'urn:oasis:names:specification:ubl:schema:xsd:Quotation-2');
  assert.match(xml, /<cac:SellerSupplierParty>[\s\S]*Verkäufer GmbH[\s\S]*Hauptstraße 1/);
  assert.match(xml, /<cac:BuyerCustomerParty>[\s\S]*K123[\s\S]*Musterkunde[\s\S]*Musterweg 1/);
  assert.match(xml, /<cac:DeliveryLocation>[\s\S]*Hamburg/);
  assert.doesNotMatch(xml, /<cac:DeliveryAddress>/);
  assert.match(xml, /30 Tage netto/);
  assert.match(xml, /<cbc:BaseQuantity unitCode="KGM">1000<\/cbc:BaseQuantity>/);
  assert.match(xml, /<cbc:PayableAmount currencyID="EUR">34989\.57<\/cbc:PayableAmount>/);
  assert.match(xml, /<cbc:LotNumberID>M-001<\/cbc:LotNumberID>/);
  assert.match(xml, /PPC &lt;7600&gt; &amp; Co\./);
  assert.match(xml, /<cbc:EndDate>2026-12-01<\/cbc:EndDate>/);
  assert.match(xml, /<cbc:Note>Valutadatum: 2026-12-02<\/cbc:Note>/);
  assert.doesNotMatch(xml, /49500/);

  const delivered = offerXml({ ...offer, batch: '', header: {
    ...offer.header, deliveryTerms: 'DAP', deliveryAddress: 'Werk 2\nHafenstraße 1', vatPercent: null,
  } }, 'AN-124');
  assert.match(delivered, /<cac:DeliveryAddress>[\s\S]*Hafenstraße 1/);
  assert.doesNotMatch(delivered, /<cac:DeliveryLocation>|<cac:TaxTotal>|<cbc:LotNumberID>/);
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
