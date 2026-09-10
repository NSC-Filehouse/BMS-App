import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getDefaultContactName,
  getSelectableContactRankings,
  normalizeContactRanking,
} from '../src/utils/contactRanking.js';

test('offers occupied contact ranks plus the next free rank', () => {
  assert.deepEqual(getSelectableContactRankings([]), [1]);
  assert.deepEqual(getSelectableContactRankings([{ ranking: 1 }]), [1, 2]);
  assert.deepEqual(getSelectableContactRankings([{ ranking: 1 }, { ranking: 2 }]), [1, 2, 3]);
  assert.deepEqual(getSelectableContactRankings([{ ranking: 1 }, { ranking: 2 }, { ranking: 3 }]), [1, 2, 3]);
});

test('uses Top 1 as the default contact and keeps the single-contact fallback', () => {
  assert.equal(getDefaultContactName([
    { name: 'Alphabetisch zuerst', ranking: null },
    { name: 'Bevorzugt', ranking: 1 },
  ]), 'Bevorzugt');
  assert.equal(getDefaultContactName([{ name: 'Einziger Kontakt', ranking: null }]), 'Einziger Kontakt');
  assert.equal(getDefaultContactName([
    { name: 'Kontakt A', ranking: null },
    { name: 'Kontakt B', ranking: null },
  ]), '');
});

test('ignores invalid rankings', () => {
  assert.equal(normalizeContactRanking(0), null);
  assert.equal(normalizeContactRanking(4), null);
  assert.equal(normalizeContactRanking('2'), 2);
});
