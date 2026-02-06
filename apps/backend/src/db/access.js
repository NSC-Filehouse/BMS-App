const odbc = require('odbc');
const logger = require('../logger');

function escapeAccessValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Date) {
    const iso = value.toISOString().slice(0, 19).replace('T', ' ');
    return `#${iso}#`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const text = String(value).replace(/'/g, "''");
  return `'${text}'`;
}

function inlineParams(query, params) {
  let idx = 0;
  return query.replace(/\?/g, () => {
    const value = params[idx++];
    return escapeAccessValue(value);
  });
}

// Funktion zum Ausfuehren einer SQL-Abfrage auf einer Access-Datenbank
async function runSQLQueryAccess(database, query, params = []) {
  const { path: targetPath, password } = database;
  const connectionString = `Driver={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=${targetPath};PWD=${password};`;

  let connection;
  try {
    connection = await odbc.connect(connectionString);
    const result = await connection.query(query, params);
    return result;
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    logger.error('Access query failed', error);
    // Optional: more verbose debug info
    logger.debug('Query:', query);
    logger.debug('Params:', JSON.stringify(params));

    // Fallback for ODBC parameter metadata issues in Access
    if (params && params.length && /parameters/i.test(message)) {
      const inlined = inlineParams(query, params);
      logger.warn('Retrying Access query with inlined params due to parameter metadata error.');
      logger.debug('Inlined Query:', inlined);
      const retryResult = await connection.query(inlined);
      return retryResult;
    }

    throw error;
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = { runSQLQueryAccess };
