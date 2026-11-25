const { hasExecutiveAccess } = require('../executive-access');

const offerReadAccess = [
  { shortCode: 'AKI', personNumber: 1, userId: 'kimaz' },
  { shortCode: 'NSC', personNumber: 227, userId: 'n.schroeder' },
];

function canViewAllOffers({ userIdentity }) {
  return hasExecutiveAccess(userIdentity) || (
    userIdentity?.active === true && offerReadAccess.some(identity => (
      userIdentity.shortCode?.trim().toUpperCase() === identity.shortCode
      && Number(userIdentity.personNumber) === identity.personNumber
      && userIdentity.userId?.trim().toLowerCase() === identity.userId
    ))
  );
}

module.exports = { canViewAllOffers };
