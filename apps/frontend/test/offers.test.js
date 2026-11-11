import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blankOffer,
  changeOfferCustomer,
  copyOffer,
  newOfferPosition,
  defaultOfferContact,
  estimateOffer,
} from '../src/utils/offers.js';
test('offer contact default chooses Top 1 then Top 2 then Top 3 and leaves unranked contacts unselected', () => {
  const a = { id: 1, name: 'A', ranking: 1 },
    b = { id: 2, name: 'B', ranking: 2 },
    c = { id: 3, name: 'C', ranking: 3 },
    unranked = { id: 4, name: 'D', ranking: null };
  assert.equal(defaultOfferContact([c, unranked, b, a]), a);
  assert.equal(defaultOfferContact([unranked, c, b]), b);
  assert.equal(defaultOfferContact([unranked, c]), c);
  assert.equal(defaultOfferContact([unranked]), null);
  assert.equal(defaultOfferContact([]), null);
});
test('copy for a new customer preserves every position, price and WPZ instruction without retaining reservations', () => {
  const source = {
    ...blankOffer(),
    id: 7,
    version: 'old',
    customerId: '100',
    contactId: 5,
    customerReference: 'Old PO',
    paymentId: 12,
    paymentText: 'old',
    packagingId: 3,
    packaging: 'Sackware',
    status: 2,
    bmsOfferNumber: '2-01-26-00001',
    positions: [
      {
        ...newOfferPosition({
          articleIndex: 'A',
          article: 'Änderung',
          unit: 'KG',
        }),
        quantity: 11000,
        price: 2650,
        costPrice: 2200,
        wpzOriginal: false,
        wpzComment: 'Schwärzen/Neutralisieren',
        reserve: true,
        beNumber: 'BE',
        warehouseId: 'L',
        reserveQuantity: 100,
        reserveUntil: '2026-12-01',
        reservationVersion: 'old',
      },
      {
        ...newOfferPosition({
          articleIndex: 'A',
          article: 'Änderung',
          unit: 'KG',
        }),
        quantity: 5500,
        price: 2990,
      },
    ],
  };
  const before = structuredClone(source);
  const copy = copyOffer(source);
  const target = changeOfferCustomer(copy, {
    customerId: '200',
    customerName: 'Neu',
    customerAddress: 'Neu',
    paymentId: 55,
    paymentText: 'Neu',
    contacts: [{ id: 25, name: 'Top 2', ranking: 2 }],
    deliveryAddresses: [{ id: '19', text: 'Zieladresse' }],
  });
  assert.deepEqual(source, before);
  assert.equal(target.copySourceId, 7);
  assert.equal(target.id, undefined);
  assert.equal(target.customerId, '200');
  assert.equal(target.contactId, 25);
  assert.equal(target.customerReference, '');
  assert.equal(target.paymentId, 55);
  assert.equal(target.deliveryAddressId, '19');
  assert.equal(target.packagingId, 3);
  assert.deepEqual(
    target.positions.map((p) => [
      p.articleIndex,
      p.quantity,
      p.price,
      p.costPrice,
      p.wpzComment,
    ]),
    source.positions.map((p) => [
      p.articleIndex,
      p.quantity,
      p.price,
      p.costPrice,
      p.wpzComment,
    ]),
  );
  for (const p of target.positions) {
    assert.equal(p.reserve, false);
    assert.equal(p.reservationVersion, null);
    assert.equal(p.beNumber, null);
    assert.ok(!source.positions.some((s) => s.lineKey === p.lineKey));
  }
});
test('customer changes retain the exact positions array and reset customer-specific addresses and payment overrides', () => {
  const original = {
    ...blankOffer(),
    positions: [
      newOfferPosition({ articleIndex: 'A', article: 'A', unit: 'KG' }),
    ],
    contactId: 123,
    contact: 'Old',
    customerReference: 'Old',
    deliveryAddressId: 10,
    specialPaymentCondition: true,
  };
  const next = changeOfferCustomer(original, {
    customerId: '200',
    customerName: 'Neu',
    customerAddress: 'Adresse',
    paymentId: null,
    paymentText: '',
    contacts: [{ id: 5, name: 'No ranking' }],
    deliveryAddresses: [],
  });
  assert.equal(next.positions, original.positions);
  assert.equal(next.contact, '');
  assert.equal(next.contactId, null);
  assert.equal(next.customerReference, '');
  assert.equal(next.deliveryAddressId, null);
  assert.equal(next.specialPaymentCondition, false);
});
test('offer amounts use decimal cent rounding without the removed discount and VAT fields', () => {
  const offer = blankOffer();
  offer.positions = [{ quantity: 1, price: 1.005, priceBasis: 1 }];
  assert.equal(estimateOffer(offer).totalAmount, 1.01);
  offer.positions = [
    { quantity: 11000, price: 2650, priceBasis: 1000 },
    { quantity: 5500, price: 2990, priceBasis: 1000 },
  ];
  assert.equal(estimateOffer(offer).totalAmount, 45595);
  for (const key of [
    'language',
    'intro',
    'closingText',
    'discountPercent',
    'vatPercent',
  ])
    assert.equal(key in offer, false);
});
