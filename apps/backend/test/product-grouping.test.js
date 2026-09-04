const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveProductGroup } = require('../src/product-grouping');

test('uses the master article as the stable VL group', () => {
  assert.deepEqual(
    resolveProductGroup({
      article: 'PP Copo NT 4600 OG MFI 3,9',
      articleIndex: '02921',
      masterArticleName: 'PP Copo NT MFI 2 - 3,99 natur',
      articleGroupId: '25200',
      articleGroupName: 'PP NT Copo',
    }),
    { key: 'master-article:02921', name: 'PP Copo NT MFI 2 - 3,99 natur' },
  );
});

test('falls back to the article group when master article data is missing', () => {
  assert.deepEqual(
    resolveProductGroup({
      article: 'PE Beispiel',
      articleGroupId: '42',
      articleGroupName: 'PE Beispiele',
    }),
    { key: 'article-group:42', name: 'PE Beispiele' },
  );
});

test('does not merge different master article indexes with the same broad category', () => {
  const first = resolveProductGroup({
    articleIndex: '02921',
    masterArticleName: 'PP Copo NT MFI 2 - 3,99 natur',
    articleGroupId: '25200',
  });
  const second = resolveProductGroup({
    articleIndex: '02925',
    masterArticleName: 'PP Copo NT MFI 20-25 natur',
    articleGroupId: '25200',
  });

  assert.notEqual(first.key, second.key);
});
