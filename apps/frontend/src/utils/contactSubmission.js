import { createCustomerOperationId } from './customerCreation.js';

// Shared by the dialog and flow tests. A retry never generates a new key.
export async function submitContact({ base, pending, body, send, writeEnabled, storage, storageKey, lang },
  { request, isCurrent, onPreflight, onFrozen, onFailed, onCreated }) {
  if (!isCurrent()) return;
  if (pending) {
    // Also retain operations restored from server history. The server no longer
    // lists them as pending once created, even if refreshing the page then fails.
    storage.setItem(storageKey, JSON.stringify(pending));
    let status;
    try { status = (await request(`${base}/operations/${encodeURIComponent(pending.id)}`)).data; }
    catch (failure) { if (failure.code !== 'CONTACT_CREATION_OPERATION_NOT_FOUND') throw failure; }
    if (!isCurrent()) return;
    if (status?.state === 'created') { await onCreated(status); return; }
    if (status?.state === 'failed') { onFailed(status.problem); return; }
    if (!writeEnabled) throw new Error(lang === 'en' ? 'Writing is disabled. The pending operation is retained; its status can be loaded again.' : 'Schreiben ist gesperrt. Der offene Vorgang bleibt erhalten; sein Status kann erneut geladen werden.');
  } else {
    const { data: checked } = await request(`${base}/check`, { method: 'POST', body: JSON.stringify(body) });
    if (!isCurrent()) return;
    onPreflight(checked);
    if (checked.ergebnis !== 'anlegbar' || (checked.warnungen?.length && !body.warningsAccepted) || !send) return;
    if (!writeEnabled) throw new Error(lang === 'en' ? 'Creation through the ERP API is currently disabled.' : 'Das Anlegen über die ERP-API ist derzeit gesperrt.');
    pending = { id: createCustomerOperationId(), body: structuredClone(body) };
    storage.setItem(storageKey, JSON.stringify(pending));
    onFrozen(pending);
  }
  if (!isCurrent()) return;
  const response = await request(base, { method: 'POST', headers: { 'Idempotency-Key': pending.id }, body: JSON.stringify(pending.body) });
  if (isCurrent()) await onCreated(response.data);
}
