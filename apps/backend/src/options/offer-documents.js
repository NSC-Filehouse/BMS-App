const { PDFDocument, StandardFonts } = require('pdf-lib');
const { randomUUID } = require('node:crypto');

const escapeMarkup = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const withoutControls = value => String(value ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, '');
const xmlText = value => escapeMarkup(withoutControls(value));
const fileLabel = value => String(value).replace(/[^a-z0-9_.-]/gi, '_').slice(0, 100);

function singleEmail(value) {
  const email = String(value || '').trim();
  return email.length <= 320 && /^[\w.!#$%&'*+/=^_\x60{|}~-]+@[a-z\d.-]+\.[a-z\d]+$/i.test(email) ? email : '';
}

function responseLinks(offer, number, sender) {
  const en = offer.language === 'en';
  const mailto = (subject, body) =>
    `mailto:${encodeURIComponent(sender).replace('%40', '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const decline = en ? 'Offer not of interest' : 'Angebot nicht interessant';
  const counter = en ? 'Make a counteroffer' : 'Gegenangebot machen';
  return {
    request: en ? 'We would appreciate a prompt reply.' : 'Wir bitten um kurzfristige Rückantwort.',
    actions: [
      { label: decline, url: mailto(`${number} - ${decline}`, en
        ? `Thank you for offer ${number}. It is not of interest to us at this time.`
        : `Vielen Dank für Ihr Angebot ${number}. Das Angebot ist für uns derzeit nicht interessant.`) },
      { label: counter, url: mailto(`${number} - ${en ? 'Counteroffer' : 'Gegenangebot'}`, en
        ? `Counteroffer for ${number}\r\n\r\nPrice in EUR/t: \r\nQuantity in kg: \r\nComment: `
        : `Gegenangebot zu ${number}\r\n\r\nWunschpreis in EUR/t: \r\nMenge in kg: \r\nBemerkung: `) },
    ],
  };
}

function offerXml(offer, number) {
  const tag = (name, value) => `<${name}>${xmlText(value)}</${name}>`;
  const { article, articleIndex, batch, quantityKg, availableQuantityKg, salePrice, incotermCode, pickup, customerId, validUntil } = offer;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Offer xmlns="urn:filehouse:bms:customer-offer:1" version="1.0">',
    `  ${tag('OfferNumber', number)}`,
    `  ${tag('CustomerNumber', customerId)}`,
    '  <NonBinding>true</NonBinding>',
    ...(validUntil ? [`  ${tag('ValidUntil', validUntil)}`] : []),
    '  <Position>',
    `    ${tag('ArticleNumber', articleIndex)}`,
    `    ${tag('ArticleName', article)}`,
    ...(batch ? [`    ${tag('Batch', batch)}`] : []),
    `    <Quantity unit="KGM">${quantityKg.toFixed(3)}</Quantity>`,
    `    <PricePerTonne currency="EUR">${salePrice.toFixed(4)}</PricePerTonne>`,
    ...(batch && availableQuantityKg > quantityKg
      ? [`    <AvailableBatchQuantity unit="KGM">${availableQuantityKg.toFixed(3)}</AvailableBatchQuantity>`] : []),
    '  </Position>',
    '  <Delivery>',
    `    ${tag('Incoterm', incotermCode)}`,
    ...(pickup ? [`    ${tag('PickupLocation', pickup)}`] : []),
    '  </Delivery>',
    '</Offer>',
  ].join('\n');
}

function assembleOfferMail(offer, document) {
  const fromAddress = singleEmail(offer.senderEmail);
  const recipient = singleEmail(offer.recipientEmail);
  if (!fromAddress || !recipient) throw new Error('Ungültiger Absender oder Empfänger.');
  const links = responseLinks(offer, document.number, fromAddress);
  const spacer = '<tr aria-hidden="true"><td height="12" style="font-size:1px;line-height:12px">&nbsp;</td></tr>';
  const actionRows = links.actions.map((action, index) => {
    const background = index === 0 ? '#E9EFF6' : '#245078';
    const foreground = index === 0 ? '#24405C' : '#FFFFFF';
    return `<tr><td bgcolor="${background}" style="padding:9px 14px;mso-padding-alt:9px 14px">`
      + `<a href="${escapeMarkup(action.url)}" style="color:${foreground};font-weight:bold;text-decoration:underline">${escapeMarkup(action.label)}</a>`
      + '</td></tr>';
  }).join(spacer);
  const controls = `<div style="margin-top:20px"><p>${escapeMarkup(links.request)}</p>`
    + `<table role="presentation" cellpadding="0" cellspacing="0" border="0">${actionRows}</table></div>`;
  const body = document.isBodyHtml
    ? (/<\/body\s*>/i.test(document.body) ? document.body.replace(/<\/body\s*>/i, match => controls + match) : document.body + controls)
    : `<div style="white-space:pre-wrap">${escapeMarkup(document.body).replace(/\r\n|\r|\n/g, '<br>')}</div>${controls}`;
  return {
    clientMessageId: `bms-app:option-offer:${offer.messageKey}`,
    fromAddress, fromDisplayName: offer.senderName,
    to: [{ address: recipient, displayName: offer.contactName }],
    subject: document.subject, body, isBodyHtml: true,
    attachments: [
      { fileName: `Angebot-${fileLabel(document.number)}.pdf`, contentType: 'application/pdf', content: document.pdf },
      { fileName: `Angebot-${fileLabel(document.number)}.xml`, contentType: 'application/xml', content: Buffer.from(offerXml(offer, document.number)) },
      ...(document.attachments || []),
    ],
  };
}

function readBmsOfferDocument(json, messageKey) {
  const data = JSON.parse(json);
  if (data?.source !== 'bms' || data.messageKey !== messageKey || typeof data.number !== 'string' || !/^[\w./-]{1,80}$/.test(data.number)
    || typeof data.subject !== 'string' || !data.subject.trim() || /[\r\n]/.test(data.subject)
    || typeof data.body !== 'string' || !data.body.trim() || typeof data.isBodyHtml !== 'boolean'
    || typeof data.pdfBase64 !== 'string') throw new Error('Ungültige BMS-Angebotsausgabe.');
  const pdf = Buffer.from(data.pdfBase64, 'base64');
  if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('BMS-Angebots-PDF fehlt.');
  const attachments = (data.attachments || []).map(item => {
    if (!item || typeof item.contentBase64 !== 'string' || !item.contentBase64.length || typeof item.fileName !== 'string'
      || !item.fileName.trim() || /[\x00-\x1F/\\]/.test(item.fileName)
      || !/^[\w.+-]+\/[\w.+-]+$/.test(item.contentType)) throw new Error('Ungültiger BMS-Anhang.');
    return { fileName: item.fileName, contentType: item.contentType, content: Buffer.from(item.contentBase64, 'base64') };
  });
  return { ...data, pdf, attachments };
}

async function createSampleOfferPdf(offer) {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const prices = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  const amounts = new Intl.NumberFormat('de-DE');
  function draw(value, y, size = 11, font = regular) {
    const safe = [...String(value)].map(char => {
      try { font.encodeText(char); return char; } catch { return '?'; }
    }).join('');
    const fitted = safe.length > 82 ? safe.slice(0, 79) + '...' : safe;
    page.drawText(fitted, { x: 50, y, size, font });
  }
  draw('MUSTER - Kundenangebot', 766, 22, bold);
  draw(offer.customerName, 724, 12, bold);
  draw(offer.contactName, 706);
  draw('wir senden Ihnen unser freibleibendes Angebot zu unseren beigefügten', 656);
  draw('allgemeinen Geschäfts- und Lieferbedingungen wie folgt zu:', 639);
  draw(offer.article, 594, 12, bold);
  if (offer.batch) draw(`Charge ${offer.batch}`, 575);
  draw(`${amounts.format(offer.quantityKg)} kg zu ${prices.format(offer.salePrice)} je Tonne`, 539);
  draw(`Angebotssumme netto ${prices.format(offer.quantityKg * offer.salePrice / 1000)}`, 514, 12, bold);
  draw(offer.incotermText, 476);
  offer.pickup.split(/\r?\n/).slice(0, 7).forEach((part, index) => draw(part, 454 - index * 16));
  if (offer.batch && offer.availableQuantityKg > offer.quantityKg) {
    draw(`Verfügbare Menge dieser Charge bis zu ${amounts.format(offer.availableQuantityKg)} kg`, 316);
  }
  draw('Musterbeleg zum Abgleich mit der Originalvorlage', 71, 9);
  return Buffer.from(await document.save());
}

async function sampleOfferEml(offer) {
  const sample = { ...offer, senderEmail: 'aussendienst@example.invalid', recipientEmail: 'kunde@example.invalid' };
  const mail = assembleOfferMail(sample, {
    number: 'MUSTER-001', subject: 'Muster - Ihr Angebot',
    body: 'Muster für die spätere BMS-Begleitmail.', isBodyHtml: false, pdf: await createSampleOfferPdf(sample),
  });
  const boundary = randomUUID();
  const encoded = bytes => Buffer.from(bytes).toString('base64').match(/.{1,76}/g).join('\r\n');
  const parts = ['From: aussendienst@example.invalid', 'To: kunde@example.invalid', `Subject: ${mail.subject}`,
    'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', encoded(mail.body)];
  for (const attachment of mail.attachments) {
    parts.push(`--${boundary}`, `Content-Type: ${attachment.contentType}`,
      `Content-Disposition: attachment; filename="${attachment.fileName}"`, 'Content-Transfer-Encoding: base64', '', encoded(attachment.content));
  }
  return parts.concat(`--${boundary}--`, '').join('\r\n');
}

module.exports = { assembleOfferMail, offerXml, readBmsOfferDocument, sampleOfferEml, singleEmail };
