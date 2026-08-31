import { MANDANT_EXCLUDE_IDS } from '../config.js';

function parseMandantId(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const id = Number(text);
  return Number.isInteger(id) ? id : null;
}

export function normalizeMandantOption(item) {
  if (typeof item === 'string') {
    return { id: null, name: item.trim() };
  }

  return {
    id: parseMandantId(item?.id ?? item?.firmaId),
    name: String(item?.name || item?.firma || '').trim(),
  };
}

export function getSelectableMandants(items) {
  return (Array.isArray(items) ? items : [])
    .map(normalizeMandantOption)
    .filter((item) => item.name && (item.id === null || !MANDANT_EXCLUDE_IDS.has(item.id)));
}
