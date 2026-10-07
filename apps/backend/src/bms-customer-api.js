const config = require('./config');
const https = require('node:https');
const tls = require('node:tls');
const fs = require('node:fs');
const { createHttpError } = require('./utils');

const LISTS = ['laender', 'anreden', 'sprachen', 'zahlungsbedingungen', 'branchen', 'verkaufsbueros', 'kategorien', 'mitarbeiter'];
const cache = new Map();

function systemTrustFetch(settings) {
  return (url, options) => new Promise((resolve, reject) => {
    try {
      // Node 22.19+ exposes Windows' trusted system CAs. Add those for this client
      // without weakening certificate verification or changing global TLS defaults.
      let ca = typeof tls.getCACertificates === 'function'
        ? [...tls.getCACertificates('default'), ...tls.getCACertificates('system')] : undefined;
      if (settings.caFile) ca = [...(ca || tls.rootCertificates), fs.readFileSync(settings.caFile, 'utf8')];
      const request = https.request(url, {
        method: options.method, headers: options.headers, signal: options.signal,
        ...(ca ? { ca } : {}),
      }, (response) => {
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) response.destroy(new Error('Response too large'));
          else chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => resolve({
          status: response.statusCode,
          headers: { get: (name) => response.headers[name.toLowerCase()] || null },
          text: async () => Buffer.concat(chunks).toString('utf8'),
        }));
      });
      request.on('error', reject);
      request.end(options.body);
    } catch (error) { reject(error); }
  });
}

function createCustomerApiClient(settings = config.customerApi, fetchImpl = systemTrustFetch(settings)) {
  async function request(path, { method = 'GET', body, idempotencyKey, write = false } = {}) {
    if (!settings.enabled || !settings.baseAddress || !settings.apiKey) {
      throw createHttpError(503, 'Die Kunden-API ist nicht konfiguriert.', { code: 'CUSTOMER_API_UNAVAILABLE' });
    }
    if (write && !settings.writeEnabled) {
      throw createHttpError(403, 'Echte Kundenanlagen sind bis zum abgestimmten Test gesperrt.', { code: 'CUSTOMER_CREATION_WRITE_DISABLED' });
    }
    const root = new URL(settings.baseAddress);
    if (root.protocol !== 'https:' || root.username || root.password) {
      throw createHttpError(503, 'Die Kunden-API benötigt eine HTTPS-Basisadresse.', { code: 'CUSTOMER_API_UNAVAILABLE' });
    }
    const headers = { Accept: 'application/json', [settings.apiKeyHeaderName || 'X-Api-Key']: settings.apiKey };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, settings.timeoutMs || 30000));
    try {
      const response = await fetchImpl(`${root.href.replace(/\/$/, '')}${path}`, {
        method, headers, redirect: 'error', signal: controller.signal,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const raw = await response.text();
      let data;
      try { data = JSON.parse(raw); } catch {
        throw createHttpError(502, 'Die Kunden-API hat keine gültige JSON-Antwort geliefert. Ergebnis einer Anlage gegebenenfalls unklar.', { code: 'CUSTOMER_API_RESPONSE_INVALID' });
      }
      return { status: response.status, data, replay: response.headers.get('Idempotent-Replay') === 'true' };
    } catch (error) {
      if (error?.status) throw error;
      // Do not attach headers, raw fetch errors, or credentials to loggable errors.
      throw createHttpError(502, 'Die Kunden-API ist nicht erreichbar oder die Wartezeit ist abgelaufen. Eine Anlage kann dennoch erfolgt sein.', { code: 'CUSTOMER_API_CONNECTION_FAILED' });
    } finally { clearTimeout(timer); }
  }
  return { request };
}

async function loadCustomerApiList(list) {
  if (!LISTS.includes(list)) throw createHttpError(400, 'Unbekannte Stammdatenliste.', { code: 'CUSTOMER_API_LIST_INVALID' });
  const key = `${config.customerApi.baseAddress}|${config.customerApi.stammMandant}|${list}`;
  const existing = cache.get(key);
  if (existing && existing.until > Date.now()) return existing.data;
  const response = await createCustomerApiClient().request(`/stammdaten/${list}?mandant=${encodeURIComponent(config.customerApi.stammMandant)}`);
  if (response.status !== 200 || !Array.isArray(response.data?.eintraege)
      || response.data.mandant !== config.customerApi.stammMandant) {
    throw createHttpError(502, 'Die Stammdaten oder der Stammmandant der Kunden-API stimmen nicht mit der Konfiguration überein.', { code: 'CUSTOMER_API_MASTER_DATA_INVALID' });
  }
  cache.set(key, { until: Date.now() + 300000, data: response.data });
  return response.data;
}

module.exports = { LISTS, createCustomerApiClient, loadCustomerApiList };
