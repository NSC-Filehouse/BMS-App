import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePositionSplit, splitPositionValues } from '../src/utils/positionSplit.js';

test('splits a position into the kept quantity and its remainder', () => {
  const result = splitPositionValues({ amountInKg: 1500, article: 'Artikel 1' }, 500, 'amountInKg');

  assert.equal(result.ok, true);
  assert.equal(result.keptPosition.amountInKg, 500);
  assert.equal(result.remainderPosition.amountInKg, 1000);
  assert.equal(result.keptPosition.article, 'Artikel 1');
  assert.equal(result.remainderPosition.article, 'Artikel 1');
});

test('requires at least one kilogram in both resulting positions', () => {
  assert.equal(calculatePositionSplit(1, 1).ok, false);
  assert.equal(calculatePositionSplit(10, 0).ok, false);
  assert.equal(calculatePositionSplit(10, 10).ok, false);
  assert.equal(calculatePositionSplit(10, 9).ok, true);
});

test('distributes an existing reservation without increasing its total', () => {
  const result = splitPositionValues({ amountInKg: 1000, reservationInKg: 500 }, 400, 'amountInKg');

  assert.equal(result.keptPosition.reservationInKg, 200);
  assert.equal(result.remainderPosition.reservationInKg, 300);
  assert.equal(result.keptPosition.reservationInKg + result.remainderPosition.reservationInKg, 500);
});
