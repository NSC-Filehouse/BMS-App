const test = require('node:test');
const assert = require('node:assert/strict');

const accessPath = require.resolve('../src/db/access');
const catalog = [
  { firmaId: 0, firma: 'Test', firmaKurz: 'TES' },
  { firmaId: 1, firma: 'MLHolding', firmaKurz: 'HOL' },
  { firmaId: 18, firma: 'Elbpolymer', firmaKurz: 'EPO' },
  { firmaId: 3, firma: 'Frupack', firmaKurz: 'FRU' },
];
const queries = [];
require.cache[accessPath] = { exports: {
  ...require(accessPath),
  canConnectToDatabase: async () => true,
  runSQLQueryFx: async (_db, sql) => sql.includes('AS userGroup')
    ? [{ userGroup: 'GR01' }]
    : [{ firmaId: 0 }, { firmaId: 1 }],
  runSQLQuerySqlServer: async (_db, sql, params) => {
    queries.push({ sql, params });
    if (!sql.includes('AS firmaKurz')) return [];
    return params?.length ? catalog.filter(row => params.includes(row.firmaId)) : catalog;
  },
} };
const { hasExecutiveAccess } = require('../src/executive-access');
const { getMandantsForIdentity, getDatabaseConnectionForIdentity, getDatabaseConnectionForIdentityById } = require('../src/db/databases');
const { getCustomerAccessScope } = require('../src/db/customer-access');
const { pilotFeaturesForIdentity } = require('../src/pilot-features');
const { canCreateCustomer, canRollbackCustomer } = require('../src/customer-creation-policy');
const { loadAppCreatedCustomers, loadRollbackTarget } = require('../src/db/customer-creation-history');
const { loadOffers } = require('../src/options/read');
const { loadOptionSource } = require('../src/options/source');
const { loadOptionPosition } = require('../src/options/purchase-source');

const executives = [
  ['DME', 2, 'Meyer'], ['SGÖ', 209, 'Goede'], ['MAW', 298, 'm.winkler'], ['OBA', 276, 'Bader'],
].map(([shortCode, personNumber, userId]) => ({ shortCode, personNumber, userId, mainCompanyId: 1, active: true }));
const regularMandant = { firmaId: 3, shortName: 'FRU' };
const testMandant = { firmaId: 0, shortName: 'TES' };

test('the four active executives can use every regular mandant and cannot resolve Test by name or ID', async () => {
  for (const identity of executives) {
    assert.equal(hasExecutiveAccess(identity), true);
    assert.equal(hasExecutiveAccess({ ...identity, active: false }), false);
    assert.equal(hasExecutiveAccess({ ...identity, personNumber: 999 }), false);
    assert.equal(hasExecutiveAccess({ ...identity, userId: 'different' }), false);
    assert.equal(hasExecutiveAccess({ ...identity, shortCode: 'OTHER' }), false);
    assert.ok(Object.values(pilotFeaturesForIdentity(identity)).every(Boolean));
    assert.deepEqual((await getMandantsForIdentity(identity)).map(row => row.firmaId).sort(), [1, 3]);
    assert.equal((await getDatabaseConnectionForIdentity(identity, 'Frupack')).firmaId, 3);
    await assert.rejects(getDatabaseConnectionForIdentity(identity, 'Elbpolymer'), { status: 403 });
    await assert.rejects(getDatabaseConnectionForIdentityById(identity, 18), { status: 403 });
    await assert.rejects(getDatabaseConnectionForIdentity(identity, 'Test'), { status: 403 });
    await assert.rejects(getDatabaseConnectionForIdentityById(identity, 0), { status: 403 });
    assert.equal((await getCustomerAccessScope(identity, regularMandant)).isFullAccess, true);
    assert.equal(canCreateCustomer(identity, regularMandant, { enabled: true }), true);
    assert.equal(canCreateCustomer(identity, testMandant, { enabled: true }), false);
    assert.equal(canRollbackCustomer(identity, regularMandant), true);
    assert.equal(canRollbackCustomer(identity, testMandant), false);
  }
  const other = { ...executives.at(-1), userId: 'other' };
  assert.equal(pilotFeaturesForIdentity(other).purchaseOrders, false);
  assert.deepEqual((await getMandantsForIdentity(other)).map(row => row.firmaId).sort(), [0, 1]);
  await assert.rejects(getDatabaseConnectionForIdentityById(other, 3), { status: 403 });
  assert.equal((await getCustomerAccessScope(other, regularMandant)).customerAccess.mode, 'all_assigned_innendienst');
});

test('shared option data and customer rollback targets exclude Test for executives', async () => {
  const identity = executives.at(-1);
  await loadOffers(null, { identity });
  assert.match(queries.at(-1).sql, /AND o\.op_MandantID <> 0/);
  await assert.rejects(loadOptionSource(10, 'file', identity), { status: 404 });
  assert.match(queries.at(-1).sql, /AND o\.op_MandantID <> 0/);
  await assert.rejects(loadOptionPosition(10, 11, null, { identity }), { status: 422 });
  assert.match(queries.at(-1).sql, /AND o\.op_MandantID <> 0/);
  await loadAppCreatedCustomers('FRU', identity);
  assert.deepEqual(queries.at(-1).params, ['FRU', 0, 'TES', 'TES']);
  await loadRollbackTarget('operation', 'FRU', identity);
  assert.match(queries.at(-1).sql, /NOT EXISTS .*CustomerCreationMandant/);
  assert.deepEqual(queries.at(-1).params, ['operation', 'FRU', 0, 'TES', 'TES']);
  await loadRollbackTarget('operation', 'FRU', { shortCode: 'NSC' });
  assert.match(queries.at(-1).sql, /IN \(N'AKI',N'MFR',N'NSC'\)/);
});
