const path = require('path');

function toBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value).toLowerCase() === 'true';
}

function toInt(value, defaultValue) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : defaultValue;
}

const ROOT_DIR = path.resolve(__dirname, '..');

const config = {
  env: process.env.NODE_ENV || 'development',

  host: process.env.HOST || '0.0.0.0',
  port: toInt(process.env.PORT, 3091),

  apiBasePath: process.env.API_BASE_PATH || '/api',

  // DB config file (databases.json)
  dbConfigPath: path.resolve(ROOT_DIR, process.env.DB_CONFIG_PATH || './config/databases.json'),

  cors: {
    enabled: toBool(process.env.CORS_ENABLED, false),
    origin: process.env.CORS_ORIGIN || 'http://localhost:3090',
  },

  // Resource definitions (tables + PKs + default sort)
  resources: {
    customers: {
      key: 'customers',
      table: 'tblKunden',
      pk: 'kd_KdNR',
      defaultSort: 'kd_KdNR',
      searchableFields: ['kd_KdNR'],
    },
    products: {
      key: 'products',
      table: 'tblArt_Artikel',
      pk: 'agA_Artikelindex',
      defaultSort: 'agA_Artikelindex',
      searchableFields: ['agA_Artikelindex'],
    },
    orders: {
      key: 'orders',
      table: 'tblAuftrag',
      pk: 'au_Auftragsindex',
      defaultSort: 'au_Auftragsindex',
      searchableFields: ['au_Auftragsindex'],
    },
  },
};

module.exports = config;
