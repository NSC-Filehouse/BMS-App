const express = require('express');
const config = require('../config');
const { asyncHandler, createHttpError, sendEnvelope } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { LISTS, createCustomerApiClient, loadCustomerApiList } = require('../bms-customer-api');
const { UUID, canCreateCustomer, assertCanCreateCustomer, normalizeCreationRequest } = require('../customer-creation-policy');
const { executeCustomerCreation } = require('../customer-creation-service');
const history = require('../db/customer-creation-history');

const router = express.Router();
const settings = () => config.customerApi;
function allowed(req) { assertCanCreateCustomer(req.userIdentity, req.database, settings()); }
async function normalized(req) {
  allowed(req);
  const countries = await loadCustomerApiList('laender');
  return normalizeCreationRequest(req.body, req.userIdentity, req.database, settings(), countries.eintraege, req.header('Idempotency-Key'));
}
function throwApiProblem(response) {
  throw createHttpError(response.status >= 500 ? 502 : response.status === 401 || response.status === 403 ? 502 : response.status,
    response.data?.detail || response.data?.title || 'Die Kunden-API hat den Vorgang abgewiesen.', {
      code: response.data?.code || 'CUSTOMER_API_ERROR', problem: response.data, state: response.state,
    });
}
router.get('/customer-creation/capabilities', requireMandant, asyncHandler(async (req, res) => {
  sendEnvelope(res, { data: { allowed: canCreateCustomer(req.userIdentity, req.database, settings()), writeEnabled: settings().writeEnabled } });
}));
router.get('/customer-creation/context', requireMandant, asyncHandler(async (req, res) => {
  allowed(req);
  const lists = await Promise.all(LISTS.map(async (name) => [name, await loadCustomerApiList(name)]));
  const data = Object.fromEntries(lists);
  if (!data.mitarbeiter.eintraege.some((entry) => entry.schluessel === req.userIdentity.shortCode)) {
    throw createHttpError(422, 'Das eigene Mitarbeiterkürzel ist in der ERP-Mitarbeiterliste nicht verfügbar.', { code: 'CUSTOMER_CREATION_EMPLOYEE_UNKNOWN' });
  }
  sendEnvelope(res, { data: {
    lists: data, ownShortCode: req.userIdentity.shortCode, ownUserId: req.userIdentity.userId, writeEnabled: settings().writeEnabled,
    stammMandant: settings().stammMandant, targetMandant: req.database.shortName,
  } });
}));
router.post('/customer-creation/check', requireMandant, asyncHandler(async (req, res) => {
  const request = await normalized(req);
  const response = await createCustomerApiClient().request('/pruefung', { method: 'POST', body: request.payload });
  if (response.status !== 200) throwApiProblem(response);
  sendEnvelope(res, { data: response.data });
}));
router.post('/customer-creation', requireMandant, asyncHandler(async (req, res) => {
  allowed(req);
  // Reject before any history writes or outgoing creation request.
  if (!settings().writeEnabled) throw createHttpError(403, 'Echte Kundenanlagen sind noch gesperrt.', { code: 'CUSTOMER_CREATION_WRITE_DISABLED' });
  const request = await normalized(req);
  const response = await executeCustomerCreation({
    operationId: req.header('Idempotency-Key'), identity: req.userIdentity,
    database: req.database, normalized: request, settings: settings(),
  }, { client: createCustomerApiClient(), history });
  if (response.status !== 201) throwApiProblem(response);
  sendEnvelope(res, { status: 201, data: response.data, meta: { operationId: req.header('Idempotency-Key'), state: response.state, replay: Boolean(response.replay) } });
}));
router.get('/customer-creation/history', requireMandant, asyncHandler(async (req, res) => {
  allowed(req);
  sendEnvelope(res, { data: await history.loadCreationHistory(req.database.firmaId) });
}));
router.get('/customer-creation/operations/:id', requireMandant, asyncHandler(async (req, res) => {
  allowed(req);
  if (!UUID.test(req.params.id)) throw createHttpError(400, 'Ungültige Vorgangs-ID.', { code: 'CUSTOMER_CREATION_KEY_INVALID' });
  const data = await history.loadCreationOperation(req.params.id, req.userIdentity.userId, req.database.firmaId);
  if (!data) throw createHttpError(404, 'Vorgang nicht gefunden.', { code: 'CUSTOMER_CREATION_NOT_FOUND' });
  sendEnvelope(res, { data });
}));
module.exports = router;
