const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { purchaseTruckLoadKg } = require('../db/purchase-order-values');
const { offeredQuantityKg } = require('./purchase-quantity');
const { optionPriceNeedsReview } = require('./price-plausibility');
const { dateOnly } = require('./read');

const WIDTH = 595.28;
const HEIGHT = 841.89;
const LEFT = 44;
const RIGHT = WIDTH - LEFT;
const DARK = rgb(0.07, 0.15, 0.24);
const INK = rgb(0.08, 0.15, 0.24);
const MUTED = rgb(0.30, 0.38, 0.46);
const LIGHT = rgb(0.95, 0.97, 0.98);
const RULE = rgb(0.85, 0.89, 0.92);
const TEAL = rgb(0, 0.42, 0.38);
const TEAL_TINT = rgb(0.89, 0.96, 0.94);
const WHITE = rgb(1, 1, 1);
const PALE = rgb(0.81, 0.87, 0.92);
const EMPTY = '–';

const weight = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 });
const price = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const infoDate = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium' });
const displayDate = (value) => dateOnly(value)?.split('-').reverse().join('.') || EMPTY;
const valueText = (parts) => parts.filter((part) => part != null && String(part).trim()).join(' ');
const kg = (value) => value == null ? '' : `${weight.format(value)} kg`;

function capturePurchaseOption(source, now) {
  const packaging = source.opp_Verpackung || source.packagingText;
  const amountKg = offeredQuantityKg(source, purchaseTruckLoadKg(packaging));
  const sourcePrice = source.opp_PreisProTonne;
  const priceNeedsReview = optionPriceNeedsReview(sourcePrice);
  const density = source.density == null ? '' : weight.format(source.density);
  const mfi = source.mfi == null ? '' : weight.format(source.mfi);
  const mfiRange = mfi && source.mfiTo != null && Number(source.mfiTo) !== Number(source.mfi)
    ? `${mfi}–${weight.format(source.mfiTo)}` : mfi;
  const rawPriceUnit = String(source.rawPriceUnit || '').trim();
  const rawCurrency = String(source.rawCurrency || '').trim();
  const rawPriceLabel = source.rawPrice == null ? '' : valueText([
    price.format(source.rawPrice),
    rawPriceUnit.toUpperCase().includes(rawCurrency.toUpperCase()) ? '' : rawCurrency,
    rawPriceUnit,
  ]);
  return {
    capturedAt: now,
    supplier: source.supplierName,
    offerNo: source.externalOfferNo,
    validUntil: dateOnly(source.validUntil),
    article: source.opp_Artikelname_Lieferant || source.opp_Artikelname,
    material: source.materialCategory,
    quality: source.quality,
    batch: source.batchNo,
    mfi: mfiRange && valueText([`${mfiRange} g/10 min`, source.mfiTestCondition && `(${source.mfiTestCondition})`]),
    density: valueText([density, source.densityUnit]),
    properties: source.propertiesText,
    amount: kg(amountKg) || source.quantityText,
    price: sourcePrice == null || priceNeedsReview ? rawPriceLabel : `${price.format(sourcePrice)} EUR/t`,
    priceNeedsReview,
    packaging,
    incoterm: source.incoterm,
    location: source.loadingLocation,
    loadingNote: source.loadingText,
    terms: source.termsText,
  };
}

function printableText(value, characters) {
  const replacements = { '−': '-', '‑': '-', '≤': '<=', '≥': '>=', 'μ': 'µ', 'α': 'alpha', 'β': 'beta',
    'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'ı': 'i' };
  return Array.from(String(value ?? '').normalize('NFC'), (char) => {
    if (char === '\n') return char;
    if (/\s/u.test(char)) return ' ';
    if (/[\p{Cc}\p{Cf}]/u.test(char)) return '';
    if (characters.has(char.codePointAt(0))) return char;
    const simplified = replacements[char] ?? char.normalize('NFKD').replace(/\p{Mark}/gu, '');
    return Array.from(simplified).every((piece) => characters.has(piece.codePointAt(0))) ? simplified : '?';
  }).join('').trim();
}

function wrap(text, font, size, maxWidth) {
  if (!text) return [EMPTY];
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.trim().split(/\s+/u)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      for (const char of word) {
        if (font.widthOfTextAtSize(line + char, size) > maxWidth) {
          lines.push(line);
          line = '';
        }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}

async function renderPurchaseOptionPdf(order, snapshots, { sample = false } = {}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Option zur Bestellung');
  pdf.setAuthor('BMS-App');
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const characters = new Set(regular.getCharacterSet());
  const clean = (value) => printableText(value, characters);
  let page;
  let cursor;
  let reference;

  function rectangle(x, top, width, height, color) {
    page.drawRectangle({ x, y: HEIGHT - top - height, width, height, color });
  }

  function text(line, x, baseline, { font = regular, size = 10.5, color = INK, align } = {}) {
    const offset = align === 'right' ? font.widthOfTextAtSize(line, size) : 0;
    page.drawText(line, { x: x - offset, y: HEIGHT - baseline, font, size, color });
  }

  function rule(y, from = LEFT, to = RIGHT) {
    page.drawLine({ start: { x: from, y: HEIGHT - y }, end: { x: to, y: HEIGHT - y }, thickness: 0.6, color: RULE });
  }

  function addPage(continuation = false) {
    page = pdf.addPage([WIDTH, HEIGHT]);
    const headerHeight = continuation ? 111 : 164;
    rectangle(0, 0, WIDTH, headerHeight, DARK);
    rectangle(LEFT, 31, 4, 13, rgb(0.38, 0.86, 0.76));
    text('BMS-App  /  Einkauf', LEFT + 12, 42, { font: bold, size: 10, color: PALE });
    if (sample) {
      rectangle(RIGHT - 149, 29, 149, 20, rgb(0.16, 0.25, 0.35));
      text('MUSTER MIT FIKTIVEN DATEN', RIGHT - 9, 42.5, { font: bold, size: 8, color: WHITE, align: 'right' });
    }
    if (!continuation) text('Option zur Bestellung', LEFT, 101, { font: bold, size: 33, color: WHITE });
    text(reference, LEFT, continuation ? 79 : 132, { size: 11, color: PALE });
    cursor = headerHeight + 24;
  }

  function room(height) {
    if (cursor + height > 750) addPage(true);
  }

  function heading(title) {
    room(65);
    text(title, LEFT, cursor + 15, { size: 16, font: bold });
    cursor += 29;
  }

  function paragraph(label, value, size = 10.5, font = regular) {
    if (!clean(value)) return;
    const lines = wrap(clean(value), font, size, RIGHT - LEFT);
    room((label ? 17 : 0) + size + 6);
    if (label) {
      text(label, LEFT, cursor + 10, { size: 9.4, color: MUTED });
      cursor += 17;
    }
    for (const line of lines) {
      room(size + 6);
      if (line) text(line, LEFT, cursor + size, { size, font });
      cursor += size + 4;
    }
    cursor += 8;
  }

  function fields(pairs, shaded = false) {
    const inset = shaded ? 15 : 0;
    const gap = 31;
    const columnWidth = (RIGHT - LEFT - 2 * inset - gap) / 2;
    for (let index = 0; index < pairs.length; index += 2) {
      const cells = pairs.slice(index, index + 2).map(([label, value]) => ({
        label, lines: wrap(clean(value), bold, 11, columnWidth),
      }));
      let offset = 0;
      const maxLines = Math.max(...cells.map(({ lines }) => lines.length));
      while (offset < maxLines) {
        room(63);
        const count = Math.min(maxLines - offset, Math.floor((750 - cursor - 37) / 15));
        const height = count * 15 + 37;
        if (shaded) rectangle(LEFT, cursor, RIGHT - LEFT, height, LIGHT);
        cells.forEach(({ label, lines }, column) => {
          if (offset >= lines.length) return;
          const x = LEFT + inset + column * (columnWidth + gap);
          text(label, x, cursor + 19, { size: 9.4, color: MUTED });
          lines.slice(offset, offset + count).forEach((line, i) => {
            if (line) text(line, x, cursor + 36 + i * 15, { size: 11, font: bold });
          });
        });
        offset += count;
        cursor += height + (shaded ? 2 : 0);
      }
    }
    cursor += shaded ? 28 : 5;
  }

  function conditions(source, line) {
    const columns = [LEFT + 13, 368, RIGHT - 13];
    const rows = [
      ['Menge', source.amount && `${source.amount} angeboten`, `${kg(line.amount)} bestellt`],
      ['Preis', source.price, `${price.format(line.purchasePrice)} ${line.currency}/t`],
      ['Verpackung', source.packaging, order.packagingType],
      ['Incoterm', source.incoterm, order.deliveryTermText],
    ];
    const rowLines = rows.map(([name, offered, ordered]) => [
      name, wrap(clean(offered), bold, 10.5, 207), wrap(clean(ordered), bold, 10.5, 148),
    ]);
    function tableHeader() {
      rectangle(LEFT, cursor, RIGHT - LEFT, 31, LIGHT);
      rectangle(383, cursor, RIGHT - 383, 31, TEAL_TINT);
      text('Konditionen', columns[0], cursor + 20, { font: bold });
      text('Laut Option', columns[1], cursor + 20, { font: bold, align: 'right' });
      text('Bestellung', columns[2], cursor + 20, { font: bold, align: 'right', color: TEAL });
      cursor += 31;
    }
    room(61);
    tableHeader();
    for (const [name, offered, ordered] of rowLines) {
      const total = Math.max(offered.length, ordered.length);
      let offset = 0;
      while (offset < total) {
        if (cursor + 26 > 750) {
          addPage(true);
          tableHeader();
        }
        const count = Math.min(total - offset, Math.floor((750 - cursor - 11) / 15));
        const height = count * 15 + 11;
        rectangle(LEFT, cursor, RIGHT - LEFT, height, LIGHT);
        rectangle(383, cursor, RIGHT - 383, height, TEAL_TINT);
        rule(cursor, columns[0], columns[2]);
        text(name, columns[0], cursor + 17, { color: MUTED });
        [offered, ordered].forEach((values, column) => {
          values.slice(offset, offset + count).forEach((line, i) => {
            if (line) text(line, columns[column + 1], cursor + 17 + i * 15, {
              font: bold, align: 'right', color: column ? TEAL : INK,
            });
          });
        });
        offset += count;
        cursor += height;
      }
    }
    cursor += 24;
  }

  for (const line of order.positions.filter((position) => position.optionId != null)) {
    const source = snapshots[line.optionPositionId];
    reference = `Bestellung ${order.id}  ·  Option ${line.optionId}  ·  Optionsstand ${infoDate.format(new Date(source.capturedAt))}`;
    addPage();
    fields([
      ['Lieferant laut Option', source.supplier || order.supplierName], ['Angebotsnummer', source.offerNo],
      ['Gültig bis', displayDate(source.validUntil)], ['Ladeort laut Option', source.location],
    ], true);
    heading(`Optionsposition ${line.optionPositionId}  ·  Bestellposition ${line.lineNo}`);
    paragraph('', source.article || line.article, 14, bold);
    paragraph('', [source.material, source.quality, source.batch && `Charge ${source.batch}`].filter(Boolean).join('  ·  '));
    const properties = [['MFI', source.mfi], ['Dichte', source.density]].filter(([, value]) => value);
    if (properties.length) {
      room(63);
      rule(cursor);
      fields(properties);
    }
    paragraph('Eigenschaften', source.properties);
    cursor += 9;
    conditions(source, line);
    if (source.priceNeedsReview) paragraph('', 'Angebotspreis aus der Quelle. Die Umrechnung in EUR/t ist nicht bestätigt.');
    heading('Logistik');
    fields([['Gewünschter Liefertermin', displayDate(line.requestedDeliveryDate)],
      ['Verladehinweis laut Option', source.loadingNote]]);
    if (order.loadingLocationChanged) paragraph('Ladeort der Bestellung', order.loadingLocationText);
    paragraph('Weitere Angebotskonditionen', source.terms);
  }

  const pages = pdf.getPages();
  pages.forEach((pdfPage, index) => {
    page = pdfPage;
    rule(777);
    text('BMS-App  /  Internes Optionsblatt', LEFT, 797, { size: 9, color: MUTED });
    text(`Seite ${index + 1} / ${pages.length}`, RIGHT, 797, { size: 9, color: MUTED, align: 'right' });
  });
  return Buffer.from(await pdf.save());
}

module.exports = { capturePurchaseOption, renderPurchaseOptionPdf };
