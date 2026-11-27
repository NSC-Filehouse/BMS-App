const test = require('node:test');
const assert = require('node:assert/strict');

const {
  rememberFirstContact,
  SET_CUSTOMER_CONTACT_RANKING_SQL,
  getRankingMessage,
  setCustomerContactRanking,
} = require('../src/db/customer-contact-ranking');

test('remembers only a selected contact when the company has no Top 1', async () => {
  let rows = [{ id: 12, ranking: 2 }, { id: 18, ranking: null }];
  const calls = [];
  const database = { databaseName: 'BMS.TES' };
  const transact = async (name, work) => {
    assert.equal(name, 'BMS.TES');
    return work({ query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('UPDLOCK')) return { rows };
      rows = rows.map(row => row.id === params[1] ? { ...row, ranking: 1 } : row);
      return { rows: [] };
    } });
  };
  assert.equal(await rememberFirstContact(database, '38201', 18, false, transact), false);
  assert.equal(calls.length, 0);
  assert.equal(await rememberFirstContact(database, '38201', 42, true, transact), false);
  assert.equal(await rememberFirstContact(database, '38201', 18, 'true', transact), true);
  assert.equal(await rememberFirstContact(database, '38201', 12, true, transact), false);
  assert.match(calls[1].sql, /UPDLOCK,HOLDLOCK/);
  assert.equal(calls[2].sql, SET_CUSTOMER_CONTACT_RANKING_SQL);
  assert.deepEqual(calls[2].params, ['38201', 18, 1]);
});

test('sets contact rankings only through the ERP procedure', async () => {
  const calls = [];
  const result = await setCustomerContactRanking(
    { databaseName: 'BMS.TES' },
    '38201',
    12345,
    1,
    async (...args) => {
      calls.push(args);
      return [{ meldung: '' }];
    },
  );

  assert.deepEqual(result, { message: '' });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][2], ['38201', 12345, 1]);
  assert.match(calls[0][1], /EXEC\s+\[dbo\]\.\[usp_KundeAnsprech_RankingSetzen\]/i);
  assert.doesNotMatch(calls[0][1], /\bUPDATE\b|INSERT\s+.*EXEC/i);
});

test('passes null to the procedure when a ranking is removed', async () => {
  let params = null;
  await setCustomerContactRanking({}, '38201', 12345, null, async (_database, _sql, values) => {
    params = values;
    return [{ meldung: null }];
  });

  assert.deepEqual(params, ['38201', 12345, null]);
});

test('keeps the German procedure message for direct display', () => {
  assert.equal(
    getRankingMessage([{ meldung: ' Rang 3 ist bei diesem Kunden nicht w\u00e4hlbar. ' }]),
    'Rang 3 ist bei diesem Kunden nicht w\u00e4hlbar.',
  );
  assert.equal(getRankingMessage([]), '');
  assert.match(SET_CUSTOMER_CONTACT_RANKING_SQL, /@KdNr\s*=\s*\?/);
  assert.match(SET_CUSTOMER_CONTACT_RANKING_SQL, /@lfdNR\s*=\s*\?/);
  assert.match(SET_CUSTOMER_CONTACT_RANKING_SQL, /@Rang\s*=\s*\?/);
});
