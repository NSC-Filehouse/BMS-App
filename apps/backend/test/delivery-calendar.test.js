const test = require('node:test');
const assert = require('node:assert/strict');

const {
  checkDeliveryDates,
  getNextWorkingDate,
  isWeekendDate,
  normalizeCountryCode,
  resolveHolidayProfile,
} = require('../src/delivery-calendar');

function holidayRow(date, validityKey, holidayText) {
  return {
    activeDate: date,
    holidayId: holidayText,
    holidayText,
    [validityKey]: 1,
  };
}

test('recognizes weekends without a holiday scope', () => {
  assert.equal(isWeekendDate('2026-09-12'), true);
  assert.equal(isWeekendDate('2026-09-14'), false);
  assert.deepEqual(checkDeliveryDates(['2026-09-12'], null, []), [{
    date: '2026-09-12',
    isWeekend: true,
    isHoliday: false,
    holidayId: null,
    holidayText: null,
    halfDay: false,
    scopeKnown: false,
    showHint: false,
    profile: null,
    profileName: null,
    suggestedDate: '2026-09-14',
  }]);
});

test('resolves German states and foreign country aliases', () => {
  assert.equal(resolveHolidayProfile('D', 'Bayern').key, 'DE-BY');
  assert.equal(resolveHolidayProfile('DE', 'BY').validityKey, 'validity02');
  assert.equal(resolveHolidayProfile('B', '').key, 'BE');
  assert.equal(resolveHolidayProfile('DK', '').key, 'DK');
  assert.equal(resolveHolidayProfile('F', '').key, 'FR');
  assert.equal(resolveHolidayProfile('DE', ''), null);
  assert.equal(resolveHolidayProfile('NL', ''), null);
  assert.equal(normalizeCountryCode('Deutschland'), 'DE');
});

test('checks the selected profile and moves an automatic date forward', () => {
  const rows = [
    holidayRow('2026-09-14', 'validity02', 'Bayerischer Feiertag'),
    holidayRow('2026-09-15', 'validity17', 'Belgischer Feiertag'),
  ];
  const profile = resolveHolidayProfile('DE', 'Bayern');
  const [status] = checkDeliveryDates(['2026-09-14'], profile, rows);

  assert.equal(status.isHoliday, true);
  assert.equal(status.holidayText, 'Bayerischer Feiertag');
  assert.equal(status.scopeKnown, true);
  assert.equal(status.suggestedDate, '2026-09-15');
  assert.equal(getNextWorkingDate('2026-09-14', profile, rows), '2026-09-15');
});

test('uses next-year holiday dates from the same table row', () => {
  const profile = resolveHolidayProfile('BE', '');
  const rows = [{
    nextDate: '2027-01-04',
    holidayId: 1,
    holidayText: 'Belgischer Feiertag',
    validity17: 1,
  }];
  const [status] = checkDeliveryDates(['2027-01-04'], profile, rows);
  assert.equal(status.isHoliday, true);
  assert.equal(status.suggestedDate, '2027-01-05');
});
