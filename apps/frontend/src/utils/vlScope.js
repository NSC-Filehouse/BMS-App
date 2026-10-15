export const FRUPACK_GROUP_SCOPE = 'frupack-group';

export function isVlReturnStateForMandant(returnState, activeMandantName) {
  const activeName = String(activeMandantName || '').trim().toLowerCase();
  return Boolean(activeName && String(returnState?.activeMandantName || '').trim().toLowerCase() === activeName);
}

export function resolveInitialVlSelection({ mandants, activeMandantName, frupackMandantIds, canViewGroup, returnState }) {
  const active = mandants.find((mandant) => mandant.name.trim().toLowerCase() === activeMandantName.trim().toLowerCase());
  const requestedId = String(returnState?.vlMandantId ?? '');
  if (isVlReturnStateForMandant(returnState, activeMandantName)
    && ((requestedId === FRUPACK_GROUP_SCOPE && canViewGroup)
      || mandants.some((mandant) => String(mandant.id) === requestedId))) {
    return { id: requestedId, restore: true };
  }
  const activeIsFrupack = active && frupackMandantIds.some((id) => String(id) === String(active.id));
  return { id: canViewGroup && activeIsFrupack ? FRUPACK_GROUP_SCOPE : String(active?.id ?? ''), restore: false };
}

export function buildVlDropdownOptions(mandants, { frupackMandantIds, canViewGroup, groupLabel }) {
  const memberIds = new Set(frupackMandantIds.map(String));
  const otherMandants = mandants.filter((mandant) => !memberIds.has(String(mandant.id)));
  const frupackMandants = mandants.filter((mandant) => memberIds.has(String(mandant.id)));
  if (canViewGroup) otherMandants.push({ id: FRUPACK_GROUP_SCOPE, name: groupLabel });
  const byName = (left, right) => left.name.localeCompare(right.name, 'de');
  return [...otherMandants.sort(byName), ...frupackMandants.sort(byName)];
}

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
