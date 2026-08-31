const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildOpenOrderCountSql,
  buildOpenOrderCountsByOwnerSql,
  formatReminderPushBody,
  formatReminderPushTitle,
  normalizeReminderConfig,
} = require('../src/db/unfinalized-order-reminder');

test('empty or invalid reminder interval disables the feature', () => {
  assert.deepEqual(normalizeReminderConfig({ intervalMinutes: null, userEmail: 'user@example.com' }), {
    intervalMinutes: null,
    userEmail: 'user@example.com',
    hasConfiguredUser: true,
    enabled: false,
  });
  assert.equal(normalizeReminderConfig({ intervalMinutes: 0, userEmail: 'user@example.com' }).enabled, false);
  assert.equal(normalizeReminderConfig({ intervalMinutes: 'not-a-number', userEmail: 'user@example.com' }).enabled, false);
});

test('reminder requires a valid configured target email', () => {
  assert.deepEqual(normalizeReminderConfig({ intervalMinutes: 60, userEmail: '' }), {
    intervalMinutes: 60,
    userEmail: '',
    hasConfiguredUser: false,
    enabled: true,
  });
  assert.equal(normalizeReminderConfig({ intervalMinutes: 60, userEmail: 'not-an-email' }).enabled, false);
  assert.deepEqual(normalizeReminderConfig({ intervalMinutes: 60, userEmail: 'User@Example.com' }), {
    intervalMinutes: 60,
    userEmail: 'user@example.com',
    hasConfiguredUser: true,
    enabled: true,
  });
});

test('open order count query only selects own non-final orders', () => {
  const sql = buildOpenOrderCountSql('[BMSApp].[tbl_Temp_Auftrag]');
  assert.match(sql, /COUNT_BIG\(\*\)/);
  assert.match(sql, /ta_CreatedBy/);
  assert.match(sql, /ta_completed/);
  assert.match(sql, /COALESCE\(\[ta_completed\], 0\) = 0/);
});

test('all-user query groups open orders by normalized creator short code', () => {
  const sql = buildOpenOrderCountsByOwnerSql('[BMSApp].[tbl_Temp_Auftrag]');
  assert.match(sql, /userShortCode/);
  assert.match(sql, /openOrderCount/);
  assert.match(sql, /GROUP BY LOWER\(LTRIM\(RTRIM\(COALESCE\(\[ta_CreatedBy\]/);
  assert.match(sql, /ta_completed/);
});

test('reminder push text is localized and includes the count', () => {
  assert.equal(formatReminderPushTitle('de'), 'BMS-App - offene Aufträge');
  assert.equal(formatReminderPushTitle('en'), 'BMS App - open orders');
  assert.match(formatReminderPushBody(2, 'de'), /noch 2 eigene Aufträge/);
  assert.match(formatReminderPushBody(1, 'de'), /noch 1 eigenen Auftrag, der/);
  assert.match(formatReminderPushBody(1, 'en'), /still have 1 own order/);
});
