const config = require('../config');
const { asyncHandler, createHttpError, sendEnvelope } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { runSQLQueryAccess } = require('../db/access');
const { createCustomerApiClient, loadCustomerApiList } = require('../bms-customer-api');
const history = require('../db/contact-creation-operations');
const { UUID } = require('../customer-creation-policy');
const {
  assertContactCreationApi, normalizeContactCreationRequest, executeContactCreation,
  throwContactCreationProblem, resolveCreatedContact, contactCreationWarnings,
} = require('../contact-creation-api');

function registerContactCreationRoutes(router, { requireVisibleCustomer, mapRepresentatives }) {
  async function authorize(req) {
    const id = String(req.params.id || '').trim();
    await requireVisibleCustomer(req, id);
    if (req.userIdentity?.active !== true || !req.userIdentity.userId || !req.userIdentity.shortCode) {
      throw createHttpError(403, 'Für die Ansprechpartneranlage fehlt ein gültiger Benutzerkontext.');
    }
    return id;
  }
  async function loadContact(database, customerId, contactId) {
    const rows = await runSQLQueryAccess(database, `SELECT kdA_lfdNR, kdA_Anrede, kdA_Vorname, kdA_Name,
      kdA_Position, kdA_Telefon, kdA_PrivatTel, kdA_Handy, kdA_eMail, kdA_Ranking
      FROM dbo.tblKun_Ansprech WHERE kdA_KdNR=? AND kdA_lfdNR=?`, [customerId, contactId]);
    return mapRepresentatives(rows)[0] || null;
  }
  const base = '/customers/:id/contacts';
  router.get(`${base}/context`, requireMandant, asyncHandler(async (req, res) => {
    const id = await authorize(req);
    assertContactCreationApi(config.customerApi);
    const pending = await history.loadPending(req.userIdentity.userId, req.database.shortName, id);
    const lists = Object.fromEntries(await Promise.all(['anreden', 'sprachen', 'laender'].map(async (name) => [name, await loadCustomerApiList(name)])));
    sendEnvelope(res, { data: { userId: req.userIdentity.userId, mandant: req.database.shortName,
      writeEnabled: config.customerApi.writeEnabled, lists, pending } });
  }));
  router.post(`${base}/check`, requireMandant, asyncHandler(async (req, res) => {
    const id = await authorize(req);
    assertContactCreationApi(config.customerApi);
    const normalized = normalizeContactCreationRequest(req.body, id, req.database, req.userIdentity);
    const response = await createCustomerApiClient().request(`/${encodeURIComponent(id)}/ansprechpartner/pruefung`, { method: 'POST', body: normalized.payload });
    if (response.status !== 200) throwContactCreationProblem(response);
    sendEnvelope(res, { data: response.data });
  }));
  router.get(`${base}/operations/:operationId`, requireMandant, asyncHandler(async (req, res) => {
    const id = await authorize(req);
    const operationId = req.params.operationId;
    if (!UUID.test(operationId)) throw createHttpError(400, 'Ungültige Vorgangs-ID.');
    const operation = await history.load(operationId, req.userIdentity.userId, req.database.shortName, id);
    if (!operation) throw createHttpError(404, 'Vorgang nicht gefunden.', { code: 'CONTACT_CREATION_OPERATION_NOT_FOUND' });
    const contact = operation.state === 'created'
      ? await resolveCreatedContact(operation, req.database, id, operationId, loadContact) : null;
    sendEnvelope(res, { data: { state: operation.state, contact, warnings: contactCreationWarnings(operation.response),
      problem: operation.state === 'failed' ? operation.response : null } });
  }));
  router.post(base, requireMandant, asyncHandler(async (req, res) => {
    const id = await authorize(req);
    assertContactCreationApi(config.customerApi, true);
    const operationId = req.header('Idempotency-Key');
    const normalized = normalizeContactCreationRequest(req.body, id, req.database, req.userIdentity, operationId);
    const response = await executeContactCreation({ operationId, customerId: id, database: req.database,
      identity: req.userIdentity, normalized, settings: config.customerApi }, { client: createCustomerApiClient(), history });
    if (response.state !== 'created') throwContactCreationProblem(response, operationId);
    const contact = await resolveCreatedContact(response, req.database, id, operationId, loadContact);
    sendEnvelope(res, { status: 201, data: { contact, warnings: contactCreationWarnings(response.data) },
      meta: { operationId, state: 'created', replay: Boolean(response.replay), idField: 'kdA_lfdNR', mandant: req.database.shortName } });
  }));
}

module.exports = { registerContactCreationRoutes };
