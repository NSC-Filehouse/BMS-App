import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSearchCondition, formatSearchMatch } from '../src/utils/productSearch.js';

test('recognized filters show localized decimals, bounds, density units and test conditions', () => {
  assert.equal(formatSearchCondition({ kind: 'mfi', min: 2, max: 3.5 }), 'MFI 2–3,5');
  assert.equal(formatSearchCondition({ kind: 'mfi', min: 2, max: 3.5 }, 'en'), 'MFI 2–3.5');
  assert.equal(formatSearchCondition({ kind: 'density', min: 0.924, max: 0.924 }), 'Dichte 0,924 g/cm³');
  assert.equal(formatSearchCondition({ kind: 'mfi', min: 8, max: null, minInclusive: false }), 'MFI > 8');
  assert.equal(formatSearchCondition({ kind: 'mfi', min: null, max: 8, maxInclusive: true }), 'MFI ≤ 8');
  assert.equal(formatSearchCondition({ kind: 'mfi', min: 8, max: 8, method: { load: 2.16, temperature: 190 } }), 'MFI 8 (190°C / 2,16 kg)');
  assert.equal(formatSearchCondition({ kind: 'mfi', min: 8, max: 8, method: {} }), 'MFI 8');
});

test('match explanation includes provenance, uncertainty and typo corrections', () => {
  const match = { matches: [{ kind: 'density', min: 0.92, max: 0.93, source: 'description', partial: true, conflict: true, assumedDensityUnit: true }], fuzzy: [{ from: 'sabci', to: 'sabic' }] };
  const explanation = formatSearchMatch(match, (key) => key, 'en');
  assert.match(explanation, /Density 0.92–0.93 g\/cm³/);
  assert.match(explanation, /vl_search_source_description/);
  assert.match(explanation, /vl_search_partial/);
  assert.match(explanation, /vl_search_conflict/);
  assert.match(explanation, /sabci → sabic/);
});
