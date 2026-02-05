function ensureNoTrailingSlash(p) {
  if (!p) return '';
  return p.endsWith('/') ? p.slice(0, -1) : p;
}

export const APP_BASE_PATH = ensureNoTrailingSlash(import.meta.env.VITE_APP_BASE_PATH || '/bms-app');
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || `${APP_BASE_PATH}/api`;

export const RESOURCES = {
  customers: { key: 'customers', label: 'Kunden', pk: 'kd_KdNR' },
  products:  { key: 'products',  label: 'Produkte', pk: 'agA_Artikelindex' },
  orders:    { key: 'orders',    label: 'Aufträge', pk: 'au_Auftragsindex' },
};
