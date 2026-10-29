const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { commonLoadingLocations, findPackaging, packagingKey } = require('../src/db/purchase-order-values');

test('supplier purchase names and internal names stay separate through defaults and legacy draft enrichment', async () => {
  const mod = { exports: {} }, calls = [];
  new Function('require', 'module', fs.readFileSync(path.join(__dirname, '../src/db/purchase-order-values.js'), 'utf8'))((name) => {
    if (name === '../config') return {};
    return { runSQLQueryAccess: async (_database, sql, params) => {
      calls.push({ sql, params });
      return [{ article: 'Supplier product', masterArticleName: 'Our master name' }];
    } };
  }, mod);
  const source = await mod.exports.loadLatestPurchase({}, 'TOTAL', 'A');
  assert.equal(source.article, 'Supplier product');
  assert.match(calls[0].sql, /COALESCE\(NULLIF\(LTRIM\(RTRIM\(\[a\]\.\[agA_Artikelname_Lieferant\]/);
  assert.deepEqual(calls[0].params, ['TOTAL', 'A']);
  const result = await mod.exports.enrichPurchaseArticleNames({}, 'TOTAL', [
    { articleIndex: 'A', article: 'Our master name', masterArticleName: 'Forged name' },
    { articleIndex: 'A', article: 'Supplier spelling stored at ordering' },
  ]);
  assert.equal(result[0].article, 'Supplier product');
  assert.equal(result[0].masterArticleName, 'Our master name');
  assert.equal(result[1].article, 'Supplier spelling stored at ordering');
});

test('only offers common supplier/article locations without manufacturing an address PK', () => {
  const rows = [
    { articleIndex: 'A', loadingLocationText: 'Hamburg' },
    { articleIndex: 'B', loadingLocationText: ' HAMBURG ' },
    { articleIndex: 'A', loadingLocationText: 'Berlin' },
  ];
  const common = commonLoadingLocations(rows, ['A', 'B', 'A']);
  assert.equal(common.length, 1);
  assert.equal(common[0].text, 'Hamburg');
  assert.equal(common[0].source, 'supplier_order_history');
  assert.deepEqual(commonLoadingLocations(rows, ['A', 'C']), []);
  assert.deepEqual(commonLoadingLocations(rows, []), []);
});

test('packaging IDs and bilingual aliases resolve consistently with order choices', () => {
  const options = [{ id: 79, text: 'Silo/bulk', aliases: ['Siloware', 'Silo/bulk'] }, { id: 78, text: 'Bags', aliases: ['Sackware', 'Bags'] }];
  assert.equal(findPackaging(options, 'Siloware').id, 79);
  assert.equal(findPackaging(options, '', 78).id, 78);
  assert.equal(packagingKey('Silo/bulk'), packagingKey('Siloware'));
  assert.notEqual(packagingKey('Big Bags'), packagingKey('Sackware'));
});

test('one grouped article offers all its historical loading places once, independent of position copies', () => {
  const rows = [
    { articleIndex: ' 04634 ', loadingLocationText: 'Werk A\r\n12345 Musterstadt' },
    { articleIndex: '04634', loadingLocationText: 'Werk B\n54321 Anderstadt' },
    { articleIndex: '04634', loadingLocationText: ' WERK A\n12345  MUSTERSTADT ' },
    { articleIndex: '04634', loadingLocationText: null },
    { articleIndex: 'OTHER', loadingLocationText: 'Fremder Ort' },
  ];
  assert.deepEqual(commonLoadingLocations(rows, ['04634', '04634']).map((place) => place.text), [
    'Werk A\r\n12345 Musterstadt', 'Werk B\n54321 Anderstadt',
  ]);
  assert.equal(commonLoadingLocations([{ articleIndex: 'abc', loadingLocationText: 'Hamburg' }], ['ABC']).length, 1);
});

test('historical loading-place lookup reads both pickup fields across all orders scoped to supplier and article', async () => {
  const calls = [];
  const mod = { exports: {} };
  const query = async (database, sql, params) => {
    calls.push({ database, sql, params });
    return [{ articleIndex: '04634', loadingLocationText: 'Werk aus dem Transportauftrag' },
      { articleIndex: '04634', loadingLocationText: 'Weiteres Werk' }];
  };
  new Function('require', 'module', fs.readFileSync(path.join(__dirname, '../src/db/purchase-order-values.js'), 'utf8'))((name) => {
    if (name === '../config') return {};
    assert.equal(name, './access');
    return { runSQLQueryAccess: query };
  }, mod);
  assert.deepEqual(await mod.exports.loadPurchaseLocations({}, 'LF0117', []), []);
  const result = await mod.exports.loadPurchaseLocations({ name: 'Test' }, 'LF0117', ['04634', '04634']);
  assert.equal(result.length, 2);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, ['LF0117', '04634']);
  assert.match(calls[0].sql, /VALUES \(\[b\]\.\[be_AdresseAbhol\]\), \(\[b\]\.\[be_AdresseSP_Abhol\]\)/);
  assert.match(calls[0].sql, /\[b\]\.\[be_KdNr\].*= \? AND.*\[beP_Artikelindex\].*IN \(\?\)/);
  assert.match(calls[0].sql, /COALESCE\(\[p\]\.\[beP_Storno\], 0\) <> 1/);
  assert.doesNotMatch(calls[0].sql, /TOP 1\b|be_AdresseLI|be_AdresseKunde/);
});
