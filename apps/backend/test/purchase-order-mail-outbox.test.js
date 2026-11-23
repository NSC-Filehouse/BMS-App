const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function fixture({ failAttachments = false } = {}) {
  const sent = [];
  const calls = [];
  const selected = [{ fileName: 'Option.pdf', mimeType: 'application/pdf', buffer: Buffer.from('generated-pdf'), isOptionPdf: true },
    { fileName: 'Prüfung.pdf', mimeType: 'application/pdf', buffer: Buffer.from('selected-pdf') },
    { fileName: 'Foto.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('selected-photo') }];
  const dependencies = {
    '../config': { sql: { database: 'BMS', columns: { firmaId: 'id', firmaKurz: 'short', firma: 'name' }, tables: {} },
      purchaseOrderMail: { enabled: true }, orderMail: { maxAttempts: 5 }, mailService: {} },
    '../logger': { warn() {}, error() {} },
    './app-tables': { appTableSql: (name) => name },
    './access': { runSQLQuerySqlServer: async (_db, sql) => {
      calls.push(sql);
      if (sql.includes('OUTPUT INSERTED.[pcom_ID]')) return [{ id: 2, orderId: 10, recipient: 'cs@example.test', attemptCount: 1 }];
      if (sql.includes('NOT EXISTS')) return [];
      if (sql.includes('SELECT TOP 50 [pcom_ID]')) return [{ id: 2 }];
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
  };
  const mod = { exports: {} };
  new Function('require', 'module', fs.readFileSync(path.join(__dirname, '../src/db/purchase-order-mail-outbox.js'), 'utf8'))((name) => {
    assert.ok(name in dependencies, name); return dependencies[name];
  }, mod);
  return { ...mod.exports, sent, calls };
}

test('the purchase order mail worker sends only the internal CS mail with selected attachments', async () => {
  const f = fixture();
  await f.processPendingPurchaseOrderMails();
  assert.deepEqual(f.sent.map((mail) => mail.recipient), ['cs@example.test']);
  assert.deepEqual(f.sent[0].attachments.map((a) => a.fileName), ['Option.pdf', 'Prüfung.pdf', 'Foto.jpg']);
  assert.equal(f.sent[0].attachments[0].buffer.toString(), 'generated-pdf');
  assert.ok(f.calls.every((sql) => !sql.includes('tb_supplier_mail_status') && !sql.includes('[pom_')));
});

test('attachment loading errors retain failed outbox state instead of sending incomplete mail', async () => {
  const f = fixture({ failAttachments: true });
  assert.equal((await f.processPurchaseOrderCsMailOutboxById(2)).status, 'failed');
  assert.equal(f.sent.length, 0);
  assert.ok(f.calls.some((sql) => sql.includes("[pcom_Status]=N'failed'")));
});
