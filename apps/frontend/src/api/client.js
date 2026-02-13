import { API_BASE_URL, APP_BASE_PATH } from '../config.js';
import { getMandant } from '../utils/mandant.js';
import { getStoredLanguage } from '../utils/i18n.jsx';

async function parseJsonSafe(res) {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function redirectToAppStart() {
  if (typeof window === 'undefined') return;
  window.location.assign(`${APP_BASE_PATH}/`);
}

function isAuthInterruptionResponse(res) {
  const contentType = String(res.headers.get('content-type') || '').toLowerCase();
  const isHtml = contentType.includes('text/html');
  return res.status === 401 || res.status === 403 || res.redirected || isHtml;
}

export async function apiRequest(path, options = {}) {
  const mandant = getMandant();

  const headers = new Headers(options.headers || {});
  // Mandant wird vom Backend nur für Resource-Endpunkte erwartet; beim Startscreen ist er leer -> okay
  if (mandant) headers.set('x-mandant', mandant);
  const lang = getStoredLanguage();
  if (lang) headers.set('x-lang', lang);

  // Content-Type nur setzen, wenn Body existiert (für GET nicht nötig, aber okay)
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, { ...options, headers });

  if (isAuthInterruptionResponse(res)) {
    redirectToAppStart();
    const err = new Error('Authentication required. Please sign in again.');
    err.status = res.status || 401;
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  const json = await parseJsonSafe(res);

  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.payload = json;
    throw err;
  }

  return json;
}
