function parseMandantIdFromBeNumber(value) {
  const match = String(value ?? '').trim().match(/^(\d+)-/);
  if (!match) return null;

  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id >= 0 ? id : null;
}

module.exports = {
  parseMandantIdFromBeNumber,
};
