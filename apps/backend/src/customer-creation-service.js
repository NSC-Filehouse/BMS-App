const { createHttpError } = require('./utils');
const { isUncertainResponse } = require('./customer-creation-policy');

async function executeCustomerCreation(context, { client, history }) {
  if (!context.settings.writeEnabled) {
    throw createHttpError(403, 'Echte Kundenanlagen sind bis zum abgestimmten Test gesperrt.', { code: 'CUSTOMER_CREATION_WRITE_DISABLED' });
  }
  const reserved = await history.reserveCreation(context);
  if (reserved.replay) return reserved;
  let response;
  try {
    response = await client.request('', { method: 'POST', body: context.normalized.payload, idempotencyKey: context.operationId, write: true });
  } catch (error) {
    response = { status: 502, data: { code: error.details?.code || 'CUSTOMER_API_CONNECTION_FAILED', detail: error.message, operationId: context.operationId } };
  }
  const isCreated = response.status === 201 && typeof response.data?.kundennummer === 'string'
    && response.data.kundennummer.trim() && response.data.mandant === context.settings.stammMandant
    && typeof response.data.uebernommen?.name1 === 'string' && response.data.uebernommen.name1.trim();
  if (response.status >= 200 && response.status < 300 && !isCreated) {
    response = { status: 502, data: { code: 'CUSTOMER_API_RESPONSE_INVALID', detail: 'Die Antwort bestätigt die Kundenanlage nicht vollständig. Ergebnis unklar; nur denselben Vorgang wiederholen.', operationId: context.operationId } };
  }
  // Central creation remains confirmed even if the copy response is incomplete.
  if (isCreated && !Array.isArray(response.data.kopien)) response.data.kopien = [];
  const failedCopy = isCreated && (context.normalized.payload.kopierenNach || []).some((mandant) =>
    !response.data.kopien.some((copy) => copy?.mandant === mandant && ['angelegt', 'bereitsVorhanden'].includes(copy.status)));
  const state = isCreated ? failedCopy ? 'partial' : 'created' : isUncertainResponse(response.status, response.data?.code) ? 'unknown' : 'failed';
  try { await history.finishCreation(context.operationId, response, state); } catch {
    // A successful ERP request must never be reported as a safely failed creation.
    throw createHttpError(502, 'Das ERP-Ergebnis konnte nicht in der Historie gespeichert werden. Bitte denselben Vorgang unverändert wiederholen.', {
      code: 'CUSTOMER_CREATION_HISTORY_UNCERTAIN', operationId: context.operationId,
    });
  }
  return { ...response, state };
}
module.exports = { executeCustomerCreation };
