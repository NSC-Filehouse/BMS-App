const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
const express = require('express');
const { normalize, totals } = require('../src/offers/values');
const { headerFields, positionFields } = require('../src/offers/storage');
const { synchronizeReservations } = require('../src/offers/reservations');
const crypto = require('node:crypto');
const {
  compact,
  catalogWhere,
  groupArticles,
} = require('../src/offers/catalog');
const { resolveProductGroup } = require('../src/product-grouping');

test('offer code search includes supplier and former names and grouping uses the VL article identity', () => {
  assert.equal(compact('ML 1803'), 'ml1803');
  assert.equal(compact('ML-1803'), 'ml1803');
  const where = catalogWhere({ q: 'ML1803' });
  assert.deepEqual(where.params, ['%ml1803%']);
  assert.match(where.sql, /agA_Artikelname_Lieferant/);
  assert.match(where.sql, /agA_AlteBezeichnung/);
  assert.doesNotMatch(where.sql, /ag_Gruppenname/);
  const article = {
    articleIndex: '01298',
    article: 'PE ML1803 Absorber',
    masterArticleName: 'PE ML1803 Absorber',
  };
  const group = groupArticles([article])[0];
  assert.equal(group.key, resolveProductGroup(article).key);
  assert.equal(group.name, 'PE ML1803 Absorber');
});

const input = () => ({
  customerId: '100',
  contactId: 71,
  packagingId: 1,
  deliveryTermsId: 1,
  deliveryAddress: 'Werkstraße 1, 12345 Musterstadt',
  clientRequestId: crypto.randomUUID(),
  positions: [
    {
      articleIndex: 'A',
      article: 'Artikel Ä',
      quantity: 11000,
      unit: 'KG',
      price: 2650,
      priceBasis: 1000,
    },
    {
      articleIndex: 'A',
      article: 'Artikel Ä',
      quantity: 5500,
      unit: 'KG',
      price: 2990,
      priceBasis: 1000,
    },
  ],
});
test('offer price basis, repeated article lines and decimal cent rounding follow BMS quantities', () => {
  const n = normalize(input());
  assert.equal(n.positions.length, 2);
  assert.equal(n.positions[0].total, 29150);
  assert.equal(n.positions[1].total, 16445);
  assert.equal(totals(n.positions, 0, 0).netAmount, 45595);
  assert.equal(totals(n.positions, 0, 0).totalAmount, 45595);
  assert.deepEqual(
    totals([{ quantity: 1, price: 1.005, priceBasis: 1 }], 0, 0),
    {
      lineTotals: [1.01],
      netAmount: 1.01,
      discountAmount: 0,
      subtotal: 1.01,
      vatAmount: 0,
      totalAmount: 1.01,
    },
  );
  assert.equal(totals(n.positions, 100, 0).totalAmount, 0);
});
test('invalid units, dates, quantities, prices, discount and reservation amounts cannot enter SQL', () => {
  for (const change of [
    { deliveryAddressId: -1 },
    { positions: [] },
    { customerId: '' },
  ])
    assert.throws(() => normalize({ ...input(), ...change }), { status: 400 });
  for (const change of [
    { deliveryDate: '2026-02-30' },
    { quantity: 0 },
    { price: -1 },
    { priceBasis: 0 },
    { quantity: '1e6' },
    { quantity: 1.0001 },
    { reserve: true, unit: 'STK' },
    {
      reserve: true,
      reserveQuantity: 99999,
      reserveUntil: '2026-11-11',
      beNumber: 'X',
      warehouseId: 'L',
    },
  ]) {
    const body = input();
    body.positions = [{ ...body.positions[0], ...change }];
    assert.throws(() => normalize(body), { status: 400 });
  }
});

function loadWithMocks(filename, mocks) {
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(filename, 'utf8'),
    {
      require: (name) => mocks[name] || localRequire(name),
      module,
      exports: module.exports,
      Buffer,
      console,
      Intl,
      Date,
      URLSearchParams,
    },
    { filename },
  );
  return module.exports;
}
async function fixture(t) {
  const state = { headers: [], positions: [], calls: [], transactionCount: 0, schemaReady: false, stock: [],
    drafts: [], mail: [], recipientEmail: 'kunde@example.invalid' };
  let nextId = 1;
  function project(row, fields) {
    return Object.fromEntries(
      Object.entries(fields).map(([key, col]) => [key, row[col]]),
    );
  }
  const query = async (sql, params = []) => {
    assert.equal((sql.match(/\?/g) || []).length, params.length, sql);
    state.calls.push({ sql, params });
    if (sql.includes('COL_LENGTH')) return { rows: [{ ready: Number(sql.includes('tag_offer_pdf') || state.schemaReady) }] };
    if (sql.includes('OUTPUT inserted.Id AS id') && sql.includes('OptionOfferMailOutbox')) {
      const row = { id: state.mail.length + 1, tempOfferId: params[3], status: 'pending' };
      state.mail.push(row);
      return { rows: [row] };
    }
    if (sql.includes('WHERE TempOfferId=?')) return { rows: state.mail.filter(row => row.tempOfferId === params[0]) };
    if (sql.includes('INSERT INTO BMSApp.OptionOfferDocument')) {
      state.drafts.push(JSON.parse(params[1]));
      return { rows: [] };
    }
    if (sql.includes('AS pdfReady')) {
      const offer = state.headers.find(row => row.tag_id === params[0] && row.tag_company_id === params[1]);
      return { rows: [{ pdfReady: offer?.tag_status === 2 && offer.pdf ? 1 : 0,
        mailStatus: state.mail.find(row => row.tempOfferId === params[0])?.status }] };
    }
    if (sql.includes('h.tag_offer_pdf AS pdf')) {
      return { rows: state.headers.filter(row => row.tag_id === params[0] && row.tag_company_id === params[1]
        && (params.length < 3 || row.tag_created_by === params[2]) && row.tag_status === 2 && row.pdf)
        .map(row => ({ number: 'AN-42', pdf: row.pdf })) };
    }
    if (sql.includes('tagp_order_position_id IS NOT NULL')) {
      return { rows: state.positions.filter((p) => p.tagp_offer_id === params[0] && p.tagp_order_position_id)
        .map((p) => ({ id: p.tagp_id })) };
    }
    if (/INSERT INTO/.test(sql)) {
      const columns = sql
        .slice(sql.indexOf('(') + 1, sql.indexOf(')'))
        .replace(/[\[\]]/g, '')
        .split(',');
      const row = Object.fromEntries(
        columns.map((c, i) => [c.trim(), params[i]]),
      );
      if (sql.includes('tbl_Temp_Angebot')) {
        row.tag_id = nextId++;
        row.tag_status = 0;
        row.version = '0x0000000000000001';
        state.headers.push(row);
        return { rows: [row] };
      }
      row.tagp_id = state.positions.length + 1;
      state.positions.push(row);
      return { rows: [row] };
    }
    if (
      sql.startsWith('SELECT') &&
      sql.includes('FROM [BMSApp].[tbl_Temp_Ang_Position]')
    ) {
      return {
        rows: state.positions
          .filter((p) => p.tagp_offer_id === params[0])
          .map((p) => ({ ...project(p, positionFields), id: p.tagp_id })),
      };
    }
    if (sql.includes('SELECT COUNT(*)'))
      return {
        rows: [
          {
            total: state.headers.filter(
              (h) =>
                h.tag_company_id === params[0] &&
                (!sql.includes('h.tag_created_by=?') || h.tag_created_by === params[1]),
            ).length,
          },
        ],
      };
    if (sql.includes('SELECT tag_id AS id'))
      return {
        rows: state.headers
          .filter(
            (h) =>
              h.tag_company_id === params[0] &&
              h.tag_created_by === params[1] &&
              h.tag_client_request_id === params[2],
          )
          .map((h) => ({ id: h.tag_id })),
      };
    if (
      sql.startsWith('SELECT') &&
      sql.includes('FROM [BMSApp].[tbl_Temp_Angebot]')
    ) {
      const list = sql.includes('OFFSET');
      const ownerRequired = sql.includes('AND h.tag_created_by=?');
      const headers = state.headers.filter((h) =>
        list
          ? h.tag_company_id === params[0] && (!ownerRequired || h.tag_created_by === params[1])
          : h.tag_id === params[0] &&
            h.tag_company_id === params[1] &&
            (!ownerRequired || h.tag_created_by === params[2]),
      );
      return {
        rows: headers.map((h) => ({
          ...project(h, headerFields),
          id: h.tag_id,
          status: h.tag_status,
          version: h.version,
          createdBy: h.tag_created_by,
        })),
      };
    }
    if (sql.startsWith('UPDATE')) {
      const h = state.headers.find((h) => h.tag_id === params.at(-1));
      if (sql.includes('tag_status=1')) h.tag_status = 1;
      else {
        Object.values(headerFields).forEach((col, i) => (h[col] = params[i]));
        h.tag_status = 0;
      }
      h.version = '0x0000000000000002';
      return { rows: [] };
    }
    if (sql.startsWith('DELETE FROM [BMSApp].[tbl_Temp_Ang_Position]')) {
      state.positions = state.positions.filter(
        (p) => p.tagp_offer_id !== params[0],
      );
      return { rows: [] };
    }
    if (sql.startsWith('DELETE FROM [BMSApp].[tbl_Temp_Angebot]')) {
      state.headers = state.headers.filter((p) => p.tag_id !== params[0]);
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const conversion = loadWithMocks(path.resolve(__dirname, '../src/offers/order-conversion.js'), {
    '../db/access': { runSQLQueryAccess: async () => state.stock },
    '../db/temp-order-planning': {
      ...require('../src/db/temp-order-planning'),
      loadTempOrderPlanning: async () => new Map(),
    },
  });
  const mail = loadWithMocks(path.resolve(__dirname, '../src/offers/erp-mail.js'), {
    '../options/customer-offers': {
      loadOfferContacts: async (_database, [customerId]) => [{
        customerId, id: 71, name: 'Testkontakt', email: state.recipientEmail, language: 'de',
      }],
    },
  });
  const outbox = loadWithMocks(path.resolve(__dirname, '../src/db/option-offer-outbox.js'), {
    './access': { runSQLQuerySqlServer: async (_database, sql, params) => (await query(sql, params)).rows },
    '../offers/erp-mail': mail,
  });
  const route = loadWithMocks(
    path.resolve(__dirname, '../src/routes/temp-offers.routes.js'),
    {
      '../middlewares/mandant.middleware': {
        requireMandant(req, res, next) {
          const who = req.header('x-test-user') || 'NSC';
          req.database = {
            firmaId: Number(req.header('x-test-company') || 0),
            databaseName: 'BMS.TES',
          };
          req.userIdentity =
            who === 'NSC'
              ? {
                  shortCode: 'NSC',
                  personNumber: 227,
                  userId: 'n.schroeder',
                  active: true,
                }
              : who === 'OBA'
              ? { shortCode: 'OBA', personNumber: 276, userId: 'Bader', active: true }
              : who === 'MFR'
              ? { shortCode: 'MFR', personNumber: 130, userId: 'm.frank', active: true }
              : who === 'AKI'
              ? { shortCode: 'AKI', personNumber: 1, userId: 'kimaz', active: true }
              : {
                  shortCode: who,
                  personNumber: 999,
                  userId: 'other',
                  active: true,
                };
          req.userIdentity.email = 'vertrieb@example.invalid';
          req.userIdentity.fullName = 'Test Vertrieb';
          next();
        },
      },
      '../db/access': {
        runSQLQuerySqlServer: async (db, sql, params) =>
          (await query(sql, params)).rows,
        runSQLQueryAccess: async (_db, sql) =>
          sql.includes('agA_Artikelindex AS')
            ? [{ articleIndex: 'A', article: 'Artikel Ä' }]
            : sql.includes('dbo.tblKun_Ansprech')
              ? [{ name: 'Testkontakt' }]
              : sql.includes('SELECT agA_Artikelindex')
              ? [{ agA_Artikelindex: 'A' }]
              : [],
        withSqlTransaction: async (_db, work) => {
          state.transactionCount++;
          const before = structuredClone({
            headers: state.headers,
            positions: state.positions,
            mail: state.mail,
            drafts: state.drafts,
          });
          try {
            return await work({ query });
          } catch (e) {
            state.headers = before.headers;
            state.positions = before.positions;
            state.mail = before.mail;
            state.drafts = before.drafts;
            throw e;
          }
        },
      },
      '../offers/terms': {
        loadOfferOptions: async () => ({
          payments: [],
          packagingTypes: [{ id: 1, text: 'Sackware' }],
          incoterms: [{ id: 1, text: 'FCA' }, { id: 2, text: 'DAP' }],
        }),
      },
      '../offers/order-conversion': conversion,
      '../offers/erp-mail': mail,
      '../db/option-offer-outbox': outbox,
      '../db/customer-access': {
        getCustomerAccessScope: async () => ({ isFullAccess: true }),
        loadVisibleCustomer: async (_db, id) =>
          id === '100'
            ? { kd_KdNR: '100', kd_Name1: 'Testkunde', kd_Strasse: 'Straße 1' }
            : null,
      },
    },
  );
  const app = express();
  app.use(express.json());
  app.use(route);
  app.use((e, req, res, next) =>
    res
      .status(e.status || 500)
      .json({ message: e.message, code: e.details?.code }),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  async function call(url, method = 'GET', body, headers = {}) {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.headers.get('content-type')?.startsWith('application/pdf')
      ? { status: res.status, pdf: Buffer.from(await res.arrayBuffer()) }
      : { status: res.status, json: await res.json() };
  }
  return { state, call, query, conversion };
}
test('manual offers require a loading location only for FCA', async (t) => {
  const { state, call } = await fixture(t);
  const missing = { ...input(), deliveryAddress: '   ' };
  const rejected = await call('/temp-offers', 'POST', missing);
  assert.equal(rejected.status, 400);
  assert.match(rejected.json.message, /Ladeort/);
  const created = await call('/temp-offers', 'POST', input());
  assert.equal(created.status, 201);
  const { id, version } = created.json.data;
  assert.equal((await call(`/temp-offers/${id}`, 'PUT', { ...missing, version })).status, 400);
  assert.equal((await call('/temp-offers', 'POST', { ...missing, deliveryTermsId: 2 })).status, 201);
  state.headers[0][headerFields.deliveryAddress] = '';
  assert.equal((await call(`/temp-offers/${id}/release`, 'POST', { version })).status, 400);
  assert.equal(state.mail.length, 0);
});

test('manual release enqueues a verified recipient and the detail serves only the completed ERP file', async (t) => {
  const { state, call } = await fixture(t);
  const { json: { data: offer } } = await call('/temp-offers', 'POST', input());
  const url = `/temp-offers/${offer.id}`;
  const body = { version: offer.version };
  state.recipientEmail = '';
  assert.equal((await call(`${url}/release`, 'POST', body)).status, 422);
  assert.equal(state.headers[0].tag_status, 0);
  assert.equal(state.mail.length, 0);
  state.recipientEmail = 'kunde@example.invalid';
  const released = await call(`${url}/release`, 'POST', body);
  assert.equal(released.status, 200);
  assert.equal(released.json.data.status, 1);
  assert.equal(released.json.data.mailStatus, 'pending');
  assert.equal(state.drafts[0].recipientEmail, state.recipientEmail);
  const pdf = Buffer.from('%PDF-1.7\nERP');
  state.headers[0].pdf = pdf;
  assert.equal((await call(`${url}/pdf`)).status, 404);
  state.headers[0].tag_status = 2;
  assert.equal((await call(`${url}/pdf`, 'GET', null, { 'x-test-company': '3' })).status, 404);
  assert.equal((await call(url)).json.data.pdfReady, true);
  assert.deepEqual((await call(`${url}/pdf`)).pdf, pdf);
});
test('only NSC can open a scoped order draft, which retains prices and leaves insufficient stock unresolved', async (t) => {
  const { state, call } = await fixture(t);
  const body = input();
  body.customerReference = 'K-422';
  body.positions[0] = { ...body.positions[0], quantity: 11, unit: 't', priceBasis: 1 };
  const created = await call('/temp-offers', 'POST', body);
  assert.equal(created.status, 201);
  const url = `/temp-offers/${created.json.data.id}/order-draft`;
  for (const other of ['OBA', 'MFR', 'OTHER']) {
    const before = state.calls.length;
    const denied = await call(url, 'GET', null, { 'x-test-user': other });
    assert.equal(denied.status, 403);
    assert.equal(state.calls.length, before);
  }
  assert.equal((await call(url)).status, 503);
  state.schemaReady = true;
  assert.equal((await call(url, 'GET', null, { 'x-test-company': '13' })).status, 404);
  state.stock = [
    { articleIndex: 'A', beNumber: '0-02-26-001-01', warehouseId: 'A1', amount: 12000, costPrice: 1975 },
    { articleIndex: 'A', beNumber: '13-02-26-001-01', warehouseId: 'A1', amount: 25000, costPrice: 1975 },
  ];
  const result = await call(url);
  assert.equal(result.status, 200);
  assert.equal(result.json.data.clientReferenceId, '100');
  assert.equal(result.json.data.customerOrderNumber, 'K-422');
  const [stocked, shortage] = result.json.data.positions;
  assert.equal(stocked.offerPositionId, created.json.data.positions[0].id);
  assert.equal(stocked.amountInKg, 11000);
  assert.equal(stocked.price, 2650);
  assert.equal(stocked.beNumber, state.stock[0].beNumber);
  assert.equal(shortage.beNumber, undefined);
  assert.deepEqual(shortage.candidates.map((candidate) => candidate.beNumber), [state.stock[0].beNumber]);
  assert.equal(state.positions.some((position) => position.tagp_order_position_id), false);
});

test('creating an order revalidates the offer version, selected lines, and customer before linking', async (t) => {
  const { state, call, query, conversion } = await fixture(t);
  state.schemaReady = true;
  const { json: { data: offer } } = await call('/temp-offers', 'POST', input());
  const req = {
    userIdentity: { shortCode: 'NSC', personNumber: 227, userId: 'n.schroeder', active: true },
    database: { firmaId: 0 },
  };
  const positions = [{ articleIndex: 'A', offerPositionId: offer.positions[0].id }, { articleIndex: 'B' }];
  const body = { offerSourceId: offer.id, offerSourceVersion: offer.version };
  assert.throws(() => conversion.orderConversionInput({ ...req, userIdentity: null }, {}, positions), { status: 403 });
  assert.throws(() => conversion.orderConversionInput(req, body, [positions[0], positions[0]]), { status: 400 });
  const source = conversion.orderConversionInput(req, body, positions);
  assert.deepEqual([...source.positionIds], [offer.positions[0].id, null]);
  await conversion.assertOrderConversion(query, req, source, offer.customerId, positions);
  await assert.rejects(conversion.assertOrderConversion(query, req, source, '101', positions), { status: 400 });
  await assert.rejects(conversion.assertOrderConversion(query, req, { ...source, version: '0x0000000000000002' }, '100', positions), { status: 409 });
  await assert.rejects(conversion.assertOrderConversion(query, req, source, '100', [{ articleIndex: 'B' }]), { status: 409 });
  state.positions[0].tagp_order_position_id = 22;
  await assert.rejects(conversion.assertOrderConversion(query, req, source, '100', positions), { status: 409 });
  const removed = await call(`/temp-offers/${offer.id}`, 'DELETE', { version: offer.version });
  assert.equal(removed.status, 409);
  assert.equal(removed.json.code, 'OFFER_POSITIONS_LINKED');
});
test('offer pilot gate and owner/tenant predicates protect list, details and every mutation, even for full-access users', async (t) => {
  const { state, call } = await fixture(t);
  const body = input();
  const created = await call('/temp-offers', 'POST', body);
  assert.equal(created.status, 201);
  const id = created.json.data.id;
  for (const [method, suffix] of [
    ['GET', ''],
    ['PUT', ''],
    ['DELETE', ''],
    ['POST', '/release'],
  ]) {
    const denied = await call(
      `/temp-offers/${id}${suffix}`,
      method,
      method === 'GET'
        ? undefined
        : { ...body, version: created.json.data.version },
      { 'x-test-user': 'OTHER' },
    );
    assert.equal(denied.status, 403);
    const foreign = await call(
      `/temp-offers/${id}${suffix}`,
      method,
      method === 'GET'
        ? undefined
        : { ...body, version: created.json.data.version },
      { 'x-test-company': '3' },
    );
    assert.equal(foreign.status, 404);
  }
  state.headers[0].tag_created_by = 'AKI';
  const mfr = { 'x-test-user': 'MFR' };
  assert.equal((await call(`/temp-offers/${id}`, 'GET', undefined, mfr)).status, 404);
  assert.equal((await call('/temp-offers?ownerScope=all', 'GET', undefined, mfr)).json.meta.total, 0);
  assert.equal((await call('/temp-offers/not-an-id', 'PUT', body)).status, 404);
});
test('AKI can switch between own and all offers in the active mandant', async (t) => {
  const { call } = await fixture(t);
  const mandant = { 'x-test-company': '3' };
  const aki = { ...mandant, 'x-test-user': 'AKI' };
  const body = input();
  const { json } = await call('/temp-offers', 'POST', body, mandant);
  const { id, version } = json.data;
  assert.equal((await call('/temp-offers?ownerScope=all', 'GET', undefined, aki)).json.meta.total, 1);
  assert.equal((await call('/temp-offers?ownerScope=mine', 'GET', undefined, aki)).json.meta.total, 0);
  assert.equal((await call(`/temp-offers/${id}`, 'GET', undefined, aki)).json.data.readOnly, true);
  assert.equal((await call(`/temp-offers/${id}`, 'GET', undefined, { ...aki, 'x-test-company': '2' })).status, 404);
  assert.equal((await call(`/temp-offers/${id}`, 'PUT', { ...body, version }, aki)).status, 404);
});

test('NSC can view an AKI offer and switch back to own offers', async (t) => {
  const { call } = await fixture(t);
  const { json } = await call('/temp-offers', 'POST', input(), { 'x-test-user': 'AKI' });
  const { id } = json.data;
  assert.equal((await call('/temp-offers')).json.meta.total, 1);
  assert.equal((await call('/temp-offers?ownerScope=mine')).json.meta.total, 0);
  const detail = await call(`/temp-offers/${id}`);
  assert.equal(detail.json.data.createdBy, 'AKI');
  assert.equal(detail.json.data.readOnly, true);
});

test('executives can list and manage other authors’ offers within the active mandant', async (t) => {
  const { state, call } = await fixture(t);
  const mandant = { 'x-test-company': '3' };
  const executive = { ...mandant, 'x-test-user': 'OBA' };
  const body = input();
  const created = await call('/temp-offers', 'POST', body, mandant);
  const { id, version } = created.json.data;
  assert.equal((await call('/temp-offers', 'GET', undefined, executive)).json.meta.total, 1);
  assert.equal((await call(`/temp-offers/${id}`, 'GET', undefined, executive)).json.data.createdBy, 'NSC');
  assert.equal((await call(`/temp-offers/${id}`, 'GET', undefined, { ...executive, 'x-test-company': '2' })).status, 404);
  const edited = await call(`/temp-offers/${id}`, 'PUT', { ...body, version }, executive);
  assert.equal(edited.status, 200);
  assert.equal(state.headers[0].tag_created_by, 'NSC');
  assert.ok(state.calls.some(({ sql, params }) => sql.startsWith('UPDATE') && params.at(-2) === 'OBA'));
  assert.equal((await call(`/temp-offers/${id}/release`, 'POST', { version: edited.json.data.version }, executive)).status, 200);
});

test('editing another author’s offer keeps reservation ownership and records the acting user', async () => {
  const calls = [];
  const version = '0x0000000000000001';
  const req = { database: { firmaId: 3, databaseName: 'BMS.FRU' }, offerCustomerId: '100', userIdentity: { shortCode: 'OBA' } };
  const position = {
    reserve: true, lineKey: 'key', beNumber: '03-123', warehouseId: 1,
    articleIndex: 'A', reserveQuantity: 50, reserveUntil: '2099-01-01',
  };
  const query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('sp_getapplock')) return { rows: [{ lockResult: 0 }] };
    if (sql.includes('AS version,bePR_reserviertVon')) return { rows: [{ owner: 'NSC', version }] };
    if (sql.startsWith('DELETE') || sql.includes('SELECT bePR_BEposID') || sql.includes('tap_amount_in_kg')) return { rows: [] };
    if (sql.includes('AS articleIndex')) return { rows: [{ amount: 100, articleIndex: 'A', unit: 'KG' }] };
    if (sql.startsWith('INSERT')) return { rows: [{ version: Buffer.from('0000000000000002', 'hex') }] };
    throw new Error(sql);
  };
  await synchronizeReservations(query, req, 1, [{ ...position, reservationVersion: version }], [position], 'NSC');
  const insert = calls.find(({ sql }) => sql.startsWith('INSERT'));
  assert.equal(insert.params[4], 'NSC');
  assert.match(insert.params.at(-1), /^OBA /);
});

test('saving preserves repeated articles, validates customer, retries without duplicates and rejects stale edits', async (t) => {
  const { state, call } = await fixture(t);
  const body = input();
  let result = await call('/temp-offers', 'POST', body);
  assert.equal(result.status, 201);
  assert.equal(state.positions.length, 2);
  const replay = await call('/temp-offers', 'POST', body);
  assert.equal(replay.json.data.id, result.json.data.id);
  assert.equal(state.headers.length, 1);
  assert.equal(
    (await call('/temp-offers', 'POST', { ...input(), customerId: '999' }))
      .status,
    404,
  );
  const id = result.json.data.id;
  const originalVersion = result.json.data.version;
  result = await call(`/temp-offers/${id}`, 'PUT', {
    ...body,
    version: originalVersion,
    internalNote: 'Geändert',
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.data.internalNote, 'Geändert');
  assert.equal(state.positions.length, 2);
  assert.equal(
    (
      await call(`/temp-offers/${id}`, 'PUT', {
        ...body,
        version: originalVersion,
      })
    ).status,
    409,
  );
  const released = await call(`/temp-offers/${id}/release`, 'POST', {
    version: result.json.data.version,
  });
  assert.equal(released.status, 200);
  assert.equal(released.json.data.status, 1);
  assert.equal(
    (
      await call(`/temp-offers/${id}`, 'DELETE', {
        version: released.json.data.version,
      })
    ).status,
    409,
  );
});

test('offer reservation conflicts never overwrite another reservation or claim a mismatched article', async () => {
  const req = {
    database: { firmaId: 0, databaseName: 'BMS.TES' },
    userIdentity: { shortCode: 'NSC' },
    offerCustomerId: '100',
  };
  const p = {
    reserve: true,
    lineKey: crypto.randomUUID(),
    beNumber: '0-02-26-00001-01',
    warehouseId: 'L',
    articleIndex: 'A',
    reserveQuantity: 100,
    reserveUntil: '2099-01-01',
  };
  const calls = [];
  const q = async (sql, params) => {
    calls.push(sql);
    if (sql.includes('sp_getapplock')) return { rows: [{ lockResult: 0 }] };
    if (sql.includes('SELECT bePR_BEposID'))
      return { rows: [{ bePR_BEposID: p.beNumber }] };
    throw Error(sql);
  };
  await assert.rejects(synchronizeReservations(q, req, 1, [], [p]), {
    status: 409,
  });
  assert.equal(
    calls.some((s) => s.startsWith('INSERT') || s.startsWith('DELETE')),
    false,
  );
  const changed = async (sql) =>
    sql.includes('sp_getapplock')
      ? { rows: [{ lockResult: 0 }] }
      : { rows: [{ version: '0x0000000000000002', owner: 'NSC' }] };
  await assert.rejects(
    synchronizeReservations(
      changed,
      req,
      1,
      [{ ...p, reservationVersion: '0x0000000000000001' }],
      [],
    ),
    { status: 409 },
  );
  const sourceMismatch = async (sql) => {
    if (sql.includes('sp_getapplock')) return { rows: [{ lockResult: 0 }] };
    if (sql.includes('SELECT bePR_BEposID')) return { rows: [] };
    if (sql.includes('AS articleIndex'))
      return { rows: [{ amount: 1000, articleIndex: 'B', unit: 'KG' }] };
    throw Error(sql);
  };
  await assert.rejects(
    synchronizeReservations(sourceMismatch, req, 1, [], [p]),
    { status: 400 },
  );
  const plannedStock = async (sql) => {
    if (sql.includes('sp_getapplock')) return { rows: [{ lockResult: 0 }] };
    if (sql.includes('SELECT bePR_BEposID')) return { rows: [] };
    if (sql.includes('AS articleIndex'))
      return { rows: [{ amount: 100, articleIndex: 'A', unit: 'KG' }] };
    if (sql.includes('tap_amount_in_kg')) return { rows: [{ amountInKg: 40 }] };
    throw Error(sql);
  };
  await assert.rejects(
    synchronizeReservations(
      plannedStock,
      req,
      1,
      [],
      [{ ...p, reserveQuantity: 61 }],
    ),
    { status: 409 },
  );
});
