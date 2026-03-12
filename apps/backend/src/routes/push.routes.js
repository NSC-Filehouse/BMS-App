const express = require('express');
const { asyncHandler, createHttpError, sendEnvelope } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const {
  deactivatePushSubscription,
  getPushSettingsForUser,
  savePushSettingsForUser,
  upsertPushSubscription,
} = require('../db/push');

const router = express.Router();

router.use(requireMandant);

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function getUserEmail(req) {
  return asText(req.userEmail);
}

router.get('/push/settings', asyncHandler(async (req, res) => {
  const email = getUserEmail(req);
  if (!email) {
    throw createHttpError(401, 'Missing user identity.', { code: 'AUTH_MISSING_IDENTITY' });
  }

  const data = await getPushSettingsForUser(email);
  sendEnvelope(res, {
    status: 200,
    data,
    meta: { count: Array.isArray(data?.mandants) ? data.mandants.length : 0 },
    error: null,
  });
}));

router.post('/push/subscribe', asyncHandler(async (req, res) => {
  const email = getUserEmail(req);
  if (!email) {
    throw createHttpError(401, 'Missing user identity.', { code: 'AUTH_MISSING_IDENTITY' });
  }

  await upsertPushSubscription({
    email,
    subscription: req.body?.subscription,
    userAgent: req.headers['user-agent'] || '',
    language: req.body?.language || req.header('x-lang') || 'de',
  });

  const data = await getPushSettingsForUser(email);
  sendEnvelope(res, {
    status: 200,
    data,
    meta: { subscribed: true },
    error: null,
  });
}));

router.delete('/push/subscribe', asyncHandler(async (req, res) => {
  const email = getUserEmail(req);
  if (!email) {
    throw createHttpError(401, 'Missing user identity.', { code: 'AUTH_MISSING_IDENTITY' });
  }

  const endpoint = asText(req.body?.endpoint);
  if (!endpoint) {
    throw createHttpError(400, 'Missing push endpoint.', { code: 'INVALID_PUSH_ENDPOINT' });
  }

  await deactivatePushSubscription(endpoint);
  const data = await getPushSettingsForUser(email);
  sendEnvelope(res, {
    status: 200,
    data,
    meta: { subscribed: false },
    error: null,
  });
}));

router.put('/push/settings', asyncHandler(async (req, res) => {
  const email = getUserEmail(req);
  if (!email) {
    throw createHttpError(401, 'Missing user identity.', { code: 'AUTH_MISSING_IDENTITY' });
  }

  const data = await savePushSettingsForUser(email, req.body?.settings);
  sendEnvelope(res, {
    status: 200,
    data,
    meta: { count: Array.isArray(data?.mandants) ? data.mandants.length : 0 },
    error: null,
  });
}));

module.exports = router;
