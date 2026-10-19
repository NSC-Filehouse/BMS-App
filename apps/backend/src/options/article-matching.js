// Canonical source; sync both deployable copies with scripts/sync-article-matching.js.
const MATCHING_VERSION = '2026-10-19.1';
const text = value => String(value ?? '').trim();
function number(value) {
  if (value == null || text(value) === '') return null;
  const parsed = Number(text(value).replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
function normalizeProductName(value) { return text(value).normalize('NFKC').toLowerCase().replace(/\s+/g, ' '); }
function productIdentity(value) {
  // Measurements are separate rule conditions, never part of the reusable product identity.
  return normalizeProductName(value)
    .replace(/\b(?:mfi|mfr|density|dichte)\s*[:=]?\s*\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?/g, '')
    .replace(/\b(?:near\s*(?:to\s*)?prime|off\s*grade|og|nt|prime|with\s+additives|without\s+additives|no\s+(?:adds|additives))\b/g, '')
    .replace(/\s+/g, ' ').trim();
}
function supplierKey(name, email = '') {
  const identity = `${name || ''} ${email || ''}`.toLowerCase();
  if (/longfield|longchem\.co\.uk/.test(identity)) return 'longfield';
  if (/total\s*energies|totalenergies|total\s+(?:petrochemicals|polymers)/.test(identity)) return 'totalenergies';
  if (/\bborealis\b|borealisgroup\.com/.test(identity)) return 'borealis';
  if (/\bineos\b|ineos\.com/.test(identity)) return 'ineos.com';
  if (/holland trading house|hth-chemicals\.nl/.test(identity)) return 'hth-chemicals.nl';
  if (/\bhyosung\b|hyosung\.com/.test(identity)) return 'hyosung.com';
  // Do not identify a named supplier by the internal forwarding sender.
  if (text(name) && !/unbekannt|unknown/i.test(name)) return normalizeProductName(name).replace(/[^a-z0-9]+/g, '');
  return text(email).toLowerCase().split('@')[1] || 'unknown';
}
function polymer(value) {
  const input = text(value).toUpperCase();
  if (/\bM[\s-]*LLDPE\b/.test(input)) return 'MLLDPE';
  if (/\bLLDPE\b/.test(input)) return 'LLDPE';
  if (/\bLDPE\b|HPPE\s*-?\s*TUBULAR\s+LD\b/.test(input)) return 'LDPE';
  if (/\bHDPE\b|\bPE[ -]?HD\b|\bBORSTAR\s+HD\b/.test(input)) return 'HDPE';
  if (/\bPP[ -]?(?:RANDOM|RACO|R)\b/.test(input)) return 'PP_RANDOM';
  if (/\bPPHP\b|\bPPH\b|\bPP[ -]?HOMO/.test(input)) return 'PP_HOMO';
  if (/\bPPCP?\b|\bPP[ -]?(?:COPO|BLOCK|IMPACT)/.test(input)) return 'PP_COPO';
  for (const family of ['ABS', 'EVA', 'PVC', 'PET', 'PBT', 'POM', 'PS', 'PC', 'PA', 'TPE', 'PP', 'PE']) {
    if (new RegExp(`\\b${family}\\b`).test(input)) return family;
  }
  return null;
}
function articlePolymer(article) {
  const named = polymer(article.articleName);
  if (named === 'MLLDPE') return named; // BMS can classify mLLDPE in its LLDPE category.
  const structured = polymer(`${article.polymerCategory || ''} ${article.polymerSubCategory || ''}`);
  return structured && !['PE', 'PP'].includes(structured) ? structured : named || structured || polymer(article.groupName);
}
function compatible(left, right) {
  if (!left || !right) return false;
  if (left === right) return true;
  return (left === 'PP' && right.startsWith('PP_')) || (right === 'PP' && left.startsWith('PP_'))
    || (left === 'PE' && ['HDPE', 'LDPE', 'LLDPE', 'MLLDPE'].includes(right))
    || (right === 'PE' && ['HDPE', 'LDPE', 'LLDPE', 'MLLDPE'].includes(left));
}
function mfiRange(name, fallback, end) {
  const match = text(name).match(/\b(?:MFI|MFR)\s*([\d.,]+)\s*(?:-|–|—|bis|to)\s*([\d.,]+)/i);
  if (match) return [number(match[1]), number(match[2])];
  const point = number(fallback);
  if (point != null) return [point, number(end) ?? point];
  const single = text(name).match(/\b(?:MFI|MFR)\s*([\d.,]+)/i);
  return single ? [number(single[1]), number(single[1])] : null;
}
function method(value) {
  const input = text(value);
  const load = input.match(/(\d+(?:[.,]\d+)?)\s*kg\b/i);
  const temperature = input.match(/(\d{2,3})\s*(?:[°℃]|C\b)/i) || input.match(/(\d{2,3})\s*\//);
  return { load: load ? number(load[1]) : null, temperature: temperature ? number(temperature[1]) : null };
}
function quality(value) {
  if (/near\s*(?:to\s*)?prime|off\s*grade|\b(?:NT|OG)\b/i.test(text(value))) return 'NT';
  return /\b(?:prime|1A)\b/i.test(text(value)) ? '1A' : null;
}
function additives(value) {
  if (/\b(?:no\s+(?:adds|additives)|without\s+additives|ohne\s+(?:additive[n]?|natur)|additive\s*:\s*keine)\b/i.test(text(value))) return 'without';
  return /\b(?:with\s+additives|mit\s+(?:additive[n]?|natur))\b/i.test(text(value)) ? 'with' : null;
}
function color(value) {
  const match = text(value).match(/\b(natur(?:al)?|black|schwarz|white|wei(?:ss|ß)|transparent|bunt)\b/i);
  if (!match) return null;
  const key = match[1].toLowerCase();
  return /natur/.test(key) ? 'natur' : /black|schwarz/.test(key) ? 'schwarz' : /white|wei/.test(key) ? 'weiss' : key;
}
function densityRange(value, unit = '', legacy = false) {
  const input = text(value);
  const match = input.match(/(?:dichte|density)\s*[:=(]?\s*(<=|>=|<|>)?\s*(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|bis)\s*(\d+(?:[.,]\d+)?))?/i)
    || input.match(/^\s*(<=|>=|<|>)?\s*(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|bis)\s*(\d+(?:[.,]\d+)?))?\s*$/);
  const explicitUnit = unit || input.match(/(?:kg\s*\/\s*m[³3]|g\s*\/\s*cm[³3])/i)?.[0] || '';
  if (!match || (!explicitUnit && !legacy)) return null;
  if (explicitUnit && !/^(?:kg\s*\/\s*m[³3]|g\s*\/\s*cm[³3])$/i.test(explicitUnit)) return null;
  const raw = number(match[2]), factor = /kg/i.test(explicitUnit) || (!explicitUnit && raw >= 100) ? 0.001 : 1;
  return { min: match[1]?.startsWith('<') ? null : raw * factor,
    max: match[1]?.startsWith('>') ? null : (number(match[3]) ?? raw) * factor,
    minInclusive: match[1] !== '>', maxInclusive: match[1] !== '<', assumedUnit: !explicitUnit };
}
function contains(range, value) {
  return value != null && (range.min == null || (range.minInclusive ? value >= range.min : value > range.min))
    && (range.max == null || (range.maxInclusive ? value <= range.max : value < range.max));
}
function features(position) {
  const input = `${position.articleName || position.productName || ''} ${position.propertiesText || ''}`;
  const category = polymer(position.materialCategory), named = polymer(input);
  return { polymer: category && !['PE', 'PP'].includes(category) ? category : named || category,
    quality: position.qualityNorm || quality(`${position.quality || ''} ${input}`), mfi: number(position.mfi),
    method: method(position.mfiTestCondition), density: densityRange(position.density, position.densityUnit),
    additives: additives(input), color: color(input) };
}
function identityMatch(position, article) {
  const input = normalizeProductName(position.articleName || position.productName);
  if (!input) return false;
  if ([article.articleName, article.supplierArticleName].some(value => normalizeProductName(value) === input)) return true;
  const tokens = new Set(input.match(/[\p{L}\d]+(?:[-/][\p{L}\d]+)*/gu) || []);
  const grade = normalizeProductName(article.productNumber);
  if (grade && /\d/.test(grade) && grade.length >= 4 && tokens.has(grade)) return true;
  const masterTokens = normalizeProductName(article.articleName).match(/[\p{L}\d]+(?:[-/][\p{L}\d]+)*/gu) || [];
  return masterTokens.some(token => token.length >= 4 && /\d/.test(token) && /[a-z]/.test(token) && tokens.has(token));
}
function mappingMatches(position, mapping) {
  if (!mapping || mapping.active === false || mapping.supplierKey !== supplierKey(position.supplierName, position.supplierKey)) return false;
  if (mapping.supplierArticleNo ? text(mapping.supplierArticleNo) !== text(position.supplierArticleNo)
    : productIdentity(mapping.productName) !== productIdentity(position.articleName || position.productName)) return false;
  const f = features(position);
  if (mapping.polymer && mapping.polymer !== f.polymer || mapping.quality && mapping.quality !== f.quality) return false;
  if (mapping.mfiFrom != null && (f.mfi == null || f.mfi < mapping.mfiFrom || f.mfi > (mapping.mfiTo ?? mapping.mfiFrom))) return false;
  if (mapping.mfiFrom == null && f.mfi != null) return false;
  const stored = method(mapping.method);
  for (const field of ['load', 'temperature']) if (stored[field] != null && stored[field] !== f.method[field]) return false;
  let conditions;
  try { conditions = typeof mapping.conditions === 'string' ? JSON.parse(mapping.conditions) : mapping.conditions; } catch { return false; }
  if (conditions) {
    for (const field of ['additives', 'color']) if (conditions[field] && conditions[field] !== f[field]) return false;
    if (conditions.density && (!f.density || !contains(conditions.density, f.density.min))) return false;
    if (conditions.requireDensity && !f.density) return false;
  }
  return true;
}
const profileCache = new WeakMap();
function profile(article) {
  if (profileCache.has(article)) return profileCache.get(article);
  const name = text(article.articleName);
  const namedType = polymer(name), structuredType = polymer(`${article.polymerCategory || ''} ${article.polymerSubCategory || ''}`);
  const namedMethod = method(name), fieldMethod = method(article.mfiMethod);
  const input = {
    type: articlePolymer(article), range: mfiRange(name, article.mfi, article.mfiTo),
    quality: quality(`${name} ${article.groupName || ''}`), method: method(`${article.mfiMethod || ''} ${name}`),
    density: densityRange(name, '', true) || densityRange(article.density, '', true) || densityRange(article.description, '', true),
    additives: additives(`${name} ${article.description || ''}`), color: color(article.color || name),
    materialConflict: namedType && structuredType && !compatible(namedType, structuredType)
      && !(namedType === 'MLLDPE' && structuredType === 'LLDPE'),
    methodConflict: ['load', 'temperature'].some(key => namedMethod[key] != null && fieldMethod[key] != null && namedMethod[key] !== fieldMethod[key]),
    names: [article.articleName, article.supplierArticleName].map(normalizeProductName).filter(Boolean),
    grades: [normalizeProductName(article.productNumber)].filter(token => token.length >= 4 && /\d/.test(token))
      .concat((normalizeProductName(name).match(/[\p{L}\d]+(?:[-/][\p{L}\d]+)*/gu) || [])
        .filter(token => token.length >= 4 && /\d/.test(token) && /[a-z]/.test(token) && !/^(?:mfi|mfr|dichte|density)/.test(token))),
  };
  profileCache.set(article, input);
  return input;
}
function rankCandidates(position, articles, options = {}) {
  const f = features(position), result = [];
  const productName = normalizeProductName(position.articleName || position.productName);
  const productTokens = new Set(productName.match(/[\p{L}\d]+(?:[-/][\p{L}\d]+)*/gu) || []);
  if (text(position.supplierArticleNo)) productTokens.add(normalizeProductName(position.supplierArticleNo));
  const learnedIds = new Set((options.mappings || []).filter(mapping => mappingMatches(position, mapping)).map(mapping => String(mapping.articleIndex)));
  for (const article of articles) {
    const name = text(article.articleName), a = profile(article);
    const identity = Boolean(productName && (a.names.includes(productName) || a.grades.some(grade => productTokens.has(grade))));
    const learned = learnedIds.has(String(article.articleIndex));
    const type = a.type, typeFits = compatible(f.polymer, type);
    if (!options.includeAll && !identity && !learned && (!typeFits || f.mfi == null)) continue;
    const reasons = [], warnings = [], conflicts = [], range = a.range;
    const mfiFits = f.mfi != null && range && f.mfi >= range[0] && f.mfi <= range[1];
    const articleQuality = a.quality, articleMethod = a.method, articleDensity = a.density, articleAdditives = a.additives, articleColor = a.color;
    if (a.materialConflict) conflicts.push('Artikelstamm: Kunststofftyp in Name und Kategorie widersprüchlich');
    if (a.methodConflict) conflicts.push('Artikelstamm: MFI-Prüfbedingungen widersprüchlich');
    if (f.polymer && type && !typeFits) conflicts.push('Kunststofftyp widerspricht');
    if (f.quality && articleQuality && f.quality !== articleQuality) conflicts.push('Qualität widerspricht');
    if (f.mfi != null && range && !mfiFits) conflicts.push(`MFI ${f.mfi} außerhalb ${range[0]}–${range[1]}`);
    for (const field of ['load', 'temperature']) if (f.method[field] != null && articleMethod[field] != null && f.method[field] !== articleMethod[field]) conflicts.push(field === 'load' ? 'MFI-Prüflast widerspricht' : 'MFI-Prüftemperatur widerspricht');
    if (f.additives && articleAdditives && f.additives !== articleAdditives) conflicts.push('Additive widersprechen');
    if (f.color && articleColor && f.color !== articleColor) conflicts.push('Farbe widerspricht');
    if (f.density && articleDensity && !contains(articleDensity, f.density.min)) conflicts.push('Dichte außerhalb Artikelbereich');
    if (!options.includeAll && !identity && !learned && (conflicts.length || !mfiFits)) continue;
    let score = 0;
    if (identity) { score += 100; reasons.push('Produktbezeichnung/Typnummer passt'); }
    if (learned) { score += 120; reasons.push('Früher manuell zugeordnet; Bedingungen passen'); }
    if (typeFits) { score += f.polymer === type ? 30 : 10; reasons.push('Kunststofftyp passt'); }
    if (mfiFits) { score += 35; reasons.push(`MFI ${range[0]}–${range[1]}`); }
    if (f.quality && f.quality === articleQuality) { score += 20; reasons.push(`${f.quality} passt`); }
    if (f.method.load != null && f.method.load === articleMethod.load) { score += 10; reasons.push('MFI-Prüflast passt'); }
    if (f.method.temperature != null && f.method.temperature === articleMethod.temperature) { score += 5; reasons.push('MFI-Prüftemperatur passt'); }
    if (f.additives && f.additives === articleAdditives) { score += 10; reasons.push('Additive passen'); }
    if (f.color && f.color === articleColor) { score += 5; reasons.push('Farbe passt'); }
    if (f.density && articleDensity && !conflicts.some(value => value.startsWith('Dichte'))) { score += 5; reasons.push('Dichte passt'); }
    if (!f.polymer) warnings.push('Kunststofftyp im Angebot unbekannt');
    if (f.mfi == null) warnings.push('MFI im Angebot fehlt; Stammdatenwert ist kein Messwert des Angebots');
    if (f.mfi != null && !range) warnings.push('Artikel-MFI unbekannt');
    if (f.mfi != null && (f.method.load == null || articleMethod.load == null)) warnings.push('MFI-Prüflast nicht beidseitig bekannt');
    if (f.method.temperature == null || articleMethod.temperature == null) warnings.push('MFI-Prüftemperatur nicht beidseitig bekannt');
    if (articleDensity && !f.density) warnings.push('Dichte/Einheit im Angebot fehlt; Artikel-Dichtegrenze ungeprüft');
    if (position.density != null && !position.densityUnit) warnings.push('Dichteeinheit des Angebots unbestätigt');
    if (articleDensity?.assumedUnit) warnings.push('Artikel-Dichteeinheit aus BMS-Konvention interpretiert');
    if (articleAdditives && !f.additives) warnings.push('Additive im Angebot unbekannt');
    if (articleColor && !f.color) warnings.push('Farbe im Angebot unbekannt');
    if (f.polymer && ['PE', 'PP'].includes(f.polymer)) warnings.push('Kunststoff-Untertyp im Angebot unbekannt');
    const criticalMissing = warnings.some(value => /Prüflast|Dichtegrenze|Additive|Untertyp/.test(value));
    result.push({ articleIndex: String(article.articleIndex), articleName: name, groupName: article.groupName || null,
      polymer: type, mfi: number(article.mfi), density: article.density || null, mfiFrom: range?.[0] ?? null, mfiTo: range?.[1] ?? null,
      score, reason: reasons.join(', '), warnings, conflicts, identityMatch: identity, learned,
      confidence: conflicts.length ? 'conflict' : (identity || learned) && !criticalMissing ? 'strong' : 'possible', version: MATCHING_VERSION });
  }
  result.sort((a, b) => Number(a.conflicts.length > 0) - Number(b.conflicts.length > 0) || b.score - a.score
    || a.articleName.localeCompare(b.articleName, 'de') || a.articleIndex.localeCompare(b.articleIndex));
  return options.limit === null ? result : result.slice(0, options.limit || 30);
}
function bestSuggestion(candidates) {
  const top = candidates[0];
  if (!top || top.conflicts.length || top.score < 70 || candidates[1]?.score === top.score) return null;
  if (!top.identityMatch && !top.learned && /Prüflast|Dichtegrenze|Untertyp|Additive/.test(top.warnings.join(' '))) return null;
  return { ...top, reason: `${top.reason}. Bitte bestätigen.${top.warnings.length ? ` Hinweise: ${top.warnings.join('; ')}` : ''}` };
}
function articleCatalogSql(prefix = '') {
  if (prefix && !/^\[BMS\.[A-Z0-9_]+\]\.$/.test(prefix)) throw new Error('Ungültiger Artikel-Datenbankname');
  return `SELECT a.agA_Artikelindex AS articleIndex, a.agA_Artikelname AS articleName,
    a.agA_Artikelname_Lieferant AS supplierArticleName, a.agA_Produktnummer AS productNumber,
    a.agA_Handelsname AS tradeName, a.agA_Beschreibung AS description, a.agA_Farbton AS color,
    a.agA_MFI AS mfi, a.agA_MFI_bis AS mfiTo, a.agA_MFI_Pruefmethode AS mfiMethod, a.agA_Dichte AS density,
    g.ag_Gruppenname AS groupName, k.art4_Bezeichnung AS polymerCategory, u.art5_Bezeichnung AS polymerSubCategory
    FROM ${prefix}[dbo].[tblArt_Artikel] a
    LEFT JOIN ${prefix}[dbo].[tblArtikelgruppe] g ON g.ag_Gruppenindex=a.agA_Artikelgruppe
    LEFT JOIN ${prefix}[dbo].[tblArt4_Kunststoff] k ON k.art4_ID_Kunststoff=a.agA_ID_Kunststoff
    LEFT JOIN ${prefix}[dbo].[tblArt5_KunststoffUnter] u ON COALESCE(u.art5_ID_Kunststoff,N'')=COALESCE(a.agA_ID_Kunststoff,N'')
      AND COALESCE(u.art5_ID_KunststoffUnter,N'')=COALESCE(a.agA_ID_KunststoffUnter,N'')
    WHERE COALESCE(a.agA_Deaktiv,0)=0 AND a.agA_Artikelname IS NOT NULL`;
}
module.exports = { MATCHING_VERSION, rankCandidates, normalizeProductName, productIdentity, mfiRange, method, polymer, articlePolymer,
  features, supplierKey, mappingMatches, bestSuggestion, articleCatalogSql, densityRange };
