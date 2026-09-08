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

test('rejects headers that identify different employees', () => {
  assert.throws(
    () => resolveIdentityFromRows([
      { ...danielRow, email: 'other@frupack.de' },
      { personNumber: 95, userId: 'rehder', email: 'dre@frupack.de', shortCode: 'OTHER' },
    ], {
      mail: 'dre@frupack.de',
      principalHeader: 'other@frupack.de',
      samAccountName: 'rehder',
    }),
    (error) => error?.details?.code === 'AUTH_IDENTITY_CONFLICT',
  );
});

test('rejects an ambiguous duplicate mail address without a matching login', () => {
  assert.throws(
    () => resolveIdentityFromRows([
      { personNumber: 83, userId: 'wbind', email: 'binder@mlpolymer.de', shortCode: 'WBI' },
      { personNumber: 106, userId: 'aharder', email: 'binder@mlpolymer.de', shortCode: 'AHA' },
    ], { mail: 'binder@mlpolymer.de' }),
    (error) => error?.details?.code === 'AUTH_IDENTITY_CONFLICT',
  );
});
