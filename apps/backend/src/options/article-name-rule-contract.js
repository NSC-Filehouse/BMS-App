const { createHash } = require('node:crypto');
const { supplierKey } = require('./supplier-identity');

function normalizeArticleName(value) {
  return String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

function articleRuleSupplierKey(source) {
  const hint = source.supplierReplyTo || source.supplierKey;
  const key = supplierKey(source.supplierName, hint);
  if (key !== 'unknown') return key;
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(hint || '') ? supplierKey('', `supplier@${hint}`) : 'unknown';
}

function optionNameKey(value, supplier) {
  const name = normalizeArticleName(value);
  return name && supplier && supplier !== 'unknown'
    ? createHash('sha256').update(JSON.stringify([supplier, name])).digest('hex') : null;
}

function ruleSelectSql(single = false) {
  return `IF COL_LENGTH(N'BMSApp.OptionArticleNameRule', N'SupplierKey') IS NOT NULL
    SELECT r.OptionNameKey AS nameKey, r.ArticleName AS articleName, m.ArticleIndex AS articleIndex
    FROM BMSApp.OptionArticleNameRule r
    LEFT JOIN BMSApp.OptionArticleNameRuleMandant m
      ON m.IsTest = r.IsTest AND m.OptionNameKey = r.OptionNameKey AND m.MandantId = @company
    WHERE r.IsTest = @isTest AND r.SupplierKey IS NOT NULL${single ? ' AND r.OptionNameKey = @nameKey' : ' ORDER BY r.OptionNameKey'}`;
}

module.exports = { normalizeArticleName, articleRuleSupplierKey, optionNameKey, ruleSelectSql };
