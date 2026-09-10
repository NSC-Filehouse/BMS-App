function ensureNoTrailingSlash(p) {
  if (!p) return '';
  return p.endsWith('/') ? p.slice(0, -1) : p;
}

const runtimeEnv = import.meta.env || {};

export const APP_BASE_PATH = ensureNoTrailingSlash(runtimeEnv.VITE_APP_BASE_PATH || '/bms-app');
export const API_BASE_URL = runtimeEnv.VITE_API_BASE_URL || `${APP_BASE_PATH}/api`;

function parseIntegerList(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map(Number)
      .filter((item) => Number.isInteger(item))
  );
}

export const MANDANT_EXCLUDE_IDS = parseIntegerList(runtimeEnv.VITE_MANDANT_EXCLUDE_IDS);

export const RESOURCES = {
  customers: { key: 'customers', label: 'Kunden', pk: 'kd_KdNR' },
  products:  { key: 'products',  label: 'Produkte', pk: 'agA_Artikelindex' },
  orders:    { key: 'orders',    label: 'Reservierungen', pk: 'au_Auftragsindex' },
};

// Minimum characters before search triggers
export const SEARCH_MIN = 2;
