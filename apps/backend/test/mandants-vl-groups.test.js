const test = require('node:test');
const assert = require('node:assert/strict');
let identity;
const mandants = [{ firmaId: 3, name: 'Frupack' }, { firmaId: 10, name: 'FrupackNordic' }, { firmaId: 2, name: 'MLPlastics' }];
const databasesPath = require.resolve('../src/db/databases');
require.cache[databasesPath] = { exports: {
  ...require(databasesPath),
  getMandantsForIdentity: async () => mandants,
} };
const usersPath = require.resolve('../src/db/users');
require.cache[usersPath] = { exports: {
  ...require(usersPath),
  getUserIdentityFromRequestContext: async () => identity,
} };
const router = require('../src/routes/mandants.routes');
function request() {
  return new Promise((resolve, reject) => {
    const res = { status: () => res, json: resolve };
    router.stack.find((layer) => layer.route?.path === '/mandants').route.stack.at(-1).handle({ headers: {} }, res, reject);
  });
}

test('membership metadata contains only authorized Frupack IDs and the group option remains pilot-gated', async () => {
  identity = { shortCode: 'NSC', personNumber: 227, userId: 'n.schroeder', active: true, mainCompanyId: 2 };
  const pilot = await request();
  assert.deepEqual(pilot.meta.vlGroupMemberships['frupack-group'], [3, 10]);
  assert.equal(pilot.meta.vlGroups.length, 1);
  assert.equal(pilot.meta.mainMandantId, 2);
  identity = { shortCode: 'DRE', active: true, mainCompanyId: 3 };
  const normal = await request();
  assert.deepEqual(normal.meta.vlGroupMemberships['frupack-group'], [3, 10]);
  assert.deepEqual(normal.meta.vlGroups, []);
  assert.equal(normal.meta.mainMandantId, 3);
});
