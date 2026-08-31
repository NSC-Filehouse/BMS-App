const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildOpenOrderCountSql,
  formatReminderPushBody,
  formatReminderPushTitle,
  normalizeReminderConfig,
} = require('../src/db/unfinalized-order-reminder');

test('empty or invalid reminder interval disables the feature', () => {
  assert.deepEqual(normalizeReminderConfig({ intervalMinutes: null, userEmail: 'user@example.com' }), {
    intervalMinutes: null,
    userEmail: 'user@example.com',
    enabled: false,
  });
  assert.equal(normalizeReminderConfig({ intervalMinutes: 0, userEmail: 'user@example.com' }).enabled, false);
  assert.equal(normalizeReminderConfig({ intervalMinutes: 'not-a-number', userEmail: 'user@example.com' }).enabled, false);
});

test('reminder requires a valid configured target email', () => {
  assert.equal(normalizeReminderConfig({ intervalMinutes: 60, userEmail: '' }).enabled, false);
  assert.equal(normalizeReminderConfig({ intervalMinutes: 60, userEmail: 'not-an-email' }).enabled, false);
  assert.equal(normalizeReminderConfig({ intervalMinutes: 60, userEmail: 'User@Example.com' }).enabled, true);
});

test('open order count query only selects own non-final orders', () => {
  const sql = buildOpenOrderCountSql('[BMSApp].[tbl_Temp_Auftrag]');
  assert.match(sql, /COUNT_BIG\(\*\)/);
  assert.match(sql, /ta_CreatedBy/);
  assert.match(sql, /ta_completed/);
  assert.match(sql, /COALESCE\(\[ta_completed\], 0\) = 0/);
});

test('reminder push text is localized and includes the count', () => {
  assert.equal(formatReminderPushTitle('de'), 'BMS-App - offene Aufträge');
  assert.equal(formatReminderPushTitle('en'), 'BMS App - open orders');
  assert.match(formatReminderPushBody(2, 'de'), /noch 2 eigene Aufträge/);
  assert.match(formatReminderPushBody(1, 'de'), /noch 1 eigenen Auftrag, der/);
  assert.match(formatReminderPushBody(1, 'en'), /still have 1 own order/);
});
