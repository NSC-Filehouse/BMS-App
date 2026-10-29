import { purchaseArticleKey } from './purchaseCart.js';

export function supplierVlPositionKey(position) {
  return String(position?.productId || position?.id || '').trim();
}

export function selectedSupplierVlPositions(article, selectedKeys) {
  const selected = new Set(Array.from(selectedKeys || [], String));
  const seen = new Set();
  return (article.positions || []).filter((position) => {
    const key = supplierVlPositionKey(position);
    const amount = Number(position.availableAmount);
    if (!key || !selected.has(key) || seen.has(key) || !Number.isFinite(amount) || amount <= 0) return false;
    seen.add(key);
    return true;
  });
}

export function supplierArticleList(groups, query = '') {
  const byId = new Map();
  for (const group of groups || []) {
    for (const entry of group.articles || []) {
      if (entry.isNt || [entry.article, entry.masterArticleName, entry.supplierArticleName, entry.lastPurchaseArticle, group.name]
        .some(value => /(?:^|[^a-z0-9])NT(?:$|[^a-z0-9])/i.test(String(value || '')))) continue;
      const display = entry.supplierArticleName || entry.lastPurchaseArticle || entry.article;
      const key = purchaseArticleKey(entry);
      if (!byId.has(key)) byId.set(key, { ...entry, article: display, key, positions: [] });
      const article = byId.get(key);
      const ids = new Set(article.positions.map((p) => p.id || p.productId));
      for (const position of entry.availablePositions || []) {
        const id = position.id || position.productId;
        if (!ids.has(id)) { article.positions.push(position); ids.add(id); }
      }
    }
  }
  const search = query.trim().toLocaleLowerCase('de-DE');
  return [...byId.values()].filter((article) => !search ||
    `${article.article} ${article.masterArticleName || ''} ${article.lastPurchaseArticle || ''} ${article.articleIndex} ${article.positions.map((p) => `${p.beNumber} ${p.warehouse}`).join(' ')}`.toLocaleLowerCase('de-DE').includes(search))
    .sort((left, right) => left.article.localeCompare(right.article, 'de', { sensitivity: 'base', numeric: true }) || left.key.localeCompare(right.key));
}
