const { asyncHandler, createHttpError } = require('../utils');
const { getDatabaseConnectionForUser } = require('../db/databases');
const { getUserContextFromRequest } = require('../user-context');

const requireMandant = asyncHandler(async (req, res, next) => {
  const user = getUserContextFromRequest(req);
  const email = String(user.email || '').trim();
  if (!email) {
    throw createHttpError(401, 'Missing user identity.');
  }

  const mandant = req.header('x-mandant');
  if (!mandant) {
    throw createHttpError(400, 'Missing required header: x-mandant');
  }

  const database = await getDatabaseConnectionForUser(email, mandant);
  req.userEmail = email;
  req.mandant = database.name;
  req.database = database;
  next();
});

module.exports = { requireMandant };
