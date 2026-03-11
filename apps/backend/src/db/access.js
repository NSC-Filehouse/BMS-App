const sql = require('mssql');
const config = require('../config');
const logger = require('../logger');

const pools = new Map();

function sanitizeDatabaseName(databaseName) {
  const value = String(databaseName || '').trim();
  if (!value) return '';
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new Error(`Invalid SQL database name: ${value}`);
  }
  return value;
}

function getSqlTargetConfig(target = 'bms') {
  return target === 'fx' ? config.fxSql : config.sql;
}

function resolveServerConfig(target = 'bms') {
  const targetConfig = getSqlTargetConfig(target);
  if (targetConfig.server) {
    return { server: targetConfig.server };
  }

  if (targetConfig.host) {
    return {
      server: targetConfig.host,
      ...(targetConfig.instanceName ? {} : { port: targetConfig.port || 1433 }),
    };
  }

  const fallback = String(targetConfig.instance || '').trim();
  if (!fallback) {
    throw new Error('Missing SQL Server host configuration.');
  }

  // Backward compatibility: allow host\instance in BMS_SQL_INSTANCE.
  if (fallback.includes('\\')) {
    const [host, instanceName] = fallback.split('\\');
    return {
      server: host,
      ...(instanceName ? { options: { instanceName } } : {}),
    };
  }

  return { server: fallback, port: targetConfig.port || 1433 };
}

function buildPoolConfig(databaseName, target = 'bms') {
  const db = sanitizeDatabaseName(databaseName);
  const targetConfig = getSqlTargetConfig(target);
  const user = String(targetConfig.user || '').trim();
  const password = String(targetConfig.password || '').trim();
  const timeoutMs = Math.max((targetConfig.connectionTimeoutSec || 15) * 1000, 5000);

  if (!db || !user || !password) {
    throw new Error('Missing SQL Server connection settings in environment.');
  }

  const serverCfg = resolveServerConfig(target);
  const options = {
    encrypt: Boolean(targetConfig.encrypt),
    trustServerCertificate: Boolean(targetConfig.trustServerCertificate),
    enableArithAbort: true,
    ...(serverCfg.options || {}),
  };

  return {
    user,
    password,
    server: serverCfg.server,
    ...(serverCfg.port ? { port: serverCfg.port } : {}),
    database: db,
    options,
    connectionTimeout: timeoutMs,
    requestTimeout: timeoutMs,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };
}

function bindQuestionParams(query, params) {
  let idx = 0;
  const sqlText = String(query || '').replace(/\?/g, () => {
    idx += 1;
    return `@p${idx}`;
  });
  return { sqlText, count: idx };
}

async function getPool(databaseName, target = 'bms') {
  const dbName = sanitizeDatabaseName(databaseName);
  const poolKey = `${target}:${dbName}`;
  let poolPromise = pools.get(poolKey);
  if (!poolPromise) {
    const pool = new sql.ConnectionPool(buildPoolConfig(dbName, target));
    poolPromise = pool.connect();
    pools.set(poolKey, poolPromise);
  }

  try {
    return await poolPromise;
  } catch (error) {
    pools.delete(poolKey);
    throw error;
  }
}

function logSqlError(error, query, params) {
  logger.error('SQL Server query failed', error);
  logger.debug('Query:', query);
  logger.debug('Params:', JSON.stringify(params));
  if (error && error.originalError) {
    const oe = error.originalError;
    logger.debug('SQL details:', JSON.stringify({
      code: oe.code || null,
      number: oe.number || null,
      state: oe.state || null,
      class: oe.class || null,
      message: oe.message || null,
    }));
  }
}

async function runSQLQuerySqlServer(databaseName, query, params = [], target = 'bms') {
  try {
    const pool = await getPool(databaseName, target);
    const request = pool.request();
    const bind = Array.isArray(params) ? params : [];
    bind.forEach((value, i) => {
      request.input(`p${i + 1}`, value);
    });
    const { sqlText } = bindQuestionParams(query, bind);
    const result = await request.query(sqlText);
    return result && Array.isArray(result.recordset) ? result.recordset : [];
  } catch (error) {
    logSqlError(error, query, params);
    throw error;
  }
}

async function runSQLQueryFx(databaseName, query, params = []) {
  return runSQLQuerySqlServer(databaseName, query, params, 'fx');
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
  runSQLQueryFx,
  canConnectToDatabase,
};
