const express = require('express');
const { asyncHandler, sendEnvelope } = require('../utils');
const { getMandantsForIdentity } = require('../db/databases');
const { getUserIdentityFromRequestContext } = require('../db/users');
const { getUserContextFromRequest } = require('../user-context');

const router = express.Router();

router.get('/mandants', asyncHandler(async (req, res) => {
  const user = getUserContextFromRequest(req);
  const identity = await getUserIdentityFromRequestContext(user);
  const mandants = await getMandantsForIdentity(identity);
  sendEnvelope(res, {
    status: 200,
    data: mandants,
    meta: { count: mandants.length },
    error: null,
  });
}));

module.exports = router;
