const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
const express = require('express');
const { normalize, totals } = require('../src/offers/values');
const { headerFields, positionFields } = require('../src/offers/storage');
const crypto = require('node:crypto');

const input = () => ({
  customerId: '100',
  offerDate: '2026-11-10',
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
  assert.equal(n.header.netAmount, 45595);
  assert.equal(n.header.totalAmount, 54258.05);
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
  assert.equal(
    normalize({ ...input(), discountPercent: 100 }).header.totalAmount,
    0,
  );
});
test('invalid units, dates, quantities, prices, discount and reservation amounts cannot enter SQL', () => {
  for (const change of [
    { offerDate: '2026-02-30' },
    { discountPercent: 101 },
    { vatPercent: -1 },
    { positions: [] },
    { customerId: '' },
  ])
    assert.throws(() => normalize({ ...input(), ...change }), { status: 400 });
  for (const change of [
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
  const state = { headers: [], positions: [], calls: [], transactionCount: 0 };
  let nextId = 1;
  function project(row, fields) {
    return Object.fromEntries(
      Object.entries(fields).map(([key, col]) => [key, row[col]]),
    );
  }
  const query = async (sql, params = []) => {
    assert.equal((sql.match(/\?/g) || []).length, params.length, sql);
    state.calls.push({ sql, params });
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
                h.tag_created_by === params[1],
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
      const headers = state.headers.filter((h) =>
        list
          ? h.tag_company_id === params[0] && h.tag_created_by === params[1]
          : h.tag_id === params[0] &&
            h.tag_company_id === params[1] &&
            h.tag_created_by === params[2],
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
              : {
                  shortCode: who,
                  personNumber: 999,
                  userId: 'other',
                  active: true,
                };
          next();
        },
      },
      '../db/access': {
        runSQLQuerySqlServer: async (db, sql, params) =>
          (await query(sql, params)).rows,
        runSQLQueryAccess: async (_db, sql) =>
          sql.includes('agA_Artikelindex AS')
            ? [{ articleIndex: 'A', article: 'Artikel Ä' }]
            : sql.includes('SELECT agA_Artikelindex')
              ? [{ agA_Artikelindex: 'A' }]
              : [],
        withSqlTransaction: async (_db, work) => {
          state.transactionCount++;
          const before = structuredClone({
            headers: state.headers,
            positions: state.positions,
          });
          try {
            return await work({ query });
          } catch (e) {
            state.headers = before.headers;
            state.positions = before.positions;
            throw e;
          }
        },
      },
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
    return { status: res.status, json: await res.json() };
  }
  return { state, call };
}
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
  assert.equal((await call(`/temp-offers/${id}`)).status, 404);
  assert.equal((await call('/temp-offers')).json.meta.total, 0);
  assert.equal((await call('/temp-offers/not-an-id', 'PUT', body)).status, 404);
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
    title: 'Geändert',
  });
  assert.equal(result.status, 200);
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
  const { synchronizeReservations } = require('../src/offers/reservations');
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
