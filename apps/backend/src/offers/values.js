const crypto = require('crypto');
const { createHttpError } = require('../utils');

function invalid(message) {
  throw createHttpError(400, message, { code: 'INVALID_OFFER' });
}
function text(value, max = 20000) {
  const result = String(value ?? '').trim();
  if (result.length > max)
    invalid(`Text ist zu lang (maximal ${max} Zeichen).`);
  return result;
}
function date(value, required = false) {
  if (!value && !required) return null;
  const result =
    value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value ?? '');
  const parsed = new Date(`${result}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== result
  )
    invalid('Ungültiges Datum.');
  return result;
}
function number(value, scale = 3, max = 999999999) {
  const s = String(value ?? '').replace(',', '.');
  const pattern = scale ? `^\\d+(?:\\.\\d{1,${scale}})?$` : '^\\d+$';
  if (
    !new RegExp(pattern).test(s) ||
    !Number.isFinite(Number(s)) ||
    Number(s) > max
  )
    invalid('Ungültige Menge oder ungültiger Preis.');
  return Number(s);
}
function uuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ''),
  );
}
function scaled(value, digits) {
  return BigInt(Number(value).toFixed(digits).replace('.', ''));
}
function roundedDivide(n, d) {
  return (n + d / 2n) / d;
}
function totals(positions, discountPercent, vatPercent) {
  const lines = positions.map((p) =>
    roundedDivide(
      scaled(p.quantity, 3) * scaled(p.price, 4),
      BigInt(p.priceBasis) * 100000n,
    ),
  );
  const net = lines.reduce((sum, v) => sum + v, 0n);
  const discount = roundedDivide(net * scaled(discountPercent, 3), 100000n);
  const subtotal = net - discount;
  const vat = roundedDivide(subtotal * scaled(vatPercent, 3), 100000n);
  if (net > 99999999999999n || subtotal + vat > 99999999999999n)
    invalid('Angebotssumme ist zu groß.');
  const amount = (v) => Number(v) / 100;
  return {
    lineTotals: lines.map(amount),
    netAmount: amount(net),
    discountAmount: amount(discount),
    subtotal: amount(subtotal),
    vatAmount: amount(vat),
    totalAmount: amount(subtotal + vat),
  };
}
function normalize(body = {}) {
  const header = {
    customerId: text(body.customerId, 10),
    contactId: body.contactId ? number(body.contactId, 0, 2147483647) : null,
    contact: text(body.contact, 50),
    department: text(body.department, 50),
    offerDate: date(body.offerDate, true),
    language: text(body.language || 'DE', 2).toUpperCase(),
    inquiryDate: date(body.inquiryDate),
    inquiryVia: text(body.inquiryVia, 15),
    customerReference: text(body.customerReference, 50),
    title: text(body.title, 100),
    validUntil: date(body.validUntil),
    currency: text(body.currency || 'EUR', 3).toUpperCase(),
    paymentId: body.paymentId ? number(body.paymentId, 0, 2147483647) : null,
    paymentText: text(body.paymentText, 1000),
    deliveryTerms: text(body.deliveryTerms, 250),
    packaging: text(body.packaging, 100),
    intro: text(body.intro),
    closingText: text(body.closingText),
    internalNote: text(body.internalNote),
    discountPercent: number(body.discountPercent ?? 0, 3, 100),
    vatPercent: number(body.vatPercent ?? 19, 3, 100),
    printTotals: body.printTotals !== false,
  };
  if (
    !header.customerId ||
    !['DE', 'EN'].includes(header.language) ||
    !/^[A-Z]{3}$/.test(header.currency)
  )
    invalid('Kunde, Sprache oder Währung fehlt bzw. ist ungültig.');
  if (header.validUntil && header.validUntil < header.offerDate)
    invalid('Gültigkeit liegt vor dem Angebotsdatum.');
  if (
    !Array.isArray(body.positions) ||
    !body.positions.length ||
    body.positions.length > 200
  )
    invalid('Bitte 1 bis 200 Positionen erfassen.');
  const keys = new Set();
  const positions = body.positions.map((p, i) => {
    const lineKey = uuid(p.lineKey) ? p.lineKey : crypto.randomUUID();
    if (keys.has(lineKey.toLowerCase())) invalid('Doppelte Positionskennung.');
    keys.add(lineKey.toLowerCase());
    const position = {
      lineNo: i + 1,
      lineKey,
      articleIndex: text(p.articleIndex, 50),
      article: text(p.article, 75),
      quantity: number(p.quantity),
      unit: text(p.unit || 'KG', 50),
      price: number(p.price, 4),
      priceBasis: number(p.priceBasis ?? 1000, 0, 1000000),
      description: text(p.description),
      alternativeText: text(p.alternativeText, 50),
      deliveryDate: date(p.deliveryDate),
      deliveryText: text(p.deliveryText, 1000),
      sample: p.sample === true,
      rejected: p.rejected === true,
      reserve: p.reserve === true,
      beNumber: p.reserve ? text(p.beNumber, 17) : null,
      warehouseId: p.reserve ? text(p.warehouseId, 6) : null,
      reserveQuantity: p.reserve ? number(p.reserveQuantity) : null,
      reserveUntil: p.reserve ? date(p.reserveUntil, true) : null,
    };
    if (
      !position.articleIndex ||
      !position.article ||
      position.quantity <= 0 ||
      !position.priceBasis
    )
      invalid('Artikel, Menge und Preisbasis sind erforderlich.');
    if (
      position.reserve &&
      (!position.beNumber ||
        !position.warehouseId ||
        position.reserveQuantity <= 0 ||
        position.reserveQuantity > position.quantity ||
        !/^kg$/i.test(position.unit))
    )
      invalid(
        'Für eine Reservierung werden eine Bestandsposition, Lager und eine passende Menge in kg benötigt.',
      );
    return position;
  });
  const calculated = totals(
    positions,
    header.discountPercent,
    header.vatPercent,
  );
  positions.forEach((p, i) => {
    p.total = calculated.lineTotals[i];
  });
  delete calculated.lineTotals;
  return { header: { ...header, ...calculated }, positions };
}
module.exports = { normalize, totals, text, date, uuid };
