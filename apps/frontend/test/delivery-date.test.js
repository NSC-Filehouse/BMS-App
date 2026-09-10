import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getWeekendStatus, isWeekendDate, nextWeekday } from '../src/utils/deliveryDate.js';

test('next weekday skips Saturday and Sunday', () => {
  assert.equal(nextWeekday(new Date(2026, 8, 11)), '2026-09-14');
  assert.equal(nextWeekday(new Date(2026, 8, 14)), '2026-09-15');
});

test('weekend status can be silent when the delivery scope is unknown', () => {
  assert.equal(isWeekendDate('2026-09-12'), true);
  assert.equal(getWeekendStatus('2026-09-12').showHint, true);
  assert.equal(getWeekendStatus('2026-09-12', { showHint: false }).showHint, false);
});
