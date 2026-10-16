const test = require('node:test');
const assert = require('node:assert/strict');
const { parseProductSearch, matchProductRow, propertiesForRow, filterProductRows } = require('../src/product-search');

const matches = (query, row) => matchProductRow(row, parseProductSearch(query));

test('German and English queries combine material and inclusive decimal ranges', () => {
  for (const query of ['ldpe mit mfi von 2,0 bis 3,5', 'LDPE MFI between 2 and 3.5', 'mfi 2–3,5 ldpe', 'LDPE MFR 2 to 3.5']) {
    const parsed = parseProductSearch(query);
    assert.equal(parsed.filters.length, 1, query);
    assert.deepEqual([parsed.filters[0].min, parsed.filters[0].max], [2, 3.5], query);
    assert.ok(matches(query, { Artikel: 'LDPE 2402H3W natur SABIC', beP_MFI: 2.5 }), query);
    assert.ok(matches(query, { Artikel: 'LDPE', beP_MFI: 3.5 }), query);
    assert.equal(matches(query, { Artikel: 'LDPE', beP_MFI: 3.6 }), null, query);
  }
});

test('single values match containing ranges and mark partial overlap explicitly', () => {
  const result = matches('mfi 8', { Artikel: 'PP Copo NT MFI 6 - 9 natur' });
  assert.ok(result);
  assert.equal(result.matches[0].partial, true);
  assert.equal(result.matches[0].source, 'positionName');
  assert.ok(matches('mfi 2-3,5', { Artikel: 'MFI 3-4' }));
  assert.equal(matches('mfi 2-3,5', { Artikel: 'MFI 4-6' }), null);
});

test('lower and upper bounds respect inclusive and strict comparisons', () => {
  for (const query of ['mfi ab 8', 'mfi mindestens 8', 'mfi >= 8', 'mfi at least 8']) {
    assert.ok(matches(query, { beP_MFI: 8 }), query);
    assert.equal(matches(query, { beP_MFI: 7.99 }), null, query);
  }
  for (const query of ['mfi > 8', 'mfi über 8', 'mfi above 8']) {
    assert.equal(matches(query, { beP_MFI: 8 }), null, query);
    assert.ok(matches(query, { beP_MFI: 9 }), query);
  }
  for (const query of ['mfi < 8', 'mfi unter 8', 'mfi below 8']) {
    assert.equal(matches(query, { beP_MFI: 8 }), null, query);
    assert.ok(matches(query, { beP_MFI: 7 }), query);
  }
  assert.ok(matches('mfi bis 8', { beP_MFI: 8 }));
  assert.ok(matches('mfi <= 8', { beP_MFI: 8 }));
});

test('measured values override names and generic article ranges', () => {
  const row = { Artikel: 'PP Homo OG F501 MFI 0,3 - 0,5', beP_MFIgemessen: 0.3825, beP_MFI: 0.5,
    masterArticleName: 'PP Homo NT MFI 0,1 - 0,99 natur' };
  assert.equal(matches('mfi 0,8', row), null);
  assert.ok(matches('mfi 0,38-0,39', row));
  assert.equal(propertiesForRow(row)[0].source, 'measured');
});

test('a concrete position value is not widened by the generic master', () => {
  const row = { Artikel: 'mLLDPE NT MFI 12,4 natur Ineos', beP_MFI: 12.4,
    masterArticleName: 'mLLDPE NT MFI 10-14,99 natur' };
  assert.equal(matches('mfi 14', row), null);
  assert.ok(matches('mfi 12,4', row));
});

test('named master ranges retain their upper bound when the field only stores the lower bound', () => {
  const row = { masterArticleName: 'HDPE NT MFI 2-3,99 (bei 2,16kg) natur', masterMfi: 2 };
  assert.ok(matches('mfi 3,5', row));
  assert.equal(matches('mfi 4', row), null);
  assert.ok(matches('mfi 3,5 bei 2,16kg', row));
});

test('text-only names and approximate position values are extracted without using type numbers', () => {
  assert.ok(matches('pp copo mfi 2-3', { Artikel: 'PPC ex 83MF10 MFI ca. 2,5' }));
  const result = matches('mfi 2,5', { Artikel: 'PPC ex 83MF10 MFI ca. 2,5' });
  assert.equal(result.matches[0].approximate, true);
  assert.equal(matches('mfi 10', { Artikel: 'PPC ex 83MF10' }), null);
  assert.equal(matches('mfi 3600', { Artikel: 'PP Copo 3600 OG' }), null);
});

test('description methods are kept separate from the MFI value', () => {
  const row = { articleDescription: 'MFI (190°C/2,16Kg): 1,0 g/10min; Emodul 1300' };
  assert.ok(matches('mfi 1', row));
  assert.equal(matches('mfi 190', row), null);
  assert.equal(matches('mfi 2,16', row), null);
  assert.ok(matches('mfi 1 bei 190°/2,16kg', row));
  assert.equal(matches('mfi 1 bei 21,6kg', row), null);
});

test('multiple description MFR values preserve their individual test loads', () => {
  const row = { beP_MFI: 7.5, beP_MFI_Pruefmethode: '190°C/2,16kg', articleDescription: 'MFR [190°C/2,16 Kg]: 7,5 g/10min\nMFR [190°C/5 Kg]: 22 g/10min' };
  assert.ok(matches('mfi 22 bei 5kg', row));
  assert.equal(matches('mfi 22 bei 2,16kg', row), null);
  assert.ok(matches('mfi 13 bei 230°/2,16kg', { articleDescription: 'MFR(230/2.16): 13' }));
});

test('MVR is not mistaken for MFI and HLMI is explicitly searchable', () => {
  assert.equal(matches('mfi 5', { articleDescription: 'PP ESD MVR 5, Dichte 1,03' }), null);
  assert.ok(matches('mvr 5', { articleDescription: 'PP ESD MVR 5, Dichte 1,03' }));
  assert.ok(matches('hlmi 14,94', { Artikel: 'HDPE HSN OG HLMI 14,94' }));
});

test('density normalizes comma, point, kg/m3, ranges and legacy integer notation', () => {
  for (const density of ['924', '0,924', '0.924', '924 kg/m³', '0,924 g/cm3']) {
    assert.ok(matches('dichte 0,924', { masterDensity: density }), density);
    assert.ok(matches('density 924 kg/m3', { masterDensity: density }), density);
  }
  assert.ok(matches('density 0.952', { masterDensity: '950-954' }));
  assert.ok(matches('dichte 2,2', { masterDensity: '2,0-2,5' }));
  assert.ok(matches('dichte 0,924', { articleDescription: 'Dichte: 924' }));
  assert.equal(parseProductSearch('dichte 7').filters[0].min, 7);
  assert.ok(parseProductSearch('dichte 924').warnings.includes('densityUnitAssumed'));
});

test('bulk density is not used as material density', () => {
  const row = { articleDescription: 'Density: 0.90 g/cm³\nBulk Density: 0,53 g/cm³' };
  assert.ok(matches('density 0.90', row));
  assert.equal(matches('density 0.53', row), null);
  assert.equal(matches('dichte 0,5', { articleDescription: 'Schüttdichte 0,5' }), null);
});

test('conflicting POM name and master field remain visible', () => {
  const row = { Artikel: 'POM Copo MFI 9 natur', masterArticleName: 'POM Copo MFI 9 natur', masterMfi: 8 };
  const result = matches('mfi 9', row);
  assert.ok(result);
  assert.equal(result.matches[0].conflict, true);
});

test('missing values are not zero, but actual zero bounds are retained', () => {
  assert.equal(matches('mfi 0', {}), null);
  assert.equal(matches('dichte 0', { masterDensity: null }), null);
  assert.ok(matches('mfi 0', { beP_MFI: 0 }));
  assert.ok(matches('mfi 0,3', { masterArticleName: 'HDPE NT MFI 0-0,69', masterMfi: 0 }));
});

test('material family searches distinguish LDPE, LLDPE and mLLDPE', () => {
  assert.equal(matches('ldpe', { Artikel: 'LLDPE 324CNJ' }), null);
  assert.equal(matches('ldpe', { Artikel: 'mLLDPE 1018MB' }), null);
  assert.ok(matches('lldpe', { Artikel: 'LLDPE 324CNJ' }));
  assert.ok(matches('pehd', { Artikel: 'HDPE 2008' }));
  assert.equal(matches('ldpe', { Artikel: 'LLDPE 324CNJ', articleDescription: 'Compatible with LDPE' }), null);
});

test('terms combine across fields, support colour aliases and preserve unknown words', () => {
  const row = { Artikel: 'PP 3600 schwarz', tradeName: 'SABIC', Lagerort: 'Hamburg' };
  assert.ok(matches('sabic black hamburg', row));
  assert.ok(matches('PP 3600', row));
  assert.equal(matches('sabic unbekannt hamburg', row), null);
  assert.equal(matches('PP 3601', row), null);
  assert.ok(matches('green', { Artikel: 'PP grün' }));
});

test('typos tolerate one edit or transposition in words while numbers remain strict', () => {
  const row = { Artikel: 'PP natur SABIC', beP_MFI: 8.3 };
  const result = matches('sabci mfi 8-9', row);
  assert.equal(result.fuzzy[0].to, 'sabic');
  assert.equal(matches('sabci mfi 8', row), null);
  assert.equal(matches('sabci 3601', { Artikel: 'SABIC 3600' }), null);
});

test('quoted phrases, literal punctuation and SQL wildcard characters do not widen the search', () => {
  assert.ok(matches('"PP 3600"', { Artikel: 'PP 3600 natur' }));
  assert.equal(matches('"PP 3600"', { Artikel: 'PP Copo 3600' }), null);
  assert.equal(matches('%', { Artikel: 'anything' }), null);
  assert.equal(matches('[', { Artikel: 'anything' }), null);
});

test('removing a recognized condition produces a complete remaining query', () => {
  const parsed = parseProductSearch('ldpe mit mfi von 2,0 bis 3,5 dichte 924');
  assert.equal(parsed.conditions[1].queryWithout, 'ldpe dichte 924');
  assert.deepEqual(parseProductSearch(parsed.conditions[1].queryWithout).filters.map((f) => f.kind), ['density']);
});

test('invalid reversed, incomplete and overlong queries never match every row', () => {
  for (const query of ['mfi 4-2', 'mfi from 2', 'mfi between 2', 'a'.repeat(501)]) {
    assert.equal(parseProductSearch(query).invalid, true, query);
    assert.equal(matches(query, { beP_MFI: 3 }), null, query);
  }
});

test('combined filters are applied to all rows before a caller paginates', () => {
  const rows = Array.from({ length: 150 }, (_, i) => ({ Artikel: 'LDPE', beP_MFI: i / 10, masterDensity: '924' }));
  const filtered = filterProductRows(rows, parseProductSearch('ldpe mfi 12-13 dichte 0,924'));
  assert.equal(filtered.length, 11);
  assert.equal(filtered[0].beP_MFI, 12);
  assert.equal(filtered.at(-1).beP_MFI, 13);
});

test('repeated numeric limits must describe one possible value under the same conditions', () => {
  const row = { Artikel: 'PP MFI 1-20' };
  assert.equal(matches('mfi > 8 mfi < 2', row), null);
  assert.equal(matches('mfi > 8 mfi <= 8', row), null);
  assert.ok(matches('mfi >= 8 mfi <= 8', row));
  assert.ok(matches('mfi > 2 mfi < 8', row));
});
