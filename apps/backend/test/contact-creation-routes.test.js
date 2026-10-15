const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createHttpError } = require('../src/utils');
const operationId = '44d1d586-c395-46b9-8b0b-8b3da41e6d64';
const erpOperationId = '6f1c2a4e-8b3d-4c1f-9a7e-2d5b8c0e1f34';
const settings = { enabled: true, writeEnabled: true, baseAddress: 'https://example.com', apiKey: 'test' };
const identity = { active: true, userId: 'test-user', shortCode: 'TST' };
let apiCalls, sqlCalls, operations, nextResponse, missingContact, reservations;
const mock = (path, exports) => { require.cache[require.resolve(path)] = { exports }; };
mock('../src/config', { customerApi: settings });
mock('../src/middlewares/mandant.middleware', { requireMandant: (req, _res, next) => {
  if (req.header('x-mandant') !== 'FRU') return next(createHttpError(403, 'Mandant forbidden'));
  req.database = { shortName: 'FRU' }; req.userIdentity = identity; next();
} });
mock('../src/db/access', { runSQLQueryAccess: async (database, sql, params) => {
  sqlCalls.push({ database, sql, params });
  return missingContact ? [] : [{ kdA_lfdNR: 9003, kdA_Name: 'Muster' }];
} });
mock('../src/bms-customer-api', {
  loadCustomerApiList: async (name) => ({ eintraege: [{ schluessel: name, bezeichnung: name }] }),
  createCustomerApiClient: () => ({ request: async (path, options) => {
    apiCalls.push({ path, options });
    return path.endsWith('/pruefung') ? { status: 200, data: { ergebnis: 'anlegbar' } } : nextResponse;
  } }),
});
mock('../src/db/contact-creation-operations', {
  reserve: async (context) => { reservations.push(context); return { payload: context.normalized.payload }; },
  finish: async (id, response, state, outcome) => operations.set(id, { state, outcome, response: response.data }),
  loadPending: async () => null,
  load: async (id, userId, mandant, customerId) => userId === identity.userId && mandant === 'FRU' && customerId === '10001' ? operations.get(id) : null,
});
const { registerContactCreationRoutes } = require('../src/routes/contact-creation.routes');
const app = express(); app.use(express.json());
registerContactCreationRoutes(app, {
  requireVisibleCustomer: async (_req, id) => { if (id !== '10001') throw createHttpError(403, 'Customer forbidden'); },
  mapRepresentatives: (rows) => rows.map((row) => ({ id: row.kdA_lfdNR, name: row.kdA_Name })),
});
app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: { message: error.message, details: error.details } }));
let server, root;
test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.on('listening', resolve));
  root = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
test.beforeEach(() => {
  apiCalls=[]; sqlCalls=[]; operations=new Map(); reservations=[]; missingContact=false; settings.writeEnabled=true;
  nextResponse={status:201,data:{kundennummer:'10001',eintraege:[{mandant:'FRU',status:'angelegt',lfdNr:9003,vorgangId:erpOperationId,rankingStatus:'nichtGesetzt'}]}};
});
const request = async (suffix, { customerId='10001', mandant='FRU', body, ...options } = {}) => {
  const response = await fetch(`${root}/customers/${customerId}/contacts${suffix}`, { ...options,
    headers: { 'x-mandant':mandant, 'Content-Type':'application/json', 'Idempotency-Key':operationId },
    ...(body ? { body:JSON.stringify(body) } : {}) });
  return { status:response.status, body:await response.json() };
};
test('every contact endpoint enforces customer and tenant visibility before API or SQL activity', async () => {
  for (const [suffix,method] of [['/context','GET'],['/check','POST'],['','POST'],[`/operations/${operationId}`,'GET']]) {
    assert.equal((await request(suffix,{method,customerId:'99999',body:method==='POST'?{contact:{name:'Muster'}}:null})).status,403);
    assert.equal((await request(suffix,{method,mandant:'PLA'})).status,403);
  }
  assert.equal(apiCalls.length,0); assert.equal(sqlCalls.length,0); assert.equal(reservations.length,0);
});
test('context exposes only contact lists, owner and active target; precheck does not reserve or write', async () => {
  const context=await request('/context'); assert.equal(context.status,200);
  assert.deepEqual(Object.keys(context.body.data.lists),['anreden','sprachen','laender']);
  assert.equal(context.body.data.userId,identity.userId); assert.equal(context.body.data.mandant,'FRU');
  settings.writeEnabled=false;
  assert.equal((await request('/check',{method:'POST',body:{contact:{name:'Muster'}}})).status,200);
  assert.equal(apiCalls.length,1); assert.equal(apiCalls[0].options.write,undefined); assert.equal(reservations.length,0);
  assert.equal((await request('',{method:'POST',body:{contact:{name:'Muster'}}})).status,403);
});
test('creation returns technical contact id and ranking warning, then supports readonly recovery', async () => {
  const result=await request('',{method:'POST',body:{contact:{name:'Muster',ranking:1},mandanten:['PLA'],quelle:{angelegtVon:'OTHER'}}});
  assert.equal(result.status,201); assert.equal(result.body.data.contact.id,9003);
  assert.equal(result.body.data.warnings[0].code,'ANSPRECHPARTNER.RANKING_NICHT_GESETZT');
  assert.deepEqual(apiCalls[1].options.body.mandanten,['FRU']);
  assert.equal(apiCalls[1].options.body.quelle.angelegtVon,'TST');
  assert.equal(apiCalls[1].options.idempotencyKey,operationId);
  assert.deepEqual(sqlCalls[0].params,['10001',9003]);
  assert.match(sqlCalls[0].sql,/WHERE kdA_KdNR=\? AND kdA_lfdNR=\?/);
  settings.writeEnabled=false;
  const status=await request(`/operations/${operationId}`);
  assert.equal(status.status,200); assert.equal(status.body.data.state,'created'); assert.equal(status.body.data.contact.id,9003);
  assert.equal(apiCalls.length,2);
});
test('SQL refresh failure retains confirmed creation and next status request only reads SQL', async () => {
  missingContact=true;
  const result=await request('',{method:'POST',body:{contact:{name:'Muster'}}});
  assert.equal(result.status,503); assert.equal(result.body.error.details.state,'created');
  assert.equal(operations.get(operationId).state,'created');
  missingContact=false;
  assert.equal((await request(`/operations/${operationId}`)).status,200);
  assert.equal(apiCalls.length,2);
});
