function escapeIdentifier(identifier) {
  // Access identifier escaping with []
  // Replace any closing bracket to avoid breaking out (defensive).
  const safe = String(identifier).replace(/]/g, ']]');
  return `[${safe}]`;
}

function normalizeDir(dir) {
  return String(dir).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
}

function buildWhereClause(resource, q) {
  const text = (q || '').toString().trim();
  if (!text) return { whereSql: '', params: [] };

  const like = `%${text}%`;

  const fields = Array.isArray(resource.searchableFields) && resource.searchableFields.length
    ? resource.searchableFields
    : [resource.pk];

  const clauses = fields.map(f => `CStr(${escapeIdentifier(f)}) LIKE ?`);
  return {
    whereSql: `WHERE (${clauses.join(' OR ')})`,
    params: fields.map(() => like),
  };
}

function buildCountQuery(resource, whereSql) {
  return `SELECT COUNT(*) AS total FROM ${escapeIdentifier(resource.table)} ${whereSql}`;
}

/**
 * Access paging via nested TOP queries.
 * page is 1-based.
 */
function buildPagedSelectQuery(resource, { whereSql, orderBy, dir, page, pageSize }) {
  const safeDir = normalizeDir(dir);
  const orderField = orderBy ? orderBy : resource.defaultSort || resource.pk;

  const orderSql = `ORDER BY ${escapeIdentifier(orderField)} ${safeDir}`;
  const cols = '*';

  if (page <= 1) {
    return `SELECT TOP ${pageSize} ${cols} FROM ${escapeIdentifier(resource.table)} ${whereSql} ${orderSql}`;
  }

  const skip = (page - 1) * pageSize;
  const topN = skip + pageSize;

  // Take TOP (skip+pageSize), then take last pageSize via reverse order, then reverse again to original order.
  const inner = `SELECT TOP ${topN} ${cols} FROM ${escapeIdentifier(resource.table)} ${whereSql} ${orderSql}`;
  const reversedDir = safeDir === 'ASC' ? 'DESC' : 'ASC';
  const middle = `SELECT TOP ${pageSize} * FROM (${inner}) AS sub1 ORDER BY ${escapeIdentifier(orderField)} ${reversedDir}`;
  const outer = `SELECT * FROM (${middle}) AS sub2 ORDER BY ${escapeIdentifier(orderField)} ${safeDir}`;

  return outer;
}

function buildDetailQuery(resource) {
  return `SELECT TOP 1 * FROM ${escapeIdentifier(resource.table)} WHERE ${escapeIdentifier(resource.pk)} = ?`;
}

module.exports = {
  escapeIdentifier,
  buildWhereClause,
  buildCountQuery,
  buildPagedSelectQuery,
  buildDetailQuery,
};
