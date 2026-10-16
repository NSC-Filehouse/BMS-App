const test = require('node:test');
const assert = require('node:assert/strict');
const { pilotFeaturesForIdentity } = require('../src/pilot-features');

test('pilot features belong to the three verified employee identities', () => {
  for (const [shortCode, personNumber, userId] of [
    ['AKI', 1, 'Kimaz'], ['MFR', 130, 'M.Frank'], ['NSC', 227, 'n.schroeder'],
  ]) {
    assert.deepEqual(pilotFeaturesForIdentity({ shortCode, personNumber, userId, active: true }), {
      purchaseOrders: true, options: true, forecast: true, frupackGroupVl: true,
    });
  }
});

test('a matching short code alone never opens pilot features', () => {
  for (const identity of [
    { shortCode: 'AKI', personNumber: 999, userId: 'other', active: true },
    { shortCode: 'MFR', personNumber: 130, userId: 'other', active: true },
    { shortCode: 'NSC', personNumber: 227, userId: 'n.schroeder', active: false },
    null,
  ]) {
    assert.deepEqual(pilotFeaturesForIdentity(identity), {
      purchaseOrders: false, options: false, forecast: false, frupackGroupVl: false,
    });
  }
});

test('active employees of every Frupack company receive group VL without other pilot features', () => {
  for (const mainCompanyId of [3, 10, 11, 12, 19]) {
    assert.deepEqual(pilotFeaturesForIdentity({ mainCompanyId, shortCode: 'TST', active: true }), {
      purchaseOrders: false, options: false, forecast: false, frupackGroupVl: true,
    });
    assert.equal(pilotFeaturesForIdentity({ mainCompanyId, active: false }).frupackGroupVl, false);
  }
  for (const mainCompanyId of [null, undefined, '', 0, 2, 9, 99]) {
    assert.equal(pilotFeaturesForIdentity({ mainCompanyId, active: true }).frupackGroupVl, false);
  }
});
