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

function buildBaseParts(databaseName, driverName) {
  const db = sanitizeDatabaseName(databaseName);
  const server = String(config.sql.instance || '').trim();
  const user = String(config.sql.user || '').trim();
  const password = String(config.sql.password || '');
  const network = String(config.sql.network || '').trim();

  if (!server || !user || !password || !db) {
    throw new Error('Missing SQL Server connection settings in environment.');
  }

  const parts = [
    `Driver={${driverName}}`,
    `Server=${server}`,
    `Database=${db}`,
    `Uid=${user}`,
    `Pwd=${password}`,
  ];

  if (network) {
    parts.push(`Network=${network}`);
  }

  return parts;
}

function buildSqlServerConnectionCandidates(databaseName) {
  const encrypt = config.sql.encrypt ? 'yes' : 'no';
  const trustServerCertificate = config.sql.trustServerCertificate ? 'yes' : 'no';
  const timeout = Math.max(parseInt(config.sql.connectionTimeoutSec || 15, 10) || 15, 5);

  const drivers = [
    'ODBC Driver 18 for SQL Server',
    'ODBC Driver 17 for SQL Server',
    'SQL Server',
  ];

  const candidates = [];
  for (const driver of drivers) {
    const base = buildBaseParts(databaseName, driver);

    // Full variant
    candidates.push(
      base.concat([
        `Encrypt=${encrypt}`,
        ...(config.sql.encrypt ? [`TrustServerCertificate=${trustServerCertificate}`] : []),
        `Connection Timeout=${timeout}`,
      ]).join(';') + ';'
    );

    // No timeout
    candidates.push(
      base.concat([
        `Encrypt=${encrypt}`,
        ...(config.sql.encrypt ? [`TrustServerCertificate=${trustServerCertificate}`] : []),
      ]).join(';') + ';'
    );

    // Minimal compatibility variant
    candidates.push(base.join(';') + ';');
  }

  return Array.from(new Set(candidates));
}

async function runSQLQuerySqlServer(databaseName, query, params = []) {
  let connection;
  try {
    let lastConnectError = null;
    const candidates = buildSqlServerConnectionCandidates(databaseName);
    for (const connectionString of candidates) {
      try {
        connection = await odbc.connect(connectionString);
        lastConnectError = null;
        break;
      } catch (err) {
        lastConnectError = err;
      }
    }

    if (!connection && lastConnectError) {
      throw lastConnectError;
    }

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
