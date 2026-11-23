const EXECUTIVES = [
  { shortCode: 'DME', personNumber: 2, userId: 'meyer' },
  { shortCode: 'SGÖ', personNumber: 209, userId: 'goede' },
  { shortCode: 'MAW', personNumber: 298, userId: 'm.winkler' },
  { shortCode: 'OBA', personNumber: 276, userId: 'bader' },
];

const TEST_MANDANT_ID = 0;
const TEST_MANDANT_CODE = 'TES';

function hasExecutiveAccess(identity) {
  if (identity?.active !== true) return false;
  const shortCode = String(identity.shortCode || '').trim().toUpperCase();
  const personNumber = Number(identity.personNumber);
  const userId = String(identity.userId || '').trim().toLowerCase();
  return EXECUTIVES.some((executive) => (
    executive.shortCode === shortCode
    && executive.personNumber === personNumber
    && executive.userId === userId
  ));
}

function isTestMandant(database) {
  return String(database?.firmaId ?? '').trim() === String(TEST_MANDANT_ID)
    || String(database?.shortName ?? '').trim().toUpperCase() === TEST_MANDANT_CODE;
}

// Shared records can be reached without switching to their source mandant.
function excludeTestMandantSql(identity, column) {
  return hasExecutiveAccess(identity) ? `AND ${column} <> ${TEST_MANDANT_ID}` : '';
}

module.exports = { hasExecutiveAccess, isTestMandant, excludeTestMandantSql, TEST_MANDANT_ID, TEST_MANDANT_CODE };
