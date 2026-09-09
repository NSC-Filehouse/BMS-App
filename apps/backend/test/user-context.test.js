const test = require('node:test');
const assert = require('node:assert/strict');

const { getUserContextFromRequest } = require('../src/user-context');

function request(headers) {
  return { headers };
}

test('prefers the real Filehouse mail address over a generic forwarded identity', () => {
  const result = getUserContextFromRequest(request({
    'x-ms-client-mail': 'n.schroeder@filehouse.net',
    'x-forwarded-user': 'filehouse',
  }));

  assert.equal(result.email, 'n.schroeder@filehouse.net');
  assert.equal(result.principalName, 'n.schroeder@filehouse.net');
});

test('keeps a normal principal name when no mail header is available', () => {
  const result = getUserContextFromRequest(request({
    'x-ms-client-principal-name': 'n.schroeder@filehouse.net',
  }));

  assert.equal(result.email, 'n.schroeder@filehouse.net');
  assert.equal(result.principalName, 'n.schroeder@filehouse.net');
});

test('does not treat a non-email forwarded identity as an email', () => {
  const result = getUserContextFromRequest(request({
    'x-forwarded-user': 'filehouse',
  }));

  assert.equal(result.email, null);
  assert.equal(result.principalName, 'filehouse');
});

test('does not treat the SAM account name as an email', () => {
  const result = getUserContextFromRequest(request({
    'x-ms-client-samaccountname': 'rehder',
  }));

  assert.equal(result.email, null);
  assert.equal(result.samAccountName, 'rehder');
  assert.equal(result.principalName, 'rehder');
});

test('keeps the mail and SAM account name separately when SSO sends both', () => {
  const result = getUserContextFromRequest(request({
    'x-ms-client-principal-name': 'rehder@frupack.de',
    'x-ms-client-mail': 'dre@frupack.de',
    'x-ms-client-samaccountname': 'rehder',
  }));

  assert.equal(result.email, 'dre@frupack.de');
  assert.equal(result.mail, 'dre@frupack.de');
  assert.equal(result.principalName, 'rehder@frupack.de');
  assert.equal(result.principalHeader, 'rehder@frupack.de');
  assert.equal(result.samAccountName, 'rehder');
});
