const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getEmailsForUserCodes,
  getGfsForMandant,
} = require('../src/config/geschaeftsfuehrer');

test('uses the SanctionChecker GF mapping for the BMS mandant', () => {
  assert.deepEqual(getGfsForMandant(15), ['PBA']);
  assert.deepEqual(getEmailsForUserCodes(getGfsForMandant(15)), ['BAessler@mlplastics.de']);
  assert.deepEqual(getGfsForMandant(99999), []);
});
