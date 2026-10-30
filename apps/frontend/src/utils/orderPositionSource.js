function text(value) {
  return String(value ?? '').trim();
}

function productId(position) {
  return text(position?.productId || position?.id);
}

export function recoverOrderPositionSource(position, sources = []) {
  if (!position) return position;
  const id = productId(position);
  // Product IDs contain article, warehouse label, BE, plastic and subcategory.
  // The warehouse label is not a technical warehouse ID and must not be used as one.
  const parts = id.split('||');
  const beNumber = text(position.beNumber) || (parts.length === 5 ? text(parts[2]) : '');
  const warehouseId = text(position.warehouseId || position.storageId);
  const matches = id ? sources.filter((source) => productId(source) === id
    && (!beNumber || text(source.beNumber) === beNumber)
    && (!warehouseId || text(source.warehouseId || source.storageId) === warehouseId)) : [];
  const uniqueValue = (field) => {
    const values = [...new Set(matches.map((source) => text(field === 'warehouseId'
      ? source.warehouseId || source.storageId : source[field])).filter(Boolean))];
    return values.length === 1 ? values[0] : '';
  };
  const recovered = {
    beNumber: beNumber || uniqueValue('beNumber'),
    warehouseId: warehouseId || uniqueValue('warehouseId'),
    articleIndex: text(position.articleIndex) || uniqueValue('articleIndex'),
  };
  const patch = Object.fromEntries(Object.entries(recovered)
    .filter(([field, value]) => !text(position[field]) && value));
  return Object.keys(patch).length ? { ...position, ...patch } : position;
}
