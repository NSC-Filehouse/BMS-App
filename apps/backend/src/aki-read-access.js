const AKI = { shortCode: 'AKI', personNumber: 1, userId: 'kimaz' };
const DELEGATES = [
  { shortCode: 'PBO', personNumber: 81, userId: 'bohmbach' },
  { shortCode: 'KMU', personNumber: 126, userId: 'musah' },
];

function matchesActiveIdentity(identity, account) {
  return identity?.active === true
    && String(identity.shortCode ?? '').trim().toUpperCase() === account.shortCode
    && Number(identity.personNumber) === account.personNumber
    && String(identity.userId ?? '').trim().toLowerCase() === account.userId;
}

function hasDelegatedAkiReadAccess(identity) {
  return DELEGATES.some(account => matchesActiveIdentity(identity, account));
}

module.exports = { AKI, matchesActiveIdentity, hasDelegatedAkiReadAccess };
