const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildOpenOrderCountSql,
  buildOpenOrderCountsByOwnerSql,
  formatReminderPushBody,
  formatReminderPushTitle,
  buildReminderClientMessageId,
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

test('reminder client message ids are stable within an interval and change between intervals', () => {
  const first = new Date('2026-09-01T10:00:00.000Z');
  const sameInterval = new Date('2026-09-01T10:59:59.000Z');
  const nextInterval = new Date('2026-09-01T11:00:00.000Z');

  assert.equal(
    buildReminderClientMessageId('User@Example.com', 60, first),
    buildReminderClientMessageId('user@example.com', 60, sameInterval),
  );
  assert.notEqual(
    buildReminderClientMessageId('user@example.com', 60, first),
    buildReminderClientMessageId('user@example.com', 60, nextInterval),
  );
});
