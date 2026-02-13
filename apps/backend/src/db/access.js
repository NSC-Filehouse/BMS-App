const odbc = require('odbc');
const config = require('../config');
const logger = require('../logger');

function sanitizeDatabaseName(databaseName) {
  const value = String(databaseName || '').trim();
  if (!value) return '';
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new Error(`Invalid SQL database name: ${value}`);
  }
  return value;
}

function buildSqlServerConnectionString(databaseName) {
  const db = sanitizeDatabaseName(databaseName);
  const server = String(config.sql.instance || '').trim();
  const user = String(config.sql.user || '').trim();
  const password = String(config.sql.password || '');

  if (!server || !user || !password || !db) {
    throw new Error('Missing SQL Server connection settings in environment.');
  }

  const encrypt = config.sql.encrypt ? 'yes' : 'no';
  const parts = [
    'Driver={ODBC Driver 17 for SQL Server}',
    `Server=${server}`,
    `Database=${db}`,
    `Uid=${user}`,
    `Pwd=${password}`,
    `Encrypt=${encrypt}`,
    'Connection Timeout=5',
  ];

  // Some driver/build combinations reject TrustServerCertificate when Encrypt is off.
  if (config.sql.encrypt) {
    const trustServerCertificate = config.sql.trustServerCertificate ? 'yes' : 'no';
    parts.push(`TrustServerCertificate=${trustServerCertificate}`);
  }

  return parts.join(';') + ';';
}

async function runSQLQuerySqlServer(databaseName, query, params = []) {
  let connection;
  try {
    const connectionString = buildSqlServerConnectionString(databaseName);
    connection = await odbc.connect(connectionString);
    const result = await connection.query(query, params);
    return result;
  } catch (error) {
    logger.error('SQL Server query failed', error);
    logger.debug('Query:', query);
    logger.debug('Params:', JSON.stringify(params));
    if (error && Array.isArray(error.odbcErrors) && error.odbcErrors.length) {
      logger.debug('ODBC details:', JSON.stringify(error.odbcErrors));
    }
    throw error;
  } finally {
    if (connection) await connection.close();
  }
}

async function runSQLQueryAccess(database, query, params = []) {
  const databaseName =
    (database && (database.databaseName || database.name || database.database)) ||
    config.sql.database;
  return runSQLQuerySqlServer(databaseName, query, params);
}

async function canConnectToDatabase(databaseName) {
  try {
    await runSQLQuerySqlServer(databaseName, 'SELECT 1 AS ok', []);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  runSQLQueryAccess,
  runSQLQuerySqlServer,
  canConnectToDatabase,
};
