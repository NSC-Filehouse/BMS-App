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

test('uses the forwarded identity as a final fallback', () => {
  const result = getUserContextFromRequest(request({
    'x-forwarded-user': 'filehouse',
  }));

  assert.equal(result.email, 'filehouse');
  assert.equal(result.principalName, 'filehouse');
});
