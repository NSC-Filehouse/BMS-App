const config = require('../config');
const { runSQLQueryAccess, runSQLQuerySqlServer } = require('../db/access');
const { buildCustomerScopeFilter, getCustomerAccessScope } = require('../db/customer-access');
const { articleByIndex, storedCandidate } = require('./matching-service');
const { exactNameCandidates } = require('./purchase-source');
const { articleHash } = require('./matching-contract');
const { checkMaterial } = require('./material-facts');
const { checkMfi } = require('./mfi-compatibility');

const text = value => String(value ?? '').trim();

async function resolveOfferArticle(database, offer, position) {
  if (Number(database.firmaId) !== Number(offer.sourceMandantId)) {
    const names = [position.articleName, position.internalArticleName].map(text).filter(Boolean);
    if (!names.length) return null;
    const candidates = (await exactNameCandidates(database, position, names, { all: true }))
      .filter(candidate => !candidate.mfiCheck.blocked);
    return candidates.length === 1 ? candidates[0] : null;
  }

  const assignedIndex = text(position.articleIndex);
  if (!assignedIndex && position.matchProcessingStatus !== 'ready') return null;
  const index = assignedIndex || text(position.suggestedArticleIndex) || text(position.singleCandidateIndex);
  if (!index) return null;

  const article = await articleByIndex(database, index);
  if (!article || checkMfi(position, article).blocked || checkMaterial(position, article).blocked) return null;
  if (assignedIndex) return article;

  const candidate = await storedCandidate(database, position, index);
  if (!candidate || candidate.conflicts?.length || (candidate.articleHash && candidate.articleHash !== articleHash(article))) return null;
  return article;
}

async function loadArticleCustomers(database, userIdentity, articleIndex) {
  const scope = await getCustomerAccessScope(userIdentity, database);
  const { whereSql, params } = buildCustomerScopeFilter(scope, 'k');
  const rows = await runSQLQueryAccess(database, `
    WITH purchases AS (
      SELECT r.re_KdNr AS customerId, r.re_Auftragsindex AS orderIndex,
        ROW_NUMBER() OVER (
          PARTITION BY r.re_KdNr
          ORDER BY COALESCE(r.re_Auftragsdatum, r.re_RgDatum) DESC, r.re_RgDatum DESC, r.re_RgNummer DESC
        ) AS purchaseRank
      FROM dbo.tblRechnung r
      JOIN dbo.tblKunden k ON k.kd_KdNR = r.re_KdNr
      WHERE r.re_Auftragsstatus = N'Rechnung' AND COALESCE(r.re_Preisgutschrift, 0) = 0
        AND EXISTS (
          SELECT 1 FROM dbo.tblRech_Position p
          WHERE p.reP_RGnummer = r.re_RgNummer AND p.reP_Artikelindex = ?
            AND p.reP_Anzahl > 0 AND COALESCE(p.reP_Preisgutschrift, 0) = 0
        )
        ${whereSql ? `AND (${whereSql})` : ''}
    )
    SELECT p.customerId AS id, k.kd_Name1 AS name, k.kd_Name2 AS name2, a.au_Lieferbedingung AS lastIncoterm
    FROM purchases p
    JOIN dbo.tblKunden k ON k.kd_KdNR = p.customerId
    LEFT JOIN dbo.tblAuftrag a ON a.au_Auftragsindex = p.orderIndex
    WHERE p.purchaseRank = 1
    ORDER BY k.kd_Name1, k.kd_Name2, p.customerId
  `, [articleIndex, ...params]);
  return rows.map(row => ({
    id: text(row.id),
    name: [text(row.name), text(row.name2)].filter(Boolean).join(' ') || text(row.id),
    lastIncoterm: text(row.lastIncoterm),
  }));
}

async function loadSentCustomerIds(companyId, positionId) {
  // The UI can be deployed ahead of the separately installed schema.
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    IF OBJECT_ID(N'BMSApp.OptionOfferMailOutbox', N'U') IS NOT NULL
      EXEC sys.sp_executesql
        N'SELECT CustomerNumber FROM BMSApp.OptionOfferMailOutbox
          WHERE CompanyId = @company AND OptionPositionId = @position AND Status = N''sent''',
        N'@company INT, @position INT', @company = ?, @position = ?;
  `, [companyId, positionId]);
  return new Set(rows.map(row => text(row.CustomerNumber).toUpperCase()));
}

async function loadOptionOfferCustomers(database, userIdentity, offer, position) {
  const article = await resolveOfferArticle(database, offer, position);
  const articleIndex = text(article?.articleIndex);
  if (!articleIndex) return { article: null, customers: [] };
  const [customers, sent] = await Promise.all([
    loadArticleCustomers(database, userIdentity, articleIndex),
    loadSentCustomerIds(Number(database.firmaId), position.id),
  ]);
  return {
    article: { index: articleIndex, name: text(article.articleName) },
    customers: customers.map(customer => ({ ...customer, sent: sent.has(customer.id.toUpperCase()) })),
  };
}

module.exports = { loadOptionOfferCustomers };
