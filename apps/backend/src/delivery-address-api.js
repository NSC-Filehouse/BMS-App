const { createHash } = require('node:crypto');
const { createHttpError } = require('./utils');
const { UUID, isUncertainResponse } = require('./customer-creation-policy');
const { normalizeDeliveryAddressInput } = require('./db/delivery-addresses');

function assertDeliveryAddressApi(settings, write = false) {
  if (!settings.enabled || !settings.baseAddress || !settings.apiKey) {
    throw createHttpError(503, 'Die ERP-API für Lieferadressen ist nicht konfiguriert.', { code: 'DELIVERY_ADDRESS_API_UNAVAILABLE' });
  }
  if (write && !settings.writeEnabled) {
    throw createHttpError(403, 'Das Anlegen von Lieferadressen über die ERP-API ist derzeit gesperrt.', { code: 'DELIVERY_ADDRESS_WRITE_DISABLED', state: 'notSent' });
  }
}

function normalizeDeliveryAddressRequest(input, customer, customerId, database, identity, country, operationId) {
  const values = normalizeDeliveryAddressInput(input, customer, customerId);
  const mandant = String(database?.shortName || '').trim().toUpperCase();
  if (identity?.active !== true || !identity.userId || !identity.shortCode || !/^[A-Z0-9]{1,10}$/.test(mandant)) {
    throw createHttpError(403, 'Für die Lieferadressanlage fehlt ein gültiger Benutzer- oder Mandantenkontext.', { code: 'DELIVERY_ADDRESS_FORBIDDEN' });
  }
  if (!country?.isoAlpha2) {
    throw createHttpError(400, 'Bitte ein verfügbares Land auswählen.', { code: 'DELIVERY_ADDRESS_COUNTRY_ID_INVALID' });
  }
  if (operationId && !UUID.test(operationId)) {
    throw createHttpError(400, 'Ungültige Vorgangs-ID.', { code: 'DELIVERY_ADDRESS_KEY_INVALID' });
  }
  const confirmed = input?.confirmed === true;
  const reason = String(input?.reason || '').trim();
  if (confirmed && (reason.length < 10 || reason.length > 500 || /[\u0000-\u001f\u007f]/.test(reason))) {
    throw createHttpError(422, 'Bitte eine Begründung mit 10 bis 500 Zeichen eingeben.', { code: 'DELIVERY_ADDRESS_CONFIRMATION_INVALID' });
  }
  // Hash user input, but persist the entire ERP request. A retry must keep the
  // original company defaults even if the customer master data has since changed.
  const canonicalInput = {
    street: values.street, postalCode: values.postalCode, city: values.city,
    countryId: values.countryId, contact: values.contact, pickupTimes: values.pickupTimes,
    confirmed, reason: confirmed ? reason : '', warningsAccepted: input?.warningsAccepted === true,
  };
  return {
    input: canonicalInput,
    hash: createHash('sha256').update(JSON.stringify(canonicalInput)).digest('hex'),
    payload: {
      quelle: { angelegtVon: identity.shortCode, externeReferenz: operationId || null },
      mandanten: [mandant],
      lieferanschrift: {
        name1: values.name1 || null, name2: values.name2 || null,
        strasse: values.street, plz: values.postalCode, ort: values.city,
        land: country.isoAlpha2, region: null,
        matchcode: values.short || null, ansprechpartner: values.contact || null, abholzeiten: values.pickupTimes || null,
      },
      bestaetigt: confirmed, begruendung: confirmed ? reason : null,
    },
  };
}

function deliveryAddressOutcome(response, customerId, mandant) {
  const entries = Array.isArray(response.data?.eintraege) ? response.data.eintraege : [];
  const matches = entries.filter((entry) => entry?.mandant === mandant);
  const entry = matches.length === 1 ? matches[0] : null;
  const id = entry?.id === null || entry?.id === undefined || entry?.id === '' ? NaN : Number(entry.id);
  return response.status === 201 && String(response.data?.kundennummer || '').trim() === customerId
    && entries.length === 1 && entry?.status === 'angelegt'
    && Number.isInteger(id) && id >= 0 && id <= 2147483647 && UUID.test(entry?.vorgangId || '')
    ? { id, erpOperationId: entry.vorgangId } : null;
}

function preflightFailure(response, warningsAccepted) {
  if (response.status !== 200) return response;
  const result = response.data;
  if (result?.ergebnis === 'anlegbar' && (!result.warnungen?.length || warningsAccepted)) return null;
  return {
    status: result?.ergebnis === 'dubletten' || result?.ergebnis === 'anlegbar' ? 409 : 422,
    data: {
      ...result,
      code: result?.code || (result?.ergebnis === 'anlegbar' ? 'DELIVERY_ADDRESS_WARNINGS_REQUIRED' : 'DELIVERY_ADDRESS_CHECK_FAILED'),
      detail: result?.ergebnis === 'anlegbar' ? 'Bitte die Hinweise zur Lieferadresse bestätigen.' : 'Bitte die Lieferadresse und mögliche Dubletten prüfen.',
    },
  };
}

async function executeDeliveryAddressCreation(context, { client, history }) {
  assertDeliveryAddressApi(context.settings, true);
  if (!UUID.test(context.operationId || '')) {
    throw createHttpError(400, 'Für die Anlage wird eine gültige Vorgangs-ID benötigt.', { code: 'DELIVERY_ADDRESS_KEY_INVALID' });
  }
  const reserved = await history.reserve(context);
  if (reserved.replay) return reserved;
  const endpoint = `/${encodeURIComponent(context.customerId)}/lieferanschriften`;
  let response;
  let state;
  let outcome = null;
  let writeAttempted = false;
  try {
    if (!reserved.retry) {
      const checked = await client.request(`${endpoint}/pruefung`, { method: 'POST', body: reserved.payload });
      response = preflightFailure(checked, context.normalized.input.warningsAccepted);
      if (response) state = 'failed'; // No business write has been attempted.
    }
    if (!response) {
      writeAttempted = true;
      response = await client.request(endpoint, {
        method: 'POST', body: reserved.payload, idempotencyKey: context.operationId, write: true,
      });
      outcome = deliveryAddressOutcome(response, context.customerId, context.database.shortName);
      const uncertain = isUncertainResponse(response.status, response.data?.code)
        || response.data?.code === 'IDEMPOTENZ.SCHLUESSEL_WIEDERVERWENDET'
        // An authorization/validation failure on a retry does not establish
        // what happened before the original connection was lost.
        || (reserved.retry && !response.replay);
      state = outcome ? 'created' : uncertain ? 'unknown' : 'failed';
      if (response.status >= 200 && response.status < 300 && !outcome) {
        response = { status: 502, data: { code: 'DELIVERY_ADDRESS_RESPONSE_INVALID', detail: 'Die ERP-Antwort bestätigt die Lieferadresse nicht vollständig. Bitte denselben Vorgang wiederholen.', erpResponse: response.data } };
        state = 'unknown';
      }
    }
  } catch (error) {
    response = { status: 502, data: { code: error.details?.code || 'CUSTOMER_API_CONNECTION_FAILED', detail: error.message } };
    state = writeAttempted ? 'unknown' : 'failed';
  }
  try {
    await history.finish(context.operationId, response, state, outcome);
  } catch {
    throw createHttpError(503, 'Das ERP-Ergebnis konnte nicht protokolliert werden. Bitte denselben Vorgang wiederholen.', { code: 'DELIVERY_ADDRESS_HISTORY_UNCERTAIN', state: 'unknown', operationId: context.operationId });
  }
  return { ...response, state, outcome };
}

function throwDeliveryAddressProblem(response, operationId) {
  throw createHttpError(response.status >= 500 || response.status === 401 || response.status === 403 ? 502 : response.status,
    response.data?.detail || response.data?.title || 'Die ERP-API hat die Lieferadresse abgewiesen.', {
      code: response.data?.code || 'DELIVERY_ADDRESS_API_ERROR', state: response.state, problem: response.data, operationId,
    });
}

async function resolveCreatedDeliveryAddress(response, database, customerId, operationId, loadAddresses) {
  let data;
  try {
    data = (await loadAddresses(database, customerId))
      .find((address) => Number(address.id) === response.outcome.id && address.text);
  } catch { /* Keep the confirmed operation if reading SQL is unavailable. */ }
  if (!data) throw createHttpError(503, 'Die Lieferadresse wurde im ERP angelegt, kann aber noch nicht geladen werden. Bitte denselben Vorgang wiederholen.', {
    code: 'DELIVERY_ADDRESS_REFRESH_PENDING', state: 'created', operationId,
  });
  return data;
}

module.exports = { assertDeliveryAddressApi, normalizeDeliveryAddressRequest, deliveryAddressOutcome, executeDeliveryAddressCreation, throwDeliveryAddressProblem, resolveCreatedDeliveryAddress };
