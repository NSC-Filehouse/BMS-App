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
  const canFilterSales = ['BMS_APP_FULL_ACCESS', 'AD01', 'GR04'].includes(scope.userGroup);
  const salesCode = text(scope.shortCode);
  if (!canFilterSales && !salesCode) return [];
  const rows = await runSQLQueryAccess(database, `
    SELECT k.kd_KdNR AS id, k.kd_Name1 AS name, k.kd_Name2 AS name2, k.kd_Aussendienst AS salesCode
    FROM dbo.tblKunden k
    WHERE EXISTS (
      SELECT 1 FROM dbo.tblRechnung r
      JOIN dbo.tblRech_Position p ON p.reP_RGnummer = r.re_RgNummer
      WHERE r.re_KdNr = k.kd_KdNR AND r.re_Auftragsstatus = N'Rechnung'
        AND COALESCE(r.re_Preisgutschrift, 0) = 0 AND p.reP_Artikelindex = ?
        AND p.reP_Anzahl > 0 AND COALESCE(p.reP_Preisgutschrift, 0) = 0
    )
    ${whereSql ? `AND (${whereSql})` : ''}
    ${canFilterSales ? '' : "AND UPPER(LTRIM(RTRIM(k.kd_Aussendienst))) = ?"}
    ORDER BY k.kd_Name1, k.kd_Name2, k.kd_KdNR
  `, [articleIndex, ...params, ...(canFilterSales ? [] : [salesCode.toUpperCase()])]);
  return rows.map(row => ({
    id: text(row.id),
    name: [text(row.name), text(row.name2)].filter(Boolean).join(' ') || text(row.id),
    salesCode: text(row.salesCode).toUpperCase(),
  }));
}

async function loadOfferCustomerStatuses(companyId, positionId) {
  // The UI can be deployed ahead of the separately installed schema.
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    IF OBJECT_ID(N'BMSApp.OptionOfferMailOutbox', N'U') IS NOT NULL
      EXEC sys.sp_executesql
        N'SELECT CustomerNumber, Status FROM BMSApp.OptionOfferMailOutbox
          WHERE CompanyId = @company AND OptionPositionId = @position',
        N'@company INT, @position INT', @company = ?, @position = ?;
  `, [companyId, positionId]);
  return new Map(rows.map(row => [text(row.CustomerNumber).toUpperCase(), text(row.Status)]));
}

async function loadOptionOfferCustomers(database, userIdentity, offer, position) {
  const article = await resolveOfferArticle(database, offer, position);
  const articleIndex = text(article?.articleIndex);
  if (!articleIndex) return { article: null, customers: [] };
  const [customers, statuses] = await Promise.all([
    loadArticleCustomers(database, userIdentity, articleIndex),
    loadOfferCustomerStatuses(Number(database.firmaId), position.id),
  ]);
  return {
    article: { index: articleIndex, name: text(article.articleName) },
    customers: customers.map(customer => {
      const status = statuses.get(customer.id.toUpperCase());
      return { ...customer, sent: status === 'sent', queued: Boolean(status && !['sent', 'failed'].includes(status)),
        failed: status === 'failed' };
    }),
  };
}

async function loadOfferContacts(database, customerIds) {
  const rows = await runSQLQueryAccess(database, `
    SELECT kdA_KdNR AS customerId, kdA_lfdNR AS id,
      LTRIM(RTRIM(CONCAT(kdA_Anrede,N' ',kdA_Vorname,N' ',kdA_Name))) AS name,
      kdA_Position AS position, kdA_Ranking AS ranking, kdA_eMail AS email, kdA_SprachID AS language
    FROM dbo.tblKun_Ansprech
    WHERE kdA_KdNR IN (SELECT [value] FROM OPENJSON(?))
    ORDER BY ISNULL(kdA_Ranking, 9), kdA_Name, kdA_Vorname, kdA_lfdNR
  `, [JSON.stringify(customerIds)]);
  return rows.filter(row => Number(row.id) > 0 && text(row.name)).map(row => ({
    customerId: text(row.customerId), id: Number(row.id), name: text(row.name), position: text(row.position),
    ranking: Number(row.ranking) || null, email: text(row.email), language: text(row.language).toLowerCase(),
  }));
}

module.exports = { loadOptionOfferCustomers, loadOfferContacts };
