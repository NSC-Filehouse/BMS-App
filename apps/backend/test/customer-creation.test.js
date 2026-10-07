const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canCreateCustomer,
  normalizeCreationRequest,
  isCustomerRollbackDeveloper,
  isCustomerRollbackPreviewExecutable,
} = require('../src/customer-creation-policy');
const { createCustomerApiClient } = require('../src/bms-customer-api');
const { executeCustomerCreation } = require('../src/customer-creation-service');
const id = '44d1d586-c395-46b9-8b0b-8b3da41e6d64';
const identity = { active: true, userId: 'test-user', shortCode: 'TST', mainCompanyId: 3 };
const database = { firmaId: 3, shortName: 'FRU' };
const settings = { enabled: true, writeEnabled: true, stammMandant: 'PLA', baseAddress: 'https://example.com/api/v1/kunden', apiKey: 'test-secret', timeoutMs: 30000 };
const countries = [{ schluessel: 'DE', euLand: true }, { schluessel: 'US', euLand: false }];
const body = () => ({ stammdaten: { name1: 'Müller GmbH', anschrift: { strasse: 'Straße 1', plz: '12345', ort: 'München', land: 'DE' }, steuer: { ustIdNr: 'DE123456789' } }, rechnungsanschrift: { email: 'invoice@example.com' } });
const normalize = (input = body()) => normalizeCreationRequest(input, identity, database, settings, countries, id);

test('creation is restricted to the active personal main tenant, without full-access exceptions', () => {
  assert.equal(canCreateCustomer(identity, database, settings), true);
  assert.equal(canCreateCustomer(identity, { firmaId: 8, shortName: 'POL' }, settings), false);
  assert.equal(canCreateCustomer({ ...identity, active: false }, database, settings), false);
  assert.equal(canCreateCustomer({ ...identity, mainCompanyId: null }, database, settings), false);
  assert.equal(canCreateCustomer({ ...identity, mainCompanyId: 0 }, { firmaId: 0, shortName: 'TES' }, settings), false);
  assert.equal(canCreateCustomer(identity, database, { ...settings, enabled: false }), false);
});
test('rollback is restricted to the exact active AKI, MFR and NSC identities', () => {
  assert.equal(isCustomerRollbackDeveloper({ active: true, shortCode: 'MFR', personNumber: 130, userId: 'm.frank' }), true);
  assert.equal(isCustomerRollbackDeveloper({ active: true, shortCode: 'NSC', personNumber: 227, userId: 'n.schroeder' }), true);
  assert.equal(isCustomerRollbackDeveloper({ active: true, shortCode: 'AKI', personNumber: 1, userId: 'kimaz' }), true);
  assert.equal(isCustomerRollbackDeveloper({ active: true, shortCode: 'AKI', personNumber: 130, userId: 'kimaz' }), false);
  assert.equal(isCustomerRollbackDeveloper({ active: true, shortCode: 'NSC', personNumber: 130, userId: 'n.schroeder' }), false);
  assert.equal(isCustomerRollbackDeveloper({ active: false, shortCode: 'NSC', personNumber: 227, userId: 'n.schroeder' }), false);
  assert.equal(isCustomerRollbackDeveloper({ active: false, shortCode: 'AKI', personNumber: 1, userId: 'kimaz' }), false);
});
test('rollback requires an explicit executable flag in the ERP preview', () => {
  assert.equal(isCustomerRollbackPreviewExecutable({ ausfuehrbar: true }), true);
  assert.equal(isCustomerRollbackPreviewExecutable({ ausfuehrbar: false }), false);
  assert.equal(isCustomerRollbackPreviewExecutable({ status: 'ausfuehrbar' }), false);
  assert.equal(isCustomerRollbackPreviewExecutable(null), false);
});
test('creator, sales representative and copy destination cannot be supplied by the browser', () => {
  const input = { ...body(), quelle: { angelegtVon: 'OTHER' }, kopierenNach: ['POL'], vertrieb: { aussendienst: 'OTHER' }, kennzeichen: { interCompany: true, distribution: false } };
  const result = normalize(input).payload;
  assert.equal(result.quelle.angelegtVon, 'TST');
  assert.equal(result.vertrieb.aussendienst, 'TST');
  assert.equal(result.vertrieb.innendienst, 'TST');
  assert.deepEqual(result.kopierenNach, ['FRU']);
  assert.deepEqual(result.kennzeichen, { keinSerienbrief: null });
  assert.equal(result.stammdaten.name1, 'Müller GmbH');
});
test('an explicitly selected inside representative is retained', () => {
  assert.equal(normalize({ ...body(), vertrieb: { innendienst: 'XYZ' } }).payload.vertrieb.innendienst, 'XYZ');
});
test('EU companies cannot use VAT omission reasons to bypass app requirements', () => {
  const input = body(); input.stammdaten.steuer = { ustIdNrFehltGrund: 'KLEINUNTERNEHMER' };
  assert.throws(() => normalize(input), (error) => error.details.fehler.some((entry) => entry.feld === 'stammdaten.steuer.ustIdNr'));
});
test('private individuals may omit VAT and are classified for app history', () => {
  const input = body(); input.privatePerson = true; input.stammdaten.steuer.ustIdNr = '';
  const result = normalize(input);
  assert.equal(result.privatePerson, true);
  assert.equal(result.payload.stammdaten.steuer.ustIdNrFehltGrund, 'PRIVATPERSON');
  assert.equal(result.payload.privatePerson, undefined);
});
test('non-EU customers may omit VAT and use DRITTLAND', () => {
  const input = body(); input.stammdaten.anschrift.land = 'US'; input.stammdaten.steuer.ustIdNr = '';
  assert.equal(normalize(input).payload.stammdaten.steuer.ustIdNrFehltGrund, 'DRITTLAND');
});
test('unknown countries and missing invoice email remain blocking', () => {
  const input = body(); input.stammdaten.anschrift.land = 'ZZ'; input.rechnungsanschrift = null;
  assert.throws(() => normalize(input), (error) => error.details.fehler.length === 2);
});
test('a central-main-tenant creation does not copy to itself', () => {
  const result = normalizeCreationRequest(body(), { ...identity, mainCompanyId: 2 }, { firmaId: 2, shortName: 'PLA' }, settings, countries, id);
  assert.deepEqual(result.payload.kopierenNach, []);
});
test('operation UUID and classification are covered by request identity', () => {
  assert.throws(() => normalizeCreationRequest(body(), identity, database, settings, countries, 'not-uuid'));
  assert.notEqual(normalize().hash, normalize({ ...body(), privatePerson: true }).hash);
});
test('API client sends exact idempotency header and rejects redirects', async () => {
  let call;
  const client = createCustomerApiClient(settings, async (url, options) => { call = { url, options }; return { status: 201, headers: { get: () => 'true' }, text: async () => '{"kundennummer":"12345"}' }; });
  const result = await client.request('', { method: 'POST', body: { name: 'Müller' }, idempotencyKey: id, write: true });
  assert.equal(call.options.headers['Idempotency-Key'], id);
  assert.equal(call.options.headers['X-Api-Key'], 'test-secret');
  assert.equal(call.options.redirect, 'error');
  assert.equal(JSON.parse(call.options.body).name, 'Müller');
  assert.equal(result.replay, true);
});
test('disabled writes never reach the network; errors never expose credentials', async () => {
  let calls = 0;
  const client = createCustomerApiClient({ ...settings, writeEnabled: false }, async () => { calls++; });
  await assert.rejects(client.request('', { write: true }), (error) => error.details.code === 'CUSTOMER_CREATION_WRITE_DISABLED');
  await assert.rejects(client.request('/vorgaenge/erp-op/rueckbau', {
    method: 'POST', body: { begruendung: 'Testbegründung', quelle: { angelegtVon: 'MFR' } }, write: true,
  }), (error) => error.details.code === 'CUSTOMER_CREATION_WRITE_DISABLED');
  assert.equal(calls, 0);
  const broken = createCustomerApiClient(settings, async () => { throw new Error(settings.apiKey); });
  await assert.rejects(broken.request('/pruefung'), (error) => !error.message.includes(settings.apiKey) && !JSON.stringify(error).includes(settings.apiKey));
});
const success = () => ({ status: 201, data: { kundennummer: '12345', mandant: 'PLA', vorgangId: id, uebernommen: { name1: 'Müller GmbH' }, kopien: [{ mandant: 'FRU', status: 'angelegt' }] } });
const context = () => ({ operationId: id, identity, database, normalized: normalize(), settings });
function dependencies(response = success()) {
  const calls = [];
  return { calls, history: { reserveCreation: async () => ({ replay: false }), finishCreation: async (...args) => { calls.push(args); } }, client: { request: async (...args) => { calls.push(args); if (response instanceof Error) throw response; return response; } } };
}
test('disabled creation does not reserve history or call ERP', async () => {
  const deps = dependencies(); deps.history.reserveCreation = () => { throw new Error('must not run'); };
  await assert.rejects(executeCustomerCreation({ ...context(), settings: { ...settings, writeEnabled: false } }, deps));
  assert.equal(deps.calls.length, 0);
});
test('completed history replay returns the original response without another ERP call', async () => {
  const deps = dependencies(); deps.history.reserveCreation = async () => ({ replay: true, ...success(), state: 'created' });
  assert.equal((await executeCustomerCreation(context(), deps)).replay, true);
  assert.equal(deps.calls.length, 0);
});
test('failed copies preserve the created customer and are recorded as partial', async () => {
  const response = success(); response.data.kopien[0].status = 'fehlgeschlagen';
  const deps = dependencies(response);
  const result = await executeCustomerCreation(context(), deps);
  assert.equal(result.state, 'partial'); assert.equal(result.data.kundennummer, '12345');
  assert.equal(deps.calls[1][2], 'partial');
});
test('an incomplete copy response preserves confirmed central creation as partial', async () => {
  const response = success(); response.data.kopien = null;
  const result = await executeCustomerCreation(context(), dependencies(response));
  assert.equal(result.state, 'partial');
  assert.equal(result.data.kundennummer, '12345');
});
test('timeouts and running ERP operations stay uncertain and retain the same key', async () => {
  for (const response of [new Error('timeout'), { status: 409, data: { code: 'IDEMPOTENZ.VORGANG_LAEUFT' } }]) {
    const deps = dependencies(response);
    const result = await executeCustomerCreation(context(), deps);
    assert.equal(result.state, 'unknown');
    assert.equal(deps.calls[0][1].idempotencyKey, id);
  }
});
test('definitive validation failures are recorded as failed', async () => {
  const deps = dependencies({ status: 422, data: { code: 'VALIDIERUNG.FEHLGESCHLAGEN' } });
  assert.equal((await executeCustomerCreation(context(), deps)).state, 'failed');
});
test('a response from another root tenant never counts as a confirmed success', async () => {
  const response = success(); response.data.mandant = 'FRU';
  const result = await executeCustomerCreation(context(), dependencies(response));
  assert.equal(result.state, 'unknown'); assert.equal(result.status, 502);
});
test('failed post-write history persistence must not invite a new customer creation', async () => {
  const deps = dependencies(); deps.history.finishCreation = async () => { throw new Error('DB down'); };
  await assert.rejects(executeCustomerCreation(context(), deps), (error) => error.details.code === 'CUSTOMER_CREATION_HISTORY_UNCERTAIN');
});
