const AKI = { shortCode: 'AKI', personNumber: 1, userId: 'kimaz' };
const PBO = { shortCode: 'PBO', personNumber: 81, userId: 'bohmbach' };
const KMU = { shortCode: 'KMU', personNumber: 126, userId: 'musah' };
const DELEGATES = [PBO, KMU];

function matchesActiveIdentity(identity, account) {
  return identity?.active === true
    && String(identity.shortCode ?? '').trim().toUpperCase() === account.shortCode
    && Number(identity.personNumber) === account.personNumber
    && String(identity.userId ?? '').trim().toLowerCase() === account.userId;
}

function hasDelegatedAkiReadAccess(identity) {
  return DELEGATES.some(account => matchesActiveIdentity(identity, account));
}

module.exports = { AKI, PBO, KMU, matchesActiveIdentity, hasDelegatedAkiReadAccess };
