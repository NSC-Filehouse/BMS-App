import test from 'node:test';
import assert from 'node:assert/strict';
import { supplierArticleList } from '../src/utils/supplierArticles.js';

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
