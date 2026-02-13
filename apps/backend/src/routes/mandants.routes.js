const express = require('express');
const { asyncHandler, createHttpError, sendEnvelope } = require('../utils');
const { listMandantsForUser } = require('../db/databases');
const { getUserContextFromRequest } = require('../user-context');

const router = express.Router();

router.get('/mandants', asyncHandler(async (req, res) => {
  const user = getUserContextFromRequest(req);
  const email = String(user.email || '').trim();
  if (!email) {
    throw createHttpError(401, 'Missing user identity.');
  }

  const mandants = await listMandantsForUser(email);
  sendEnvelope(res, {
    status: 200,
    data: mandants,
    meta: { count: mandants.length },
    error: null,
  });
}));

module.exports = router;
