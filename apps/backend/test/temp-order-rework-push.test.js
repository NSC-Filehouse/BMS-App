const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildReworkOrderScanSql,
  buildReworkPushBody,
  buildReworkPushTitle,
  normalizeReworkPushConfig,
  shouldNotifyRework,
} = require('../src/db/temp-order-rework-push');

test('rework push interval accepts positive seconds and rejects invalid values', () => {
  assert.deepEqual(normalizeReworkPushConfig({ intervalSeconds: 45 }), {
    intervalSeconds: 45,
    enabled: true,
  });
  assert.deepEqual(normalizeReworkPushConfig({ intervalSeconds: 0 }), {
    intervalSeconds: null,
    enabled: false,
  });
  assert.equal(normalizeReworkPushConfig({ intervalSeconds: 'invalid' }).enabled, false);
});

test('rework scan reads status, creator, and ERP return comment', () => {
  const sql = buildReworkOrderScanSql('[BMSApp].[tbl_Temp_Auftrag]');
  assert.match(sql, /ta_Status/);
  assert.match(sql, /ta_return_comment/);
  assert.match(sql, /ta_CreatedBy/);
  assert.match(sql, /IN \(0, 1, 2, 3\)/);
});

test('rework push text contains the CS reason and is localized', () => {
  assert.equal(buildReworkPushTitle('de'), 'BMS-App - Auftrag zur Nachbearbeitung');
  assert.equal(buildReworkPushTitle('en'), 'BMS App - order returned');
  assert.equal(
    buildReworkPushBody({ returnComment: 'Preis bitte pruefen.' }, 'de'),
    'Auftrag zur Nachbearbeitung zurück erhalten: Preis bitte pruefen.',
  );
  assert.equal(
    buildReworkPushBody({ returnComment: 'Please check the price.' }, 'en'),
    'Order returned for rework: Please check the price.',
  );
});

test('rework notification is sent once per return cycle and again for a new reason', () => {
  assert.equal(shouldNotifyRework({
    previousStatus: 1,
    previousReturnComment: null,
    lastNotifiedAt: null,
    currentStatus: 3,
    currentReturnComment: 'Bitte Preis pruefen.',
  }), true);
  assert.equal(shouldNotifyRework({
    previousStatus: 3,
    previousReturnComment: 'Bitte Preis pruefen.',
    lastNotifiedAt: new Date('2026-09-08T10:00:00.000Z'),
    currentStatus: 3,
    currentReturnComment: 'Bitte Preis pruefen.',
  }), false);
  assert.equal(shouldNotifyRework({
    previousStatus: 3,
    previousReturnComment: 'Bitte Preis pruefen.',
    lastNotifiedAt: new Date('2026-09-08T10:00:00.000Z'),
    currentStatus: 3,
    currentReturnComment: 'Bitte Menge pruefen.',
  }), true);
  assert.equal(shouldNotifyRework({ previousStatus: 1, currentStatus: 1 }), false);
});
