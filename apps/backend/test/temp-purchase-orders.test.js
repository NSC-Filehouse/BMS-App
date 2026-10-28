const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function fixture() {
  const routes = [];
  const headers = [];
  const lines = [];
  const calls = [];
  const timeline = [];
  let failRead = false;
  const router = { use() {}, get(path, ...handlers) { routes.push({ method: 'get', path, handlers }); }, post(path, ...handlers) { routes.push({ method: 'post', path, handlers }); }, put(path, ...handlers) { routes.push({ method: 'put', path, handlers }); }, delete() {} };
  const project = (sql, row) => Object.fromEntries([...sql.matchAll(/\[(tbp?_\w+)\] AS (?:\[([^\]]+)\]|(\w+))/g)].map((match) => [match[2] || match[3], row[match[1]]]));
  const query = async (sql, params = []) => {
    assert.equal((sql.match(/\?/g) || []).length, params.length, `SQL parameter count: ${sql}`);
    calls.push({ sql, params });
    if (sql.includes('FROM timeline')) return { rows: [] };
    if (sql.startsWith('UPDATE orders')) {
      const row = headers.find((p) => p.tb_id === params.at(-2));
      let index = 0;
      for (const match of sql.split('SET ')[1].split('WHERE')[0].matchAll(/\[(\w+)\]\s*=\s*(\?|NULL|\d+)/g)) row[match[1]] = match[2] === '?' ? params[index++] : match[2] === 'NULL' ? null : Number(match[2]);
      return { rows: [] };
    }
    if (sql.startsWith('DELETE FROM positions')) { lines.splice(0, lines.length, ...lines.filter((p) => p.tbp_tb_id !== params[0])); return { rows: [] }; }
    if (sql.includes('INSERT INTO')) {
      const columns = sql.slice(sql.indexOf('(') + 1, sql.indexOf(')')).match(/\w+/g);
      const tokens = sql.match(/VALUES\s*\(([^)]+)\)/)[1].split(',').map((v) => v.trim());
      assert.equal(columns.length, tokens.length);
      let i = 0;
      const row = Object.fromEntries(columns.map((column, index) => [column, tokens[index] === '?' ? params[i++] : Number(tokens[index])]));
      if (sql.includes('INSERT INTO orders')) { row.tb_id = headers.length + 1; headers.push(row); return { rows: [{ id: row.tb_id }] }; }
      row.tbp_id = lines.length + 1; lines.push(row); return { rows: [] };
    }
    if (sql.includes('FROM positions')) {
      if (failRead) throw new Error('Simulated read error');
      return { rows: lines.filter((p) => p.tbp_tb_id === params[0]).map((p) => project(sql, p)) };
    }
    if (sql.includes('FROM orders')) {
      const rows = sql.includes('[tb_client_request_id]=?')
        ? headers.filter((p) => p.tb_company_id === params[0] && p.tb_client_request_id === params[1])
        : headers.filter((p) => p.tb_id === params[0]);
      return { rows: rows.map((p) => project(sql, p)) };
    }
    throw new Error(`Unexpected SQL ${sql}`);
  };
  const values = {
    loadPurchaseOptions: async () => ({ packagingTypes: [{ id: 79, text: 'Siloware', aliases: ['Siloware'] }], incoterms: [{ id: 1, text: 'FCA' }] }),
    loadSupplierTerms: async () => ({ paymentConditionId: 17, paymentConditionText: '30 Tage' }),
    loadLatestPurchase: async (_db, _supplier, article) => article === 'A' ? { article: 'Neuester Name', originalPackagingType: 'Sackware' } : null,
    loadPurchaseLocations: async () => [{ id: 'Hamburg', text: 'Hamburg' }],
    findPackaging: (options, value, id) => options.find((p) => p.id === Number(id) || p.text === value),
    packagingKey: (value) => value,
  };
  const dependencies = {
    crypto: require('node:crypto'), express: { Router: () => router }, '../config': { sql: { database: 'mock' } }, '../logger': {}, '../utils': require('../src/utils'),
    '../middlewares/mandant.middleware': { requireMandant() {} }, '../middlewares/pilot-feature.middleware': { requirePilotFeature: () => () => {} },
    '../db/access': {
      runSQLQueryAccess: async () => [{ ok: 1 }], runSQLQuerySqlServer: async (_database, sql, params) => (await query(sql, params)).rows,
      withSqlTransaction: async (_db, work) => {
        const beforeHeaders = headers.length; const beforeLines = lines.length;
        try { return await work({ query }); } catch (error) { headers.splice(beforeHeaders); lines.splice(beforeLines); throw error; }
      },
    },
    '../db/app-tables': { appTableSql: (name) => name === 'tempPurchaseOrder' ? 'orders' : name === 'tempPurchaseOrderPosition' ? 'positions' : name },
    '../db/customer-access': { getCustomerAccessScope: async () => ({ isFullAccess: true }), loadVisibleCustomer: async () => ({ kd_Name1: 'Lieferant' }) },
    '../db/purchase-order-values': values, '../db/holidays': {}, '../delivery-calendar': require('../src/delivery-calendar'),
    '../db/purchase-order-mail-outbox': { queuePurchaseOrderCsMail: async () => ({ queued: true }) },
    '../mail/order-mail': { validateOrderMailConfig: () => ({ ok: true }), resolveOrderMailRecipient: () => ({ ok: true }) },
    '../db/timeline': { appendTimelineEntries: async (entries) => timeline.push(...entries) },
  };
  const mod = { exports: {} };
  new Function('require', 'module', fs.readFileSync(path.join(__dirname, '../src/routes/temp-purchase-orders.routes.js'), 'utf8'))((name) => {
    assert.ok(name in dependencies, name); return dependencies[name];
  }, mod);
  const request = (body, method = 'post', route = '/temp-purchase-orders') => new Promise((resolve, reject) => {
    const req = { body, params: { id: '1' }, header: () => 'de', database: { firmaId: 1 }, userIdentity: { shortCode: 'AD' }, mandant: 'Test' };
    const res = { status(status) { this.statusCode = status; return this; }, json(payload) { resolve({ status: this.statusCode, ...payload }); } };
    routes.find((r) => r.path === route && r.method === method).handlers.at(-1)(req, res, reject);
  });
  return { request, headers, lines, calls, timeline, normalizePositions: mod.exports.normalizePositions, failRead: () => { failRead = true; } };
}

const body = () => ({ supplierId: '42', clientRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', packagingTypeId: 79, deliveryTermId: 1, paymentConditionText: 'Manipuliert', paymentConditionId: 999,
  loadingLocationText: 'Hamburg', positions: [{ articleIndex: 'A', article: 'Alter Name', amount: 25000, purchasePrice: 900, requestedDeliveryDate: '2026-11-05', sourceBestellindex: 'ALTE-BE' }] });

test('create returns a valid mapped order after all reads; copies survive without historical BE references', async () => {
  const f = fixture();
  const input = body(); input.positions.push({ ...input.positions[0], amount: 24750 });
  const response = await f.request(input);
  assert.equal(response.status, 201);
  assert.equal(response.data.id, 1);
  assert.equal(response.data.supplierName, 'Lieferant');
  assert.equal(response.data.positions.length, 2);
  assert.equal(response.data.paymentConditionId, 17);
  assert.equal(response.data.paymentConditionText, '30 Tage');
  assert.equal(response.data.positions[0].article, 'Neuester Name');
  assert.equal(response.data.positions[0].originalPackagingType, 'Sackware');
  assert.equal(response.data.positions[0].packagingTypeChanged, true);
  assert.equal(response.data.positions[0].sourceBestellindex, undefined);
  assert.equal(f.calls.some((call) => call.sql.includes('INSERT') && call.sql.includes('tbp_source_')), false);
});

test('retrying a committed request returns the same ID without another insert', async () => {
  const f = fixture();
  await f.request(body());
  const retry = await f.request(body());
  assert.equal(retry.data.id, 1);
  assert.equal(retry.meta.alreadyCreated, true);
  assert.equal(f.headers.length, 1);
  assert.equal(f.lines.length, 1);
});

test('a response read failure rolls back instead of leaving an apparently failed saved order', async () => {
  const f = fixture(); f.failRead();
  await assert.rejects(f.request(body()), /Simulated read error/);
  assert.equal(f.headers.length, 0);
  assert.equal(f.lines.length, 0);
});

test('blank EK is rejected rather than silently stored as zero', () => {
  const f = fixture(); const input = body().positions;
  input[0].purchasePrice = '';
  assert.throws(() => f.normalizePositions(input), /unvollständig/);
  input[0].purchasePrice = 0;
  assert.equal(f.normalizePositions(input)[0].purchasePrice, 0);
  input[0].amount = 25; input[0].unit = 't';
  assert.equal(f.normalizePositions(input)[0].amount, 25000);
});

test('allows copies of one article but rejects mixing article types in every purchase payload', () => {
  const f = fixture();
  const line = body().positions[0];
  assert.equal(f.normalizePositions([line, { ...line, amount: 10000 }]).length, 2);
  assert.throws(() => f.normalizePositions([line, { ...line, articleIndex: 'B' }]), (error) => error.details.code === 'PURCHASE_SINGLE_ARTICLE_REQUIRED');
});

test('edit keeps saved payment terms and authoritative packaging snapshots for an independent copy', async () => {
  const f = fixture();
  const created = (await f.request(body())).data;
  const original = created.positions[0];
  const copied = { ...original, id: undefined, copyOfPositionId: original.id, originalPackagingType: 'Manipuliert', amount: 10000 };
  const result = await f.request({ ...created, paymentConditionId: 999, paymentConditionText: 'Manipuliert', positions: [original, copied] }, 'put', '/temp-purchase-orders/:id');
  assert.equal(result.data.positions.length, 2);
  assert.equal(result.data.positions[1].amount, 10000);
  assert.equal(result.data.positions[1].originalPackagingType, 'Sackware');
  assert.equal(result.data.paymentConditionId, 17);
  assert.equal(result.data.paymentConditionText, '30 Tage');
});

test('finalize locks the saved order and publishes current purchase identity, never the previous BE', async () => {
  const f = fixture();
  await f.request(body());
  const result = await f.request({}, 'post', '/temp-purchase-orders/:id/finalize');
  assert.equal(result.data.status, 1);
  assert.equal(result.data.csMail.queued, true);
  assert.equal(f.timeline.length, 1);
  assert.equal(f.timeline[0].referenceId, '1');
  assert.equal(f.timeline[0].beNumber, '');
  assert.equal(f.timeline[0].payloadJson.sourceBestellindex, undefined);
  await f.request({}, 'post', '/temp-purchase-orders/:id/finalize');
  assert.equal(f.timeline.length, 1);
  await assert.rejects(f.request(body(), 'put', '/temp-purchase-orders/:id'), /nicht mehr bearbeitbar/);
});

test('rejects a location outside the supplier/article selection before creating anything', async () => {
  const f = fixture();
  await assert.rejects(f.request({ ...body(), loadingLocationText: 'Fremder Ort' }), /gemeinsamen Ladeort/);
  assert.equal(f.headers.length, 0);
});
