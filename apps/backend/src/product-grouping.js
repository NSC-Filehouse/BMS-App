function toText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function isPpCopo3600Article(value) {
  const text = toText(value);
  return /\bpp[\s-]*(?:copo|c)\b/i.test(text) && /\b3600\b/i.test(text);
}

function resolveProductGroup(row = {}) {
  const articleIndex = toText(row.articleIndex);
  const masterArticleName = toText(row.masterArticleName);
  if (articleIndex && masterArticleName) {
    return {
      key: `master-article:${articleIndex}`,
      name: masterArticleName,
    };
  }
  if (masterArticleName) {
    return {
      key: `master-article-name:${masterArticleName.toLowerCase()}`,
      name: masterArticleName,
    };
  }

  if (isPpCopo3600Article(row.article)) {
    return { key: 'pp-copo-3600-og', name: 'PP Copo 3600 OG' };
  }

  const groupId = toText(row.articleGroupId);
  const groupName = toText(row.articleGroupName);
  if (groupId || groupName) {
    return {
      key: `article-group:${groupId || groupName.toLowerCase()}`,
      name: groupName || `Artikelgruppe ${groupId}`,
    };
  }

  const category = [toText(row.plastic), toText(row.plasticSubCategory)]
    .filter((value) => value && value.toLowerCase() !== 'unbekannt')
    .join(' ');
  if (category) return { key: `category:${category.toLowerCase()}`, name: category };
  return { key: 'other', name: 'Sonstige' };
}

module.exports = {
  resolveProductGroup,
};
