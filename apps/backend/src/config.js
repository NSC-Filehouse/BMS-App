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

  sql: {
    instance: (process.env.BMS_SQL_INSTANCE || '').trim(),
    database: (process.env.BMS_SQL_DATABASE || 'BMS').trim(),
    user: (process.env.BMS_SQL_USER || '').trim(),
    password: String(process.env.BMS_SQL_PASSWORD || '').trim(),
    encrypt: toBool(process.env.BMS_SQL_ENCRYPT, false),
    trustServerCertificate: toBool(process.env.BMS_SQL_TRUST_SERVER_CERT, true),
    tables: {
      mitarbeiter: (process.env.BMS_SQL_TABLE_MITARBEITER || 'tblMitarbeiter').trim(),
      mitarbeiterMandant: (process.env.BMS_SQL_TABLE_MITARBEITER_MANDANT || 'tblMitarbeiterMandant').trim(),
      mandant: (process.env.BMS_SQL_TABLE_MANDANT || 'tblMandant').trim(),
    },
    columns: {
      persNr: (process.env.BMS_SQL_COL_PERSNR || 'ma_PersNR').trim(),
      email: (process.env.BMS_SQL_COL_EMAIL || 'ma_eMail').trim(),
      mapPersNr: (process.env.BMS_SQL_COL_MAP_PERSNR || 'mamd_PersNR').trim(),
      mapFirmaId: (process.env.BMS_SQL_COL_MAP_FIRMAID || 'mamd_FirmaID').trim(),
      firmaId: (process.env.BMS_SQL_COL_FIRMAID || 'md_FirmaID').trim(),
      firma: (process.env.BMS_SQL_COL_FIRMA || 'md_Firma').trim(),
      firmaKurz: (process.env.BMS_SQL_COL_FIRMAKURZ || 'md_FirmaKurz').trim(),
    },
  },

  cache: {
    mandantsTtlMs: toInt(process.env.MANDANTS_CACHE_TTL_MS, 10 * 60 * 1000),
    dbAvailabilityTtlMs: toInt(process.env.DB_AVAILABILITY_CACHE_TTL_MS, 10 * 60 * 1000),
  },

  featureFlags: {
    filterUnavailableMandants: toBool(process.env.MANDANTS_FILTER_UNAVAILABLE, false),
  },

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
      defaultSort: 'kd_Name1',
      searchableFields: ['kd_KdNR', 'kd_Name1', 'kd_Name2'],
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
