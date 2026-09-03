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
