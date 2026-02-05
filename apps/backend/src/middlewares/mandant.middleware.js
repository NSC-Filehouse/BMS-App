const { asyncHandler, createHttpError } = require('../utils');
const { getDatabaseConnection } = require('../db/databases');

const requireMandant = asyncHandler(async (req, res, next) => {
  const mandant = req.header('x-mandant');
  if (!mandant) {
    throw createHttpError(400, 'Missing required header: x-mandant');
  }

  const database = await getDatabaseConnection(mandant);
  req.mandant = mandant;
  req.database = database;
  next();
});

module.exports = { requireMandant };
