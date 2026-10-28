import test from 'node:test';
import assert from 'node:assert/strict';
import { supplierArticleList, selectedSupplierVlPositions, supplierVlPositionKey } from '../src/utils/supplierArticles.js';

test('mixes VL and historical articles alphabetically by our name without the supplier heading', () => {
  const rows = supplierArticleList([
    { name: 'Group Z', articles: [{ articleIndex: 'Z', article: 'Zeta', supplierArticleName: 'ABC Supplier', availablePositions: [] }] },
    { name: 'Group A', articles: [{ articleIndex: 'B', article: 'Beta', supplierArticleName: 'ZZZ Supplier', availablePositions: [{ id: 'BE-1', beNumber: 'BE-1', warehouse: 'Hamburg' }] }, { articleIndex: 'A', article: 'Alpha', availablePositions: [] }] },
  ]);
  assert.deepEqual(rows.map((row) => row.article), ['Alpha', 'Beta', 'Zeta']);
  assert.equal(rows[1].positions[0].id, 'BE-1');
  assert.equal(rows[0].groupName, undefined);
  assert.equal(supplierArticleList([{ articles: rows.map((row) => ({ ...row, availablePositions: row.positions })) }], 'hamburg').length, 1);
});

test('merges duplicate article IDs while retaining different VL stock positions', () => {
  const groups = [{ articles: [{ articleIndex: 'A', article: 'Unser Artikel', availablePositions: [{ id: '1' }] }, { articleIndex: 'A', article: 'Unser Artikel', availablePositions: [{ id: '1' }, { id: '2' }] }] }];
  const rows = supplierArticleList(groups);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].positions.map((p) => p.id), ['1', '2']);
});

test('VL multi-selection retains each selected BE/warehouse position and its original order data', () => {
  const first = { productId: 'BE-1-HH', id: 'legacy-id', beNumber: 'BE-1', warehouseId: 'HH', availableAmount: 20000, articleIndex: 'A' };
  const second = { id: 'BE-1-HB', beNumber: 'BE-1', warehouseId: 'HB', availableAmount: 5000, articleIndex: 'A' };
  const article = { positions: [first, second, { id: 'BE-2', availableAmount: 10000 }] };
  const result = selectedSupplierVlPositions(article, new Set(['BE-1-HH', 'BE-1-HB', 'another-article']));
  assert.deepEqual(result, [first, second]);
  assert.equal(result[0], first);
  assert.equal(result[1], second);
  assert.equal(supplierVlPositionKey(first), 'BE-1-HH');
});

test('VL selection excludes exhausted, invalid, duplicate and unrelated positions', () => {
  const valid = { id: '1', availableAmount: 500 };
  const article = { positions: [valid, valid, { id: '2', availableAmount: 0 }, { id: '3', availableAmount: -1 },
    { id: '4', availableAmount: Infinity }, { id: '', availableAmount: 100 }] };
  assert.deepEqual(selectedSupplierVlPositions(article, ['1', '2', '3', '4', '', 'unknown']), [valid]);
  assert.deepEqual(selectedSupplierVlPositions(article, []), []);
  assert.deepEqual(selectedSupplierVlPositions({ positions: [{ id: 'foreign', availableAmount: 200 }] }, ['1']), []);
});
