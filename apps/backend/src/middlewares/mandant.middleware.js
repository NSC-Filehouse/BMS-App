const { asyncHandler, createHttpError } = require('../utils');
const { getDatabaseConnectionForIdentity } = require('../db/databases');
const { getUserIdentityFromRequestContext } = require('../db/users');
const { getUserContextFromRequest } = require('../user-context');

const requireMandant = asyncHandler(async (req, res, next) => {
  const user = getUserContextFromRequest(req);
  const identity = await getUserIdentityFromRequestContext(user);

  const mandant = req.header('x-mandant');
  if (!mandant) {
    throw createHttpError(400, 'Missing required header: x-mandant', { code: 'MANDANT_HEADER_REQUIRED' });
  }

  const database = await getDatabaseConnectionForIdentity(identity, mandant);
  // Keep the historic field for app-owned tables. Authentication itself has
  // already been completed by SAM account name and never uses this fallback.
  req.userEmail = identity.email || identity.userId || null;
  req.userId = identity.userId || null;
  req.userIdentity = identity;
  req.userContext = user;
  req.mandant = database.name;
  req.database = database;
  next();
});

module.exports = { requireMandant };
