const test = require('node:test');
const assert = require('node:assert/strict');
const { optionNameKey } = require('../src/options/article-name-rule-contract');

test('confirmation keeps one global name and one independently confirmed article ID per mandant', async () => {
  const articleName = 'LDPE Sample Grade';
  const source = { opp_id: 15, sourceVersion: 'source-v1', sourceMandantId: 3, articleName: '  Sample   clear ' };
  const articles = new Map([[3, new Set(['FRU-A'])], [8, new Set(['POL-B', 'POL-C'])]]);
  const rules = [];
  const confirmed = new Map();
  const sourceIds = new Map();
  const query = async (sql, params) => {
    if (sql.includes('OBJECT_ID')) return { rows: [{ ruleTable: 1, mandantTable: 2 }] };
    if (sql.startsWith('SELECT 1 FROM BMSApp.OptionArticleNameRule ')) {
      assert.match(sql, /UPDLOCK, HOLDLOCK/);
      return { rows: rules.length ? [{}] : [] };
    }
    if (sql.includes('INSERT BMSApp.OptionArticleNameRule (')) rules.push(params);
    else if (sql.includes('SELECT ArticleIndex AS')) {
      return { rows: confirmed.has(params[2]) ? [{ articleIndex: confirmed.get(params[2]) }] : [] };
    } else if (sql.includes('INSERT BMSApp.OptionArticleNameRuleMandant')) {
      confirmed.set(params[2], params[3]);
      sourceIds.set(params[2], params[4]);
    } else if (sql.includes('DELETE FROM BMSApp.OptionArticleNameRuleMandant')) {
      const removed = sourceIds.get(params[2]) === params[3] && confirmed.get(params[2]) === params[4];
      if (removed) confirmed.delete(params[2]);
      return { rowsAffected: [Number(removed)] };
    } else if (sql.includes('SELECT SourcePositionId')) {
      return { rows: confirmed.has(params[2]) ? [{ SourcePositionId: sourceIds.get(params[2]) }] : [] };
    } else if (sql.includes('DELETE FROM BMSApp.OptionArticleNameRule WHERE')) {
      if (!confirmed.size) rules.length = 0;
    } else assert.fail(sql);
    return { rows: [] };
  };
  require.cache[require.resolve('../src/db/access')] = { exports: {
    withSqlTransaction: async (_database, work) => work({ query }),
    runSQLQuerySqlServer: async (_database, sql, params) => {
      if (sql.includes('SourcePositionId=?')) {
        return confirmed.has(params[2]) && sourceIds.get(params[2]) === params[3] ? [{ articleIndex: confirmed.get(params[2]) }] : [];
      }
      return rules.length ? [{ articleName, articleIndex: confirmed.get(params[0]) }] : [];
    },
    runSQLQueryAccess: async () => [{ articleIndex: 'FRU-A', articleName }],
  } };
  require.cache[require.resolve('../src/options/purchase-source')] = { exports: {
    loadOptionPosition: async (_id, _positionId, execute, options) => {
      if (execute) assert.equal(options.lock, true);
      return source;
    },
    validateOptionArticle: async (database, _source, { articleIndex }) => {
      assert.ok(articles.get(database.firmaId).has(articleIndex));
      return { articleIndex, articleName: database.firmaId === 3 ? articleName : 'Alternative catalog name' };
    },
  } };
  require.cache[require.resolve('../src/options/matching-service')] = { exports: {
    articleByIndex: async (database, index) => articles.get(database.firmaId)?.has(index) ? { articleIndex: index } : null,
  } };
  const { confirmArticleNameRule, loadArticleNameConfirmation, revokeArticleNameConfirmation } = require('../src/options/article-name-rules');
  const confirm = (firmaId, articleIndex, optionArticleName = 'sample clear') => confirmArticleNameRule({ firmaId }, 1, 15,
    { articleIndex, optionArticleName }, {}, 'NSC');

  assert.deepEqual(await confirm(3, 'FRU-A'), { articleIndex: 'FRU-A', articleName });
  await confirm(3, 'FRU-A');
  assert.equal((await confirm(8, 'POL-B')).articleIndex, 'POL-B');
  assert.deepEqual(rules, [[false, optionNameKey('sample clear'), source.articleName, articleName, 'NSC']]);
  assert.deepEqual([...confirmed], [[3, 'FRU-A'], [8, 'POL-B']]);
  await assert.rejects(() => confirm(8, 'POL-C'), error => error.details?.code === 'OPTION_ARTICLE_RULE_CONFLICT');
  await assert.rejects(() => confirm(8, 'POL-C', 'old name'), error => error.details?.code === 'OPTION_CHANGED');
  await assert.rejects(() => confirm(0, 'POL-C'), error => error.details?.code === 'OPTION_ARTICLE_RULE_SCOPE');
  const position = { id: 15, articleName: source.articleName };
  assert.equal(await loadArticleNameConfirmation({ firmaId: 3 }, position), 'FRU-A');
  const revoke = (firmaId, articleIndex) => revokeArticleNameConfirmation({ firmaId }, 1, 15,
    { articleIndex, optionArticleName: 'sample clear' }, {});
  await assert.rejects(() => revoke(8, 'POL-C'), error => error.details?.code === 'OPTION_CHANGED');
  assert.deepEqual(await revoke(3, 'FRU-A'), { articleIndex: 'FRU-A', articleName });
  assert.equal(await loadArticleNameConfirmation({ firmaId: 3 }, position), null);
  assert.equal(rules.length, 1);
  assert.equal(await revoke(8, 'POL-B'), null);
  assert.deepEqual(rules, []);
  assert.equal(await revoke(8, 'POL-B'), null);
});
