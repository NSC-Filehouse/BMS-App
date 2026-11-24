// Keep this mapping aligned with SanctionChecker's mandant-specific GF routing.
// The BMS credit-limit workflow uses the same business recipients, but keeps
// the configuration local so it does not need a runtime dependency on that app.
const mandantUsers = Object.freeze({
  BBO: [12],
  DZI: [2],
  HZI: [5],
  MFL: [7],
  PAL: [9],
  PBA: [2, 15, 16],
  RHE: [7],
  RSC: [12],
  SJE: [10, 19],
});

const emailMapping = Object.freeze({
  AKI: 'Kimaz@mlplastics.de',
  BBO: 'bourbon@frupack.fr',
  DZI: 'Zimmermann@mlplastics.de',
  DME: 'Meyer@mlplastics.de',
  MFR: 'm.frank@filehouse.net',
  MMÜ: 'Mueller@mlplastics.de',
  MWI: 'm.winkler@mlholding.org',
  NSC: 'n.schroeder@filehouse.net',
  PBA: 'BAessler@mlplastics.de',
  PBO: 'Bohmbach@frupack.de',
  SDE: 'Demir@chg-thermoplast.de',
  SGÖ: 'Goede@mlholding.org',
  FRÖ: 'Roeder@mlplastics.de',
  HZI: 'ziburt@mlpolymer.de',
  MFL: 'flasch@chg-thermoplast.de',
  PAL: 'altendorf@westpoly.de',
  RHE: 'hennicken@chg-thermoplast.de',
  RSC: 'Schultz@frupack.fr',
  SJE: 'jensen@frupack.dk',
});

function normalizeCode(value) {
  return String(value || '').trim().normalize('NFC').toLocaleUpperCase('de-DE');
}

function getGfsForMandant(mandantId) {
  const id = Number(mandantId);
  if (!Number.isFinite(id)) return [];
  return Object.entries(mandantUsers)
    .filter(([, ids]) => ids.includes(id))
    .map(([code]) => code);
}

function getEmailForUserCode(userCode) {
  return emailMapping[normalizeCode(userCode)] || '';
}

function uniqueCaseInsensitive(values) {
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const text = String(value || '').trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function getEmailsForUserCodes(userCodes) {
  return uniqueCaseInsensitive((userCodes || []).map(getEmailForUserCode));
}

module.exports = {
  emailMapping,
  getEmailForUserCode,
  getEmailsForUserCodes,
  getGfsForMandant,
  mandantUsers,
};
