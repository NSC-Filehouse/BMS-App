// These identities are resolved from the active FX employee record using the
// SSO SAM account. Matching all fields avoids granting access to a reused code.
const PILOT_USERS = [
  { shortCode: 'AKI', personNumber: 1, userId: 'kimaz' },
  { shortCode: 'MFR', personNumber: 130, userId: 'm.frank' },
  { shortCode: 'NSC', personNumber: 227, userId: 'n.schroeder' },
];

function pilotFeaturesForIdentity(identity) {
  const shortCode = String(identity?.shortCode || '').trim().toUpperCase();
  const userId = String(identity?.userId || '').trim().toLowerCase();
  const personNumber = Number(identity?.personNumber);
  const enabled = identity?.active === true && PILOT_USERS.some((user) => (
    user.shortCode === shortCode && user.personNumber === personNumber && user.userId === userId
  ));
  return {
    purchaseOrders: enabled,
    options: enabled,
    forecast: enabled,
  };
}

module.exports = { pilotFeaturesForIdentity };
