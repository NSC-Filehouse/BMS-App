const { createHash } = require('node:crypto');

function normalizeArticleName(value) {
  return String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

function optionNameKey(value) {
  const name = normalizeArticleName(value);
  return name ? createHash('sha256').update(name).digest('hex') : null;
}

function ruleSelectSql(single = false) {
  return `IF OBJECT_ID(N'BMSApp.OptionArticleNameRule', N'U') IS NOT NULL
    SELECT r.OptionNameKey AS nameKey, r.ArticleName AS articleName, m.ArticleIndex AS articleIndex
    FROM BMSApp.OptionArticleNameRule r
    LEFT JOIN BMSApp.OptionArticleNameRuleMandant m
      ON m.IsTest = r.IsTest AND m.OptionNameKey = r.OptionNameKey AND m.MandantId = @company
    WHERE r.IsTest = @isTest${single ? ' AND r.OptionNameKey = @nameKey' : ' ORDER BY r.OptionNameKey'}`;
}

module.exports = { normalizeArticleName, optionNameKey, ruleSelectSql };
