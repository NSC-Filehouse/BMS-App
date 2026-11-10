const test = require('node:test');
const assert = require('node:assert/strict');
const dotenv = require('dotenv');
const { normalizeDailyVlSenderName } = require('../src/daily-vl-sender');

const expected = 'Verf\u00fcgbarkeitsliste - MLHolding GmbH';

test('repairs the sender name observed in the delivered Westpoly mail', () => {
  const ansiFile = Buffer.from(`BMS_DAILY_VL_MAIL_FROM_DISPLAY_NAME="${expected}"`, 'latin1');
  const parsed = dotenv.parse(ansiFile);
  assert.ok(parsed.BMS_DAILY_VL_MAIL_FROM_DISPLAY_NAME.includes('\uFFFD'));
  assert.equal(normalizeDailyVlSenderName(parsed.BMS_DAILY_VL_MAIL_FROM_DISPLAY_NAME), expected);
});

test('an ASCII-only sender configuration survives both ANSI and UTF-8 copies', () => {
  const envLine = 'BMS_DAILY_VL_MAIL_FROM_DISPLAY_NAME="Verf\\u00fcgbarkeitsliste - MLHolding GmbH"';
  for (const encoding of ['latin1', 'utf8']) {
    const parsed = dotenv.parse(Buffer.from(envLine, encoding));
    assert.equal(normalizeDailyVlSenderName(parsed.BMS_DAILY_VL_MAIL_FROM_DISPLAY_NAME), expected);
  }
});

test('keeps correct Unicode and custom sender names without changing other characters', () => {
  for (const name of [expected, 'Andere Liste - M\u00fcller GmbH', 'Custom list', 'Name with \uFFFD elsewhere']) {
    assert.equal(normalizeDailyVlSenderName(` ${name} `), name);
  }
  assert.equal(normalizeDailyVlSenderName(undefined), '');
  assert.equal(normalizeDailyVlSenderName(''), '');
});

test('repairs the double-decoded spelling of the known VL sender word', () => {
  assert.equal(normalizeDailyVlSenderName('Verf\u00C3\u00BCgbarkeitsliste - MLHolding GmbH'), expected);
});
