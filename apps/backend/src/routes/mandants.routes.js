const express = require('express');
const { asyncHandler, sendEnvelope } = require('../utils');
const { getMandantsForIdentity, getDefaultMandantForIdentity } = require('../db/databases');
const { getUserIdentityFromRequestContext } = require('../db/users');
const { getUserContextFromRequest } = require('../user-context');
const { pilotFeaturesForIdentity } = require('../pilot-features');
const { FRUPACK_GROUP_SCOPE, selectFrupackMandants } = require('../vl-group');

const router = express.Router();

router.get('/mandants', asyncHandler(async (req, res) => {
  const user = getUserContextFromRequest(req);
  const identity = await getUserIdentityFromRequestContext(user);
  const mandants = await getMandantsForIdentity(identity);
  const frupackMandants = selectFrupackMandants(mandants);
  const defaultMandant = getDefaultMandantForIdentity(identity, mandants);
  const defaultMandantId = defaultMandant ? Number(defaultMandant.firmaId) : null;
  sendEnvelope(res, {
    status: 200,
    data: mandants.map((mandant) => ({
      ...mandant,
      isMain: Boolean(defaultMandant && Number(mandant.firmaId) === defaultMandantId),
    })),
    meta: {
      count: mandants.length,
      mainMandantId: Number.isFinite(defaultMandantId) ? defaultMandantId : null,
      mainMandantName: defaultMandant?.name || null,
      vlGroupMemberships: { [FRUPACK_GROUP_SCOPE]: frupackMandants.map((mandant) => mandant.firmaId) },
      vlGroups: pilotFeaturesForIdentity(identity).frupackGroupVl && frupackMandants.length
        ? [{ scope: FRUPACK_GROUP_SCOPE, name: 'Frupack Gruppe' }]
        : [],
    },
    error: null,
  });
}));

module.exports = router;
