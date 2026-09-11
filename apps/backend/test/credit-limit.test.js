const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateAvailableCredit,
  calculateTempOrderValue,
  formatCreditLimitRequestBody,
  hasBankDetails,
  isWithinCooldown,
  roundCreditLimit,
} = require('../src/credit-limit');
const config = require('../src/config');
const { queueCreditLimitMails } = require('../src/db/credit-limit-request-outbox');

test('calculates available credit from unpaid invoices and keeps open orders separate', () => {
  assert.deepEqual(calculateAvailableCredit({
    amount: 10000,
    unpaidInvoicesAmount: 1250.5,
    openOrdersAmount: 3000,
  }), {
    amount: 10000,
    unpaidInvoicesAmount: 1250.5,
    openOrdersAmount: 3000,
    availableAmount: 8749.5,
  });
});

test('keeps available credit negative when unpaid invoices exceed the limit', () => {
  assert.equal(calculateAvailableCredit({
    amount: 1000,
    unpaidInvoicesAmount: 1100,
    openOrdersAmount: 200,
  }).availableAmount, -100);
});

test('returns no available amount when no credit limit is configured', () => {
  assert.deepEqual(calculateAvailableCredit({
    amount: null,
    unpaidInvoicesAmount: 100,
    openOrdersAmount: 200,
  }), {
    amount: null,
    unpaidInvoicesAmount: 100,
    openOrdersAmount: 200,
    availableAmount: null,
  });
});

test('calculates temp-order value from kg and EUR per tonne', () => {
  assert.equal(calculateTempOrderValue([
    { amountInKg: 100000, price: 1230 },
    { amountInKg: 50000, price: 1100 },
  ]), 178000);
});

test('rounds requested credit limits using the graduated business steps', () => {
  assert.equal(roundCreditLimit(323000), 350000);
  assert.equal(roundCreditLimit(951), 1000);
  assert.equal(roundCreditLimit(10001), 15000);
  assert.equal(roundCreditLimit(100001), 150000);
});

test('detects bank details and suppresses repeated requests during the cooldown', () => {
  assert.equal(hasBankDetails({ iban: 'DE123' }), true);
  assert.equal(hasBankDetails({ iban: '', bankName: '', accountNumber: '', bankInfo: '' }), false);
  assert.equal(isWithinCooldown('2026-06-01T00:00:00.000Z', new Date('2026-09-01T00:00:00.000Z'), 6), true);
  assert.equal(isWithinCooldown('2025-12-01T00:00:00.000Z', new Date('2026-09-01T00:00:00.000Z'), 6), false);
});

test('credit-limit mail body contains the legal customer identity and exposure', () => {
  const body = formatCreditLimitRequestBody({
    mandantName: 'Mandant GmbH',
    mandantShortName: 'MFL',
    companyId: 7,
    orderId: 42,
    customer: {
      customerId: 'K-1',
      legalName: 'ER&GE GmbH',
      street: 'Hafenstraße 1',
      postalCode: '20095',
      city: 'Hamburg',
      country: 'DE',
      vatId: 'DE123456789',
    },
    currentOrderAmount: 323000,
    openTempOrders: [{ amount: 1000 }],
    openOrders: [{ amount: 2000 }],
    unpaidInvoicesAmount: 500,
    requestedLimit: 350000,
    requestedAt: '2026-09-11T10:00:00.000Z',
  });

  assert.match(body, /ER&GE GmbH/);
  assert.match(body, /Hafenstraße 1/);
  assert.match(body, /DE123456789/);
  assert.match(body, /350\.000,00 EUR/);
  assert.match(body, /326\.000,00 EUR/);
});

test('queues one request and suppresses the next request for the same customer', async () => {
  const previousEnabled = config.creditLimitMail.enabled;
  const previousCooldown = config.creditLimitMail.cooldownMonths;
  config.creditLimitMail.enabled = true;
  config.creditLimitMail.cooldownMonths = 6;

  const nowIso = '2026-09-11T10:00:00.000Z';
  const creditContext = {
    customer: {
      customerId: 'K-1',
      legalName: 'ER&GE GmbH',
      street: 'Hafenstraße 1',
      postalCode: '20095',
      city: 'Hamburg',
      country: 'DE',
      vatId: 'DE123456789',
      iban: 'DE123',
    },
    credit: {
      amount: 0,
      unpaidInvoicesAmount: 0,
    },
    openOrders: [],
  };

  const runQueue = async (stateRows) => {
    const calls = [];
    let nextId = 10;
    const query = async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('SELECT TOP 1') && sql.includes('CreditLimitRequestState')) {
        return { rows: stateRows };
      }
      if (sql.includes('INSERT INTO') && sql.includes('CreditLimitRequestState')) {
        return { rows: [{ id: 1 }] };
      }
      if (sql.includes('INSERT INTO') && sql.includes('CreditLimitMailOutbox')) {
        return { rows: [{ id: nextId++ }] };
      }
      return { rows: [] };
    };
    const result = await queueCreditLimitMails({
      query,
      companyId: 7,
      customerId: 'K-1',
      orderId: 42,
      currentOrderAmount: 323000,
      openTempOrders: [],
      creditContext,
      primaryAdEmail: '',
      mandantName: 'Mandant GmbH',
      mandantShortName: 'MFL',
      nowIso,
      creditTo: ['Kimaz@mlplastics.de', 'Petschler@mlplastics.de'],
      creditCc: ['Meyer@mlplastics.de', 'flasch@chg-thermoplast.de'],
      testRecipient: '',
    });
    return { calls, result };
  };

  try {
    const first = await runQueue([]);
    assert.equal(first.result.creditRequest.status, 'queued');
    assert.equal(first.result.creditRequest.requestedLimit, 350000);
    const insert = first.calls.find((call) => call.sql.includes('INSERT INTO') && call.sql.includes('CreditLimitMailOutbox'));
    assert.deepEqual(JSON.parse(insert.params[4]), ['Kimaz@mlplastics.de', 'Petschler@mlplastics.de']);
    assert.deepEqual(JSON.parse(insert.params[5]), ['Meyer@mlplastics.de', 'flasch@chg-thermoplast.de']);

    const second = await runQueue([{
      id: 1,
      lastRequestedAt: nowIso,
      lastRequestedLimit: 350000,
      lastExposureAmount: 323000,
      lastCreditMailStatus: 'sent',
    }]);
    assert.equal(second.result.creditRequest.status, 'suppressed_cooldown');
    assert.equal(second.calls.some((call) => call.sql.includes('INSERT INTO')), false);
  } finally {
    config.creditLimitMail.enabled = previousEnabled;
    config.creditLimitMail.cooldownMonths = previousCooldown;
  }
});
