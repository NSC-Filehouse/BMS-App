import { purchaseArticleKey } from './purchaseCart.js';

export function supplierArticleList(groups, query = '') {
  const byId = new Map();
  for (const group of groups || []) {
    for (const entry of group.articles || []) {
      const key = purchaseArticleKey(entry);
      if (!byId.has(key)) byId.set(key, { ...entry, key, positions: [] });
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
    `${article.article} ${article.articleIndex} ${article.positions.map((p) => `${p.beNumber} ${p.warehouse}`).join(' ')}`.toLocaleLowerCase('de-DE').includes(search))
    .sort((left, right) => left.article.localeCompare(right.article, 'de', { sensitivity: 'base', numeric: true }) || left.key.localeCompare(right.key));
}
