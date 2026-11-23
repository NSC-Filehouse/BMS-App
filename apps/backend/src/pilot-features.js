const { isFrupackEmployee } = require('./frupack-membership');
const { hasExecutiveAccess } = require('./executive-access');

// These identities are resolved from the active FX employee record using the
// SSO SAM account. Matching all fields avoids granting access to a reused code.
const OFFER_ORDER_USER = { shortCode: 'NSC', personNumber: 227, userId: 'n.schroeder' };
const PILOT_USERS = [
  { shortCode: 'AKI', personNumber: 1, userId: 'kimaz' },
  { shortCode: 'MFR', personNumber: 130, userId: 'm.frank' },
  OFFER_ORDER_USER,
];

function pilotFeaturesForIdentity(identity) {
  const shortCode = String(identity?.shortCode || '').trim().toUpperCase();
  const userId = String(identity?.userId || '').trim().toLowerCase();
  const personNumber = Number(identity?.personNumber);
  const matches = (user) => identity?.active === true
    && user.shortCode === shortCode && user.personNumber === personNumber && user.userId === userId;
  const enabled = hasExecutiveAccess(identity) || PILOT_USERS.some(matches);
  return {
    offers: enabled,
    offerToOrder: matches(OFFER_ORDER_USER),
    purchaseOrders: enabled,
    options: enabled,
    optionsVlPreview: enabled,
    forecast: enabled,
    frupackGroupVl: enabled || isFrupackEmployee(identity),
  };
}

module.exports = { pilotFeaturesForIdentity };
