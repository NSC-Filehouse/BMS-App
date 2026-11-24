const config = require('../config');
const { runSQLQueryAccess, runSQLQuerySqlServer } = require('../db/access');
const { buildCustomerScopeFilter, getCustomerAccessScope } = require('../db/customer-access');
const { loadOwnMandantNames } = require('../db/own-sales-mandants');
const { createHttpError } = require('../utils');
const { articleByIndex, storedCandidate } = require('./matching-service');
const { exactNameCandidates, validateOptionArticle } = require('./purchase-source');
const { articleHash } = require('./matching-contract');
const { checkMaterial } = require('./material-facts');
const { checkMfi } = require('./mfi-compatibility');
const { hasExecutiveAccess } = require('../executive-access');

const text = value => String(value ?? '').trim();
const nameKey = value => text(value).normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]+/gu, '');

function canSeeGroupBuyers(identity) {
  if (hasExecutiveAccess(identity)) return true;
  const allowed = { AKI: [1, 'kimaz'], NSC: [227, 'n.schroeder'], MFR: [130, 'm.frank'] };
  const match = allowed[text(identity?.shortCode).toUpperCase()];
  return identity?.active === true && Array.isArray(match) && Number(identity.personNumber) === match[0]
    && text(identity.userId).toLowerCase() === match[1];
}

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

async function loadArticleCustomers(database, userIdentity, articleIndex, group) {
  const scope = group ? { isFullAccess: true, userGroup: 'BMS_APP_FULL_ACCESS' } : await getCustomerAccessScope(userIdentity, database);
  const { whereSql, params } = buildCustomerScopeFilter(scope, 'k');
  const canFilterSales = ['BMS_APP_FULL_ACCESS', 'AD01', 'GR04'].includes(scope.userGroup);
  const salesCode = text(scope.shortCode).toUpperCase();
  const salesFilter = { enabled: canFilterSales, defaultCode: salesCode };
  if (!canFilterSales && !salesCode) return { customers: [], salesFilter };
  const [rows, mandants] = await Promise.all([runSQLQueryAccess(database, `
    SELECT k.kd_KdNR AS id, k.kd_Name1 AS name, k.kd_Name2 AS name2, k.kd_Aussendienst AS salesCode
      ${group ? ', k.kd_UST_Ident_Nr AS vat' : ''}
    FROM dbo.tblKunden k
    WHERE COALESCE(k.kd_InterCompany, 0) = 0 AND EXISTS (
      SELECT 1 FROM dbo.tblRechnung r
      JOIN dbo.tblRech_Position p ON p.reP_RGnummer = r.re_RgNummer
      WHERE r.re_KdNr = k.kd_KdNR AND r.re_Auftragsstatus = N'Rechnung'
        AND COALESCE(r.re_Preisgutschrift, 0) = 0 AND ${group?.articleName ? `p.reP_Artikelindex IN (
          SELECT a.agA_Artikelindex FROM dbo.tblArt_Artikel a WHERE LTRIM(RTRIM(a.agA_Artikelname)) = ?
        )` : 'p.reP_Artikelindex = ?'}
        AND p.reP_Anzahl > 0 AND COALESCE(p.reP_Preisgutschrift, 0) = 0
    )
    ${whereSql ? `AND (${whereSql})` : ''}
    ${canFilterSales ? '' : "AND UPPER(LTRIM(RTRIM(k.kd_Aussendienst))) = ?"}
    ORDER BY k.kd_Name1, k.kd_Name2, k.kd_KdNR
  `, [group?.articleName || articleIndex, ...params, ...(canFilterSales ? [] : [salesCode])]), group?.mandants || loadOwnMandantNames()]);
  const legalNames = new Set(mandants.map(row => nameKey(row.legalName)).filter(Boolean));
  const displayNames = new Set(mandants.map(row => nameKey(row.name)).filter(Boolean));
  const customers = [];
  for (const row of rows) {
    const name = [text(row.name), text(row.name2)].filter(Boolean).join(' ');
    const fullNameKey = nameKey(name);
    if (legalNames.has(nameKey(row.name)) || legalNames.has(fullNameKey) || displayNames.has(fullNameKey)) continue;
    const id = text(row.id);
    const vat = group ? nameKey(row.vat) : '';
    customers.push({ id, name: name || id, salesCode: text(row.salesCode).toUpperCase(),
      ...(group && { vat: /^[A-Z]{2}(?=[A-Z0-9]*\d)[A-Z0-9]{6,15}$/.test(vat) ? vat : '',
        companyName: fullNameKey, companyName1: nameKey(row.name) }) });
  }
  return { customers, salesFilter };
}

async function loadOfferCustomerStatuses(companyId, positionId) {
  if (positionId == null) return new Map();
  // The UI can be deployed ahead of the separately installed schema.
  const rows = typeof positionId === 'string' ? await runSQLQuerySqlServer(config.sql.database, `
    IF COL_LENGTH(N'BMSApp.OptionOfferMailOutbox', N'StockPositionKey') IS NOT NULL
      EXEC sys.sp_executesql
        N'SELECT CustomerNumber, Status FROM BMSApp.OptionOfferMailOutbox WHERE CompanyId = @company AND OptionPositionId IS NULL AND StockPositionKey = @stock',
        N'@company INT, @stock NVARCHAR(64)', @company = ?, @stock = ?;
  `, [companyId, positionId]) : await runSQLQuerySqlServer(config.sql.database, `
    IF OBJECT_ID(N'BMSApp.OptionOfferMailOutbox', N'U') IS NOT NULL
      EXEC sys.sp_executesql
        N'SELECT CustomerNumber, Status FROM BMSApp.OptionOfferMailOutbox
          WHERE CompanyId = @company AND OptionPositionId = @position',
        N'@company INT, @position INT', @company = ?, @position = ?;
  `, [companyId, positionId]);
  return new Map(rows.map(row => [text(row.CustomerNumber).toUpperCase(), text(row.Status)]));
}

async function loadOptionOfferCustomers(database, userIdentity, offer, position, selectedArticleIndex, options) {
  if (selectedArticleIndex !== undefined && (typeof selectedArticleIndex !== 'string' || !selectedArticleIndex.trim())) {
    throw createHttpError(400, 'Ungültiger Artikelindex.', { code: 'OPTION_ARTICLE_INVALID' });
  }
  const matchedArticle = await resolveOfferArticle(database, offer, position);
  if (selectedArticleIndex === undefined) {
    return loadCustomerOfferAudience(database, userIdentity, matchedArticle, position.id, options);
  }

  const articleIndex = selectedArticleIndex.trim();
  const article = matchedArticle && text(matchedArticle.articleIndex) === articleIndex
    ? matchedArticle
    : await validateOptionArticle(database, position, { articleIndex });
  const audience = await loadCustomerOfferAudience(database, userIdentity, article, position.id, options);
  return { ...audience, matched: Boolean(matchedArticle && text(matchedArticle.articleIndex) === audience.article?.index) };
}

async function loadGroupBuyers(database, userIdentity, article, localCustomers) {
  const mandants = await loadOwnMandantNames();
  const localId = Number(database.firmaId);
  const allowed = new Map(localCustomers.map(customer => [customer.id, customer]));
  const localMandant = mandants.find(row => Number(row.firmaId) === localId);
  const sources = [localMandant ?? database, ...mandants.filter(row => Number(row.firmaId) !== localId && text(row.shortName))];
  const batches = await Promise.all(sources.map(async mandant => {
    const local = Number(mandant.firmaId) === localId;
    const shortName = text(mandant.shortName || database.shortName || mandant.firmaId).toUpperCase();
    if (!local && !article.name) return [];
    const target = local ? database : { firmaId: Number(mandant.firmaId), databaseName: `BMS.${shortName}` };
    const { customers } = await loadArticleCustomers(target, userIdentity, article.index,
      { mandants, articleName: local ? '' : article.name });
    return customers.map(({ vat, companyName, companyName1, ...customer }) => ({ vat, companyName,
      accountKey: companyName1 ? JSON.stringify([customer.id.toUpperCase(), companyName1]) : '',
      customer: { ...customer, ...(local && allowed.get(customer.id)),
        id: local ? customer.id : `${shortName}:${customer.id}`, readOnly: !local || !allowed.has(customer.id) },
      assignment: { salesCode: customer.salesCode, mandant: shortName },
    }));
  }));
  const groups = [];
  const byVat = new Map(), byName = new Map(), byAccount = new Map();
  for (const { vat, companyName, accountKey, customer, assignment } of batches.flat()) {
    const names = companyName ? byName.get(companyName) || [] : [];
    const accounts = accountKey ? byAccount.get(accountKey) || [] : [];
    const compatible = groups => groups.length === 1 && (!vat || !groups[0].vat || vat === groups[0].vat) && groups[0];
    let group = (vat && byVat.get(vat)) || compatible(accounts) || compatible(names);
    if (!group) {
      group = { vat, customer, assignments: new Map() };
      groups.push(group);
    } else if (group.customer.readOnly && !customer.readOnly) {
      group.customer = customer;
    }
    if (vat) { group.vat = vat; byVat.set(vat, group); }
    if (companyName && !names.includes(group)) byName.set(companyName, [...names, group]);
    if (accountKey && !accounts.includes(group)) byAccount.set(accountKey, [...accounts, group]);
    group.assignments.set(JSON.stringify(assignment), assignment);
  }
  return groups.map(({ customer, assignments }) => ({ ...customer, assignments: [...assignments.values()] }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

async function loadCustomerOfferAudience(database, userIdentity, article, sourceId, { group = false } = {}) {
  const articleIndex = text(article?.articleIndex);
  if (!articleIndex) return { article: null, customers: [] };
  const [{ customers, salesFilter }, statuses] = await Promise.all([
    loadArticleCustomers(database, userIdentity, articleIndex),
    loadOfferCustomerStatuses(Number(database.firmaId), sourceId),
  ]);
  const matchedArticle = { index: articleIndex, name: text(article.articleName) };
  const localCustomers = customers.map(customer => {
    const status = statuses.get(customer.id.toUpperCase());
    return { ...customer, sent: status === 'sent', queued: Boolean(status && !['sent', 'failed'].includes(status)),
      failed: status === 'failed' };
  });
  if (group && canSeeGroupBuyers(userIdentity)) {
    return { article: matchedArticle, salesFilter: { ...salesFilter, enabled: true },
      customers: await loadGroupBuyers(database, userIdentity, matchedArticle, localCustomers) };
  }
  return { article: matchedArticle, salesFilter, customers: localCustomers };
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

module.exports = { loadOptionOfferCustomers, loadCustomerOfferAudience, loadOfferContacts };
