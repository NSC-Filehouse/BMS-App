const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../src/config');
const calls = [];
const deliveries = [];
let currentCustomer;
let item;
let directoryError = false;

require.cache[require.resolve('../src/db/access')] = { exports: {
  runSQLQueryAccess: async () => [currentCustomer],
  runSQLQuerySqlServer: async (database, sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('INSERTED.[clm_ID]')) return [item];
    if (sql.includes('[md_KdNR]')) {
      if (directoryError) throw new Error('directory unavailable');
      return [{ mandantId: 7, customerId: '14104' }];
    }
    return [];
  },
} };
require.cache[require.resolve('../src/db/databases')] = { exports: {
  getDatabaseConnectionForCompanyId: async (id) => ({ firmaId: id, databaseName: 'BMS.FRU' }),
} };
const mailPath = require.resolve('../src/mail/order-mail');
const mail = require(mailPath);
require.cache[mailPath] = { exports: {
  ...mail,
  sendOrderMail: async (message) => { deliveries.push(message); return { transport: 'test' }; },
} };

const {
  BANK_DETAILS_TYPE, CREDIT_LIMIT_TYPE, queueCreditLimitMails, processCreditLimitMailOutboxById,
} = require('../src/db/credit-limit-request-outbox');

function reset(type = CREDIT_LIMIT_TYPE, customer = {}) {
  calls.length = 0;
  deliveries.length = 0;
  directoryError = false;
  currentCustomer = { customerId: '14104', interCompany: true, insolvent: false, ...customer };
  item = {
    id: 42, companyId: 3, customerId: currentCustomer.customerId, type, orderId: 1,
    toRecipients: '["recipient@example.com"]', subject: 'Credit request', body: 'Body',
    clientMessageId: 'test-message', status: 'sending', attemptCount: 1,
    ...(type === CREDIT_LIMIT_TYPE ? {
      fromAddress: 'creator@example.com',
      fromDisplayName: 'Order Creator',
    } : {}),
  };
}

test('explicit API consent cannot queue credit for an internal customer; bank reminder remains enabled', async () => {
  const previousEnabled = config.creditLimitMail.enabled;
  config.creditLimitMail.enabled = true;
  try {
    const writes = [];
    const result = await queueCreditLimitMails({
      query: async (sql, params) => {
        writes.push({ sql, params });
        return { rows: sql.includes('SELECT TOP 1') ? [] : [{ id: 10 }] };
      },
      companyId: 3, customerId: '14104', orderId: 1,
      currentOrderAmount: 200000, openTempOrders: [], sendCreditRequest: true,
      creditContext: {
        customer: { customerId: '14104', interCompany: true, ownSalesMandantId: 7 },
        credit: { amount: 0 }, openOrders: [],
      },
      primaryAdEmail: 'ad@example.com', mandantName: 'Frupack',
      nowIso: '2026-10-14T10:00:00.000Z', creditTo: ['credit@example.com'], creditCc: [],
    });
    assert.equal(result.creditRequest.status, 'suppressed_internal');
    assert.equal(result.bankReminder.status, 'queued');
    const inserts = writes.filter((call) => call.sql.includes('INSERT INTO') && call.sql.includes('CreditLimitMailOutbox'));
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].params[3], BANK_DETAILS_TYPE);
  } finally {
    config.creditLimitMail.enabled = previousEnabled;
  }
});

test('worker suppresses an already queued credit request using current customer data', async () => {
  reset();
  const result = await processCreditLimitMailOutboxById(42);
  assert.equal(result.status, 'suppressed_internal');
  assert.equal(deliveries.length, 0);
  assert.ok(calls.some((call) => call.sql.includes("[clm_Status] = N'suppressed'")));
  assert.ok(calls.some((call) => call.sql.includes('[clrs_LastCreditMailStatus]') && call.params[0] === 'suppressed_internal'));
});

test('worker sends ordinary credit for external customers or missing InterCompany flags', async () => {
  for (const customer of [{ customerId: 'external' }, { interCompany: false }, { interCompany: '0' }, { customerId: '200995' }]) {
    reset(CREDIT_LIMIT_TYPE, customer);
    assert.equal((await processCreditLimitMailOutboxById(42)).status, 'sent');
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].fromAddress, 'creator@example.com');
    assert.equal(deliveries[0].fromDisplayName, 'Order Creator');
    assert.equal(deliveries[0].onBehalfOfAddress, undefined);
  }
});

test('worker does not fall back to the service sender for credit requests without a creator email', async () => {
  reset(CREDIT_LIMIT_TYPE, { customerId: 'external' });
  delete item.fromAddress;
  delete item.fromDisplayName;
  assert.equal((await processCreditLimitMailOutboxById(42)).status, 'failed');
  assert.equal(deliveries.length, 0);
});

test('directory failures use normal credit handling without granting an exemption', async () => {
  reset();
  directoryError = true;
  assert.equal((await processCreditLimitMailOutboxById(42)).status, 'sent');
  assert.equal(deliveries.length, 1);
});

test('worker still sends bank reminders to internal customers and preserves insolvency suppression', async () => {
  reset(BANK_DETAILS_TYPE);
  assert.equal((await processCreditLimitMailOutboxById(42)).status, 'sent');
  assert.equal(deliveries.length, 1);
  assert.equal(calls.some((call) => call.sql.includes('[md_KdNR]')), false);
  reset(CREDIT_LIMIT_TYPE, { insolvent: true });
  assert.equal((await processCreditLimitMailOutboxById(42)).status, 'suppressed_insolvent');
  assert.equal(deliveries.length, 0);
});

test('migration permits the worker credit type for new and existing tables, retaining legacy types', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../sql/add_credit_limit_request.sql'), 'utf8');
  const checks = [...migration.matchAll(/CHECK \(\[clm_Type\] IN \(([^)]+)\)\)/g)];
  assert.equal(checks.length, 2);
  for (const [, types] of checks) {
    assert.ok(types.includes(`N'${CREDIT_LIMIT_TYPE}'`));
    assert.ok(types.includes(`N'${BANK_DETAILS_TYPE}'`));
    assert.ok(types.includes("N'credit_limit_request'"));
  }
});

test('sender migration adds nullable creator sender columns to existing outboxes', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../sql/add_credit_limit_mail_sender.sql'), 'utf8');
  assert.match(migration, /COL_LENGTH\(N'BMSApp\.CreditLimitMailOutbox', N'clm_FromAddress'\) IS NULL/);
  assert.match(migration, /ADD \[clm_FromAddress\] NVARCHAR\(320\) NULL/);
  assert.match(migration, /COL_LENGTH\(N'BMSApp\.CreditLimitMailOutbox', N'clm_FromDisplayName'\) IS NULL/);
  assert.match(migration, /ADD \[clm_FromDisplayName\] NVARCHAR\(255\) NULL/);
});
