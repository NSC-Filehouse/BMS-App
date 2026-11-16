const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function fixture({ pdf = true, failAttachments = false } = {}) {
  const sent = [];
  const calls = [];
  const selected = [{ fileName: 'Prüfung.pdf', mimeType: 'application/pdf', buffer: Buffer.from('selected-pdf') },
    { fileName: 'Foto.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('selected-photo') }];
  const dependencies = {
    '../config': { sql: { database: 'BMS', columns: { firmaId: 'id', firmaKurz: 'short', firma: 'name' }, tables: {} },
      purchaseOrderMail: { maxAttempts: 5 }, orderMail: {}, mailService: {} },
    fs: { promises: { readFile: async () => Buffer.from('bms-document') } },
    '../logger': { warn() {}, error() {} },
    './app-tables': { appTableSql: (name) => name },
    './access': { runSQLQuerySqlServer: async (_db, sql) => {
      calls.push(sql);
      if (sql.includes('OUTPUT INSERTED.[pom_ID]')) return [{ id: 1, orderId: 10, companyId: 1, recipient: 'supplier@example.test', attemptCount: 1 }];
      if (sql.includes('OUTPUT INSERTED.[pcom_ID]')) return [{ id: 2, orderId: 10, recipient: 'cs@example.test', attemptCount: 1 }];
      if (sql.includes('FROM tempPurchaseOrderPosition')) return [];
      if (sql.includes('FROM tempPurchaseOrder')) return [{ id: 10, companyId: 1, bmsPurchaseOrderNumber: 'BE-123', status: 2 }];
      if (sql.includes('FROM [dbo].[tblMandant]')) return [{ companyId: 1, shortName: 'FRU', name: 'Own company' }];
      if (sql.includes('UPDATE')) return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    } },
    './purchase-order-attachments': { loadPurchaseOrderAttachments: async (id, options) => {
      assert.equal(id, 10);
      if (failAttachments) throw new Error('Could not load attachments');
      return selected.map((item) => options?.includeContent ? { ...item } : { fileName: item.fileName });
    } },
    '../mail/order-mail': { sendOrderMail: async (message) => { sent.push(message); return { transport: 'mock' }; } },
    '../mail/purchase-order-mail': require('../src/mail/purchase-order-mail'),
    '../order-pdf': { resolveLatestPurchaseOrderPdf: async () => pdf ? { filePath: 'mock.pdf', fileName: 'BMS-Bestellung.pdf' } : null },
  };
  const mod = { exports: {} };
  new Function('require', 'module', fs.readFileSync(path.join(__dirname, '../src/db/purchase-order-mail-outbox.js'), 'utf8'))((name) => {
    assert.ok(name in dependencies, name); return dependencies[name];
  }, mod);
  return { ...mod.exports, sent, calls };
}

test('CS receives selected files and supplier receives the same files plus the existing BMS PDF', async () => {
  const f = fixture();
  assert.equal((await f.processPurchaseOrderCsMailOutboxById(2)).status, 'sent');
  assert.equal((await f.processPurchaseOrderMailOutboxById(1)).status, 'sent');
  assert.deepEqual(f.sent[0].attachments.map((a) => a.fileName), ['Prüfung.pdf', 'Foto.jpg']);
  assert.deepEqual(f.sent[1].attachments.map((a) => a.fileName), ['Prüfung.pdf', 'Foto.jpg', 'BMS-Bestellung.pdf']);
  assert.equal(f.sent[1].attachments[0].buffer.toString(), 'selected-pdf');
  assert.equal(f.sent[1].attachments[2].buffer.toString(), 'bms-document');
});

test('supplier attachments are sent even without a BMS PDF', async () => {
  const f = fixture({ pdf: false });
  assert.equal((await f.processPurchaseOrderMailOutboxById(1)).status, 'sent');
  assert.equal(f.sent[0].attachments.length, 2);
});

test('attachment loading errors retain failed outbox state instead of sending incomplete mail', async () => {
  const f = fixture({ failAttachments: true });
  assert.equal((await f.processPurchaseOrderCsMailOutboxById(2)).status, 'failed');
  assert.equal((await f.processPurchaseOrderMailOutboxById(1)).status, 'failed');
  assert.equal(f.sent.length, 0);
  assert.ok(f.calls.some((sql) => sql.includes("[pom_Status]=N'failed'")));
  assert.ok(f.calls.some((sql) => sql.includes("[pcom_Status]=N'failed'")));
});
