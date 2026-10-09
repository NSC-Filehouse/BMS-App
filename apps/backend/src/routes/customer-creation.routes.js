const express = require('express');
const config = require('../config');
const { asyncHandler, createHttpError, sendEnvelope } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { LISTS, createCustomerApiClient, loadCustomerApiList } = require('../bms-customer-api');
const {
  UUID,
  canCreateCustomer,
  assertCanCreateCustomer,
  isCustomerRollbackDeveloper,
  assertCustomerRollbackDeveloper,
  normalizeCreationRequest,
} = require('../customer-creation-policy');
const { executeCustomerCreation } = require('../customer-creation-service');
const history = require('../db/customer-creation-history');

const router = express.Router();
const settings = () => config.customerApi;
function allowed(req) { assertCanCreateCustomer(req.userIdentity, req.database, settings()); }
function rollbackDeveloper(req) { assertCustomerRollbackDeveloper(req.userIdentity); }
function apiReady() {
  return settings().enabled && Boolean(settings().baseAddress) && Boolean(settings().apiKey);
}
async function normalized(req) {
  allowed(req);
  const [countries, salutations, employees] = await Promise.all([
    loadCustomerApiList('laender'), loadCustomerApiList('anreden'), loadCustomerApiList('mitarbeiter'),
  ]);
  return normalizeCreationRequest(req.body, req.userIdentity, req.database, settings(), countries.eintraege, salutations.eintraege, req.header('Idempotency-Key'), employees.eintraege);
}
function throwApiProblem(response) {
  throw createHttpError(response.status >= 500 ? 502 : response.status === 401 || response.status === 403 ? 502 : response.status,
    response.data?.detail || response.data?.title || 'Die Kunden-API hat den Vorgang abgewiesen.', {
      code: response.data?.code || 'CUSTOMER_API_ERROR', problem: response.data, state: response.state,
    });
}
router.get('/customer-creation/capabilities', requireMandant, asyncHandler(async (req, res) => {
  const rollbackDeveloperAllowed = isCustomerRollbackDeveloper(req.userIdentity);
  sendEnvelope(res, { data: {
    allowed: canCreateCustomer(req.userIdentity, req.database, settings()),
    writeEnabled: settings().writeEnabled,
    canViewAppCreated: rollbackDeveloperAllowed,
    canPreviewRollback: rollbackDeveloperAllowed && apiReady(),
    canRollback: rollbackDeveloperAllowed && apiReady() && settings().writeEnabled,
  } });
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
router.get('/customer-creation/operations/:id', requireMandant, asyncHandler(async (req, res) => {
  allowed(req);
  if (!UUID.test(req.params.id)) throw createHttpError(400, 'Ungültige Vorgangs-ID.', { code: 'CUSTOMER_CREATION_KEY_INVALID' });
  const data = await history.loadCreationOperation(req.params.id, req.userIdentity.userId, req.database.firmaId);
  if (!data) throw createHttpError(404, 'Vorgang nicht gefunden.', { code: 'CUSTOMER_CREATION_NOT_FOUND' });
  sendEnvelope(res, { data });
}));

router.get('/customer-creation/operations/:id/rueckbau-vorschau', requireMandant, asyncHandler(async (req, res) => {
  rollbackDeveloper(req);
  if (!UUID.test(req.params.id)) throw createHttpError(400, 'Ungültige Vorgangs-ID.', { code: 'CUSTOMER_CREATION_KEY_INVALID' });
  const target = await history.loadRollbackTarget(req.params.id, req.database.shortName);
  if (!target) throw createHttpError(404, 'Für diesen Mandanten wurde kein rückbaubarer App-Anlagevorgang gefunden.', { code: 'CUSTOMER_ROLLBACK_NOT_FOUND' });
  const resumable = await history.loadLatestResumableRollback(target.operationId);
  if (resumable) {
    sendEnvelope(res, { data: {
      rollbackId: resumable.rollbackId,
      operationId: target.operationId,
      preview: resumable.preview,
      reason: resumable.reason,
      resumable: true,
    } });
    return;
  }
  const response = await createCustomerApiClient().request(`/vorgaenge/${encodeURIComponent(target.erpOperationId)}/rueckbau`);
  if (response.status !== 200) throwApiProblem(response);
  if (!response.data || typeof response.data !== 'object') {
    throw createHttpError(502, 'Die Kunden-API hat keine gültige Rückbauvorschau geliefert.', { code: 'CUSTOMER_ROLLBACK_PREVIEW_INVALID' });
  }
  const rollbackId = require('node:crypto').randomUUID();
  await history.saveRollbackPreview({
    rollbackId,
    operationId: target.operationId,
    mandant: req.database.shortName,
    identity: req.userIdentity,
    preview: response.data,
  });
  sendEnvelope(res, { data: { rollbackId, operationId: target.operationId, preview: response.data, resumable: false } });
}));

router.post('/customer-creation/operations/:id/rueckbau/:rollbackId', requireMandant, asyncHandler(async (req, res) => {
  rollbackDeveloper(req);
  if (!settings().writeEnabled) {
    throw createHttpError(403, 'ERP-Schreibzugriffe sind derzeit gesperrt.', { code: 'CUSTOMER_CREATION_WRITE_DISABLED' });
  }
  if (!UUID.test(req.params.id) || !UUID.test(req.params.rollbackId)) {
    throw createHttpError(400, 'Ungültige Vorgangs-ID.', { code: 'CUSTOMER_CREATION_KEY_INVALID' });
  }
  const target = await history.loadRollbackTarget(req.params.id, req.database.shortName);
  if (!target) throw createHttpError(404, 'Für diesen Mandanten wurde kein rückbaubarer App-Anlagevorgang gefunden.', { code: 'CUSTOMER_ROLLBACK_NOT_FOUND' });
  const reservation = await history.reserveRollback({
    rollbackId: req.params.rollbackId,
    operationId: target.operationId,
    identity: req.userIdentity,
    reason: req.body?.begruendung,
    leaseSeconds: Math.max(120, Math.ceil((settings().timeoutMs || 30000) / 1000) + 60),
  });
  if (reservation.replay) {
    sendEnvelope(res, { data: reservation.data, meta: { rollbackId: req.params.rollbackId, state: 'completed', replay: true } });
    return;
  }

  let response;
  try {
    response = await createCustomerApiClient().request(
      `/vorgaenge/${encodeURIComponent(target.erpOperationId)}/rueckbau`,
      {
        method: 'POST',
        idempotencyKey: req.params.rollbackId,
        body: { begruendung: String(req.body.begruendung).trim(), quelle: { angelegtVon: target.createdBy } },
        write: true,
      },
    );
  } catch (error) {
    try {
      await history.finishRollback(req.params.rollbackId, {
        status: error.status || 502,
        data: { code: error.details?.code || 'CUSTOMER_API_CONNECTION_FAILED', detail: error.message },
      }, 'unknown');
    } catch {
      throw createHttpError(503, 'Der Rückbau kann beim ERP bereits eingegangen sein; Status und Idempotenzschlüssel bleiben in der Historie erhalten.', { code: 'CUSTOMER_ROLLBACK_HISTORY_UNCERTAIN' });
    }
    throw error;
  }

  if (response.status >= 200 && response.status < 300
    && (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)
      || typeof response.data.status !== 'string' || !response.data.status.trim())) {
    try {
      await history.finishRollback(req.params.rollbackId, {
        status: response.status,
        data: response.data ?? { code: 'CUSTOMER_ROLLBACK_RESPONSE_INVALID' },
      }, 'unknown');
    } catch {
      throw createHttpError(503, 'Der ERP-Rückbau könnte erfolgt sein; die Antwort war unvollständig und konnte nicht in der App-Historie gesichert werden.', { code: 'CUSTOMER_ROLLBACK_HISTORY_UNCERTAIN' });
    }
    throw createHttpError(502, 'Die ERP-Antwort bestätigt keinen auswertbaren Rückbaustatus. Bitte denselben Vorgang mit gleicher Begründung fortsetzen.', { code: 'CUSTOMER_ROLLBACK_RESPONSE_INVALID' });
  }

  const state = response.status >= 200 && response.status < 300
    ? (response.data?.status === 'teilweiseZurueckgebaut' ? 'partial' : 'completed')
    : response.status >= 500 ? 'unknown'
      : (response.status === 409 ? 'blocked' : 'failed');
  try {
    await history.finishRollback(req.params.rollbackId, response, state);
  } catch {
    throw createHttpError(503, 'Der ERP-Rückbau wurde beantwortet, aber sein Ergebnis konnte nicht in der App-Historie gespeichert werden. Bitte denselben Vorgang fortsetzen.', { code: 'CUSTOMER_ROLLBACK_HISTORY_UNCERTAIN' });
  }
  if (response.status < 200 || response.status >= 300) throwApiProblem(response);
  sendEnvelope(res, { data: response.data, meta: { rollbackId: req.params.rollbackId, state, replay: Boolean(response.replay) } });
}));
module.exports = router;
