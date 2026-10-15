const { createHash } = require('node:crypto');
const { createHttpError } = require('./utils');
const { UUID, isUncertainResponse } = require('./customer-creation-policy');

function assertContactCreationApi(settings, write = false) {
  if (!settings.enabled || !settings.baseAddress || !settings.apiKey) {
    throw createHttpError(503, 'Die ERP-API für Ansprechpartner ist nicht konfiguriert.', { code: 'CONTACT_CREATION_API_UNAVAILABLE' });
  }
  if (write && !settings.writeEnabled) {
    throw createHttpError(403, 'Das Anlegen von Ansprechpartnern über die ERP-API ist derzeit gesperrt.', { code: 'CONTACT_CREATION_WRITE_DISABLED', state: 'notSent' });
  }
}

function normalizeContactCreationRequest(input, customerId, database, identity, operationId) {
  const mandant = String(database?.shortName || '').trim().toUpperCase();
  if (identity?.active !== true || !identity.userId || !identity.shortCode || !/^[A-Z0-9]{1,10}$/.test(mandant)) {
    throw createHttpError(403, 'Für den Ansprechpartneranlage fehlt ein gültiger Benutzer- oder Mandantenkontext.', { code: 'CONTACT_CREATION_FORBIDDEN' });
  }
  if (!customerId || customerId.length > 10) throw createHttpError(400, 'Ungültige Kundennummer.');
  if (operationId && !UUID.test(operationId)) throw createHttpError(400, 'Ungültige Vorgangs-ID.', { code: 'CONTACT_CREATION_KEY_INVALID' });
  const fieldError = (field, message) => { throw createHttpError(422, message, { code: 'CONTACT_CREATION_INPUT_INVALID', field }); };
  const text = (source, key, max, path = key, required = false) => {
    const value = source?.[key] == null ? '' : String(source[key]).trim();
    if ((required && !value) || (max && value.length > max) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fieldError(path, 'Bitte die Angabe für ' + path + ' prüfen.');
    return value || null;
  };
  const person = input?.contact;
  if (!person || typeof person !== 'object' || Array.isArray(person)) fieldError('name', 'Bitte einen Ansprechpartner angeben.');
  const limits = { anrede: 25, titel: 50, vorname: 25, name: 50, abteilung: 50, position: 50, telefon: 50, fax: 50, mobil: 50, email: 150, sprache: 2, notiz: null };
  const contact = Object.fromEntries(Object.entries(limits).map(([key, limit]) => [key, text(person, key, limit, key, key === 'name')]));
  if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) fieldError('email', 'Bitte eine gültige E-Mail-Adresse angeben.');
  contact.ranking = person.ranking === '' || person.ranking == null ? null : Number(person.ranking);
  if (contact.ranking !== null && ![1, 2, 3].includes(contact.ranking)) fieldError('ranking', 'Ranking muss leer oder 1 bis 3 sein.');
  contact.geburtstag = text(person, 'geburtstag', 10);
  if (contact.geburtstag && (!/^\d{4}-\d{2}-\d{2}$/.test(contact.geburtstag) || !Number.isFinite(Date.parse(contact.geburtstag)) || new Date(contact.geburtstag).toISOString().slice(0, 10) !== contact.geburtstag)) fieldError('geburtstag', 'Bitte ein gültiges Datum angeben.');
  contact.eigeneAnschrift = person.eigeneAnschrift == null ? null : Object.fromEntries(Object.entries({ strasse: 50, plz: 15, ort: 50, land: 2 }).map(([key, limit]) => [key, text(person.eigeneAnschrift, key, limit, 'eigeneAnschrift.' + key, true)]));
  if (contact.eigeneAnschrift && !/^[A-Z]{2}$/.test(contact.eigeneAnschrift.land)) fieldError('eigeneAnschrift.land', 'Bitte ein ISO-Länderkürzel auswählen.');
  const confirmed = input?.confirmed === true;
  const reason = String(input?.reason || '').trim();
  if (confirmed && (reason.length < 10 || reason.length > 500 || /[\u0000-\u001f\u007f]/.test(reason))) fieldError('reason', 'Bitte eine Begründung mit 10 bis 500 Zeichen eingeben.');
  const canonicalInput = { contact, confirmed, reason: confirmed ? reason : '', warningsAccepted: input?.warningsAccepted === true };
  return { input: canonicalInput, hash: createHash('sha256').update(JSON.stringify(canonicalInput)).digest('hex'), payload: {
    quelle: { angelegtVon: identity.shortCode, externeReferenz: operationId || null }, mandanten: [mandant],
    ansprechpartner: contact, bestaetigt: confirmed, begruendung: confirmed ? reason : null,
  } };
}

function contactCreationOutcome(response, customerId, mandant) {
  const entries = Array.isArray(response.data?.eintraege) ? response.data.eintraege : [];
  const matches = entries.filter((entry) => entry?.mandant === mandant);
  const entry = matches.length === 1 ? matches[0] : null;
  const id = entry?.lfdNr === null || entry?.lfdNr === undefined || entry?.lfdNr === '' ? NaN : Number(entry.lfdNr);
  return response.status === 201 && String(response.data?.kundennummer || '').trim() === customerId
    && entries.length === 1 && entry?.status === 'angelegt'
    && Number.isInteger(id) && id > 0 && id <= 2147483647 && UUID.test(entry?.vorgangId || '')
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
      code: result?.code || (result?.ergebnis === 'anlegbar' ? 'CONTACT_CREATION_WARNINGS_REQUIRED' : 'CONTACT_CREATION_CHECK_FAILED'),
      detail: result?.ergebnis === 'anlegbar' ? 'Bitte die Hinweise zum Ansprechpartner bestätigen.' : 'Bitte den Ansprechpartner und mögliche Dubletten prüfen.',
    },
  };
}

async function executeContactCreation(context, { client, history }) {
  assertContactCreationApi(context.settings, true);
  if (!UUID.test(context.operationId || '')) {
    throw createHttpError(400, 'Für die Anlage wird eine gültige Vorgangs-ID benötigt.', { code: 'CONTACT_CREATION_KEY_INVALID' });
  }
  const reserved = await history.reserve(context);
  if (reserved.replay) return reserved;
  const endpoint = `/${encodeURIComponent(context.customerId)}/ansprechpartner`;
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
      outcome = contactCreationOutcome(response, context.customerId, context.database.shortName);
      const uncertain = isUncertainResponse(response.status, response.data?.code)
        || response.data?.code === 'IDEMPOTENZ.SCHLUESSEL_WIEDERVERWENDET'
        // An authorization/validation failure on a retry does not establish
        // what happened before the original connection was lost.
        || (reserved.retry && !response.replay);
      state = outcome ? 'created' : uncertain ? 'unknown' : 'failed';
      if (response.status >= 200 && response.status < 300 && !outcome) {
        response = { status: 502, data: { code: 'CONTACT_CREATION_RESPONSE_INVALID', detail: 'Die ERP-Antwort bestätigt den Ansprechpartner nicht vollständig. Bitte denselben Vorgang wiederholen.', erpResponse: response.data } };
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
    throw createHttpError(503, 'Das ERP-Ergebnis konnte nicht protokolliert werden. Bitte denselben Vorgang wiederholen.', { code: 'CONTACT_CREATION_HISTORY_UNCERTAIN', state: 'unknown', operationId: context.operationId });
  }
  return { ...response, state, outcome };
}

function throwContactCreationProblem(response, operationId) {
  throw createHttpError(response.status >= 500 || response.status === 401 || response.status === 403 ? 502 : response.status,
    response.data?.detail || response.data?.title || 'Die ERP-API hat den Ansprechpartner abgewiesen.', {
      code: response.data?.code || 'CONTACT_CREATION_API_ERROR', state: response.state, problem: response.data, operationId,
    });
}

async function resolveCreatedContact(response, database, customerId, operationId, loadContact) {
  let contact;
  try { contact = await loadContact(database, customerId, response.outcome.id); } catch { /* Keep the confirmed ERP operation. */ }
  if (!contact || Number(contact.id) !== response.outcome.id) throw createHttpError(503, 'Der Ansprechpartner wurde im ERP angelegt, kann aber noch nicht geladen werden. Bitte denselben Vorgang wiederholen.', {
    code: 'CONTACT_CREATION_REFRESH_PENDING', state: 'created', operationId,
  });
  return contact;
}
function contactCreationWarnings(data) {
  const warnings = Array.isArray(data?.warnungen) ? [...data.warnungen] : [];
  if (data?.eintraege?.some((entry) => entry.rankingStatus === 'nichtGesetzt') && !warnings.some((warning) => warning.code === 'ANSPRECHPARTNER.RANKING_NICHT_GESETZT')) {
    warnings.push({ code: 'ANSPRECHPARTNER.RANKING_NICHT_GESETZT', nachricht: 'Der Ansprechpartner wurde angelegt, das gewünschte Ranking jedoch nicht gesetzt. Bitte das Ranking prüfen.' });
  }
  return warnings;
}

module.exports = { assertContactCreationApi, normalizeContactCreationRequest, contactCreationOutcome, executeContactCreation, throwContactCreationProblem, resolveCreatedContact, contactCreationWarnings };
