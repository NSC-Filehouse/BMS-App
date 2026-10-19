function buildOptionEntries(offers, database) {
  return offers.flatMap(offer => offer.positions.map(position => {
    const plastic = position.plastic || 'Optionen';
    const plasticSubCategory = position.plasticSubCategory ?? 'Zuordnung offen';
    const id = `option:${database.firmaId}:${offer.id}:${position.id}`;
    return {
      kind: 'option', id, positionKey: id, sourceMandantId: database.firmaId, sourceMandantName: database.name,
      article: position.internalArticleName || position.articleName, articleName: position.articleName,
      articleIndex: position.articleIndex || null, plastic, plasticSubCategory,
      mfi: position.mfi, mfiMeasured: null, mfiTestMethod: position.mfiTestCondition,
      amount: null, reserved: null, acquisitionPrice: null, availableAmount: null,
      optionId: offer.id, optionPositionId: position.id, supplierName: offer.supplierName,
      supplierArticleName: position.articleName, masterArticleName: position.internalArticleName || '',
      articleDescription: position.propertiesText || '', masterDensity: position.densityUnit ? position.density : null,
      about: position.comment, warehouse: offer.loadingLocation, beNumber: '',
      option: { ...position,
        supplierName: offer.supplierName, isDemo: offer.isDemo, incoterm: offer.incoterm, loadingLocation: offer.loadingLocation,
        moreCandidates: position.candidateCount > 5, negotiable: offer.negotiable },
      // Search uses the existing VL parser and the offer's own measured values.
      searchRow: { Artikel: position.articleName, masterArticleName: position.internalArticleName || '',
        Kunststoff: plastic, Kunststoff_Untergruppe: plasticSubCategory, Lagerort: offer.loadingLocation,
        articleDescription: `${position.propertiesText || ''} ${offer.supplierName} ${position.comment || ''}`,
        beP_MFI: position.mfi, beP_MFI_Pruefmethode: position.mfiTestCondition,
        masterDensity: position.densityUnit ? `${position.density} ${position.densityUnit}` : null },
    };
  }));
}
module.exports = { buildOptionEntries };
