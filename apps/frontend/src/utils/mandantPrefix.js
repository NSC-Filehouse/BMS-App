export function parseMandantIdFromBeNumber(value) {
  const match = String(value ?? '').trim().match(/^(\d+)-/);
  if (!match) return null;

  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id >= 0 ? id : null;
}

export function findForeignMandantName(beNumber, mandants, activeMandantName) {
  const sourceId = parseMandantIdFromBeNumber(beNumber);
  if (sourceId === null) return '';

  const source = (Array.isArray(mandants) ? mandants : []).find((mandant) => (
    Number(mandant?.id ?? mandant?.firmaId) === sourceId
  ));
  if (!source) return '';

  const activeName = String(activeMandantName || '').trim().toLowerCase();
  const sourceName = String(source.name || source.firma || '').trim();
  return sourceName && sourceName.toLowerCase() !== activeName ? sourceName : '';
}
