const text = value => String(value ?? '').trim();
function supplierArticleDisplay(row) {
  return text(row.supplierArticleName) || text(row.lastPurchaseArticle) || text(row.article) || text(row.masterArticleName);
}
function isNtSupplierArticle(row) {
  return [row.articleGroupName, row.masterArticleName, row.supplierArticleName, row.lastPurchaseArticle, row.article]
    .some(value => /(?:^|[^a-z0-9])NT(?:$|[^a-z0-9])/i.test(text(value)));
}
module.exports = { supplierArticleDisplay, isNtSupplierArticle };
