export const FRUPACK_GROUP_SCOPE = 'frupack-group';

export function getVlPositionKey(item) {
  if (item?.positionKey) return String(item.positionKey);
  const id = String(item?.id || '').trim();
  return item?.sourceMandantId === null || item?.sourceMandantId === undefined
    ? id : `${item.sourceMandantId}::${id}`;
}

export function isVlPositionReadOnly(item, activeMandantId, foreignList = false) {
  if (foreignList) return true;
  const source = item?.sourceMandantId;
  if (source === null || source === undefined || activeMandantId === null || activeMandantId === undefined) return true;
  return Number(source) !== Number(activeMandantId);
}

export function getProductSourceMandantId(item, selectedVlMandantId) {
  return String(item?.sourceMandantId ?? (selectedVlMandantId === FRUPACK_GROUP_SCOPE ? '' : selectedVlMandantId) ?? '');
}
