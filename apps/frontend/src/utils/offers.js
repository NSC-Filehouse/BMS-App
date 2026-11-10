import { createCustomerOperationId as createId } from './customerCreation.js';

export const offerStatus = (status, en = false) =>
  (en
    ? ['Draft', 'Released for BMS import', 'Imported into BMS', 'Rework']
    : [
        'Entwurf',
        'Zur BMS-Übernahme freigegeben',
        'In BMS übernommen',
        'Nacharbeit',
      ])[Number(status)] || '-';
export function today() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(
    new Date(),
  );
}
export function blankOffer() {
  return {
    customerId: '',
    customerName: '',
    customerAddress: '',
    contactId: null,
    contact: '',
    department: '',
    offerDate: today(),
    language: 'DE',
    currency: 'EUR',
    title: '',
    customerReference: '',
    inquiryDate: '',
    inquiryVia: '',
    validUntil: '',
    paymentId: null,
    paymentText: '',
    deliveryTerms: '',
    packaging: '',
    intro: '',
    closingText: '',
    internalNote: '',
    discountPercent: 0,
    vatPercent: 19,
    printTotals: true,
    positions: [],
    clientRequestId: createId(),
  };
}
export function copyOffer(source) {
  const result = {
    ...blankOffer(),
    ...source,
    id: undefined,
    version: undefined,
    copySourceId: source.id,
    clientRequestId: createId(),
    status: 0,
    bmsOfferNumber: '',
    offerDate: today(),
    validUntil: '',
    customerId: '',
    customerName: '',
    customerAddress: '',
    contactId: null,
    contact: '',
    department: '',
    customerReference: '',
    inquiryDate: '',
    inquiryVia: '',
    paymentId: null,
    paymentText: '',
    createdBy: undefined,
    createdAt: undefined,
    modifiedAt: undefined,
    returnComment: '',
  };
  result.positions = source.positions.map((p) => ({
    ...p,
    id: undefined,
    lineKey: createId(),
    reserve: false,
    beNumber: null,
    warehouseId: null,
    reserveQuantity: null,
    reserveUntil: null,
    reservationVersion: null,
  }));
  return result;
}
export function changeOfferCustomer(offer, defaults) {
  return {
    ...offer,
    customerId: defaults.customerId,
    customerName: defaults.customerName,
    customerAddress: defaults.customerAddress,
    contactId: null,
    contact: '',
    department: '',
    customerReference: '',
    paymentId: defaults.paymentId,
    paymentText: defaults.paymentText,
  };
}
export function newOfferPosition(article) {
  return {
    lineKey: createId(),
    articleIndex: article.articleIndex,
    article: article.article,
    quantity: '',
    unit: article.unit || 'KG',
    price: '',
    priceBasis: /^kg$/i.test(article.unit || 'KG') ? 1000 : 1,
    description: article.description || '',
    alternativeText: '',
    deliveryDate: '',
    deliveryText: '',
    sample: false,
    rejected: false,
    reserve: false,
  };
}
export function estimateOffer(offer) {
  const scaled = (value, digits) =>
    BigInt(
      Math.max(0, Math.min(999999999, Number(value) || 0))
        .toFixed(digits)
        .replace('.', ''),
    );
  const divide = (n, d) => (n + d / 2n) / d;
  const net = offer.positions.reduce(
    (sum, p) =>
      sum +
      divide(
        scaled(p.quantity, 3) * scaled(p.price, 4),
        BigInt(Math.max(1, Math.trunc(Number(p.priceBasis) || 1))) * 100000n,
      ),
    0n,
  );
  const discount = divide(net * scaled(offer.discountPercent, 3), 100000n);
  const subtotal = net - discount;
  const vat = divide(subtotal * scaled(offer.vatPercent, 3), 100000n);
  return {
    netAmount: Number(net) / 100,
    discountAmount: Number(discount) / 100,
    subtotal: Number(subtotal) / 100,
    vatAmount: Number(vat) / 100,
    totalAmount: Number(subtotal + vat) / 100,
  };
}
export const money = (n, currency = 'EUR') =>
  `${Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
