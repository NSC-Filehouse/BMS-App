const test = require('node:test');
const assert = require('node:assert/strict');
const accessPath = require.resolve('../src/db/access');
const historyPath = require.resolve('../src/db/customer-creation-history');
const sqlCalls = [];
const privateCalls = [];
let customerRows = [];
let privateMatch = false;
const countries = { D: { iso: 'DE', euLand: true }, USA: { iso: 'US', euLand: false }, CH: { iso: 'CH', euLand: false }, BAD: { iso: '', euLand: false } };
require.cache[accessPath] = { exports: {
  runSQLQueryAccess: async () => customerRows,
  runSQLQuerySqlServer: async (database, sql, params) => { sqlCalls.push({ database, params }); return countries[params[0]] ? [countries[params[0]]] : []; },
} };
require.cache[historyPath] = { exports: {
  isAppCreatedPrivateCustomer: async (...args) => { privateCalls.push(args); return privateMatch; },
} };
const { resolveCustomerOrderRequirements, loadCustomerOrderRequirements } = require('../src/db/customer-order-requirements');
const database = { shortName: 'FRU' };
const customer = (country = 'D') => ({ kd_KdNR: '12345', kd_Name1: 'Müller', kd_LK: country, kd_RG_Email: 'invoice@example.com', kd_UST_Ident_Nr: '' });

test('EU companies still need VAT; a positive app private-person record exempts the exact ERP customer', async () => {
  privateMatch = false;
  assert.deepEqual((await resolveCustomerOrderRequirements(database, customer())).missingFields, ['vatId']);
  privateMatch = true;
  const result = await resolveCustomerOrderRequirements(database, customer());
  assert.equal(result.privatePerson, true);
  assert.deepEqual(result.missingFields, []);
  assert.deepEqual(privateCalls.at(-1), [database, '12345', 'Müller', 'DE']);
});
test('known third countries may omit VAT, while invoice email remains mandatory', async () => {
  for (const code of ['USA', 'CH']) {
    const result = await resolveCustomerOrderRequirements(database, { ...customer(code), kd_RG_Email: ' ' });
    assert.equal(result.vatIdRequired, false);
    assert.deepEqual(result.missingFields, ['invoiceEmail']);
  }
  assert.ok(sqlCalls.every((entry) => entry.database === 'BMS'));
});
test('missing, unknown or corrupt country data never accidentally exempts VAT', async () => {
  for (const code of ['', 'ZZ', 'BAD']) {
    assert.deepEqual((await resolveCustomerOrderRequirements(database, customer(code))).missingFields, ['vatId']);
  }
});
test('a supplied VAT ID skips classification queries, and missing customers remain distinguishable', async () => {
  const queries = sqlCalls.length;
  const result = await resolveCustomerOrderRequirements(database, { ...customer(), kd_UST_Ident_Nr: 'DE123456789' });
  assert.deepEqual(result.missingFields, []);
  assert.equal(sqlCalls.length, queries);
  customerRows = [];
  assert.equal((await loadCustomerOrderRequirements(database, 'unknown')).customerFound, false);
  customerRows = [customer('USA')];
  assert.equal((await loadCustomerOrderRequirements(database, '12345')).vatIdRequired, false);
});
