const { createHttpError } = require('./utils');
const { pilotFeaturesForIdentity } = require('./pilot-features');
const { compareVlItems } = require('./mfi-sort');

const FRUPACK_GROUP_SCOPE = 'frupack-group';
const FRUPACK_MANDANT_IDS = Object.freeze([3, 10, 11, 12, 19]);

// The pilot gate is deliberately separate from membership and tenant permissions.
// A later rollout can replace this gate without changing the VL data flow.
function assertFrupackGroupAccess(identity) {
  if (!pilotFeaturesForIdentity(identity).frupackGroupVl) {
    throw createHttpError(403, 'Frupack Gruppe ist fuer diesen Anwender noch nicht freigegeben.', {
      code: 'FRUPACK_GROUP_FORBIDDEN',
    });
  }
}

function selectFrupackMandants(mandants) {
  return (Array.isArray(mandants) ? mandants : [])
    .filter((mandant) => FRUPACK_MANDANT_IDS.includes(Number(mandant.firmaId)));
}

function getVlScope(query) {
  const scope = String(query?.vlScope || '').trim();
  if (scope && scope !== FRUPACK_GROUP_SCOPE) {
    throw createHttpError(400, 'Ungueltige VL-Gruppe.', { code: 'VL_SCOPE_INVALID' });
  }
  if (scope && String(query?.vlMandantId || '').trim()) {
    throw createHttpError(400, 'VL-Gruppe und einzelner VL-Mandant sind nicht kombinierbar.', {
      code: 'VL_SCOPE_INVALID',
    });
  }
  return scope;
}

function getVlPositionKey(item) {
  return `${item.sourceMandantId}::${item.id}`;
}

function sortGroupVlItems(items) {
  return items.slice().sort((left, right) => compareVlItems(left, right)
    || Number(left.sourceMandantId) - Number(right.sourceMandantId));
}

function combineVlGroups(tenantGroups) {
  // Article indexes belong to a tenant. Keep its existing groups and every
  // position separate, even if another tenant has an identical article/index.
  return tenantGroups.flatMap(({ database, groups }) => groups.map((group) => ({
    ...group,
    key: `${database.firmaId}::${group.key}`,
    sourceMandantId: database.firmaId,
    sourceMandantName: database.name,
    positions: group.positions.map((item) => ({
      ...item,
      positionKey: getVlPositionKey(item),
      groupKey: `${database.firmaId}::${group.key}`,
    })),
  }))).sort((left, right) => left.name.localeCompare(right.name, 'de')
    || Number(left.sourceMandantId) - Number(right.sourceMandantId));
}

module.exports = {
  FRUPACK_GROUP_SCOPE,
  FRUPACK_MANDANT_IDS,
  assertFrupackGroupAccess,
  selectFrupackMandants,
  getVlScope,
  getVlPositionKey,
  sortGroupVlItems,
  combineVlGroups,
};
