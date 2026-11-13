const text = value => String(value ?? '').trim();
const key = value => text(value).toLocaleLowerCase('de-DE').replace(/[\s-]+/g, ' ');
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patternFor = value => value.split('/').map(part => part.trim().split(/\s+/).map(escape).join('[\\s-]+')).join('\\s*/\\s*');

function packagingFormatter(choices, lang) {
  const aliases = new Map();
  for (const choice of choices) {
    const names = (choice.aliases || []).map(text).filter(Boolean);
    const label = lang === 'en' ? names[1] || names[0] || text(choice.text) : names[0] || text(choice.text);
    if (!label) continue;
    for (const name of names.flatMap(name => [name, ...name.split('/')])) {
      const variants = [name];
      if (/bags$|octabins$/i.test(name)) variants.push(name.slice(0, -1));
      for (const alias of variants) {
        const normalized = key(alias);
        if (!normalized) continue;
        if (!aliases.has(normalized)) aliases.set(normalized, { alias: text(alias), labels: new Set() });
        aliases.get(normalized).labels.add(label);
      }
    }
  }
  const rules = [...aliases.values()].sort((a,b) => b.alias.length-a.alias.length)
    .map(rule => ({ ...rule, pattern: patternFor(rule.alias), matches: new RegExp(`^(?:${patternFor(rule.alias)})$`, 'iu') }));
  if (!rules.length) return value => text(value);
  // "Bulk bags" is not the same wording as "Bags / Bulk". Without an explicit
  // dictionary entry, preserve that compound rather than inventing two types.
  const bulkBags = aliases.has('bulk bags') ? [] : ['bulk[\\s-]+bags?'];
  const matcher = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${[...bulkBags, ...rules.map(rule => rule.pattern)].join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
  return value => {
    let translated = false;
    const result = text(value).replace(matcher, match => {
      const rule = rules.find(rule => rule.matches.test(match));
      if (!rule || rule.labels.size !== 1) return match;
      translated = true;
      return [...rule.labels][0];
    });
    if (!translated) return result;
    return lang === 'en'
      ? result.replace(/\b(?:und\s*\/\s*oder|and\s*\/\s*or)\b/gi, 'and/or').replace(/\bund\b/gi, 'and').replace(/\boder\b/gi, 'or')
      : result.replace(/\b(?:und\s*\/\s*oder|and\s*\/\s*or)\b/gi, 'und/oder').replace(/\band\b/gi, 'und').replace(/\bor\b/gi, 'oder');
  };
}

function createPackagingDisplay(choices) {
  const de = packagingFormatter(choices, 'de'), en = packagingFormatter(choices, 'en');
  return value => ({ de: de(value), en: en(value) });
}

module.exports = { createPackagingDisplay };
