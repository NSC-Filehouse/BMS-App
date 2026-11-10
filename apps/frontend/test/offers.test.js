import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blankOffer,
  changeOfferCustomer,
  copyOffer,
  newOfferPosition,
  estimateOffer,
} from '../src/utils/offers.js';
test('copying for another customer retains all article tiers, prices and texts and resets every reservation', () => {
  const source = {
    ...blankOffer(),
    id: 7,
    version: 'old',
    customerId: '100',
    contactId: 5,
    customerReference: 'Old PO',
    paymentId: 12,
    paymentText: 'old',
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
        description: 'Text',
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
    customerName: 'Neuer Kunde',
    customerAddress: 'Neu',
    paymentId: 55,
    paymentText: 'Neu',
  });
  assert.deepEqual(source, before);
  assert.equal(target.copySourceId, 7);
  assert.equal(target.id, undefined);
  assert.equal(target.customerId, '200');
  assert.equal(target.contactId, null);
  assert.equal(target.customerReference, '');
  assert.equal(target.paymentId, 55);
  assert.deepEqual(
    target.positions.map((p) => [
      p.articleIndex,
      p.quantity,
      p.price,
      p.description,
    ]),
    source.positions.map((p) => [
      p.articleIndex,
      p.quantity,
      p.price,
      p.description,
    ]),
  );
  for (const p of target.positions) {
    assert.equal(p.reserve, false);
    assert.equal(p.reservationVersion, null);
    assert.equal(p.beNumber, null);
    assert.ok(!source.positions.some((s) => s.lineKey === p.lineKey));
  }
  assert.notEqual(target.clientRequestId, source.clientRequestId);
});

test('offer preview uses the same decimal rounding as the server for half cents and price bases', () => {
  const offer = blankOffer();
  offer.positions = [{ quantity: 1, price: 1.005, priceBasis: 1 }];
  offer.vatPercent = 0;
  assert.equal(estimateOffer(offer).totalAmount, 1.01);
  offer.positions = [
    { quantity: 11000, price: 2650, priceBasis: 1000 },
    { quantity: 5500, price: 2990, priceBasis: 1000 },
  ];
  offer.vatPercent = 19;
  assert.equal(estimateOffer(offer).totalAmount, 54258.05);
});
test('changing customer in an existing draft leaves the exact positions array untouched', () => {
  const original = {
    ...blankOffer(),
    positions: [
      newOfferPosition({ articleIndex: 'A', article: 'A', unit: 'KG' }),
    ],
    contactId: 123,
    contact: 'Old',
    department: 'Old',
    customerReference: 'Old',
  };
  const next = changeOfferCustomer(original, {
    customerId: '200',
    customerName: 'Neu',
    customerAddress: 'Adresse',
    paymentId: null,
    paymentText: '',
  });
  assert.equal(next.positions, original.positions);
  assert.equal(next.contact, '');
  assert.equal(next.department, '');
  assert.equal(next.customerReference, '');
  assert.equal(original.contact, 'Old');
});
