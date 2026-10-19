const { rankCandidates, features, bestSuggestion, articlePolymer } = require('./article-matching');
const CATEGORIES = {
  HDPE: ['PE', 'HDPE'], LDPE: ['PE', 'LDPE'], LLDPE: ['PE', 'LLDPE'], MLLDPE: ['PE', 'mLLDPE'],
  PP_HOMO: ['PP', 'Homo'], PP_COPO: ['PP', 'Copo'], PP_RANDOM: ['PP', 'Random'],
};
function buildOptionEntries(offers, database, context) {
  const byId = new Map(context.articles.map(article => [String(article.articleIndex), article]));
  return offers.flatMap(offer => offer.positions.map(position => {
    const input = { ...position, supplierName: offer.supplierName, supplierKey: offer.supplierKey };
    const candidates = rankCandidates(input, context.articles, { mappings: context.mappings, limit: 6 });
    const best = bestSuggestion(candidates), assigned = position.articleIndex ? byId.get(String(position.articleIndex)) : null;
    const identified = candidates.find(candidate => candidate.identityMatch && !candidate.conflicts.length);
    const type = features(input).polymer || (assigned ? articlePolymer(assigned) : identified?.polymer);
    const category = CATEGORIES[type] || (type && !['PE', 'PP'].includes(type) ? [type, ''] : ['Optionen', 'Zuordnung offen']);
    const safeArticle = assigned || (best && !best.conflicts.length ? byId.get(best.articleIndex) : null);
    const plastic = safeArticle?.polymerCategory || category[0];
    const plasticSubCategory = type === 'MLLDPE' ? 'mLLDPE' : safeArticle?.polymerSubCategory || category[1];
    const id = `option:${database.firmaId}:${offer.id}:${position.id}`;
    return {
      kind: 'option', id, positionKey: id, sourceMandantId: database.firmaId, sourceMandantName: database.name,
      article: assigned?.articleName || position.articleName, articleName: position.articleName,
      articleIndex: position.articleIndex || null, plastic, plasticSubCategory,
      mfi: position.mfi, mfiMeasured: null, mfiTestMethod: position.mfiTestCondition,
      amount: null, reserved: null, acquisitionPrice: null, availableAmount: null,
      optionId: offer.id, optionPositionId: position.id, supplierName: offer.supplierName,
      supplierArticleName: position.articleName, masterArticleName: assigned?.articleName || '',
      articleDescription: position.propertiesText || '', masterDensity: position.densityUnit ? position.density : null,
      about: position.comment, warehouse: offer.loadingLocation, beNumber: '',
      option: { ...position, suggestedArticleIndex: best?.articleIndex || null, suggestedArticleName: best?.articleName || null,
        matchReason: best?.reason || null, matchStatus: assigned ? 'confirmed' : best ? 'suggested' : 'unmatched',
        supplierName: offer.supplierName, isDemo: offer.isDemo, incoterm: offer.incoterm, loadingLocation: offer.loadingLocation,
        candidateCount: candidates.length, moreCandidates: candidates.length > 5, negotiable: offer.negotiable },
      // Search uses the existing VL parser and the offer's own measured values.
      searchRow: { Artikel: position.articleName, masterArticleName: assigned?.articleName || '',
        Kunststoff: plastic, Kunststoff_Untergruppe: plasticSubCategory, Lagerort: offer.loadingLocation,
        articleDescription: `${position.propertiesText || ''} ${offer.supplierName} ${position.comment || ''}`,
        beP_MFI: position.mfi, beP_MFI_Pruefmethode: position.mfiTestCondition,
        masterDensity: position.densityUnit ? `${position.density} ${position.densityUnit}` : null },
    };
  }));
}
module.exports = { buildOptionEntries };
