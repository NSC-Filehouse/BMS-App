import { createEmptyContact } from './customerCreation.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function contactStorageKey(userId, mandant, customerId) {
  return `bms.contactCreation.pending.${[userId, mandant, customerId].map((value) => encodeURIComponent(String(value))).join('.')}`;
}
export function readContactPending(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key) || 'null');
    return UUID.test(value?.id || '') && value?.body?.contact && typeof value.body.contact === 'object' && !Array.isArray(value.body.contact) ? value : null;
  } catch { return null; }
}
export function contactDraft(input) {
  const draft = createEmptyContact();
  for (const key of Object.keys(draft)) draft[key] = key === 'eigeneAnschrift' ? input?.[key] || null : input?.[key] ?? '';
  return draft;
}
export function validateContactDraft(contact, confirmed = false, reason = '') {
  const errors = {};
  const required = (value, key) => { if (!String(value ?? '').trim()) errors[key] = 'Bitte ausfüllen.'; };
  required(contact.name, 'name');
  if (contact.eigeneAnschrift) for (const key of ['strasse', 'plz', 'ort', 'land']) required(contact.eigeneAnschrift[key], `eigeneAnschrift.${key}`);
  if (confirmed && (reason.trim().length < 10 || reason.trim().length > 500)) errors.reason = 'Bitte 10 bis 500 Zeichen eingeben.';
  return errors;
}
export function contactFailureDetails(failure) {
  const details = failure?.payload?.error?.details || {};
  return { ...details, problem: details.problem || details };
}
export function contactProblemFields(problem) {
  const errors = {};
  if (problem?.field) errors[problem.field] = 'Bitte die Angabe prüfen.';
  for (const entry of problem?.fehler || []) {
    if (entry.feld) errors[entry.feld.replace(/^ansprechpartner\./, '')] = entry.abhilfe || entry.nachricht || 'Bitte die Angabe prüfen.';
  }
  return errors;
}
