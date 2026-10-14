const test = require('node:test');
const assert = require('node:assert/strict');
const { SALES_MANDANT_IDS } = require('../src/config/sales-mandants');
const config = require('../src/config');

const directory = [
  [2, 'LF0004'], [3, '20401'], [4, '200957'], [5, 'LF0400'], [7, '14104'],
  [9, '200961'], [10, 'DK1111'], [11, 'BE2880'], [12, 'FR0341'], [19, 'SE1111'],
].map(([mandantId, customerId]) => ({ mandantId, customerId }));
let directoryRows = directory;
let directoryError = false;
let customerRow = null;
const directoryCalls = [];

require.cache[require.resolve('../src/db/access')] = { exports: {
  runSQLQuerySqlServer: async (database, sql, params) => {
    directoryCalls.push({ database, sql, params });
    if (directoryError) throw new Error('directory unavailable');
    return directoryRows;
  },
  runSQLQueryAccess: async (database, sql) => {
    if (sql.includes('FROM [dbo].[tblKunden]')) return customerRow ? [customerRow] : [];
    if (sql.includes('tblKun_KreditLimit')) return [{ amount: 0, unpaidInvoicesAmount: 100 }];
    return [];
  },
} };

const { loadOwnSalesMandantId, isOwnSalesMandantCustomer } = require('../src/db/own-sales-mandants');
const { loadCustomerCreditContext, isCreditLimitRequestRequired } = require('../src/credit-limit');

test('recognizes all ten sales-company IDs regardless of casing, names, VAT or user permissions', async () => {
  directoryCalls.length = 0;
  for (const row of directory) {
    const customer = { customerId: ` ${row.customerId.toLowerCase()} `, interCompany: true };
    customer.ownSalesMandantId = await loadOwnSalesMandantId(customer);
    assert.equal(customer.ownSalesMandantId, row.mandantId);
    assert.equal(isOwnSalesMandantCustomer(customer), true);
    assert.equal(isCreditLimitRequestRequired({ customer, credit: { amount: 0 } }, 50000), false);
  }
  assert.ok(directoryCalls.every((call) => call.database === config.sql.database));
  assert.ok(directoryCalls.every((call) => JSON.stringify(call.params) === JSON.stringify(SALES_MANDANT_IDS)));
});

test('requires both a sales-company number and the InterCompany flag', async () => {
  for (const interCompany of [false, undefined, '0']) {
    assert.equal(await loadOwnSalesMandantId({ customerId: '14104', interCompany }), null);
  }
  for (const customerId of ['200995', '200955', '22010', '00000', '0020401', 'external']) {
    assert.equal(await loadOwnSalesMandantId({ customerId, interCompany: true }), null);
  }
  assert.equal(isOwnSalesMandantCustomer({ ownSalesMandantId: 7, interCompany: false }), false);
  assert.equal(isOwnSalesMandantCustomer({ ownSalesMandantId: 1, interCompany: true }), false);
});

test('ambiguous directory entries and excluded mandants never grant an exemption', async () => {
  try {
    directoryRows = [...directory, { mandantId: 5, customerId: 'lf0004' }, { mandantId: 1, customerId: '200995' }];
    assert.equal(await loadOwnSalesMandantId({ customerId: 'LF0004', interCompany: true }), null);
    assert.equal(await loadOwnSalesMandantId({ customerId: '200995', interCompany: true }), null);
  } finally {
    directoryRows = directory;
  }
});

test('fresh customer context supplies the exemption and flag zero keeps ordinary credit checks', async () => {
  const database = { firmaId: 3, databaseName: 'BMS.FRU' };
  customerRow = { customerId: '14104', interCompany: 1, name1: 'Different CHG name' };
  let context = await loadCustomerCreditContext(database, '14104');
  assert.equal(context.customer.ownSalesMandantId, 7);
  assert.equal(isCreditLimitRequestRequired(context, 50000), false);
  customerRow = { customerId: '14104', interCompany: '0' };
  context = await loadCustomerCreditContext(database, '14104');
  assert.equal(context.customer.interCompany, false);
  assert.equal(context.customer.ownSalesMandantId, null);
  assert.equal(isCreditLimitRequestRequired(context, 50000), true);
});

test('directory read failure retains the customer credit data and ordinary checks', async () => {
  directoryError = true;
  customerRow = { customerId: 'LF0400', interCompany: true };
  try {
    const context = await loadCustomerCreditContext({ databaseName: 'BMS.PLA' }, 'LF0400');
    assert.equal(context.customer.ownSalesMandantId, null);
    assert.equal(context.credit.amount, 0);
    assert.equal(context.credit.unpaidInvoicesAmount, 100);
    assert.equal(isCreditLimitRequestRequired(context, 50000), true);
  } finally {
    directoryError = false;
  }
});
