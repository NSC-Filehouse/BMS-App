const { totals } = require('./values');
const { incotermCode } = require('../incoterm');

const xml = value => String(value ?? '')
  .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g, '')
  .replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);

function basic(name, value, attributes = '') {
  return value == null || String(value).trim() === '' ? '' : `<cbc:${name}${attributes}>${xml(value)}</cbc:${name}>`;
}

function aggregate(name, ...children) {
  const content = children.filter(Boolean);
  if (!content.length) return '';
  return `<cac:${name}>\n${content.join('\n').replace(/^/gm, '  ')}\n</cac:${name}>`;
}

function address(name, value) {
  const lines = String(value ?? '').split(/\r\n|\n|\r/);
  return aggregate(name, ...lines.map(line => aggregate('AddressLine', basic('Line', line))));
}

function date(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function unitCode(unit) {
  const key = String(unit ?? '').trim().toUpperCase();
  return ({ KG: 'KGM', T: 'TNE', ST: 'C62', STK: 'C62', L: 'LTR' })[key] || key;
}

function property(name, value) {
  return value ? aggregate('AdditionalItemProperty', basic('Name', name), basic('Value', value)) : '';
}

function offerXml(offer, number) {
  const { header, seller, positions } = offer;
  const issueDate = date(header?.issueDate);
  if (!issueDate || !String(seller?.name ?? '').trim() || !positions?.length) throw new Error('Angebotsdatum, Verkäufer oder Angebotspositionen fehlen.');
  const currency = xml(String(header.currency || 'EUR').trim().toUpperCase());
  const amount = (name, value) => value == null ? '' : basic(name, Number(value).toFixed(2), ` currencyID="${currency}"`);
  const vatKnown = header.vatPercent != null || header.vatAmount != null;
  const calculated = totals(positions, Number(header.discountPercent ?? 0), Number(header.vatPercent ?? 0));
  const lineAmounts = positions.map((line, i) => Number(line.total ?? calculated.lineTotals[i]));
  const lineTotal = lineAmounts.reduce((sum, value) => sum + value, 0);
  const discount = Number(header.discountAmount ?? calculated.discountAmount);
  const subtotal = Number(header.subtotal ?? (Number(header.netAmount ?? lineTotal) - discount));
  const vat = vatKnown ? Number(header.vatAmount ?? calculated.vatAmount) : null;
  const payable = Number(header.totalAmount ?? (subtotal + (vat ?? 0)));
  const deliveryCode = incotermCode(header.deliveryTerms) || offer.incotermCode;
  const pickup = deliveryCode === 'FCA' ? offer.pickup || header.deliveryAddress : '';
  const deliveryAddress = pickup ? '' : address('DeliveryAddress', header.deliveryAddress);
  const contact = (name, email, department) => aggregate('Contact',
    basic('Name', name), basic('Department', department), basic('ElectronicMail', email));

  const lines = positions.map((line, i) => {
    const unit = ` unitCode="${xml(unitCode(line.unit))}"`;
    const valutaDate = date(line.valutaDate);
    const valutaLabel = offer.language === 'en' ? 'Value date' : 'Valutadatum';
    return aggregate('QuotationLine', aggregate('LineItem',
      basic('ID', line.lineNo ?? i + 1),
      valutaDate && basic('Note', valutaLabel + ': ' + valutaDate),
      basic('Quantity', Number(line.quantity).toFixed(3), unit),
      amount('LineExtensionAmount', lineAmounts[i]),
      aggregate('Delivery', aggregate('PromisedDeliveryPeriod',
        basic('EndDate', date(line.deliveryDate)), basic('Description', line.deliveryText))),
      aggregate('Price', basic('PriceAmount', Number(line.price).toFixed(4), ` currencyID="${currency}"`),
        basic('BaseQuantity', line.priceBasis, unit)),
      aggregate('Item', basic('Description', line.description), basic('Name', line.article),
        basic('AdditionalInformation', line.alternativeText),
        aggregate('SellersItemIdentification', basic('ID', line.articleIndex)),
        property('Packaging', header.packaging),
        offer.batch && aggregate('ItemInstance', aggregate('LotIdentification', basic('LotNumberID', offer.batch))))));
  });

  const components = [
    basic('UBLVersionID', '2.3'),
    basic('ID', number),
    basic('IssueDate', issueDate),
    basic('Note', offer.language === 'en' ? 'Non-binding offer' : 'Freibleibendes Angebot'),
    basic('Note', header.title), basic('Note', header.intro), basic('Note', header.closingText),
    basic('PricingCurrencyCode', currency),
    basic('LineCountNumeric', positions.length),
    aggregate('ValidityPeriod', basic('EndDate', date(header.validUntil ?? offer.validUntil))),
    header.customerReference && aggregate('AdditionalDocumentReference',
      basic('ID', header.customerReference), basic('DocumentType', 'Customer reference')),
    aggregate('SellerSupplierParty', aggregate('Party',
      aggregate('PartyIdentification', basic('ID', seller.id)),
      aggregate('PartyName', basic('Name', seller.name)),
      aggregate('PostalAddress', basic('StreetName', seller.street),
        basic('CityName', seller.city), basic('PostalZone', seller.postalCode),
        aggregate('Country', basic('IdentificationCode', seller.country))),
      contact(offer.senderName, offer.senderEmail))),
    aggregate('BuyerCustomerParty', basic('SupplierAssignedAccountID', header.customerId ?? offer.customerId),
      aggregate('Party', aggregate('PartyName', basic('Name', header.customerName ?? offer.customerName)),
        address('PostalAddress', header.customerAddress),
        contact(offer.contactName ?? header.contact, offer.recipientEmail, header.department))),
    aggregate('Delivery', deliveryAddress),
    aggregate('DeliveryTerms', basic('ID', deliveryCode), basic('SpecialTerms', header.deliveryTerms || offer.incotermText),
      pickup && aggregate('DeliveryLocation', address('Address', pickup))),
    aggregate('TransactionConditions', basic('Description', header.paymentText)),
    discount > 0 && aggregate('AllowanceCharge', basic('ChargeIndicator', false),
      basic('MultiplierFactorNumeric', header.discountPercent == null ? null : Number(header.discountPercent) / 100),
      amount('Amount', discount), amount('BaseAmount', lineTotal)),
    vatKnown && aggregate('TaxTotal', amount('TaxAmount', vat),
      header.vatPercent != null && aggregate('TaxSubtotal', amount('TaxableAmount', subtotal), amount('TaxAmount', vat),
        aggregate('TaxCategory', basic('Percent', header.vatPercent), aggregate('TaxScheme', basic('ID', 'VAT'))))),
    aggregate('QuotedMonetaryTotal', amount('LineExtensionAmount', lineTotal), amount('TaxExclusiveAmount', subtotal),
      amount('TaxInclusiveAmount', vatKnown ? payable : null), amount('AllowanceTotalAmount', discount || null),
      amount('PayableAmount', payable)),
    ...lines,
  ].filter(Boolean);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Quotation xmlns="urn:oasis:names:specification:ubl:schema:xsd:Quotation-2"',
    '  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"',
    '  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">',
    components.join('\n').replace(/^/gm, '  '),
    '</Quotation>',
  ].join('\n');
}

module.exports = { offerXml };
