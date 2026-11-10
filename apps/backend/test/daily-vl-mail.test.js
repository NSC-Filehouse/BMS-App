const test = require('node:test');
const assert = require('node:assert/strict');

process.env.BMS_DAILY_VL_MAIL_FROM_ADDRESS = ' Verfuegbarkeitsliste@MLHolding.org ';
process.env.BMS_DAILY_VL_MAIL_FROM_DISPLAY_NAME = ' Verf\uFFFDgbarkeitsliste - MLHolding GmbH ';
const config = require('../src/config');
const EWS = require('ews-javascript-api');
const { sendOrderMail } = require('../src/mail/order-mail');
const sqlCalls = [];

require.cache[require.resolve('../src/db/access')] = { exports: {
  runSQLQuerySqlServer: async (database, sql, params) => {
    sqlCalls.push({ sql, params });
    return sql.includes('INSERTED.[vld_ID]') ? [{
      id: 42,
      runDate: '2026-11-09',
      companyId: 3,
      companyName: 'MLPlastics',
      recipientsJson: '["recipient@example.com"]',
      subject: 'VL_MLPlastics',
      body: '<p>Aktuelle VL</p>',
      attemptCount: 1,
    }] : [];
  },
} };
function unexpectedDiscovery() {
  throw new Error('Sending an existing daily VL must not rediscover mandants or reload VL data.');
}
require.cache[require.resolve('../src/db/databases')] = { exports: {
  getDatabaseConnectionForIdentityById: unexpectedDiscovery,
  getMandantsForIdentity: unexpectedDiscovery,
} };
require.cache[require.resolve('../src/db/users')] = { exports: {
  getUserIdentityByShortCode: unexpectedDiscovery,
} };
require.cache[require.resolve('../src/db/vl-completion-mail')] = { exports: {
  loadCurrentVl: unexpectedDiscovery,
} };
const { processDailyVlMail } = require('../src/db/daily-vl-mail');

config.orderMail = {
  enabled: true,
  ewsFallback: true,
  maxAttempts: 10,
  ews: { username: 'technical@example.com', password: 'test', url: 'https://exchange.example.test/EWS' },
};
config.mailService = {
  enabled: true,
  baseAddress: 'https://mail.example.test/',
  apiKey: 'test-key',
  timeoutMs: 1000,
};

test('daily VL repairs the damaged configured sender before submitting to MailService', async (t) => {
  assert.equal(config.dailyVlMail.fromAddress, 'verfuegbarkeitsliste@mlholding.org');
  assert.equal(config.dailyVlMail.fromDisplayName, 'Verfügbarkeitsliste - MLHolding GmbH');
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, status: 202, text: async () => '{"Id":42}' };
  });

  const result = await processDailyVlMail(42, '2026-11-09');
  assert.equal(result.status, 'sent');
  assert.equal(requests.length, 1);
  const message = requests[0];
  assert.equal(message.FromAddress, 'verfuegbarkeitsliste@mlholding.org');
  assert.equal(message.FromDisplayName, 'Verfügbarkeitsliste - MLHolding GmbH');
  assert.equal(Object.hasOwn(message, 'OnBehalfOfAddress'), false);
  assert.deepEqual(message.To, [{ Address: 'recipient@example.com' }]);
  assert.equal(message.Subject, 'VL_MLPlastics');
  assert.equal(message.Body, '<p>Aktuelle VL</p>');
  assert.equal(message.IsBodyHtml, true);
  assert.equal(message.ClientMessageId, 'bms-app:daily-vl:2026-11-09:3');
  assert.ok(sqlCalls.some(({ sql }) => sql.includes("[vld_Status] = N'sent'")));
});

test('daily VL retains its sender when a transient failure triggers EWS fallback', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: false, status: 503, text: async () => 'Service unavailable',
  }));
  const messages = [];
  t.mock.method(EWS.EmailMessage.prototype, 'SendAndSaveCopy', async function () {
    messages.push(this);
  });

  assert.equal((await processDailyVlMail(42, '2026-11-09')).status, 'sent');
  assert.equal(messages.length, 1);
  for (const sender of [messages[0].From, messages[0].Sender]) {
    assert.equal(sender.Address, 'verfuegbarkeitsliste@mlholding.org');
    assert.equal(sender.Name, 'Verfügbarkeitsliste - MLHolding GmbH');
  }
  assert.equal(messages[0].Subject, 'VL_MLPlastics');
});

test('other mails continue to use the service sender despite the daily VL configuration', async (t) => {
  let message;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    message = JSON.parse(options.body);
    return { ok: true, status: 202, text: async () => '{"Id":43}' };
  });
  await sendOrderMail({
    orderMailConfig: config.orderMail,
    mailServiceConfig: config.mailService,
    recipient: 'other@example.com',
    subject: 'Other notification',
    body: 'Body',
  });
  assert.equal(Object.hasOwn(message, 'FromAddress'), false);
  assert.equal(Object.hasOwn(message, 'FromDisplayName'), false);
});
