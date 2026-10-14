const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeDeliveryAddressRequest, deliveryAddressOutcome, executeDeliveryAddressCreation, resolveCreatedDeliveryAddress,
} = require('../src/delivery-address-api');
const { createDeliveryAddressHistory } = require('../src/db/delivery-address-operations');

const operationId = '44d1d586-c395-46b9-8b0b-8b3da41e6d64';
const erpOperationId = '6f1c2a4e-8b3d-4c1f-9a7e-2d5b8c0e1f34';
const identity = { active: true, userId: 'test-user', shortCode: 'TST' };
const database = { shortName: 'FRU', firmaId: 3 };
const settings = { enabled: true, writeEnabled: true, baseAddress: 'https://example.com/api/v1/kunden', apiKey: 'test', timeoutMs: 30000 };
const input = { street: 'Hafenstraße 12', postalCode: '20457', city: 'Hamburg', countryId: 'D', contact: 'Tor 2', pickupTimes: 'Mo-Fr 08:00-16:00' };
const customer = { kd_Name1: 'Kunde GmbH', kd_Name2: 'Lager', kd_Kurz: 'Kunde kurz', kd_KdNR: '10001', kd_Region: 'Alt' };
const normalize = (body = input, person = identity) => normalizeDeliveryAddressRequest(body, customer, '10001', database, person, { id: 'D', isoAlpha2: 'DE' }, operationId);
const context = (body = input) => ({ operationId, customerId: '10001', identity, database, settings, normalized: normalize(body) });
const created = () => ({ status: 201, data: { kundennummer: '10001', vorgangId: erpOperationId,
  eintraege: [{ mandant: 'FRU', status: 'angelegt', id: 4711, lieferanschriftNr: 3, vorgangId: erpOperationId }] } });
function dependencies(responses = [{ status: 200, data: { ergebnis: 'anlegbar', warnungen: [] } }, created()], reservation) {
  const calls = [], finished = [];
  return { calls, finished,
    client: { request: async (path, options) => {
      calls.push({ path, ...options });
      const response = responses.shift();
      if (response instanceof Error) throw response;
      assert.ok(response, 'unexpected API call'); return response;
    } },
    history: { reserve: async (ctx) => reservation || { retry: false, payload: ctx.normalized.payload },
      finish: async (...args) => { finished.push(args); } },
  };
}

test('address input binds the target tenant and creator to the server context and maps all ERP fields', () => {
  const result = normalize({ ...input, mandanten: ['PLA', 'POL'], quelle: { angelegtVon: 'OTHER' }, name1: 'Fake' });
  assert.deepEqual(result.payload.mandanten, ['FRU']);
  assert.deepEqual(result.payload.quelle, { angelegtVon: 'TST', externeReferenz: operationId });
  assert.deepEqual(result.payload.lieferanschrift, {
    name1: 'Kunde GmbH', name2: 'Lager', strasse: input.street, plz: '20457', ort: 'Hamburg', land: 'DE', region: null,
    matchcode: 'Kunde kurz', ansprechpartner: 'Tor 2', abholzeiten: 'Mo-Fr 08:00-16:00',
  });
});

test('API input requires active identities, known countries, valid lengths and explicit duplicate reasons', () => {
  assert.throws(() => normalize(input, { ...identity, active: false }), (e) => e.status === 403);
  assert.throws(() => normalize({ ...input, contact: 'x'.repeat(151) }), (e) => e.details.field === 'contact');
  assert.throws(() => normalize({ ...input, pickupTimes: 'x'.repeat(251) }), (e) => e.details.field === 'pickupTimes');
  assert.doesNotThrow(() => normalize({ ...input, contact: 'x'.repeat(150), pickupTimes: 'x'.repeat(250) }));
  assert.throws(() => normalize({ ...input, confirmed: true, reason: 'kurz' }), (e) => e.details.code === 'DELIVERY_ADDRESS_CONFIRMATION_INVALID');
  assert.throws(() => normalizeDeliveryAddressRequest(input, customer, '10001', database, identity, null), (e) => e.details.code === 'DELIVERY_ADDRESS_COUNTRY_ID_INVALID');
});

test('a first attempt checks the address and persists the per-tenant technical id after writing', async () => {
  const deps = dependencies(); const result = await executeDeliveryAddressCreation(context(), deps);
  assert.equal(deps.calls[0].path, '/10001/lieferanschriften/pruefung');
  assert.equal(deps.calls[0].write, undefined);
  assert.equal(deps.calls[1].path, '/10001/lieferanschriften');
  assert.equal(deps.calls[1].write, true);
  assert.equal(deps.calls[1].idempotencyKey, operationId);
  assert.equal(result.state, 'created');
  assert.deepEqual(result.outcome, { id: 4711, erpOperationId });
  assert.equal(deps.finished[0][2], 'created');
});

test('write lock rejects before history reservations or API calls', async () => {
  const deps = dependencies(); deps.history.reserve = () => assert.fail('must not reserve');
  await assert.rejects(() => executeDeliveryAddressCreation({ ...context(), settings: { ...settings, writeEnabled: false } }, deps), (e) => e.details.code === 'DELIVERY_ADDRESS_WRITE_DISABLED');
  assert.equal(deps.calls.length, 0);
});

test('duplicates and unaccepted warnings stop before any ERP business write', async () => {
  for (const data of [
    { ergebnis: 'dubletten', code: 'LIEFERANSCHRIFT.VORHANDEN', vorhanden: [{ mandant: 'FRU', lieferanschriftNr: 3 }] },
    { ergebnis: 'anlegbar', warnungen: [{ code: 'PLZ.UNBEKANNT' }] },
  ]) {
    const deps = dependencies([{ status: 200, data }]);
    const result = await executeDeliveryAddressCreation(context(), deps);
    assert.equal(result.state, 'failed'); assert.equal(result.status, 409); assert.equal(deps.calls.length, 1);
  }
});

test('reviewed warnings allow creation', async () => {
  const deps = dependencies([{ status: 200, data: { ergebnis: 'anlegbar', warnungen: [{ code: 'PLZ.UNBEKANNT' }] } }, created()]);
  assert.equal((await executeDeliveryAddressCreation(context({ ...input, warningsAccepted: true }), deps)).state, 'created');
});

test('an unknown attempt replays the exact stored request without another duplicate precheck', async () => {
  const frozen = { ...normalize().payload, lieferanschrift: { ...normalize().payload.lieferanschrift, name1: 'Original company name' } };
  const deps = dependencies([created()], { retry: true, payload: frozen });
  const result = await executeDeliveryAddressCreation(context(), deps);
  assert.equal(result.state, 'created'); assert.equal(deps.calls.length, 1);
  assert.equal(deps.calls[0].body, frozen); assert.equal(deps.calls[0].idempotencyKey, operationId);
});

test('timeouts are uncertain only after attempting the business write', async () => {
  let deps = dependencies([new Error('precheck timeout')]);
  assert.equal((await executeDeliveryAddressCreation(context(), deps)).state, 'failed');
  deps = dependencies([{ status: 200, data: { ergebnis: 'anlegbar' } }, new Error('write timeout')]);
  assert.equal((await executeDeliveryAddressCreation(context(), deps)).state, 'unknown');
});

test('a retry that loses authorization cannot release an earlier uncertain operation', async () => {
  const retry = { retry: true, payload: normalize().payload };
  for (const status of [401, 403, 404, 422]) {
    const deps = dependencies([{ status, data: { code: 'REJECTED' } }], retry);
    assert.equal((await executeDeliveryAddressCreation(context(), deps)).state, 'unknown');
  }
  const deps = dependencies([{ status: 422, data: { code: 'INVALID' }, replay: true }], retry);
  assert.equal((await executeDeliveryAddressCreation(context(), deps)).state, 'failed');
});

test('an ERP idempotency key conflict must keep the original request frozen', async () => {
  const deps = dependencies([{ status: 200, data: { ergebnis: 'anlegbar' } }, { status: 409, data: { code: 'IDEMPOTENZ.SCHLUESSEL_WIEDERVERWENDET' } }]);
  assert.equal((await executeDeliveryAddressCreation(context(), deps)).state, 'unknown');
});

test('a replay of a confirmed result does not contact the ERP again', async () => {
  const reservation = { ...created(), replay: true, state: 'created', outcome: { id: 4711, erpOperationId } };
  const deps = dependencies([], reservation);
  assert.equal(await executeDeliveryAddressCreation(context(), deps), reservation);
  assert.equal(deps.calls.length, 0); assert.equal(deps.finished.length, 0);
});

test('201 alone cannot confirm a missing id, failed tenant, wrong customer or another tenant', async () => {
  const mutations = [
    (r) => { delete r.data.eintraege[0].id; },
    (r) => { r.data.eintraege[0].mandant = 'PLA'; },
    (r) => { r.data.eintraege[0].status = 'fehlgeschlagen'; },
    (r) => { r.data.kundennummer = 'OTHER'; },
    (r) => { r.data.eintraege.push({ ...r.data.eintraege[0], mandant: 'PLA' }); },
  ];
  for (const mutate of mutations) {
    const response = created(); mutate(response);
    assert.equal(deliveryAddressOutcome(response, '10001', 'FRU'), null);
    const deps = dependencies([{ status: 200, data: { ergebnis: 'anlegbar' } }, response]);
    const result = await executeDeliveryAddressCreation(context(), deps);
    assert.equal(result.state, 'unknown'); assert.equal(result.status, 502);
  }
});

test('an unsuccessful audit update after creation preserves an uncertain operation', async () => {
  const deps = dependencies(); deps.history.finish = async () => { throw new Error('SQL down'); };
  await assert.rejects(() => executeDeliveryAddressCreation(context(), deps), (e) => e.details.state === 'unknown');
});

test('a confirmed creation waits for its own technical id to become readable', async () => {
  const response = { outcome: { id: 4711 } };
  await assert.rejects(() => resolveCreatedDeliveryAddress(response, database, '10001', operationId, async () => [{ id: '3', addressNo: '4711', text: 'wrong' }]), (e) => e.details.state === 'created');
  await assert.rejects(() => resolveCreatedDeliveryAddress(response, database, '10001', operationId, async () => { throw new Error('SQL down'); }), (e) => e.details.code === 'DELIVERY_ADDRESS_REFRESH_PENDING');
  const row = { id: '4711', addressNo: '3', text: 'Correct address' };
  assert.equal(await resolveCreatedDeliveryAddress(response, database, '10001', operationId, async () => [row]), row);
});

function historyWithRow(row) {
  const queries = [];
  const history = createDeliveryAddressHistory({ transact: async (_database, work) => work({ query: async (sql, params) => {
    queries.push({ sql, params }); return { rows: queries.length === 1 && row ? [row] : [] };
  } }) });
  return { history, queries };
}
const pendingRow = () => ({ UserId: identity.userId, Mandant: 'FRU', CustomerNumber: '10001', RequestHash: normalize().hash, Status: 'unknown', RequestJson: JSON.stringify(normalize().payload) });

test('history rejects operation keys reused across users, tenants, customers or input', async () => {
  for (const changes of [{ UserId: 'someone-else' }, { Mandant: 'PLA' }, { CustomerNumber: '99999' }, { RequestHash: 'different' }]) {
    const { history } = historyWithRow({ ...pendingRow(), ...changes });
    await assert.rejects(() => history.reserve(context()), (e) => e.details.code === 'DELIVERY_ADDRESS_KEY_REUSED');
  }
});

test('history blocks concurrent sends and keeps frozen server defaults on retry', async () => {
  let fixture = historyWithRow({ ...pendingRow(), Status: 'sending', IsLocked: 1 });
  await assert.rejects(() => fixture.history.reserve(context()), (e) => e.details.code === 'DELIVERY_ADDRESS_RUNNING');
  const row = pendingRow(); row.RequestJson = JSON.stringify({ originalPayload: true });
  fixture = historyWithRow(row);
  const retry = await fixture.history.reserve(context());
  assert.equal(retry.retry, true); assert.deepEqual(retry.payload, { originalPayload: true });
});

test('history saves input and the exact ERP payload before the first call', async () => {
  const { history, queries } = historyWithRow(null); const ctx = context();
  await history.reserve(ctx);
  assert.deepEqual(JSON.parse(queries[1].params[5]), ctx.normalized.input);
  assert.deepEqual(JSON.parse(queries[1].params[6]), ctx.normalized.payload);
});

test('missing audit migration prevents creating operations', async () => {
  const history = createDeliveryAddressHistory({ transact: async () => { throw Object.assign(new Error('missing table'), { number: 208 }); } });
  await assert.rejects(() => history.reserve(context()), (e) => e.details.code === 'DELIVERY_ADDRESS_SCHEMA_MISSING');
});

test('read-only recovery is scoped to operation, user, tenant and customer', async () => {
  let parameters;
  const history = createDeliveryAddressHistory({ runQuery: async (_database, _sql, params) => {
    parameters = params;
    return [{ Status: 'created', HttpStatus: 201, ResponseJson: JSON.stringify(created().data), AddressId: 4711, ErpOperationId: erpOperationId }];
  } });
  const status = await history.load(operationId, identity.userId, 'FRU', '10001');
  assert.deepEqual(parameters, [operationId, identity.userId, 'FRU', '10001']);
  assert.deepEqual(status.outcome, { id: 4711, erpOperationId });
});
