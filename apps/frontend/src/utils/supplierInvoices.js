export function filterSupplierInvoices(items, query = '') {
  const normalized = String(query).trim().toLocaleLowerCase('de-DE');
  if (!normalized) return items;
  const search = normalized.replace(/^(?:be|rg)\s*[:#-]?\s+(?=\S)/i, '');
  const terms = search.split(/\s+/).filter(Boolean);
  return items.filter(invoice => {
    const haystack = [invoice.invoiceNumber, ...(invoice.orderNumbers || []), ...(invoice.positionNumbers || []),
      ...(invoice.materials || []).flatMap(material => [material.article, material.purchaseArticle, material.masterArticleName, material.articleIndex])]
      .filter(Boolean).join(' ').toLocaleLowerCase('de-DE');
    return terms.every(term => haystack.includes(term));
  });
}
