const path = require('path');

function toBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value).toLowerCase() === 'true';
}

function toInt(value, defaultValue) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : defaultValue;
}

function toPositiveIntOrNull(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const ROOT_DIR = path.resolve(__dirname, '..');

const config = {
  env: process.env.NODE_ENV || 'development',

  host: process.env.HOST || '0.0.0.0',
  port: toInt(process.env.PORT, 3091),

  apiBasePath: process.env.API_BASE_PATH || '/api',

  push: {
    vapidSubject: String(process.env.PUSH_VAPID_SUBJECT || 'mailto:bmsapp@mlholding.de').trim(),
    vapidPublicKey: String(process.env.PUSH_VAPID_PUBLIC_KEY || '').trim(),
    vapidPrivateKey: String(process.env.PUSH_VAPID_PRIVATE_KEY || '').trim(),
  },

  mailService: {
    enabled: toBool(process.env.FILEHOUSE_MAIL_SERVICE_ENABLED, true),
    baseAddress: String(process.env.FILEHOUSE_MAIL_SERVICE_BASE_ADDRESS || '').trim(),
    apiKey: String(process.env.FILEHOUSE_MAIL_SERVICE_API_KEY || '').trim(),
    apiKeyHeaderName: String(process.env.FILEHOUSE_MAIL_SERVICE_API_KEY_HEADER_NAME || 'X-Api-Key').trim(),
    timeoutMs: toInt(process.env.FILEHOUSE_MAIL_SERVICE_TIMEOUT_MS, 100000),
  },

  orderMail: {
    enabled: toBool(process.env.BMS_ORDER_MAIL_ENABLED, true),
    ewsFallback: toBool(process.env.BMS_ORDER_MAIL_EWS_FALLBACK, true),
    testRecipient: String(process.env.BMS_ORDER_MAIL_TEST_RECIPIENT || '').trim().toLowerCase(),
    customerServiceAddressMap: String(process.env.INVOICE_ROUTER_ADDRESS_MAP || '').trim(),
    accountingMailboxMap: String(process.env.EWS_SHARED_MAILBOXES || '').trim(),
    retryIntervalSeconds: toInt(process.env.BMS_ORDER_MAIL_RETRY_INTERVAL_SECONDS, 60),
    maxAttempts: toInt(process.env.BMS_ORDER_MAIL_MAX_ATTEMPTS, 10),
    ews: {
      username: String(process.env.EWS_USERNAME || '').trim(),
      password: String(process.env.EWS_PASSWORD || ''),
      exchangeVersion: toInt(process.env.EWS_EXCHANGE_VERSION, 7),
      url: String(process.env.EWS_URL_EXTERN || '').trim(),
    },
  },

  unfinalizedOrderReminder: {
    intervalMinutes: toPositiveIntOrNull(process.env.BMS_UNFINALIZED_ORDER_REMINDER_INTERVAL_MINUTES),
    userEmail: String(process.env.BMS_UNFINALIZED_ORDER_REMINDER_USER_EMAIL || '').trim().toLowerCase(),
  },

  sql: {
    server: (process.env.BMS_SQL_SERVER || '').trim(),
    host: (process.env.BMS_SQL_HOST || '').trim(),
    port: toInt(process.env.BMS_SQL_PORT, 1433),
    instanceName: (process.env.BMS_SQL_INSTANCE_NAME || '').trim(),
    instance: (process.env.BMS_SQL_INSTANCE || '').trim(),
    database: (process.env.BMS_SQL_DATABASE || 'BMS').trim(),
    user: (process.env.BMS_SQL_USER || '').trim(),
    password: String(process.env.BMS_SQL_PASSWORD || '').trim(),
    encrypt: toBool(process.env.BMS_SQL_ENCRYPT, false),
    trustServerCertificate: toBool(process.env.BMS_SQL_TRUST_SERVER_CERT, true),
    connectionTimeoutSec: toInt(process.env.BMS_SQL_CONNECTION_TIMEOUT_SEC, 15),
    tables: {
      mitarbeiter: (process.env.BMS_SQL_TABLE_MITARBEITER || 'tblMitarbeiter').trim(),
      mitarbeiterMandant: (process.env.BMS_SQL_TABLE_MITARBEITER_MANDANT || 'tblMitarbeiterMandant').trim(),
      mandant: (process.env.BMS_SQL_TABLE_MANDANT || 'tblMandant').trim(),
    },
    appSchema: (process.env.BMS_SQL_APP_SCHEMA || 'BMSApp').trim(),
    appTables: {
      timeline: (process.env.BMS_SQL_APP_TABLE_TIMELINE || 'Timeline').trim(),
      pushSubscription: (process.env.BMS_SQL_APP_TABLE_PUSH_SUBSCRIPTION || 'PushSubscription').trim(),
      pushMandantSetting: (process.env.BMS_SQL_APP_TABLE_PUSH_MANDANT_SETTING || 'PushMandantSetting').trim(),
      tempOrder: (process.env.BMS_SQL_APP_TABLE_TEMP_ORDER || 'tbl_Temp_Auftrag').trim(),
      tempOrderPosition: (process.env.BMS_SQL_APP_TABLE_TEMP_ORDER_POSITION || 'tbl_Temp_Auf_Position').trim(),
      orderMailOutbox: (process.env.BMS_SQL_APP_TABLE_ORDER_MAIL_OUTBOX || 'OrderMailOutbox').trim(),
      orderReminderState: (process.env.BMS_SQL_APP_TABLE_ORDER_REMINDER_STATE || 'OrderReminderState').trim(),
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

  fxSql: {
    server: (process.env.FX_SQL_SERVER || '').trim(),
    host: (process.env.FX_SQL_HOST || '').trim(),
    port: toInt(process.env.FX_SQL_PORT, 1433),
    instanceName: (process.env.FX_SQL_INSTANCE_NAME || '').trim(),
    instance: (process.env.FX_SQL_INSTANCE || '').trim(),
    user: (process.env.FX_SQL_USER_NAME || '').trim(),
    password: String(process.env.FX_SQL_USER_PASSWORD || '').trim(),
    encrypt: toBool(process.env.FX_SQL_ENCRYPT, false),
    trustServerCertificate: toBool(process.env.FX_SQL_TRUST_SERVER_CERTIFICATE, true),
    connectionTimeoutSec: toInt(process.env.FX_SQL_CONNECTION_TIMEOUT_SEC, 15),
    databases: {
      mandantManager: (process.env.FX_SQL_DATABASE_MANDANT_MANAGER || 'BMSFX_MandantManager_Entwicklung').trim(),
      mlPlastics: (process.env.FX_SQL_DATABASE_ML_PLASTICS || 'BMSFX_MLPlastics_Entwicklung').trim(),
    },
    views: {
      mitarbeiter: (process.env.FX_SQL_VIEW_MITARBEITER || 'vwtblMitarbeiter').trim(),
      mitarbeiterMandant: (process.env.FX_SQL_VIEW_MITARBEITER_MANDANT || 'vwtblMitarbeiterMandant').trim(),
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
