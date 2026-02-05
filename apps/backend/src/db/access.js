const odbc = require('odbc');
const logger = require('../logger');

// Funktion zum Ausführen einer SQL-Abfrage auf einer Access-Datenbank
async function runSQLQueryAccess(database, query, params = []) {
  const { path: targetPath, password } = database;
  const connectionString = `Driver={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=${targetPath};PWD=${password};`;

  let connection;
  try {
    connection = await odbc.connect(connectionString);
    const result = await connection.query(query, params);
    return result;
  } catch (error) {
    logger.error('Access query failed', error);
    // Optional: more verbose debug info
    logger.debug('Query:', query);
    logger.debug('Params:', JSON.stringify(params));
    throw error;
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = { runSQLQueryAccess };
