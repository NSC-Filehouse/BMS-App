const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function loadModule(relativePath, dependencies) {
  const module = { exports: {} };
  new Function('require', 'module', fs.readFileSync(path.join(__dirname, relativePath), 'utf8'))((name) => {
    assert.ok(name in dependencies, name);
    return dependencies[name];
  }, module);
  return module.exports;
}

test('all packaging choices retain IDs and fall back to German for missing or whitespace English', async () => {
  const rows = [
    { id: '78', sortKey: 1, de: ' Sackware ', en: ' Bags ' },
    { id: 79, sortKey: 2, de: 'Siloware', en: '   ' },
    { id: 80, sortKey: 3, de: 'Big Bags', en: null },
    { id: 81, sortKey: 4, de: 'Octa', en: '' },
  ];
  const calls = [];
  const shared = loadModule('../src/db/packaging-types.js', {
    '../config': { sql: { database: 'BMS' } },
    './access': { runSQLQuerySqlServer: async (database, sql) => {
      calls.push({ database, sql });
      return rows;
    } },
  });
  const de = await shared.loadPackagingTypes('de');
  const en = await shared.loadPackagingTypes('en');
  assert.deepEqual(de.map(row => row.id), en.map(row => row.id));
  assert.deepEqual(en.map(row => row.text), ['Bags', 'Siloware', 'Big Bags', 'Octa']);
  assert.deepEqual(en[0].aliases, ['Sackware', 'Bags']);
  assert.deepEqual(en[1].aliases, ['Siloware']);
  assert.equal(calls[0].database, 'BMS');
  assert.match(calls[0].sql, /\[spT_GruppenID\] = 1/);
  assert.match(calls[0].sql, /N'BE, AB'/);
  assert.match(calls[0].sql, /ORDER BY \[spT_SortKey\], \[spT_ID\]/);

  const purchase = loadModule('../src/db/purchase-order-values.js', {
    '../config': { sql: { database: 'BMS' } },
    './access': {}, './packaging-types': shared,
  });
  const purchaseChoices = await purchase.loadPurchasePackagingOptions('en');
  assert.deepEqual(purchaseChoices.map(row => row.text), en.map(row => row.text));
  assert.equal(purchaseChoices[1].key, 'silo');
  assert.equal(purchase.findPackaging(purchaseChoices, 'Sackware').id, 78);

  const offer = loadModule('../src/offers/terms.js', {
    '../config': { sql: { database: 'BMS' } },
    '../db/access': { runSQLQueryAccess: async () => [], runSQLQuerySqlServer: async () => [] },
    '../db/packaging-types': shared,
  });
  assert.deepEqual((await offer.loadOfferOptions({}, 'en')).packagingTypes, en);
});
