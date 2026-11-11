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
export const today = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(
    new Date(),
  );
export function tomorrow() {
  const d = new Date(`${today()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
export function blankOffer() {
  return {
    customerId: '',
    customerName: '',
    customerAddress: '',
    contactId: null,
    contact: '',
    customerReference: '',
    paymentId: null,
    paymentText: '',
    specialPaymentCondition: false,
    deliveryTermsId: null,
    deliveryTerms: '',
    packagingId: null,
    packaging: '',
    deliveryAddressId: null,
    deliveryAddress: '',
    deliveryAddressManual: false,
    internalNote: '',
    positions: [],
    clientRequestId: createId(),
  };
}
export function defaultOfferContact(contacts = []) {
  return (
    [1, 2, 3]
      .map((rank) =>
        contacts.find(
          (c) =>
            Number(c.ranking) === rank && c.id && String(c.name || '').trim(),
        ),
      )
      .find(Boolean) || null
  );
}
export function changeOfferCustomer(offer, defaults) {
  const contact = defaultOfferContact(defaults.contacts);
  const address =
    defaults.deliveryAddresses?.length === 1
      ? defaults.deliveryAddresses[0]
      : null;
  return {
    ...offer,
    customerId: defaults.customerId,
    customerName: defaults.customerName,
    customerAddress: defaults.customerAddress,
    contactId: contact?.id || null,
    contact: contact?.name || '',
    customerReference: '',
    paymentId: defaults.paymentId,
    paymentText: defaults.paymentText,
    specialPaymentCondition: false,
    deliveryAddressId: address?.id || null,
    deliveryAddress: address?.text || '',
    deliveryAddressManual: false,
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
    customerId: '',
    customerName: '',
    customerAddress: '',
    contactId: null,
    contact: '',
    customerReference: '',
    paymentId: null,
    paymentText: '',
    specialPaymentCondition: false,
    deliveryAddressId: null,
    deliveryAddress: '',
    deliveryAddressManual: false,
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
export function newOfferPosition(article) {
  return {
    lineKey: createId(),
    articleIndex: article.articleIndex,
    article: article.article,
    masterArticle: article.article,
    quantity: '',
    unit: article.unit || 'KG',
    price: '',
    priceBasis: /^kg$/i.test(article.unit || 'KG') ? 1000 : 1,
    costPrice: article.costPrice ?? '',
    deliveryDate: tomorrow(),
    valutaDate: tomorrow(),
    wpzOriginal: true,
    wpzComment: 'Original verwenden',
    reserve: false,
  };
}
export function positionTotal(p) {
  const scaled = (v, n) =>
    BigInt(
      Math.max(0, Math.min(999999999, Number(v) || 0))
        .toFixed(n)
        .replace('.', ''),
    );
  const d =
    BigInt(Math.max(1, Math.trunc(Number(p.priceBasis) || 1))) * 100000n;
  return (
    Number((scaled(p.quantity, 3) * scaled(p.price, 4) + d / 2n) / d) / 100
  );
}
export function estimateOffer(offer) {
  const net =
    offer.positions.reduce(
      (sum, p) => sum + Math.round(positionTotal(p) * 100),
      0,
    ) / 100;
  return { netAmount: net, totalAmount: net };
}
export const money = (n, currency = 'EUR') =>
  `${Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
