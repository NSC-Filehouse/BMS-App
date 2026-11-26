const { asyncHandler, createHttpError } = require('../utils');
const { getUserContextFromRequest } = require('../user-context');
const { getUserIdentityFromRequestContext } = require('../db/users');
const { pilotFeaturesForIdentity } = require('../pilot-features');

function requirePilotFeature(feature) {
  return asyncHandler(async (req, res, next) => {
    const identity = req.userIdentity || await getUserIdentityFromRequestContext(getUserContextFromRequest(req));
    const readOnly = req.method === 'GET' || req.method === 'HEAD';
    if (!pilotFeaturesForIdentity(identity, { readOnly })[feature]) {
      throw createHttpError(403, 'Dieser Bereich ist nicht freigeschaltet.', { code: 'PILOT_FEATURE_FORBIDDEN' });
    }
    next();
  });
}

module.exports = { requirePilotFeature };
