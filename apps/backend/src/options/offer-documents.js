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
    fallback: en
      ? `If an action does not open a draft, please reply to this email and quote ${number}.`
      : `Falls sich kein Entwurf öffnet, antworten Sie bitte direkt auf diese E-Mail und nennen Sie ${number}.`,
    actions: [
      { label: en ? 'Accept offer' : 'Angebot annehmen', url: mailto(`${number} - ${en ? 'Offer accepted' : 'Angebot angenommen'}`, en
        ? `Thank you for your offer ${number}. We accept this offer.`
        : `Vielen Dank für Ihr Angebot ${number}. Wir nehmen das Angebot an.`) },
      { label: counter, url: mailto(`${number} - ${en ? 'Counteroffer' : 'Gegenangebot'}`, en
        ? `Counteroffer for ${number}\r\n\r\nPrice in EUR/t: \r\nQuantity in kg: \r\nComment: `
        : `Gegenangebot zu ${number}\r\n\r\nWunschpreis in EUR/t: \r\nMenge in kg: \r\nBemerkung: `) },
      { label: decline, url: mailto(`${number} - ${decline}`, en
        ? `Thank you for offer ${number}. It is not of interest to us at this time.`
        : `Vielen Dank für Ihr Angebot ${number}. Das Angebot ist für uns derzeit nicht interessant.`) },
    ],
  };
}

function offerXml(offer, number) {
  const tag = (name, value) => `<${name}>${xmlText(value)}</${name}>`;
  const { article, articleIndex, batch, quantityKg, availableQuantityKg, salePrice, incotermCode, pickup, customerId, validUntil } = offer;
  if (offer.kind === 'app' && !offer.positions?.length) throw new Error('Angebotspositionen fehlen.');
  const positions = offer.kind === 'app' ? offer.positions.flatMap(position => [
    '  <Position>',
    `    ${tag('ArticleNumber', position.articleIndex)}`,
    `    ${tag('ArticleName', position.article)}`,
    `    <Quantity unit="${xmlText(/^kg$/i.test(position.unit) ? 'KGM' : position.unit)}">${Number(position.quantity).toFixed(3)}</Quantity>`,
    `    <Price currency="EUR" basis="${xmlText(position.priceBasis)}">${Number(position.price).toFixed(4)}</Price>`,
    '  </Position>',
  ]) : [
    '  <Position>',
    `    ${tag('ArticleNumber', articleIndex)}`,
    `    ${tag('ArticleName', article)}`,
    ...(batch ? [`    ${tag('Batch', batch)}`] : []),
    `    <Quantity unit="KGM">${quantityKg.toFixed(3)}</Quantity>`,
    `    <PricePerTonne currency="EUR">${salePrice.toFixed(4)}</PricePerTonne>`,
    ...(batch && availableQuantityKg > quantityKg
      ? [`    <AvailableBatchQuantity unit="KGM">${availableQuantityKg.toFixed(3)}</AvailableBatchQuantity>`] : []),
    '  </Position>',
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Offer xmlns="urn:filehouse:bms:customer-offer:1" version="1.0">',
    `  ${tag('OfferNumber', number)}`,
    `  ${tag('CustomerNumber', customerId)}`,
    '  <NonBinding>true</NonBinding>',
    ...(validUntil ? [`  ${tag('ValidUntil', validUntil)}`] : []),
    ...positions,
    '  <Delivery>',
    ...(incotermCode ? [`    ${tag('Incoterm', incotermCode)}`] : []),
    ...(pickup ? [`    ${tag('PickupLocation', pickup)}`] : []),
    '  </Delivery>',
    '</Offer>',
  ].join('\n');
}

function defaultOfferBody(offer, number) {
  if (offer.language === 'en') return [
    'Dear Sir or Madam,',
    `Please find our non-binding offer ${number} attached. Our general terms and conditions of sale and delivery apply.`,
    `We hope our offer meets your requirements. When placing your order, please quote our offer reference ${number}. If you have any questions, we will be happy to help.`,
    `Kind regards\n${offer.senderName}`,
  ].join('\n\n');
  return [
    'Sehr geehrte Damen und Herren,',
    `anbei senden wir Ihnen unser freibleibendes Angebot ${number} zu unseren allgemeinen Geschäfts- und Lieferbedingungen.`,
    `Wir hoffen, unser Angebot sagt Ihnen zu, und freuen uns auf Ihren Auftrag. Bei Ihrer Bestellung bitten wir Sie, unsere Angebotsreferenz ${number} anzugeben. Für Rückfragen stehen wir Ihnen gerne zur Verfügung.`,
    `Mit freundlichen Grüßen\n${offer.senderName}`,
  ].join('\n\n');
}

function assembleOfferMail(offer, document, delivery) {
  const fromAddress = singleEmail(offer.senderEmail);
  const recipient = singleEmail(offer.recipientEmail);
  if (!fromAddress || !recipient) throw new Error('Ungültiger Absender oder Empfänger.');
  const links = responseLinks(offer, document.number, fromAddress);
  const spacer = '<tr aria-hidden="true"><td height="12" style="font-size:1px;line-height:12px">&nbsp;</td></tr>';
  const actionRows = links.actions.map((action, index) => {
    const background = index === 0 ? '#245078' : '#E9EFF6';
    const foreground = index === 0 ? '#FFFFFF' : '#24405C';
    return `<tr><td align="center" bgcolor="${background}" style="text-align:center;mso-padding-alt:9px 14px">`
      + `<a href="${escapeMarkup(action.url)}" style="display:block;padding:9px 14px;text-align:center;color:${foreground} !important;font-weight:bold;text-decoration:underline">`
      + `<span style="color:${foreground} !important;mso-style-textfill-type:solid;mso-style-textfill-fill-color:${foreground}">${escapeMarkup(action.label)}</span></a>`
      + '</td></tr>';
  }).join(spacer);
  const controls = `<div style="margin-top:20px"><p>${escapeMarkup(links.request)}</p>`
    + `<table role="presentation" cellpadding="0" cellspacing="0" border="0">${actionRows}</table>`
    + `<p>${escapeMarkup(links.fallback)}</p></div>`;
  const en = offer.language === 'en';
  const nonBinding = en ? /\bnon[\s\u00a0\u2010-\u2011-]+binding\b/i : /\bfreibleibend\p{L}*\b/iu;
  const mailText = document.body || defaultOfferBody(offer, document.number);
  const visibleText = document.isBodyHtml
    ? mailText.replace(/<!--[\s\S]*?-->|<[^>]*>/g, '').replace(/&nbsp;/gi, ' ')
    : mailText;
  const notice = nonBinding.test(visibleText) ? '' : en
    ? '<p>This offer is non-binding.</p>'
    : '<p>Dieses Angebot ist freibleibend.</p>';
  const footer = notice + controls;
  const body = document.isBodyHtml
    ? (/<\/body\s*>/i.test(mailText) ? mailText.replace(/<\/body\s*>/i, match => footer + match) : mailText + footer)
    : `<div style="white-space:pre-wrap">${escapeMarkup(mailText).replace(/\r\n|\r|\n/g, '<br>')}</div>${footer}`;
  return {
    clientMessageId: delivery?.clientMessageId ?? `bms-app:option-offer:${offer.messageKey}`,
    fromAddress, fromDisplayName: offer.senderName,
    to: delivery?.to ?? [{ address: recipient, displayName: offer.contactName }],
    subject: document.subject, body, isBodyHtml: true,
    attachments: [
      { fileName: `Angebot-${fileLabel(document.number)}.pdf`, contentType: 'application/pdf', content: document.pdf },
      { fileName: `Angebot-${fileLabel(document.number)}.xml`, contentType: 'application/xml', content: Buffer.from(offerXml(offer, document.number)) },
      ...(document.attachments || []),
    ],
  };
}

function readBmsOfferDocument(json, messageKey, erpPdf) {
  const data = JSON.parse(json);
  if (data?.source !== 'bms' || data.messageKey !== messageKey || typeof data.number !== 'string' || !/^[\w./-]{1,80}$/.test(data.number)
    || typeof data.subject !== 'string' || !data.subject.trim() || /[\r\n]/.test(data.subject)
    || typeof data.body !== 'string' || !data.body.trim() || typeof data.isBodyHtml !== 'boolean'
    || (!erpPdf && typeof data.pdfBase64 !== 'string')) throw new Error('Ungültige BMS-Angebotsausgabe.');
  const pdf = erpPdf || Buffer.from(data.pdfBase64, 'base64');
  if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('BMS-Angebots-PDF fehlt.');
  const attachments = (data.attachments || []).map(item => {
    if (!item || typeof item.contentBase64 !== 'string' || !item.contentBase64.length || typeof item.fileName !== 'string'
      || !item.fileName.trim() || /[\x00-\x1F/\\]/.test(item.fileName)
      || !/^[\w.+-]+\/[\w.+-]+$/.test(item.contentType)) throw new Error('Ungültiger BMS-Anhang.');
    return { fileName: item.fileName, contentType: item.contentType, content: Buffer.from(item.contentBase64, 'base64') };
  });
  return { ...data, pdf, attachments };
}

function readTempOfferDocument(row, offer) {
  const number = String(row.offerNumber ?? '').trim();
  const pdf = row.pdf;
  if (Number(row.erpStatus) !== 2 || !/^[\w./-]{1,80}$/.test(number) || !Buffer.isBuffer(pdf)
    || pdf.length <= 5 || pdf.subarray(0, 5).toString() !== '%PDF-') {
    throw new Error('Das BMS-Angebot mit PDF ist nicht fertig.');
  }
  if (row.documentJson) {
    const document = readBmsOfferDocument(row.documentJson, offer.messageKey, pdf);
    if (document.number !== number) throw new Error('Die BMS-Ausgaben haben unterschiedliche Angebotsnummern.');
    return document;
  }
  const en = offer.language === 'en';
  return {
    number, pdf, isBodyHtml: false,
    subject: en ? `Your offer ${number}` : `Ihr Angebot ${number}`,
  };
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
    isBodyHtml: false, pdf: await createSampleOfferPdf(sample),
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

module.exports = { assembleOfferMail, offerXml, readBmsOfferDocument, readTempOfferDocument, sampleOfferEml, singleEmail };
