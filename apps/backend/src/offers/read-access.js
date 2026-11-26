const { hasExecutiveAccess } = require('../executive-access');
const { AKI, matchesActiveIdentity, hasDelegatedAkiReadAccess } = require('../aki-read-access');

const offerReadAccess = [
  AKI,
  { shortCode: 'NSC', personNumber: 227, userId: 'n.schroeder' },
];

function canViewAllOffers({ userIdentity }) {
  return hasExecutiveAccess(userIdentity) || hasDelegatedAkiReadAccess(userIdentity)
    || offerReadAccess.some(account => matchesActiveIdentity(userIdentity, account));
}

module.exports = { canViewAllOffers };
