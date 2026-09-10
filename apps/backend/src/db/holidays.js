const config = require('../config');
const { runSQLQuerySqlServer } = require('./access');

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { loadedAt: 0, rows: null, promise: null };

const HOLIDAY_SQL = `
  SELECT
    [Feiertag_ID] AS holidayId,
    [FeiertagText] AS holidayText,
    CONVERT(char(10), [DatumAktJahr], 23) AS activeDate,
    CONVERT(char(10), [DatumNextJahr], 23) AS nextDate,
    [HalbeTag] AS halfDay,
    [Gültig01] AS validity01,
    [Gültig02] AS validity02,
    [Gültig03] AS validity03,
    [Gültig04] AS validity04,
    [Gültig05] AS validity05,
    [Gültig06] AS validity06,
    [Gültig07] AS validity07,
    [Gültig08] AS validity08,
    [Gültig09] AS validity09,
    [Gültig10] AS validity10,
    [Gültig11] AS validity11,
    [Gültig12] AS validity12,
    [Gültig13] AS validity13,
    [Gültig14] AS validity14,
    [Gültig15] AS validity15,
    [Gültig16] AS validity16,
    [Gültig17] AS validity17,
    [Gültig18] AS validity18,
    [Gültig19] AS validity19,
    [Gültig20] AS validity20
  FROM [dbo].[tblFeiertage]
`;

async function loadHolidayRows({ force = false, queryRunner = runSQLQuerySqlServer } = {}) {
  const now = Date.now();
  if (!force && Array.isArray(cache.rows) && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache.rows;
  }
  if (!force && cache.promise) return cache.promise;

  cache.promise = queryRunner(config.sql.database, HOLIDAY_SQL, [])
    .then((rows) => {
      cache = { loadedAt: Date.now(), rows: Array.isArray(rows) ? rows : [], promise: null };
      return cache.rows;
    })
    .catch((error) => {
      cache.promise = null;
      throw error;
    });
  return cache.promise;
}

function clearHolidayRowsCache() {
  cache = { loadedAt: 0, rows: null, promise: null };
}

module.exports = {
  CACHE_TTL_MS,
  HOLIDAY_SQL,
  clearHolidayRowsCache,
  loadHolidayRows,
};
