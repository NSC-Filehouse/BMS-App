const config = require('../config');

function escapeIdentifier(identifier, label) {
  const text = String(identifier || '').trim();
  if (!text) {
    throw new Error(`Missing SQL identifier: ${label}`);
  }
  return `[${text.replace(/]/g, ']]')}]`;
}

function appSchemaName() {
  return String(config.sql.appSchema || 'BMSApp').trim();
}

function appTableName(key) {
  const name = config.sql.appTables?.[key];
  if (!name) {
    throw new Error(`Missing app table config: ${key}`);
  }
  return String(name).trim();
}

function appTableSql(key) {
  return `${escapeIdentifier(appSchemaName(), 'app schema')}.${escapeIdentifier(appTableName(key), `app table ${key}`)}`;
}

function appTableDisplayName(key) {
  return `${appSchemaName()}.${appTableName(key)}`;
}

module.exports = {
  appSchemaName,
  appTableDisplayName,
  appTableName,
  appTableSql,
};
