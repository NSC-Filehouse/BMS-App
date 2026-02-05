import { API_BASE_URL } from '../config.js';
import { getMandant } from '../utils/mandant.js';

async function parseJsonSafe(res) {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export async function apiRequest(path, options = {}) {
  const mandant = getMandant();

  const headers = new Headers(options.headers || {});
  // Mandant wird vom Backend nur für Resource-Endpunkte erwartet; beim Startscreen ist er leer -> okay
  if (mandant) headers.set('x-mandant', mandant);

  // Content-Type nur setzen, wenn Body existiert (für GET nicht nötig, aber okay)
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, { ...options, headers });

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
