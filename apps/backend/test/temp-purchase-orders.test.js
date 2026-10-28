const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function fixture(options = {}) {
  const routes = [];
  const headers = [];
  const lines = [];
  const calls = [];
  const timeline = [];
  const mails = [];
  const csMails = [];
  let failDelete = false;
  let failRead = false;
  const router = { use() {}, get(path, ...handlers) { routes.push({ method: 'get', path, handlers }); }, post(path, ...handlers) { routes.push({ method: 'post', path, handlers }); }, put(path, ...handlers) { routes.push({ method: 'put', path, handlers }); }, delete(path, ...handlers) { routes.push({ method: 'delete', path, handlers }); } };
  const project = (sql, row) => Object.fromEntries([...sql.matchAll(/\[(tbp?_\w+)\] AS (?:\[([^\]]+)\]|(\w+))/g)].map((match) => [match[2] || match[3], row[match[1]]]));
  const query = async (sql, params = []) => {
    assert.equal((sql.match(/\?/g) || []).length, params.length, `SQL parameter count: ${sql}`);
    calls.push({ sql, params });
    assert.doesNotMatch(sql, /\bAND\s+AND\b/i, 'composed list predicates must be valid SQL');
    if (sql.includes('COUNT(*) AS total FROM orders')) return { rows: [{ total: 0 }] };
    if (sql.includes('OFFSET ? ROWS')) return { rows: [] };
    if (sql.includes('FROM timeline')) return { rows: [] };
    if (sql.startsWith('IF OBJECT_ID')) {
      const outbox = sql.includes('purchaseOrderCsMailOutbox') ? csMails : mails;
      outbox.splice(0, outbox.length, ...outbox.filter((id) => id !== params[1]));
      return { rows: [] };
    }
    if (sql.startsWith('DELETE FROM orders')) {
      assert.equal(lines.filter((p) => p.tbp_tb_id === params[0]).length, 0, 'positions before parent');
      assert.equal(mails.includes(params[0]) || csMails.includes(params[0]), false, 'outboxes before parent');
      if (failDelete) throw new Error('Simulated delete constraint error');
      headers.splice(0, headers.length, ...headers.filter((p) => !(p.tb_id === params[0] && p.tb_company_id === params[1])));
      return { rows: [] };
    }
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
      return { rows: rows.filter((p) => !/AND \[tb_company_id\]\s*=/.test(sql) || p.tb_company_id === params[1]).filter((p) => !/AND \[tb_created_by\]\s*=/.test(sql) || p.tb_created_by === params[2]).map((p) => project(sql, p)) };
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
        const arrays = [headers, lines, mails, csMails];
        const before = structuredClone(arrays);
        try { return await work({ query }); } catch (error) { arrays.forEach((items, index) => items.splice(0, items.length, ...before[index])); throw error; }
      },
    },
    '../db/app-tables': { appTableSql: (name) => name === 'tempPurchaseOrder' ? 'orders' : name === 'tempPurchaseOrderPosition' ? 'positions' : name },
    '../db/customer-access': { getCustomerAccessScope: async () => ({ isFullAccess: options.fullAccess !== false }), loadVisibleCustomer: async () => ({ kd_Name1: 'Lieferant' }) },
    '../db/purchase-order-values': values, '../db/holidays': {}, '../delivery-calendar': require('../src/delivery-calendar'),
    '../db/purchase-order-mail-outbox': { queuePurchaseOrderCsMail: async () => ({ queued: true }) },
    '../mail/order-mail': { validateOrderMailConfig: () => ({ ok: true }), resolveOrderMailRecipient: () => ({ ok: true }) },
    '../db/timeline': { appendTimelineEntries: async (entries) => timeline.push(...entries) },
  };
  const mod = { exports: {} };
  new Function('require', 'module', fs.readFileSync(path.join(__dirname, '../src/routes/temp-purchase-orders.routes.js'), 'utf8'))((name) => {
    assert.ok(name in dependencies, name); return dependencies[name];
  }, mod);
  const request = (body, method = 'post', route = '/temp-purchase-orders', context = {}) => new Promise((resolve, reject) => {
    const req = { body, query: context.query || {}, params: { id: '1' }, header: () => 'de', database: { firmaId: context.companyId ?? 1 }, userIdentity: { shortCode: context.user || 'AD' }, mandant: 'Test' };
    const res = { status(status) { this.statusCode = status; return this; }, json(payload) { resolve({ status: this.statusCode, ...payload }); }, end() { resolve({ status: this.statusCode }); } };
    routes.find((r) => r.path === route && r.method === method).handlers.at(-1)(req, res, reject);
  });
  return { request, headers, lines, calls, timeline, mails, csMails, failDelete: () => { failDelete = true; }, buildCreatedPeriodFilter: mod.exports.buildPurchaseCreatedPeriodFilter, normalizePositions: mod.exports.normalizePositions, failRead: () => { failRead = true; } };
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


test('DELETE removes the whole draft and both outboxes in one locked transaction and can be retried', async () => {
  const f = fixture(); const input = body(); input.positions.push({ ...input.positions[0] });
  await f.request(input); f.mails.push(1); f.csMails.push(1);
  const result = await f.request({}, 'delete', '/temp-purchase-orders/:id');
  assert.equal(result.status, 204);
  assert.equal(f.headers.length + f.lines.length + f.mails.length + f.csMails.length, 0);
  assert.ok(f.calls.some((call) => call.sql.includes('UPDLOCK,HOLDLOCK')));
  assert.equal((await f.request({}, 'delete', '/temp-purchase-orders/:id')).status, 204);
});

test('saving removal of the last position deletes the entire order without requiring new form values', async () => {
  const f = fixture(); await f.request(body());
  const result = await f.request({ positions: [] }, 'put', '/temp-purchase-orders/:id');
  assert.deepEqual(result.data, { id: 1, deleted: true });
  assert.equal(f.headers.length + f.lines.length, 0);
});

test('deletion keeps tenant and owner boundaries and never deletes sent or accepted orders', async () => {
  const f = fixture({ fullAccess: false }); await f.request(body());
  await f.request({}, 'delete', '/temp-purchase-orders/:id', { companyId: 2 });
  await f.request({}, 'delete', '/temp-purchase-orders/:id', { user: 'OTHER' });
  assert.equal(f.headers.length, 1); assert.equal(f.lines.length, 1);
  for (const status of [1, 2]) {
    f.headers[0].tb_status = status;
    await assert.rejects(f.request({}, 'delete', '/temp-purchase-orders/:id'), (error) => error.status === 409);
    assert.equal(f.headers.length, 1); assert.equal(f.lines.length, 1);
  }
  f.headers[0].tb_status = 3;
  assert.equal((await f.request({}, 'delete', '/temp-purchase-orders/:id')).status, 204);
});

test('a deletion constraint error restores the header, positions and outboxes', async () => {
  const f = fixture(); await f.request(body()); f.mails.push(1); f.csMails.push(1); f.failDelete();
  await assert.rejects(f.request({}, 'delete', '/temp-purchase-orders/:id'), /delete constraint/);
  assert.equal(f.headers.length, 1); assert.equal(f.lines.length, 1);
  assert.deepEqual(f.mails, [1]); assert.deepEqual(f.csMails, [1]);
});

test('purchase creation period filters mirror today and Monday-based week filters from orders', () => {
  const f = fixture();
  assert.match(f.buildCreatedPeriodFilter('today').whereSql, /tb_create_date.*CONVERT\(date, GETDATE\(\)\)/);
  assert.match(f.buildCreatedPeriodFilter('week').whereSql, /19000101/);
  assert.equal(f.buildCreatedPeriodFilter('other').whereSql, '');
});


test('list count and page compose status, own scope and period without duplicate AND clauses', async () => {
  const f = fixture();
  const response = await f.request({}, 'get', '/temp-purchase-orders', { query: { status: 'draft', ownerScope: 'mine', createdPeriod: 'week', q: 'PP' } });
  assert.equal(response.meta.createdPeriod, 'week');
  assert.equal(response.meta.ownerScope, 'mine');
  const queries = f.calls.filter((call) => call.sql.includes('COUNT(*)') || call.sql.includes('OFFSET ? ROWS'));
  assert.equal(queries.length, 2);
  for (const { sql, params } of queries) {
    assert.match(sql, /AND LOWER\(COALESCE\(\[tb_created_by\], ''\)\) = \?/);
    assert.match(sql, /AND COALESCE\(\[tb_status\], 0\) = 0/);
    assert.match(sql, /19000101/);
    assert.deepEqual(params.slice(0, 2), [1, 'ad']);
  }
});
