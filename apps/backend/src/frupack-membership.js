const FRUPACK_MANDANT_IDS = Object.freeze([3, 10, 11, 12, 19]);

// mainCompanyId is ma_FirmaID from the SSO-resolved FX employee record.
function isFrupackEmployee(identity) {
  return identity?.active === true
    && FRUPACK_MANDANT_IDS.includes(Number(identity.mainCompanyId));
}

module.exports = { FRUPACK_MANDANT_IDS, isFrupackEmployee };
