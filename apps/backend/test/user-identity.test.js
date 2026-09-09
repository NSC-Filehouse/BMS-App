const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveIdentityFromRows } = require('../src/db/users');

const danielRow = {
  personNumber: 94,
  userId: 'rehder',
  email: 'dre@frupack.de',
  shortCode: 'DRE',
  givenName: 'Daniel',
  surname: 'Rehder',
  mainCompanyId: 3,
};

test('resolves an identity when principal, mail and SAM name use different values', () => {
  const identity = resolveIdentityFromRows([danielRow], {
    email: 'dre@frupack.de',
    mail: 'dre@frupack.de',
    principalHeader: 'rehder@frupack.de',
    samAccountName: 'rehder',
  });

  assert.equal(identity.personNumber, 94);
  assert.equal(identity.userId, 'rehder');
  assert.equal(identity.email, 'dre@frupack.de');
  assert.equal(identity.shortCode, 'DRE');
});

test('uses SAM as the authority even when mail and principal name differ', () => {
  const identity = resolveIdentityFromRows([
    { ...danielRow, email: 'other@frupack.de' },
  ], {
    mail: 'dre@frupack.de',
    principalHeader: 'other@frupack.de',
    samAccountName: 'rehder',
  });

  assert.equal(identity.personNumber, 94);
  assert.equal(identity.userId, 'rehder');
});

test('does not use an email-only context for request authentication', () => {
  assert.throws(
    () => resolveIdentityFromRows([
      { personNumber: 83, userId: 'wbind', email: 'binder@mlpolymer.de', shortCode: 'WBI' },
      { personNumber: 106, userId: 'aharder', email: 'binder@mlpolymer.de', shortCode: 'AHA' },
    ], { mail: 'binder@mlpolymer.de' }),
    (error) => error?.details?.code === 'AUTH_SAM_ACCOUNT_REQUIRED',
  );
});

test('rejects an unknown SAM account name even when mail matches', () => {
  assert.throws(
    () => resolveIdentityFromRows([danielRow], {
      mail: 'dre@frupack.de',
      samAccountName: 'unknown',
    }),
    (error) => error?.details?.code === 'USER_NOT_FOUND_IN_FX',
  );
});

test('rejects an ambiguous active SAM account name', () => {
  assert.throws(
    () => resolveIdentityFromRows([
      { personNumber: 94, userId: 'rehder', email: 'dre@frupack.de' },
      { personNumber: 95, userId: 'rehder', email: 'other@frupack.de' },
    ], { samAccountName: 'rehder' }),
    (error) => error?.details?.code === 'AUTH_SAM_ACCOUNT_AMBIGUOUS',
  );
});
