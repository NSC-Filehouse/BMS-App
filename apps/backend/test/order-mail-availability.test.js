const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const beNumber = '3-02-26-00884-01';
const warehouseId = 'LG0345';
let orders;
let mails;
let sent;
let failMail;
let lockTail;
let stockAmount;
let failSentUpdate;

async function query(sql, params = []) {
  if (sql.includes('SUM(')) {
    const statuses = sql.match(/COALESCE\(o\.\[ta_Status\], 0\) IN \(([^)]+)\)/)[1].split(',').map(Number);
    return orders.filter((order) => statuses.includes(order.orderStatus) && order.id !== params[1]
      && (order.orderStatus === 3 || mails.find((mail) => mail.orderId === order.id)?.status !== 'failed'))
      .map((order) => ({ beNumber, warehouseId, amountInKg: order.amount, ownerShortCode: order.createdBy }));
  }
  if (sql.includes('[OrderMailOutbox]')) {
    const id = params.at(-1);
    if (sql.includes('SELECT [om_CompanyID]')) return mails.filter((mail) => mail.id === params[0]);
    if (sql.includes('WITH (ROWLOCK, UPDLOCK, READPAST)')) {
      const mail = mails.find((entry) => entry.id === params[0] && ['failed', 'pending'].includes(entry.status));
      if (!mail) return [];
      mail.status = 'sending'; mail.attemptCount++;
      return [{ ...mail }];
    }
    const mail = mails.find((entry) => entry.id === id);
    if (sql.includes("[om_Status] = N'sent'")) {
      if (failSentUpdate) throw new Error('Cannot persist sent state');
      mail.status = 'sent';
    }
    if (sql.includes("[om_Status] = N'failed'")) mail.status = 'failed';
    return [];
  }
  if (sql.includes('[tbl_Temp_Auf_Position]')) {
    const order = orders.find((entry) => entry.id === params[0]);
    return order ? [{ beNumber, warehouseId, amountInKg: order.amount, reservationInKg: 0 }] : [];
  }
  if (sql.includes('[tbl_Temp_Auftrag]')) return orders.filter((order) => order.id === params[0]);
  if (sql.includes('[tbl_Temp_Auftrag_Anhang]')) return [];
  throw new Error(`Unexpected query: ${sql}`);
}

require.cache[require.resolve('../src/db/access')] = { exports: {
  runSQLQuerySqlServer: async (db, sql, params) => query(sql, params),
  runSQLQueryAccess: async () => stockAmount > 0 ? [{ amount: stockAmount, reserved: 0, storageId: warehouseId }] : [],
  withSqlTransaction: async (db, work) => {
    let release;
    const transactionQuery = async (sql, params) => {
      if (sql.includes('sp_getapplock')) {
        const previous = lockTail;
        lockTail = new Promise((resolve) => { release = resolve; });
        await previous;
        return { rows: [{ lockResult: 0 }] };
      }
      return { rows: await query(sql, params) };
    };
    try { return await work({ query: transactionQuery }); } finally { release?.(); }
  },
} };
require.cache[require.resolve('../src/db/databases')] = { exports: {
  getDatabaseConnectionForCompanyId: async () => ({ firmaId: 3, databaseName: 'BMS.FRU' }),
} };
require.cache[require.resolve('../src/db/users')] = { exports: { getUserIdentityByShortCode: async () => null } };
const mailModule = require('../src/mail/order-mail');
require.cache[require.resolve('../src/mail/order-mail')] = { exports: {
  ...mailModule,
  sendOrderMail: async (message) => {
    sent.push(message);
    if (failMail) throw new Error('Mail transport unavailable');
    return { transport: 'test' };
  },
} };
const { processOrderMailOutboxById } = require('../src/db/order-mail-outbox');

function addOrder(id, amount, status = 'pending', orderStatus = 1) {
  orders.push({ id, orderStatus, amount, createdBy: `AD${id}` });
  mails.push({ id, orderId: id, companyId: 3, recipient: 'test@example.com',
    onBehalfOfAddress: 'ad@example.com', status, attemptCount: 0, body: 'Order' });
}
beforeEach(() => {
  orders = []; mails = []; sent = []; failMail = false; failSentUpdate = false; stockAmount = 23375; lockTail = Promise.resolve();
});

test('a successful dispatch claims quantity until BMS has booked it', async () => {
  addOrder(1, 23375);
  assert.equal((await processOrderMailOutboxById(1)).status, 'sent');
  assert.equal(sent.length, 1);
  assert.equal(mails[0].status, 'sent');
});

test('a failed dispatch releases quantity and a retry checks the winner again before sending', async () => {
  addOrder(1, 11000);
  failMail = true;
  assert.equal((await processOrderMailOutboxById(1)).status, 'failed');
  failMail = false;
  addOrder(2, 23375);
  assert.equal((await processOrderMailOutboxById(2)).status, 'sent');
  const retry = await processOrderMailOutboxById(1);
  assert.equal(retry.status, 'failed');
  assert.match(retry.error, /verfügbar/);
  assert.equal(sent.length, 2); // Failed first delivery plus the winning order only.
  assert.equal(mails[0].status, 'failed');
});

test('two due retries serialize their quantity checks before either transport runs', async () => {
  addOrder(1, 23375, 'failed');
  addOrder(2, 11000, 'failed');
  const results = await Promise.all([processOrderMailOutboxById(1), processOrderMailOutboxById(2)]);
  assert.deepEqual(results.map((result) => result.status), ['sent', 'failed']);
  assert.equal(sent.length, 1);
});

test('a returned order is not dispatched by an old queued notification', async () => {
  addOrder(1, 11000, 'pending', 3);
  assert.equal((await processOrderMailOutboxById(1)).status, 'failed');
  assert.equal(sent.length, 0);
});

test('a notification retry for an already booked order does not claim sold-out stock again', async () => {
  addOrder(1, 23375, 'failed', 2);
  stockAmount = 0;
  assert.equal((await processOrderMailOutboxById(1)).status, 'sent');
  assert.equal(sent.length, 1);
});

test('a confirmed delivery keeps its claim if persisting the sent state fails', async () => {
  addOrder(1, 23375);
  failSentUpdate = true;
  assert.equal((await processOrderMailOutboxById(1)).status, 'sending');
  assert.equal(mails[0].status, 'sending');
  addOrder(2, 11000);
  assert.equal((await processOrderMailOutboxById(2)).status, 'failed');
  assert.equal(sent.length, 1);
});
