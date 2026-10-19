const { createHttpError } = require('./utils');
const { getDatabaseConnectionForIdentityById, getDatabaseConnectionForCompanyId } = require('./db/databases');
const { getVlScope, assertFrupackGroupAccess, FRUPACK_MANDANT_IDS } = require('./vl-group');

async function resolveVlDatabase(req, rawMandantId) {
  const groupScope = getVlScope({ vlScope: req.query?.vlScope });
  const value = String(rawMandantId ?? '').trim();
  if (groupScope && !value) throw createHttpError(400, 'Für Details bitte den Herkunftsmandanten angeben.', { code: 'VL_SCOPE_INVALID' });
  if (!value) return req.database;
  const selectedId = Number(value);
  if (!Number.isSafeInteger(selectedId) || selectedId < 0) throw createHttpError(400, 'Ungültiger VL-Mandant.', { code: 'MANDANT_ID_INVALID' });
  if (groupScope) {
    assertFrupackGroupAccess(req.userIdentity);
    if (!FRUPACK_MANDANT_IDS.includes(selectedId)) throw createHttpError(403, 'Mandant gehört nicht zur Frupack Gruppe.', { code: 'MANDANT_FORBIDDEN' });
    return getDatabaseConnectionForCompanyId(selectedId);
  }
  if (Number(req.database?.firmaId) === selectedId) return req.database;
  return getDatabaseConnectionForIdentityById(req.userIdentity, selectedId);
}
module.exports = { resolveVlDatabase };
