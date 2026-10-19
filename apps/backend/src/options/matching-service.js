const { runSQLQueryAccess, runSQLQuerySqlServer } = require('../db/access');
const config = require('../config');
const { articleCatalogSql, rankCandidates, supplierKey, polymer } = require('./article-matching');
const cache = new Map();
async function articleCatalog(database) {
  const key = `${database.firmaId}:${database.databaseName || database.name}`;
  const existing = cache.get(key);
  if (existing && existing.until > Date.now()) return existing.promise;
  const promise = runSQLQueryAccess(database, articleCatalogSql()).catch(error => { cache.delete(key); throw error; });
  cache.set(key, { until: Date.now() + 60000, promise });
  return promise;
}
async function loadMappings(companyId) {
  // SELECT * remains readable before the optional metadata migration is applied.
  const rows = await runSQLQuerySqlServer(config.sql.database, `SELECT m.* FROM [BMSApp].[tblOptionenArtikelMapping] m
    WHERE m.oam_MandantID=? AND m.oam_Aktiv=1`, [companyId]);
  return rows.map(row => ({ id: Number(row.oam_id), articleIndex: row.oam_Artikelindex,
    supplierKey: supplierKey(row.oam_Lieferantenname, row.oam_Lieferantenkennung), supplierArticleNo: row.oam_Artikelnummer_Lieferant,
    productName: row.oam_Artikelname_Lieferant, polymer: polymer(row.oam_Kunststofftyp) || row.oam_Kunststofftyp, quality: row.oam_ZustandNorm,
    mfiFrom: row.oam_MFIvon, mfiTo: row.oam_MFIbis, method: row.oam_MFI_Pruefmethode, conditions: row.oam_MerkmaleJson }));
}
async function candidateContext(database) {
  const [articles, mappings] = await Promise.all([articleCatalog(database), loadMappings(database.firmaId)]);
  return { articles, mappings };
}
async function candidatesFor(database, position, { q = '', limit = 30 } = {}) {
  const context = await candidateContext(database);
  if (q) {
    const terms = q.toLocaleLowerCase('de').split(/\s+/).filter(Boolean);
    return context.articles.filter(article => terms.every(term => `${article.articleIndex} ${article.articleName} ${article.productNumber || ''}`.toLocaleLowerCase('de').includes(term)))
      .slice(0, limit == null ? undefined : limit).map(article => ({ ...rankCandidates(position, [article], { includeAll: true })[0],
        reason: 'Manuelle Artikelsuche – technische Eignung prüfen', confidence: 'manual' }));
  }
  return rankCandidates(position, context.articles, { mappings: context.mappings, limit });
}
module.exports = { candidateContext, candidatesFor, articleCatalog };
