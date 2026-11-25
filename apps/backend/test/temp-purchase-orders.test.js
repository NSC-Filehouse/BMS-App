const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument } = require('pdf-lib');

function fixture(options = {}) {
  const routes = [];
  const headers = [];
  const lines = [];
  const calls = [];
  const timeline = [];
  const mails = [];
  const csMails = [];
  const attachments = [];
  let failDelete = false;
  let failRead = false;
  let failAttachmentRead = false;
  const router = options.routing ? require('express').Router() : { use() {}, get(path, ...handlers) { routes.push({ method: 'get', path, handlers }); }, post(path, ...handlers) { routes.push({ method: 'post', path, handlers }); }, put(path, ...handlers) { routes.push({ method: 'put', path, handlers }); }, delete(path, ...handlers) { routes.push({ method: 'delete', path, handlers }); } };
  const project = (sql, row) => Object.fromEntries([...sql.matchAll(/\[(tbp?_\w+|tba_\w+|OptionID|OptionPositionID)\] AS (?:\[([^\]]+)\]|(\w+))/g)].map((match) => [match[2] || match[3], row[match[1]]]));
  const query = async (sql, params = []) => {
    assert.equal((sql.match(/\?/g) || []).length, params.length, `SQL parameter count: ${sql}`);
    calls.push({ sql, params });
    assert.doesNotMatch(sql, /\bAND\s+AND\b/i, 'composed list predicates must be valid SQL');
    if (sql.includes('COL_LENGTH')) {
      return { rows: [{ optionSnapshotLength: options.optionSnapshotSupported === false ? null : -1 }] };
    }
    if (sql.includes('INSERT INTO tempPurchaseOrderAttachment')) {
      const [orderId, fileName, mimeType, buffer, sizeBytes, user, now, snapshot] = params;
      attachments.push({ tba_ID: attachments.length + 1, tba_tb_id: orderId, tba_FileName: fileName, tba_MimeType: mimeType, tba_Content: buffer, tba_SizeBytes: sizeBytes, tba_CreatedBy: user, tba_CreatedAt: now, tba_OptionSnapshot: snapshot });
      return { rows: [] };
    }
    if (sql.includes('UPDATE tempPurchaseOrderAttachment')) {
      const row = attachments.find((a) => a.tba_tb_id === params.at(-2) && a.tba_ID === params.at(-1) && !a.tba_DeletedAt);
      if (sql.includes('SET [tba_Content]')) {
        [row.tba_Content, row.tba_SizeBytes, row.tba_OptionSnapshot] = params;
        return { rows: [] };
      }
      if (row?.tba_OptionSnapshot && sql.includes('[tba_OptionSnapshot] IS NULL')) return { rows: [] };
      if (row) { row.tba_DeletedAt = params[0]; row.tba_DeletedBy = params[1]; }
      return { rows: row ? [{ id: row.tba_ID }] : [] };
    }
    if (sql.includes('FROM tempPurchaseOrderAttachment')) {
      if (failAttachmentRead) throw new Error('Simulated attachment read error');
      const rows = attachments.filter((a) => a.tba_tb_id === params[0] && !a.tba_DeletedAt && (params.length === 1 || a.tba_ID === params[1]));
      if (sql.includes('AS snapshotJson')) {
        return { rows: rows.filter((a) => a.tba_OptionSnapshot).map((a) => project(sql, a)) };
      }
      if (sql.includes('ORDER BY CASE')) rows.sort((a, b) => Number(Boolean(b.tba_OptionSnapshot)) - Number(Boolean(a.tba_OptionSnapshot)) || a.tba_ID - b.tba_ID);
      return { rows: rows.map((a) => ({ ...project(sql, a), isOptionPdf: sql.includes('AS isOptionPdf') && Boolean(a.tba_OptionSnapshot) })) };
    }
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
      attachments.splice(0, attachments.length, ...attachments.filter((a) => a.tba_tb_id !== params[0]));
      return { rows: [] };
    }
    if (sql.startsWith('UPDATE orders')) {
      const row = headers.find((p) => p.tb_id === params.at(-2));
      let index = 0;
      for (const match of sql.split('SET ')[1].split('WHERE')[0].matchAll(/\[(\w+)\]\s*=\s*(\?|NULL|\d+)/g)) row[match[1]] = match[2] === '?' ? params[index++] : match[2] === 'NULL' ? null : Number(match[2]);
      return { rows: [] };
    }
    if (sql.startsWith('UPDATE positions')) { const row=lines.find(p=>p.tbp_id===params[3] && p.tbp_tb_id===params[4]); row.tbp_article=params[0]; return { rows: [] }; }
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
    loadPurchaseOptions: async () => ({ packagingTypes: [{ id: 79, text: 'Siloware', aliases: ['Siloware'] }],
      incoterms: [{ id: 1, text: 'FCA' }, { id: 2, text: 'DAP' }] }),
    loadSupplierTerms: async () => options.supplierTerms || ({ paymentConditionId: 17, paymentConditionText: '30 Tage' }),
    loadPurchaseWarehouses: async (_database, id) => [
      { id: 'LG0001', isDirect: false, owners: [{ id: '43', name: 'Lagerkunde' }] },
      { id: 'LG0000', isDirect: true, owners: [] },
    ].filter(warehouse => !id || warehouse.id === id),
    loadPurchasePaymentText: async (id) => ({ 17: '30 Tage', 19: '14 Tage netto' })[id] || '',
    loadLatestPurchase: async (_db, _supplier, article) => article === 'A' ? { article: 'Neuester Name', originalPackagingType: 'Sackware' } : null,
    enrichPurchaseArticleNames: async (_db, _supplier, positions) => positions.map(p => ({ ...p, article: p.article === 'Unsere Bezeichnung' ? 'Neuester Name' : p.article, masterArticleName: 'Unsere Bezeichnung' })),
    loadPurchaseLocations: async () => options.locations || [{ id: 'Hamburg', text: 'Hamburg' }],
    findPackaging: (options, value, id) => options.find((p) => p.id === Number(id) || p.text === value),
    packagingKey: (value) => value,
  };
  const dependencies = {
    crypto: require('node:crypto'), express: { Router: () => router }, '../config': { sql: { database: 'mock' } }, '../logger': {}, '../utils': require('../src/utils'),
    '../middlewares/mandant.middleware': { requireMandant(req, res, next) { next(); } },
    '../middlewares/pilot-feature.middleware': options.routing ? require('../src/middlewares/pilot-feature.middleware') : { requirePilotFeature: () => () => {} },
    '../db/access': {
      runSQLQueryAccess: async (_database, sql) => sql.includes('tblArt_Artikel')
        ? (options.inactiveArticle ? [] : [{ article: 'Stammartikel' }]) : [{ ok: 1 }],
      runSQLQuerySqlServer: async (_database, sql, params) => (await query(sql, params)).rows,
      withSqlTransaction: async (_db, work) => {
        const arrays = [headers, lines, mails, csMails, attachments];
        const before = structuredClone(arrays);
        try { return await work({ query }); } catch (error) { arrays.forEach((items, index) => items.splice(0, items.length, ...before[index])); throw error; }
      },
    },
    '../db/app-tables': { appTableSql: (name) => name === 'tempPurchaseOrder' ? 'orders' : name === 'tempPurchaseOrderPosition' ? 'positions' : name },
    '../db/customer-access': { getCustomerAccessScope: async () => ({ isFullAccess: options.fullAccess !== false }), loadVisibleCustomer: async () => options.supplier || ({ kd_Name1: 'Lieferant' }) },
    '../db/purchase-order-values': values, '../db/holidays': {}, '../delivery-calendar': require('../src/delivery-calendar'),
    '../db/delivery-addresses': { loadCustomerDeliveryAddresses: async (_database, id) => ({
      42: [{ id: '11', text: 'Hamburg' }, { id: '12', text: 'Werk B' }],
      43: [{ id: '13', text: 'Lageradresse' }],
      44: [{ id: '14', text: 'Kundenadresse' }],
    }[id] || []) },
    '../db/purchase-order-mail-outbox': { queuePurchaseOrderCsMail: options.queueCsMail || (async () => ({ queued: true })) },
    '../mail/order-mail': { validateOrderMailConfig: () => ({ ok: true }), resolveOrderMailRecipient: () => ({ ok: true }) },
    '../db/timeline': { appendTimelineEntries: async (entries) => timeline.push(...entries) },
    '../options/purchase-source': {
      loadOptionPosition: async (optionId,positionId)=>({opp_id:positionId,opp_op_id:optionId,opp_Artikelname_Lieferant:'Optionsmaterial',
        opp_Verpackung:'Sackware', opp_MengeBisKg:49500, opp_PreisProTonne:options.optionPrice ?? 950,
        externalOfferNo:'MP-2026-1198', validUntil:'2026-12-31'}),
      validateOptionArticle: async ()=>({articleName:'Optionsartikel'}),
      validateOptionSupplier: async (_database,_source,supplierId)=>{if(options.optionSupplierId && supplierId!==options.optionSupplierId)throw new Error('Optionslieferant stimmt nicht überein');},
      assertOptionQuantities: async (_query, positions) => {
        const optionLines = positions.filter((position) => position.optionId != null);
        if (options.optionQuantityLimit != null && optionLines.reduce((sum, position) => sum + position.amount, 0) > options.optionQuantityLimit) {
          throw new Error('Optionsmenge überschritten');
        }
        const sources = new Map();
        for (const position of optionLines) {
          sources.set(position.optionPositionId, await dependencies['../options/purchase-source'].loadOptionPosition(position.optionId, position.optionPositionId));
        }
        return sources;
      },
    },
  };
  dependencies['../pilot-features'] = require('../src/pilot-features');
  dependencies['../db/linked-procurement'] = {
    procurementSchemaReady: async () => Boolean(options.procurementEnabled),
    assertProcurementAccess: require('../src/db/linked-procurement').assertProcurementAccess,
    loadPurchaseOrderLinks: async (id, companyId) => {
      assert.equal(id, 1);
      assert.equal(companyId, 0);
      return [22];
    },
  };
  const attachmentModule = { exports: {} };
  const optionPdf = require('../src/options/purchase-order-pdf');
  const attachmentDependencies = {
    multer: require('multer'), '../config': dependencies['../config'], '../utils': dependencies['../utils'],
    './app-tables': dependencies['../db/app-tables'], './access': dependencies['../db/access'],
    '../logger': { error() {} },
    '../options/purchase-order-pdf': {
      ...optionPdf,
      renderPurchaseOptionPdf: (...args) => {
        if (options.failOptionPdf) throw new Error('Simulated PDF failure');
        return optionPdf.renderPurchaseOptionPdf(...args);
      },
    },
  };
  new Function('require', 'module', fs.readFileSync(path.join(__dirname, '../src/db/purchase-order-attachments.js'), 'utf8'))((name) => {
    assert.ok(name in attachmentDependencies, name); return attachmentDependencies[name];
  }, attachmentModule);
  dependencies['../db/purchase-order-attachments'] = attachmentModule.exports;
  const mod = { exports: {} };
  new Function('require', 'module', fs.readFileSync(path.join(__dirname, '../src/routes/temp-purchase-orders.routes.js'), 'utf8'))((name) => {
    assert.ok(name in dependencies, name); return dependencies[name];
  }, mod);
  const request = (body, method = 'post', route = '/temp-purchase-orders', context = {}) => new Promise((resolve, reject) => {
    const req = { body, files: context.files || [], query: context.query || {}, params: { id: '1', ...context.params }, header: () => 'de', database: { firmaId: context.companyId ?? 1 }, userIdentity: context.userIdentity || { shortCode: context.user || 'AD' }, mandant: 'Test' };
    const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, send(buffer) { resolve({ buffer, headers: this.headers }); }, status(status) { this.statusCode = status; return this; }, json(payload) { resolve({ status: this.statusCode, ...payload }); }, end() { resolve({ status: this.statusCode }); } };
    routes.find((r) => r.path === route && r.method === method).handlers.at(-1)(req, res, reject);
  });
  return { router, request, headers, lines, calls, timeline, mails, csMails, attachments, attachmentModule: attachmentModule.exports, failAttachmentRead: () => { failAttachmentRead = true; }, failDelete: () => { failDelete = true; }, buildCreatedPeriodFilter: mod.exports.buildPurchaseCreatedPeriodFilter, normalizePositions: mod.exports.normalizePositions, failRead: () => { failRead = true; } };
}

function routedRequest(router, method, url, userIdentity) {
  return new Promise((resolve, reject) => {
    const req = { method, url, userIdentity, query: { supplierId: '42' }, params: {},
      database: { firmaId: 1 }, header: () => 'de' };
    const res = { status() { return this; }, json: resolve };
    router.handle(req, res, (error) => error ? reject(error) : resolve({ next: true }));
  });
}

const ordinaryUser = { shortCode: 'AD', active: true };

test('ordinary users reach the delivery calendar and other routes mounted after purchases', async () => {
  const { router } = fixture({ routing: true });
  const calendarModule = { exports: {} };
  const dependencies = {
    express: require('express'), '../utils': require('../src/utils'),
    '../middlewares/mandant.middleware': { requireMandant(req, res, next) { next(); } },
    '../db/delivery-addresses': {}, '../db/holidays': {}, '../logger': {},
    '../delivery-calendar': require('../src/delivery-calendar'),
  };
  new Function('require', 'module', fs.readFileSync(path.join(__dirname, '../src/routes/delivery-calendar.routes.js'), 'utf8'))((name) => {
    assert.ok(name in dependencies, name); return dependencies[name];
  }, calendarModule);
  const api = require('express').Router();
  api.use(router);
  api.use(calendarModule.exports);
  const result = await new Promise((resolve, reject) => {
    api.handle({ method: 'POST', url: '/delivery-calendar/check', userIdentity: ordinaryUser,
      body: { dates: ['2026-11-01'] } }, { status() { return this; }, json: resolve }, reject);
  });
  assert.equal(result.data[0].isWeekend, true);
  for (const [method, url] of [['GET', '/timeline'], ['POST', '/push/subscribe'], ['GET', '/options']]) {
    assert.deepEqual(await routedRequest(router, method, url, ordinaryUser), { next: true });
  }
});

test('every purchase route still rejects ordinary users before accessing data', async () => {
  const f = fixture({ routing: true });
  const routes = f.router.stack.filter((layer) => layer.route).map((layer) => layer.route);
  assert.equal(routes.length, 11);
  for (const route of routes) {
    const url = route.path.replace(/:[^/]+/g, '1');
    for (const method of Object.keys(route.methods)) {
      await assert.rejects(routedRequest(f.router, method.toUpperCase(), url, ordinaryUser), (error) =>
        error.status === 403 && error.details.code === 'PILOT_FEATURE_FORBIDDEN');
    }
  }
  assert.equal(f.calls.length, 0);
});

test('verified pilot users can still load purchase options', async () => {
  const f = fixture({ routing: true, supplier: { kd_Name1: 'Lieferant', kd_Strasse: 'Plant 1 ', kd_PLZ: '01234', kd_Ort: 'Werkstadt', kd_LK: 'D' } });
  const result = await routedRequest(f.router, 'GET', '/purchase-order-options', {
    shortCode: 'NSC', personNumber: 227, userId: 'n.schroeder', active: true,
  });
  assert.equal(result.data.defaults.paymentConditionId, 17);
  assert.deepEqual(result.data.supplierAddress, {
    name: 'Lieferant', street: 'Plant 1', postalCode: '01234', city: 'Werkstadt', countryCode: 'D',
  });
});

const body = () => ({ supplierId: '42', clientRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', packagingTypeId: 79, deliveryTermId: 1, paymentConditionText: 'Manipuliert', paymentConditionId: 999,
  warehouseId: 'LG0001', addressCustomerId: '42', addressId: 11,
  positions: [{ articleIndex: 'A', article: 'Alter Name', amount: 25000, purchasePrice: 900, requestedDeliveryDate: '2026-11-05', sourceBestellindex: 'ALTE-BE' }] });

test('a missing supplier payment term can be filled from the validated catalog on draft save and edit', async () => {
  const f = fixture({ supplierTerms: { paymentConditionId: null, paymentConditionText: '' } });
  await assert.rejects(f.request(body()), (error) => error.details?.code === 'PURCHASE_PAYMENT_CONDITION_INVALID');
  const saved = (await f.request({ ...body(), paymentConditionId: '19' })).data;
  assert.equal(saved.paymentConditionId, 19);
  assert.equal(saved.paymentConditionText, '14 Tage netto');
  assert.equal(saved.paymentConditionChanged, true);
  const edited = (await f.request({ ...saved, paymentConditionId: '17' }, 'put', '/temp-purchase-orders/:id')).data;
  assert.equal(edited.paymentConditionId, 17);
  assert.equal(edited.paymentConditionText, '30 Tage');
  assert.equal(edited.paymentConditionChanged, true);
});

const file = (name = 'Prüfung.pdf', content = '%PDF-example') => ({ originalname: name, mimetype: 'application/pdf', buffer: Buffer.from(content), size: Buffer.byteLength(content) });

test('purchase detail loads linked orders with the requested purchase ID and test mandant', async () => {
  const f = fixture({ procurementEnabled: true });
  const context = { companyId: 0, userIdentity: { shortCode: 'NSC', personNumber: 227, userId: 'n.schroeder', active: true } };
  await f.request(body(), 'post', '/temp-purchase-orders', context);
  const detail = await f.request({}, 'get', '/temp-purchase-orders/:id', context);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.data.linkedOrderIds, [22]);
});

test('attachments survive create, committed retry, detail, position copy, edit and finalize', async () => {
  const f = fixture();
  const created = (await f.request({ ...body(), attachmentCount: '2', positions: JSON.stringify(body().positions) }, 'post', '/temp-purchase-orders', { files: [file('PrÃ¼fung.pdf'), file('Bild.png', 'image')] })).data;
  assert.deepEqual(created.attachments.map((a) => a.fileName), ['Prüfung.pdf', 'Bild.png']);
  assert.equal(created.attachments[0].buffer, undefined, 'metadata responses never contain file contents');
  const retry = await f.request({ ...body(), attachmentCount: 2 });
  assert.equal(retry.meta.alreadyCreated, true);
  assert.equal(f.attachments.length, 2, 'an uncertain response can be checked without uploading duplicates');
  assert.equal(retry.data.attachments.length, 2);
  const detail = (await f.request({}, 'get', '/temp-purchase-orders/:id')).data;
  const copied = { ...detail.positions[0], id: undefined, copyOfPositionId: detail.positions[0].id };
  const edited = (await f.request({ ...detail, positions: JSON.stringify([...detail.positions, copied]), removeAttachmentIds: '[1]', attachmentCount: '1' }, 'put', '/temp-purchase-orders/:id', { files: [file('Neu.pdf')] })).data;
  assert.equal(edited.positions.length, 2);
  assert.deepEqual(edited.attachments.map((a) => a.fileName), ['Bild.png', 'Neu.pdf']);
  assert.equal(f.attachments[0].tba_DeletedBy, 'AD');
  const finalized = (await f.request({}, 'post', '/temp-purchase-orders/:id/finalize')).data;
  assert.deepEqual(finalized.attachments, edited.attachments);
  await assert.rejects(f.request({ ...detail, removeAttachmentIds: [2] }, 'put', '/temp-purchase-orders/:id'), /nicht mehr bearbeitbar/);
});

test('download enforces tenant, owner, order and active attachment boundaries', async () => {
  const f = fixture({ fullAccess: false });
  await f.request(body(), 'post', '/temp-purchase-orders', { files: [file()] });
  const download = (context = {}) => f.request({}, 'get', '/temp-purchase-orders/:id/attachments/:attachmentId', { params: { attachmentId: '1' }, ...context });
  const response = await download();
  assert.deepEqual(response.buffer, file().buffer);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.match(response.headers['Content-Disposition'], /filename\*=UTF-8''Pr%C3%BCfung.pdf/);
  for (const context of [{ companyId: 2 }, { user: 'OTHER' }, { params: { attachmentId: '2' } }, { params: { id: '2', attachmentId: '1' } }]) {
    await assert.rejects(download(context), (error) => error.status === 404);
  }
  await f.request({ ...body(), removeAttachmentIds: [1] }, 'put', '/temp-purchase-orders/:id');
  await assert.rejects(download(), (error) => error.status === 404);
});

test('missing uploads and invalid removals cannot partially create or edit an order', async () => {
  const f = fixture();
  await assert.rejects(f.request({ ...body(), attachmentCount: 1 }), (error) => error.details.code === 'PURCHASE_ATTACHMENTS_MISSING');
  assert.equal(f.headers.length, 0);
  const created = (await f.request(body(), 'post', '/temp-purchase-orders', { files: [file()] })).data;
  await assert.rejects(f.request({ ...created, comment: 'must roll back', removeAttachmentIds: [1, 999] }, 'put', '/temp-purchase-orders/:id'), /nicht gefunden/);
  const detail = (await f.request({}, 'get', '/temp-purchase-orders/:id')).data;
  assert.notEqual(detail.comment, 'must roll back');
  assert.equal(detail.attachments.length, 1);
  await f.request({}, 'delete', '/temp-purchase-orders/:id');
  assert.equal(f.attachments.length, 0);
});

test('an attachment read error rolls back creation and finalization instead of leaving partial success', async () => {
  const failedCreate = fixture(); failedCreate.failAttachmentRead();
  await assert.rejects(failedCreate.request(body(), 'post', '/temp-purchase-orders', { files: [file()] }), /attachment read error/);
  assert.equal(failedCreate.headers.length, 0);
  assert.equal(failedCreate.attachments.length, 0);
  const failedFinalize = fixture();
  await failedFinalize.request(body()); failedFinalize.failAttachmentRead();
  await assert.rejects(failedFinalize.request({}, 'post', '/temp-purchase-orders/:id/finalize'), /attachment read error/);
  assert.equal(failedFinalize.headers[0].tb_status, 0);
  assert.equal(failedFinalize.timeline.length, 0);
});

test('real multipart requests use the order picker formats and enforce file type and size limits', async (t) => {
  const express = require('express');
  const f = fixture({ routing: true });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.database = { firmaId: 1 }; req.mandant = 'Test';
    req.userIdentity = { shortCode: 'NSC', personNumber: 227, userId: 'n.schroeder', active: true };
    next();
  });
  app.use(f.router);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: { message: error.message, code: error.details?.code } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/temp-purchase-orders`;
  const payload = (name, content, type = 'application/pdf') => {
    const form = new FormData();
    Object.entries(body()).forEach(([key, value]) => form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value)));
    form.append('attachmentCount', '1');
    form.append('attachment', new Blob([content], { type }), name);
    return form;
  };
  let response = await fetch(url, { method: 'POST', body: payload('not-allowed.txt', 'text', 'text/plain') });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'ATTACHMENT_INVALID_TYPE');
  response = await fetch(url, { method: 'POST', body: payload('too-large.pdf', Buffer.alloc(10 * 1024 * 1024 + 1)) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'ATTACHMENT_TOO_LARGE');
  response = await fetch(url, { method: 'POST', body: payload('Prüfung.pdf', '%PDF-test') });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).data.attachments[0].fileName, 'Prüfung.pdf');
  response = await fetch(`${url}/1/attachments/1`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '%PDF-test');
  assert.equal(f.headers.length, 1);
  const batchError = await new Promise((resolve) => f.attachmentModule.attachmentUploadMiddleware({ headers: { 'content-length': String(103 * 1024 * 1024) } }, {}, resolve));
  assert.equal(batchError.status, 413);
});

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

test('finalize retries missing mail for the same status-1 purchase without publishing twice', async () => {
  const attempts = [];
  const f = fixture({ queueCsMail: async ({ order }) => {
    attempts.push(order.id);
    if (attempts.length === 1) throw new Error('Mail queue unavailable');
    return { queued: true };
  } });
  await f.request(body());
  const first = await f.request({}, 'post', '/temp-purchase-orders/:id/finalize');
  assert.equal(first.data.status, 1);
  assert.equal(first.data.csMail.queued, false);
  const retry = await f.request({}, 'post', '/temp-purchase-orders/:id/finalize');
  assert.equal(retry.meta.alreadyFinalized, true);
  assert.equal(retry.data.csMail.queued, true);
  assert.deepEqual(attempts, [1, 1]);
  assert.equal(f.timeline.length, 1);
});

test('legacy internal article names are replaced before hand-off and remain supplier names in persistence and timeline', async () => {
  const f = fixture();
  await f.request(body());
  f.lines[0].tbp_article = 'Unsere Bezeichnung';
  const detail = (await f.request({}, 'get', '/temp-purchase-orders/:id')).data;
  assert.equal(detail.positions[0].article, 'Neuester Name');
  assert.equal(detail.positions[0].masterArticleName, 'Unsere Bezeichnung');
  const sent = (await f.request({}, 'post', '/temp-purchase-orders/:id/finalize')).data;
  assert.equal(sent.positions[0].article, 'Neuester Name');
  assert.equal(f.lines[0].tbp_article, 'Neuester Name');
  assert.equal(f.timeline[0].product, 'Neuester Name');
});

test('rejects historical free text and pickup addresses owned by another customer', async () => {
  const f = fixture();
  await assert.rejects(f.request({ ...body(), addressId: null, loadingLocationText: 'Fremder Ort' }), /Adresse.*Stamm/i);
  await assert.rejects(f.request({ ...body(), addressCustomerId: '43' }), /Adressinhaber/);
  assert.equal(f.headers.length, 0);
});

test('structured pickup address and USD fields survive create, edit and finalize for repeated article positions', async () => {
  const f = fixture({ supplierTerms: { paymentConditionId: 17, paymentConditionText: '30 Tage',
    contacts: [{ id: 109, name: 'Einkauf' }] } });
  const input = body();
  Object.assign(input, { addressId: 12, supplierContactId: 109, currency: 'USD', reference: 'Abruf' });
  Object.assign(input.positions[0], { placeAtSupplier: 'Feluy', pickupReference: 'AB-123', availabilityNote: 'August Volume' });
  input.positions.push({ ...input.positions[0] });
  const created = (await f.request(input)).data;
  assert.equal(created.loadingLocationText, 'Werk B');
  assert.equal(created.addressId, 12);
  assert.equal(created.supplierContact, 'Einkauf');
  assert.equal(created.supplierContactId, 109);
  assert.equal(created.positions.length, 2);
  const edited = (await f.request({ ...created, addressId: 11 }, 'put', '/temp-purchase-orders/:id')).data;
  assert.equal(edited.loadingLocationText, 'Hamburg');
  const sent = (await f.request({}, 'post', '/temp-purchase-orders/:id/finalize')).data;
  assert.equal(sent.status, 1);
  assert.equal(sent.loadingLocationText, 'Hamburg');
  assert.equal(sent.currency, 'USD');
  assert.equal(sent.reference, 'Abruf');
  assert.equal(sent.positions[0].currency, 'USD');
  assert.equal(sent.positions[0].placeAtSupplier, 'Feluy');
  assert.equal(sent.positions[0].pickupReference, 'AB-123');
  assert.equal(sent.positions[1].availabilityNote, 'August Volume');
});

test('a warehouse delivery uses its warehouse account and a direct delivery can use the visible customer', async () => {
  const warehouse = { ...body(), deliveryTermId: 2, addressCustomerId: '43', addressId: 13 };
  const f = fixture();
  const stored = (await f.request(warehouse)).data;
  assert.equal(stored.loadingLocationText, 'Lageradresse');
  assert.equal(stored.currency, 'EUR');
  await assert.rejects(fixture().request({ ...warehouse, addressCustomerId: '44', addressId: 14 }), /Adressinhaber/);
  const direct = (await fixture().request({ ...warehouse, warehouseId: 'LG0000', addressCustomerId: '44', addressId: 14 })).data;
  assert.equal(direct.loadingLocationText, 'Kundenadresse');
});

test('enforces the active ERP master article and position field lengths on save', async () => {
  await assert.rejects(fixture({ inactiveArticle: true }).request(body()), /Artikel im Stamm/);
  const input = body();
  input.positions[0].pickupReference = 'x'.repeat(26);
  await assert.rejects(fixture().request(input), /25 Zeichen/);
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

test('option reference survives create, copy, edit, detail and hand-off without a historical purchase',async()=>{
  const options = {};
  const f=fixture(options);const input=body();
  input.addressId=12;
  input.positions=[{...input.positions[0],articleIndex:'NEW',optionId:7,optionPositionId:11,supplierConfirmed:true,articleConfirmed:true,amount:1000}];
  const created=(await f.request(input, 'post', '/temp-purchase-orders', { files: [file()] })).data;
  assert.equal(created.positions[0].optionId,7);assert.equal(created.positions[0].optionPositionId,11);
  assert.equal(created.positions[0].article,'Optionsmaterial');assert.equal(created.loadingLocationSource,'master');
  assert.equal(created.addressId,12);assert.equal(created.loadingLocationChanged,false);
  assert.deepEqual(created.attachments.map((attachment) => attachment.fileName), ['Option.pdf', 'Prüfung.pdf']);
  const [generated] = created.attachments;
  assert.equal(generated.isOptionPdf, true);
  const retry = await f.request(input);
  assert.equal(retry.meta.alreadyCreated, true);
  assert.equal(f.attachments.length, 2);
  const original=created.positions[0];
  options.optionPrice = 1300;
  const edited=(await f.request({...created,positions:[original,{...original,id:undefined,copyOfPositionId:original.id,amount:500}]},'put','/temp-purchase-orders/:id')).data;
  assert.equal(edited.positions.length,2);assert.ok(edited.positions.every(p=>p.optionId===7&&p.optionPositionId===11));
  assert.equal(edited.attachments[0].id, generated.id);
  assert.equal(JSON.parse(f.attachments[0].tba_OptionSnapshot)[11].price, '950,00 EUR/t');
  const downloaded = await f.request({}, 'get', '/temp-purchase-orders/:id/attachments/:attachmentId', { params: { attachmentId: String(generated.id) } });
  assert.equal(downloaded.headers['Content-Type'], 'application/pdf');
  const pdf = await PDFDocument.load(downloaded.buffer);
  assert.equal(pdf.getTitle(), 'Option zur Bestellung');
  assert.ok(pdf.getPageCount() >= 2);
  await assert.rejects(f.request({ ...edited, removeAttachmentIds: [generated.id] }, 'put', '/temp-purchase-orders/:id'),
    (error) => error.details.code === 'PURCHASE_ORDER_ATTACHMENT_NOT_FOUND');
  await assert.rejects(f.request({...edited,positions:[{...edited.positions[0],optionId:null,optionPositionId:null}]},'put','/temp-purchase-orders/:id'),e=>e.details.code==='OPTION_REFERENCE_CHANGED');
  const sent=(await f.request({},'post','/temp-purchase-orders/:id/finalize')).data;
  assert.equal(sent.status,1);assert.equal(sent.positions[1].optionPositionId,11);
  assert.equal(sent.attachments[0].id, generated.id);
  assert.equal(f.attachments.length, 2);
  assert.equal(f.timeline[0].payloadJson.optionId,7);
});

test('an existing draft gets the options PDF before already saved attachments and can lose its last option line', async () => {
  const options = { optionSnapshotSupported: false };
  const f = fixture(options);
  const created = (await f.request(body(), 'post', '/temp-purchase-orders', { files: [file('Option.pdf')] })).data;
  assert.equal(created.attachments.length, 1);
  assert.equal(created.attachments[0].isOptionPdf, undefined);
  options.optionSnapshotSupported = true;
  const [line] = created.positions;
  const fromOption = { ...line, id: undefined, optionId: 7, optionPositionId: 11, supplierConfirmed: true, articleConfirmed: true };
  const edit = (positions) => f.request({ ...created, positions }, 'put', '/temp-purchase-orders/:id');
  const updated = (await edit([line, fromOption])).data;
  assert.deepEqual(updated.attachments.map((attachment) => attachment.id), [2, 1]);
  assert.equal(updated.attachments[0].isOptionPdf, true);
  const withoutOption = (await edit([updated.positions[0]])).data;
  assert.deepEqual(withoutOption.attachments, created.attachments);
});

test('an existing option can be handed off for the first time with a generated PDF', async () => {
  const f = fixture();
  await f.request(body(), 'post', '/temp-purchase-orders', { files: [file()] });
  Object.assign(f.lines[0], { OptionID: 7, OptionPositionID: 11 });
  const sent = (await f.request({}, 'post', '/temp-purchase-orders/:id/finalize')).data;
  assert.equal(sent.status, 1);
  assert.deepEqual(sent.attachments.map((attachment) => attachment.fileName), ['Option.pdf', 'Prüfung.pdf']);
});

test('an option order is rolled back if PDF rendering fails or the required schema is missing', async () => {
  const input = body();
  Object.assign(input.positions[0], { optionId: 7, optionPositionId: 11, supplierConfirmed: true, articleConfirmed: true });
  for (const [options, code] of [
    [{ failOptionPdf: true }, 'PURCHASE_OPTION_PDF_FAILED'],
    [{ optionSnapshotSupported: false }, 'PURCHASE_OPTION_PDF_SCHEMA_MISSING'],
  ]) {
    const f = fixture(options);
    await assert.rejects(f.request(input, 'post', '/temp-purchase-orders', { files: [file()] }), (error) => error.details.code === code);
    assert.equal(f.headers.length, 0);
    assert.equal(f.lines.length, 0);
    assert.equal(f.attachments.length, 0);
  }
});

test('unconfirmed option selections and excess quantities cannot create a draft',async()=>{
  const f=fixture({optionQuantityLimit:100});const input=body();
  Object.assign(input.positions[0],{optionId:7,optionPositionId:11});
  await assert.rejects(f.request(input),e=>e.details.code==='OPTION_SELECTION_REQUIRED');
  Object.assign(input.positions[0],{supplierConfirmed:true,articleConfirmed:true});
  await assert.rejects(f.request(input),/Optionsmenge überschritten/);
  assert.equal(f.headers.length,0);assert.equal(f.lines.length,0);
});

test('an option cannot change to an unrelated supplier during save, edit or finalize',async()=>{
  const options={optionSupplierId:'WRONG'},f=fixture(options),input=body();
  Object.assign(input.positions[0],{optionId:7,optionPositionId:11,supplierConfirmed:true,articleConfirmed:true});
  await assert.rejects(f.request(input),/Optionslieferant/);
  assert.equal(f.headers.length,0);
  options.optionSupplierId=input.supplierId;
  const created=(await f.request(input)).data;
  options.optionSupplierId='WRONG';
  await assert.rejects(f.request(created,'put','/temp-purchase-orders/:id'),/Optionslieferant/);
  await assert.rejects(f.request({},'post','/temp-purchase-orders/:id/finalize'),/Optionslieferant/);
  assert.equal(f.mails.length,0);
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
