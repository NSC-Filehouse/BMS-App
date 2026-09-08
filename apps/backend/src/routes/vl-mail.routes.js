const express = require('express');
const { asyncHandler, createHttpError, sendEnvelope } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const {
  getVlMailSettingsForUser,
  saveVlMailSettingsForUser,
} = require('../db/vl-completion-mail');

const router = express.Router();

router.use(requireMandant);

function getUserEmail(req) {
  return String(req.userEmail || '').trim();
}

router.get('/vl-mail/settings', asyncHandler(async (req, res) => {
  const email = getUserEmail(req);
  if (!email) {
    throw createHttpError(401, 'Missing user identity.', { code: 'AUTH_MISSING_IDENTITY' });
  }

  const data = await getVlMailSettingsForUser(email);
  sendEnvelope(res, { status: 200, data, meta: {}, error: null });
}));

router.put('/vl-mail/settings', asyncHandler(async (req, res) => {
  const email = getUserEmail(req);
  if (!email) {
    throw createHttpError(401, 'Missing user identity.', { code: 'AUTH_MISSING_IDENTITY' });
  }

  const enabled = Boolean(req.body?.vlMailsEnabled);
  const data = await saveVlMailSettingsForUser(email, enabled);
  sendEnvelope(res, { status: 200, data, meta: {}, error: null });
}));

module.exports = router;
