// Query parsing and matching deliberately share one implementation for every VL scope.
const NUMBER = String.raw`\d+(?:[.,]\d+)?`;
const PROPERTY = String.raw`mfi|mfr|hlmi|mvr|dichte|density`;
const RANGE = String.raw`\s*(?:-|–|—|−|‐|bis\b|to\b|und\b|and\b|\.\.)\s*`;
const UNIT = String.raw`(?:kg\s*\/\s*m[³3]|g\s*\/\s*cm[³3])`;
const STOP_WORDS = new Set('mit with und and von from bis to zwischen between einem einer einen ein eine the a an bitte please suche search find zeige show mir me'.split(' '));
const MATERIALS = new Set('ldpe lldpe mlldpe hdpe pe pp pph ppc abs pom pa pbt pet pc ps pvc tpe eva'.split(' '));
const ALIASES = { pehd: 'hdpe', homopolymer: 'homo', copolymer: 'copo', black: 'schwarz', white: 'weiss', natural: 'natur', gray: 'grau', grey: 'grau', blue: 'blau', red: 'rot', green: 'gruen', yellow: 'gelb' };
const SEARCH_FIELDS = ['Artikel', 'Kunststoff', 'Kunststoff_Untergruppe', 'Lagerort', 'Bestell-Pos', 'Einheit',
  'beP_MFI_Pruefmethode', 'beP_VLbemerkung', 'beP_Additive', 'txtLagerInfo', 'Menge', 'EP', 'beP_MFI',
  'beP_MFIgemessen', 'bePR_Anzahl', 'masterArticleName', 'supplierArticleName', 'articleGroupName',
  'tradeName', 'colorName', 'articleDescription', 'applications', 'productNumber', 'oldArticleName'];

function text(value) { return value == null ? '' : String(value).trim(); }
function number(value) {
  if (!text(value)) return null;
  const parsed = Number(text(value).replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
function normalize(value) {
  return text(value).toLowerCase().replace(/ß/g, 'ss').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(?:pp[\s-]+homo|pphp|pph)\b/g, 'pp pph homo').replace(/\b(?:pp[\s-]+copo|ppc)\b/g, 'pp ppc copo')
    .replace(/\bpe[\s-]*hd\b/g, 'hdpe')
    .replace(/[\p{L}]+/gu, (word) => ALIASES[word] || word);
}
function densityValue(value, unit = '') {
  if (value === null) return null;
  if (/kg/i.test(unit)) return value / 1000;
  if (unit) return value;
  // Existing BMS density fields mix e.g. 924 and 0,924 without units.
  return value >= 100 && value <= 10000 ? value / 1000 : value;
}
function interval(min, max = min, extra = {}) { return { min, max, ...extra }; }
function method(value) {
  const raw = text(value);
  const load = raw.match(new RegExp(`(${NUMBER})\\s*kg\\b`, 'i')) || raw.match(new RegExp(`\\/\\s*(${NUMBER})(?:\\s*$|\\s*[)\\]])`, 'i'));
  const temperature = raw.match(/(\d{2,3})\s*(?:[°℃]|c\b)/i)
    || raw.match(/(\d{2,3})\s*\//);
  return { ...(load ? { load: number(load[1]) } : {}), ...(temperature ? { temperature: number(temperature[1]) } : {}) };
}
function sameMethod(actual, wanted) {
  return Object.entries(wanted || {}).every(([key, value]) => actual?.[key] === value);
}

function parseProductSearch(input) {
  const query = text(input);
  const filters = [];
  const consumed = query.split('').map(() => false);
  const re = new RegExp(`\\b(${PROPERTY})(?![a-z])\\s*[:=]?\\s*(?:(von|from|zwischen|between|ab|mindestens|at least|bis|up to|unter|below|under|uber|über|over|above|mehr als|less than|more than|<\\s*=?|>\\s*=?|=)\\s*)?(${NUMBER})(?:${RANGE}(${NUMBER}))?\\s*(${UNIT})?`, 'gi');
  for (const match of query.matchAll(re)) {
    const kind = /dichte|density/i.test(match[1]) ? 'density' : /mfi|mfr/i.test(match[1]) ? 'mfi' : match[1].toLowerCase();
    const op = text(match[2]).toLowerCase().replace(/\s+/g, ' ');
    let min = number(match[3]);
    let max = match[4] ? number(match[4]) : min;
    if (kind === 'density') { min = densityValue(min, match[5]); max = densityValue(max, match[5]); }
    const filter = { kind, min, max, minInclusive: true, maxInclusive: true, start: match.index, end: match.index + match[0].trimEnd().length };
    if (match[4] && min > max) { filter.invalid = true; }
    if (!match[4]) {
      if (/^(ab|mindestens|at least|>=|> =)$/.test(op)) filter.max = null;
      else if (/^(uber|über|over|above|mehr als|more than|>)$/.test(op)) { filter.max = null; filter.minInclusive = false; }
      else if (/^(bis|up to|<=|< =)$/.test(op)) filter.min = null;
      else if (/^(unter|below|under|less than|<)$/.test(op)) { filter.min = null; filter.maxInclusive = false; }
      else if (/^(von|from|zwischen|between)$/.test(op)) filter.incomplete = true;
    }
    const tail = query.slice(filter.end);
    if (!match[4] && /^\s*(?:bis\b|to\b|and\b|und\b|[-–—])/.test(tail)) filter.incomplete = true;
    const qualifier = tail.match(new RegExp(`^\\s*(?:bei|at|@)?\\s*\\(?\\s*(?:(${NUMBER})\\s*[°℃]\\s*c?\\s*\\/\\s*)?(${NUMBER})\\s*kg\\b\\s*\\)?`, 'i'));
    if (kind !== 'density' && qualifier) {
      filter.method = { load: number(qualifier[2]), ...(qualifier[1] ? { temperature: number(qualifier[1]) } : {}) };
      filter.end += qualifier[0].length;
    }
    filter.raw = query.slice(filter.start, filter.end);
    filter.assumedDensityUnit = kind === 'density' && !match[5] && (number(match[3]) >= 100 || number(match[4]) >= 100);
    filters.push(filter);
    for (let i = filter.start; i < filter.end; i += 1) consumed[i] = true;
  }
  const remainder = query.split('').map((char, i) => consumed[i] ? ' ' : char).join('');
  const terms = [...remainder.matchAll(/"([^"\n]+)"|[^\s,;]+/g)].map((match) => ({
    kind: 'text', raw: match[0], value: match[1] || match[0], start: match.index, end: match.index + match[0].length,
    phrase: Boolean(match[1]),
  })).filter((term) => !STOP_WORDS.has(normalize(term.value)) && !/^[():]+$/.test(term.value));
  const parts = [...filters, ...terms].sort((a, b) => a.start - b.start);
  const conditions = parts.map((part, index) => ({ ...part, id: index,
    queryWithout: parts.filter((_, other) => other !== index).map((entry) => entry.raw).join(' '),
  }));
  return { query, filters, terms, conditions, invalid: query.length > 500 || filters.some((entry) => entry.invalid || entry.incomplete),
    warnings: [...(query.length > 500 ? ['queryTooLong'] : []),
      ...(filters.some((entry) => entry.invalid) ? ['reversedRange'] : []),
      ...(filters.some((entry) => entry.incomplete) ? ['incompleteRange'] : []),
      ...(filters.some((entry) => entry.assumedDensityUnit) ? ['densityUnitAssumed'] : []),
      ...(filters.some((entry) => entry.kind === 'density' && entry.min === 7 && entry.max === 7) ? ['densityLiteral'] : [])],
  };
}

function extractProperties(value, source) {
  const input = text(value);
  const re = new RegExp(`\\b(${PROPERTY})(?![a-z])\\s*(?:\\(([^)]{0,80})\\)|\\[([^\\]]{0,80})\\])?\\s*[:=]?\\s*(?:ca\\.?|approx\\.?|about|von|from)?\\s*(${NUMBER})(?:\\s*(?:-|–|—|−|‐|bis\\b|to\\b)\\s*(${NUMBER}))?\\s*(${UNIT})?`, 'gi');
  return [...input.matchAll(re)].flatMap((match) => {
    // Bulk density is a different property from material density.
    if (/bulk\s*$|schuett\s*$|schütt\s*$/i.test(input.slice(Math.max(0, match.index - 16), match.index))) return [];
    const kind = /dichte|density/i.test(match[1]) ? 'density' : /mfi|mfr/i.test(match[1]) ? 'mfi' : match[1].toLowerCase();
    let min = number(match[4]); let max = match[5] ? number(match[5]) : min;
    if (kind === 'density') { min = densityValue(min, match[6]); max = densityValue(max, match[6]); }
    if (min > max) return [];
    const suffix = input.slice(match.index + match[0].length).match(/^\s*\(([^)]{0,80})\)/);
    return [interval(min, max, { kind, source, raw: match[0], method: method(match[2] || match[3] || suffix?.[1]),
      approximate: /\bca\.?|approx|about/i.test(match[0]),
      assumedDensityUnit: kind === 'density' && !match[6] && number(match[4]) >= 100 })];
  });
}
function fieldInterval(value, endValue, kind, source, testMethod) {
  const match = text(value).match(new RegExp(`^(${NUMBER})(?:\\s*(?:-|–|—|−|‐|bis|to)\\s*(${NUMBER}))?\\s*(${UNIT})?$`, 'i'));
  if (!match) return [];
  let min = number(match[1]); let max = number(endValue) ?? number(match[2]) ?? min;
  if (kind === 'density') { min = densityValue(min, match[3]); max = densityValue(max, match[3]); }
  if (max < min) return [];
  return [interval(min, max, { kind, source, raw: text(value), method: method(testMethod),
    assumedDensityUnit: kind === 'density' && !match[3] && number(match[1]) >= 100 })];
}
function propertiesForRow(row) {
  const position = extractProperties(row.Artikel, 'positionName');
  const master = extractProperties(row.masterArticleName, 'masterName');
  const description = extractProperties(row.articleDescription, 'description');
  const measured = fieldInterval(row.beP_MFIgemessen, null, 'mfi', 'measured', row.beP_MFI_Pruefmethode);
  const base = fieldInterval(row.beP_MFI, null, 'mfi', 'positionField', row.beP_MFI_Pruefmethode);
  const masterField = fieldInterval(row.masterMfi, row.masterMfiTo, 'mfi', 'masterField', row.masterMfiMethod);
  const density = fieldInterval(row.masterDensity, null, 'density', 'masterField');
  const properties = [];
  for (const kind of ['mfi', 'hlmi', 'mvr', 'density']) {
    const named = position.filter((entry) => entry.kind === kind);
    const masterNamed = master.filter((entry) => entry.kind === kind);
    const described = description.filter((entry) => entry.kind === kind);
    let chosen;
    if (kind === 'mfi') {
      if (measured.length) chosen = measured;
      // A concrete position name can express a narrower range than its generic master.
      else if (base.length && named.length && named.every((entry) => entry.min <= base[0].min && entry.max >= base[0].max)) chosen = named;
      else if (base.length) chosen = base;
      else if (named.length) chosen = named;
      // A stored lower bound must not collapse an explicitly named master range.
      else if (masterField.length && masterNamed.some((entry) => entry.min === masterField[0].min && entry.max > entry.min)) chosen = masterNamed;
      else chosen = masterField.length ? masterField : masterNamed.length ? masterNamed : described;
    } else if (kind === 'density') chosen = named.length ? named : density.length ? density : masterNamed.length ? masterNamed : described;
    else chosen = named.length ? named : masterNamed.length ? masterNamed : described;
    if (kind === 'mfi' && (base.length || measured.length)) {
      // Additional, explicitly different test conditions describe another measurement.
      const primaryMethod = method(row.beP_MFI_Pruefmethode);
      const extraMethods = described.filter((entry) => entry.method.load != null && primaryMethod.load != null
        && (entry.method.load !== primaryMethod.load || (entry.method.temperature != null && primaryMethod.temperature != null && entry.method.temperature !== primaryMethod.temperature)));
      chosen = [...chosen, ...extraMethods];
    }
    const alternatives = [...named, ...masterNamed, ...described, ...(kind === 'mfi' ? [...base, ...masterField] : [])];
    for (const entry of chosen) {
      const fallbackMethod = entry.source.startsWith('position') ? row.beP_MFI_Pruefmethode : row.masterMfiMethod;
      const testMethod = kind === 'density' ? {} : Object.keys(entry.method).length ? entry.method : method(fallbackMethod);
      const conflict = alternatives.some((other) => sameMethod(testMethod, other.method)
        && (other.max < entry.min || other.min > entry.max));
      properties.push({ ...entry, method: testMethod, conflict });
    }
  }
  return properties;
}

function overlaps(value, filter) {
  if (!sameMethod(value.method, filter.method)) return false;
  if (filter.min !== null && (value.max < filter.min || (!filter.minInclusive && value.max === filter.min))) return false;
  if (filter.max !== null && (value.min > filter.max || (!filter.maxInclusive && value.min === filter.max))) return false;
  return true;
}
function intersectFilters(filters) {
  let min = null; let max = null; let minInclusive = true; let maxInclusive = true;
  for (const filter of filters) {
    if (filter.min !== null && (min === null || filter.min > min)) { min = filter.min; minInclusive = filter.minInclusive; }
    else if (filter.min === min) minInclusive = minInclusive && filter.minInclusive;
    if (filter.max !== null && (max === null || filter.max < max)) { max = filter.max; maxInclusive = filter.maxInclusive; }
    else if (filter.max === max) maxInclusive = maxInclusive && filter.maxInclusive;
  }
  return { min, max, minInclusive, maxInclusive, method: filters[0].method,
    invalid: min !== null && max !== null && (min > max || (min === max && (!minInclusive || !maxInclusive))) };
}
function nearWord(left, right) {
  if (left.length < 4 || right.length < 4 || /\d/.test(left + right) || Math.abs(left.length - right.length) > 1) return false;
  if (left.length === right.length) {
    const diffs = [...left].map((char, i) => char === right[i] ? -1 : i).filter((i) => i >= 0);
    return diffs.length === 1 || (diffs.length === 2 && diffs[1] === diffs[0] + 1 && left[diffs[0]] === right[diffs[1]] && left[diffs[1]] === right[diffs[0]]);
  }
  const [short, long] = left.length < right.length ? [left, right] : [right, left];
  let i = 0; while (i < short.length && short[i] === long[i]) i += 1;
  return short.slice(i) === long.slice(i + 1);
}
function matchTerm(term, haystack, words) {
  const wanted = normalize(term.value);
  const tokens = wanted.split(/\s+/).filter(Boolean);
  if (MATERIALS.has(wanted)) return words.includes(wanted) ? { exact: true } : null;
  if (term.phrase || /\d/.test(wanted) || tokens.length > 1) return haystack.includes(wanted) ? { exact: true } : null;
  if (haystack.includes(wanted)) return { exact: true };
  const candidates = words.filter((word) => !MATERIALS.has(word) && nearWord(wanted, word));
  return candidates.length ? { from: term.value, to: candidates[0] } : null;
}
function matchProductRow(row, search) {
  if (search.invalid) return null;
  const haystack = SEARCH_FIELDS.map((key) => normalize(row[key])).join(' ');
  const words = [...new Set(haystack.match(/[\p{L}\d]+/gu) || [])];
  const materialWords = ['Artikel', 'masterArticleName', 'Kunststoff', 'Kunststoff_Untergruppe']
    .flatMap((key) => normalize(row[key]).match(/[\p{L}\d]+/gu) || []);
  const fuzzy = [];
  for (const term of search.terms) {
    if (MATERIALS.has(normalize(term.value)) && !materialWords.includes(normalize(term.value))) return null;
    const match = matchTerm(term, haystack, words);
    if (!match) return null;
    if (!match.exact) fuzzy.push(match);
  }
  const values = search.filters.length ? propertiesForRow(row) : [];
  const matches = [];
  for (const filter of search.filters) {
    // Repeated limits for one property must be satisfied by the same measurement.
    const relatedFilters = search.filters.filter((entry) => entry.kind === filter.kind
      && JSON.stringify(entry.method || {}) === JSON.stringify(filter.method || {}));
    const combined = intersectFilters(relatedFilters);
    if (combined.invalid) return null;
    const value = values.find((entry) => entry.kind === filter.kind && overlaps(entry, combined));
    if (!value) return null;
    matches.push({ ...value, partial: value.min !== value.max
      && ((filter.min !== null && value.min < filter.min) || (filter.max !== null && value.max > filter.max)) });
  }
  return { matches, fuzzy };
}
function filterProductRows(rows, search) {
  if (!search.query) return rows;
  return rows.flatMap((row) => {
    const match = matchProductRow(row, search);
    return match ? [{ ...row, searchMatch: match }] : [];
  });
}
function searchMetadata(search) {
  return { query: search.query, conditions: search.conditions, warnings: search.warnings };
}

module.exports = { parseProductSearch, filterProductRows, matchProductRow, propertiesForRow, searchMetadata };
