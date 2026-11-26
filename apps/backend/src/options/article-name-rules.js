const config = require('../config');
const { runSQLQueryAccess, runSQLQuerySqlServer, withSqlTransaction } = require('../db/access');
const { isTestMandant } = require('../executive-access');
const { createHttpError } = require('../utils');
const { articleSelect } = require('./article-catalog');
const { articleByIndex } = require('./matching-service');
const { checkMfi } = require('./mfi-compatibility');
const { checkMaterial } = require('./material-facts');
const { loadOptionPosition, validateOptionArticle } = require('./purchase-source');
const { normalizeArticleName, optionNameKey, ruleSelectSql } = require('./article-name-rule-contract');

async function findByName(database, name) {
  const key = normalizeArticleName(name);
  const pattern = key.split(' ')
    .map(word => word.replace(/[~%_\[]/g, letter => `~${letter}`)).join('%');
  const rows = await runSQLQueryAccess(database, `${articleSelect()}
    AND LTRIM(RTRIM(a.agA_Artikelname)) COLLATE Latin1_General_100_CI_AS LIKE ? ESCAPE N'~'`, [pattern]);
  const matches = rows.filter(article => normalizeArticleName(article.articleName) === key);
  return matches.length === 1 ? matches[0] : null;
}

async function resolveArticleNameRule(database, sourceMandantId, position) {
  const key = optionNameKey(position.articleName);
  const test = isTestMandant(database);
  if (!key || test !== isTestMandant({ firmaId: sourceMandantId })) return null;

  const [rule] = await runSQLQuerySqlServer(config.sql.database,
    `DECLARE @company INT=?, @isTest BIT=?, @nameKey CHAR(64)=?; ${ruleSelectSql(true)}`,
    [Number(database.firmaId), test, key]);
  if (!rule) return null;

  const assigned = rule.articleIndex == null ? null : await articleByIndex(database, String(rule.articleIndex));
  const article = assigned || await findByName(database, rule.articleName);
  return { article: article && !checkMfi(position, article).blocked && !checkMaterial(position, article).blocked ? article : null };
}

async function loadArticleNameConfirmation(database, position) {
  const key = optionNameKey(position.articleName);
  if (!key || !position.id) return null;
  const [row] = await runSQLQuerySqlServer(config.sql.database, `
    IF OBJECT_ID(N'BMSApp.OptionArticleNameRuleMandant', N'U') IS NOT NULL
      SELECT ArticleIndex AS articleIndex FROM BMSApp.OptionArticleNameRuleMandant
      WHERE IsTest=? AND OptionNameKey=CONVERT(CHAR(64),?) AND MandantId=? AND SourcePositionId=?`,
  [isTestMandant(database), key, Number(database.firmaId), Number(position.id)]);
  return row ? String(row.articleIndex) : null;
}

async function revokeArticleNameConfirmation(database, optionId, positionId, selection, identity) {
  const source = await withSqlTransaction(config.sql.database, async ({ query }) => {
    const current = await loadOptionPosition(optionId, positionId, query, { identity, lock: true });
    const test = isTestMandant(database);
    const key = optionNameKey(current.articleName);
    if (!key || key !== optionNameKey(selection.optionArticleName) || test !== isTestMandant({ firmaId: current.sourceMandantId })) {
      throw createHttpError(409, 'Die Optionszuordnung wurde geändert. Bitte die Option erneut laden.', { code: 'OPTION_CHANGED' });
    }
    // Serialize confirmation and revocation of the same shared name rule.
    await query(`SELECT 1 FROM BMSApp.OptionArticleNameRule WITH (UPDLOCK, HOLDLOCK)
      WHERE IsTest=? AND OptionNameKey=CONVERT(CHAR(64),?)`, [test, key]);
    const result = await query(`DELETE FROM BMSApp.OptionArticleNameRuleMandant
      WHERE IsTest=? AND OptionNameKey=CONVERT(CHAR(64),?) AND MandantId=? AND SourcePositionId=? AND ArticleIndex=?`,
    [test, key, Number(database.firmaId), Number(current.opp_id), selection.articleIndex.trim()]);
    if (!result.rowsAffected[0]) {
      const [remaining] = (await query(`SELECT SourcePositionId FROM BMSApp.OptionArticleNameRuleMandant
        WHERE IsTest=? AND OptionNameKey=CONVERT(CHAR(64),?) AND MandantId=?`, [test, key, Number(database.firmaId)])).rows;
      if (remaining) throw createHttpError(409, 'Die Optionszuordnung wurde geändert. Bitte die Option erneut laden.', { code: 'OPTION_CHANGED' });
      return current;
    }
    await query(`DELETE FROM BMSApp.OptionArticleNameRule WHERE IsTest=? AND OptionNameKey=CONVERT(CHAR(64),?)
      AND NOT EXISTS (SELECT 1 FROM BMSApp.OptionArticleNameRuleMandant WHERE IsTest=? AND OptionNameKey=CONVERT(CHAR(64),?))`,
    [test, key, test, key]);
    return current;
  });
  const rule = await resolveArticleNameRule(database, source.sourceMandantId, source);
  return rule?.article ? { articleIndex: String(rule.article.articleIndex), articleName: rule.article.articleName } : null;
}

async function confirmArticleNameRule(database, optionId, positionId, selection, identity, actor) {
  const source = await loadOptionPosition(optionId, positionId, null, { identity });
  const test = isTestMandant(database);
  if (test !== isTestMandant({ firmaId: source.sourceMandantId })) {
    throw createHttpError(403, 'Bitte zum passenden Test- oder Echtmandanten wechseln.', { code: 'OPTION_ARTICLE_RULE_SCOPE' });
  }
  const key = optionNameKey(source.articleName);
  if (!key || key !== optionNameKey(selection.optionArticleName)) {
    throw createHttpError(409, 'Der Optionsartikelname hat sich geändert. Bitte die Option erneut laden.', { code: 'OPTION_CHANGED' });
  }
  const article = await validateOptionArticle(database, source, selection);
  const index = String(article.articleIndex);
  if (!normalizeArticleName(article.articleName)) {
    throw createHttpError(422, 'Der ausgewählte Artikel hat keinen Namen im Artikelstamm.', { code: 'OPTION_ARTICLE_NAME_REQUIRED' });
  }

  await withSqlTransaction(config.sql.database, async ({ query }) => {
    const current = await loadOptionPosition(optionId, positionId, query, { identity, lock: true });
    if (optionNameKey(current.articleName) !== key || current.sourceVersion !== source.sourceVersion
      || current.opp_AktuellerAbgleichID !== source.opp_AktuellerAbgleichID) {
      throw createHttpError(409, 'Die Option wurde zwischenzeitlich geändert. Bitte erneut laden.', { code: 'OPTION_CHANGED' });
    }
    const availability = await query(`SELECT OBJECT_ID(N'BMSApp.OptionArticleNameRule', N'U') AS ruleTable,
      OBJECT_ID(N'BMSApp.OptionArticleNameRuleMandant', N'U') AS mandantTable`);
    if (!availability.rows[0]?.ruleTable || !availability.rows[0]?.mandantTable) {
      throw createHttpError(503, 'Das Speichern von Artikelregeln ist noch nicht verfügbar.', { code: 'OPTION_ARTICLE_RULE_NOT_READY' });
    }
    const rule = await query(`SELECT 1 FROM BMSApp.OptionArticleNameRule WITH (UPDLOCK, HOLDLOCK)
      WHERE IsTest=? AND OptionNameKey=CONVERT(CHAR(64),?)`, [test, key]);
    if (!rule.rows.length) {
      await query(`INSERT BMSApp.OptionArticleNameRule (IsTest, OptionNameKey, OptionName, ArticleName, CreatedBy)
        VALUES (?, ?, ?, ?, ?)`, [test, key, source.articleName, article.articleName, actor]);
    }
    const mandantId = Number(database.firmaId);
    const target = await query(`SELECT ArticleIndex AS articleIndex FROM BMSApp.OptionArticleNameRuleMandant
      WHERE IsTest=? AND OptionNameKey=? AND MandantId=?`, [test, key, mandantId]);
    if (target.rows.length && String(target.rows[0].articleIndex) !== index) {
      // A retired catalog ID can be replaced. A live conflicting confirmation requires review.
      if (await articleByIndex(database, String(target.rows[0].articleIndex))) {
        throw createHttpError(409, 'Für diesen Optionsnamen wurde bereits ein anderer Artikel bestätigt.', { code: 'OPTION_ARTICLE_RULE_CONFLICT' });
      }
      await query(`UPDATE BMSApp.OptionArticleNameRuleMandant SET ArticleIndex=?, SourcePositionId=?,
        ConfirmedBy=?, ConfirmedAt=SYSUTCDATETIME() WHERE IsTest=? AND OptionNameKey=? AND MandantId=?`,
      [index, Number(current.opp_id), actor, test, key, mandantId]);
    }
    if (!target.rows.length) {
      await query(`INSERT BMSApp.OptionArticleNameRuleMandant
        (IsTest, OptionNameKey, MandantId, ArticleIndex, SourcePositionId, ConfirmedBy) VALUES (?, ?, ?, ?, ?, ?)`,
      [test, key, mandantId, index, Number(current.opp_id), actor]);
    }
  });
  return { articleIndex: index, articleName: article.articleName };
}

module.exports = { resolveArticleNameRule, confirmArticleNameRule, loadArticleNameConfirmation, revokeArticleNameConfirmation };
