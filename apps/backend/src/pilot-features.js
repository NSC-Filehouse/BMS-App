const { isFrupackEmployee } = require('./frupack-membership');
const { hasExecutiveAccess } = require('./executive-access');
const { AKI, PBO, KMU, matchesActiveIdentity, hasDelegatedAkiReadAccess } = require('./aki-read-access');

// These identities are resolved from the active FX employee record using the
// SSO SAM account. Matching all fields avoids granting access to a reused code.
const OFFER_ORDER_USER = { shortCode: 'NSC', personNumber: 227, userId: 'n.schroeder' };
const PILOT_USERS = [
  AKI,
  { shortCode: 'MFR', personNumber: 130, userId: 'm.frank' },
  OFFER_ORDER_USER,
];

function pilotFeaturesForIdentity(identity, { readOnly = true } = {}) {
  const matches = account => matchesActiveIdentity(identity, account);
  const enabled = hasExecutiveAccess(identity) || PILOT_USERS.some(matches);
  const akiReadAccess = readOnly && hasDelegatedAkiReadAccess(identity);
  const visibleFeatures = enabled || akiReadAccess;
  const purchasingEnabled = enabled || matches(KMU) || matches(PBO);
  const orderPurchasingEnabled = PILOT_USERS.some(matches) || matches(KMU);
  return {
    offers: visibleFeatures || orderPurchasingEnabled,
    offerToOrder: orderPurchasingEnabled,
    linkedProcurement: orderPurchasingEnabled,
    purchaseOrders: purchasingEnabled || akiReadAccess,
    options: purchasingEnabled || akiReadAccess,
    optionsVlPreview: visibleFeatures,
    forecast: visibleFeatures,
    frupackGroupVl: visibleFeatures || isFrupackEmployee(identity),
  };
}

function canReadProcurement(identity) {
  return pilotFeaturesForIdentity(identity).linkedProcurement || hasDelegatedAkiReadAccess(identity);
}

module.exports = { pilotFeaturesForIdentity, canReadProcurement };
