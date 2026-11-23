function incotermCode(value) {
  return String(value ?? '').trim().match(/^([a-z]{3})(?![a-z])/i)?.[1].toUpperCase() || '';
}

function findIncotermByCode(options, value) {
  const code = incotermCode(value);
  if (!code) return null;
  const mentionedCodes = new Set(String(value).toUpperCase().match(/\b[A-Z]{3}\b/g) ?? []);
  mentionedCodes.add(code);
  const matches = options.filter(option => mentionedCodes.has(incotermCode(option.text)));
  return matches.length === 1 && incotermCode(matches[0].text) === code ? matches[0] : null;
}

function isFcaIncoterm(value) {
  return incotermCode(value) === 'FCA';
}

module.exports = { findIncotermByCode, incotermCode, isFcaIncoterm };
