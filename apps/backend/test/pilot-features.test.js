const test = require('node:test');
const assert = require('node:assert/strict');
const { pilotFeaturesForIdentity } = require('../src/pilot-features');

test('pilot features belong to the three verified employee identities', () => {
  for (const [shortCode, personNumber, userId] of [
    ['AKI', 1, 'Kimaz'], ['MFR', 130, 'M.Frank'], ['NSC', 227, 'n.schroeder'],
  ]) {
    assert.deepEqual(pilotFeaturesForIdentity({ shortCode, personNumber, userId, active: true }), {
      offers: true, offerToOrder: true, linkedProcurement: true, purchaseOrders: true, options: true, optionsVlPreview: true, forecast: true, frupackGroupVl: true,
    });
  }
});

test('PBO and KMU see the same pilot sections as AKI while keeping their existing action permissions', () => {
  const aki = { shortCode: 'AKI', personNumber: 1, userId: 'kimaz', active: true };
  const pbo = { shortCode: 'PBO', personNumber: 81, userId: 'bohmbach', active: true, mainCompanyId: 3 };
  const kmu = { shortCode: 'KMU', personNumber: 126, userId: 'musah', active: true, mainCompanyId: 3 };
  const expected = pilotFeaturesForIdentity(aki);
  assert.deepEqual(pilotFeaturesForIdentity(kmu), expected);
  assert.deepEqual(pilotFeaturesForIdentity(pbo), { ...expected, offerToOrder: false, linkedProcurement: false });
  assert.deepEqual(pilotFeaturesForIdentity(pbo, { readOnly: false }), {
    offers: false, offerToOrder: false, linkedProcurement: false, purchaseOrders: false, options: false,
    optionsVlPreview: false, forecast: false, frupackGroupVl: true,
  });
  assert.deepEqual(pilotFeaturesForIdentity(kmu, { readOnly: false }), {
    ...expected, optionsVlPreview: false, forecast: false,
  });
});

test('a matching short code alone never opens pilot features', () => {
  for (const identity of [
    { shortCode: 'AKI', personNumber: 999, userId: 'other', active: true },
    { shortCode: 'MFR', personNumber: 130, userId: 'other', active: true },
    { shortCode: 'NSC', personNumber: 228, userId: 'n.schroeder', active: true },
    { shortCode: 'NSC', personNumber: 227, userId: 'other', active: true },
    { shortCode: 'NSC', personNumber: 227, userId: 'n.schroeder', active: false },
    { shortCode: 'PBO', personNumber: 81, userId: 'other', active: true },
    { shortCode: 'PBO', personNumber: 81, userId: 'bohmbach', active: false },
    { shortCode: 'KMU', personNumber: 127, userId: 'musah', active: true },
    { shortCode: 'KMU', personNumber: 126, userId: 'other', active: true },
    { shortCode: 'KMU', personNumber: 126, userId: 'musah', active: false },
    null,
  ]) {
    assert.deepEqual(pilotFeaturesForIdentity(identity), {
      offers: false, offerToOrder: false, linkedProcurement: false, purchaseOrders: false, options: false, optionsVlPreview: false, forecast: false, frupackGroupVl: false,
    });
  }
});

test('active employees of every Frupack company receive group VL without other pilot features', () => {
  for (const mainCompanyId of [3, 10, 11, 12, 19]) {
    assert.deepEqual(pilotFeaturesForIdentity({ mainCompanyId, shortCode: 'TST', active: true }), {
      offers: false, offerToOrder: false, linkedProcurement: false, purchaseOrders: false, options: false, optionsVlPreview: false, forecast: false, frupackGroupVl: true,
    });
    assert.equal(pilotFeaturesForIdentity({ mainCompanyId, active: false }).frupackGroupVl, false);
  }
  for (const mainCompanyId of [null, undefined, '', 0, 2, 9, 99]) {
    assert.equal(pilotFeaturesForIdentity({ mainCompanyId, active: true }).frupackGroupVl, false);
  }
});
