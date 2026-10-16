const test = require('node:test');
const assert = require('node:assert/strict');
const { productAvailabilitySource } = require('../src/db/product-availability');

test('availability source calculates stock from purchase, order and material-credit tables', () => {
  const source = productAvailabilitySource('availability');

  assert.match(source, /tblBest_Position/);
  assert.match(source, /tblBest_Pos_Lager/);
  assert.match(source, /tblAuf_Position/);
  assert.match(source, /tblRech_Position/);
  assert.match(source, /re_Auftragsstatus\] = N'Gutschrift'/);
  assert.match(source, /beP_Abgerechnet\], 0\) = 0/);
  assert.match(source, /beP_Pulver\], 0\) = 0/);
  assert.match(source, /- COALESCE\(\[customer_order\]\.\[Verplant\], 0\)/);
  assert.match(source, /\+ COALESCE\(\[material_credit\]\.\[Gutschrift\], 0\)/);
  assert.doesNotMatch(source, /tvfMengen/i);
});

test('availability source keeps alias validation', () => {
  assert.throws(() => productAvailabilitySource('availability alias'), /Invalid product availability alias/);
});

test('search enrichment exposes article fields through the existing index join only when requested', () => {
  const regular = productAvailabilitySource();
  const enriched = productAvailabilitySource('availability', { includeSearchFields: true });
  assert.doesNotMatch(regular, /agA_Dichte|agA_Beschreibung/);
  assert.match(enriched, /agA_MFI_bis/);
  assert.match(enriched, /agA_Dichte/);
  assert.match(enriched, /agA_Beschreibung/);
  assert.match(enriched, /articleGroupName/);
  assert.equal((enriched.match(/LEFT JOIN \[dbo\]\.\[tblArt_Artikel\]/g) || []).length, 1);
});
