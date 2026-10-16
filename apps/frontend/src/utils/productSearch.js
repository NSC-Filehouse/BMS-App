export function formatSearchCondition(condition, lang = 'de') {
  if (condition.kind === 'text') return condition.value;
  const number = (value) => Number(value).toLocaleString(lang === 'en' ? 'en-GB' : 'de-DE', { maximumFractionDigits: 6 });
  const name = condition.kind === 'density' ? (lang === 'en' ? 'Density' : 'Dichte') : condition.kind.toUpperCase();
  let value;
  if (condition.min === null) value = `${condition.maxInclusive ? '≤' : '<'} ${number(condition.max)}`;
  else if (condition.max === null) value = `${condition.minInclusive ? '≥' : '>'} ${number(condition.min)}`;
  else value = condition.min === condition.max ? number(condition.min) : `${number(condition.min)}–${number(condition.max)}`;
  const testMethod = condition.method;
  const methodParts = testMethod ? [testMethod.temperature != null ? `${number(testMethod.temperature)}°C` : '', testMethod.load != null ? `${number(testMethod.load)} kg` : ''].filter(Boolean) : [];
  const suffix = methodParts.length ? ` (${methodParts.join(' / ')})` : '';
  return `${name} ${value}${condition.kind === 'density' ? ' g/cm³' : ''}${suffix}`;
}

export function formatSearchMatch(match, t, lang = 'de') {
  const details = match.matches.map((value) => {
    const label = formatSearchCondition(value, lang);
    return `${label} · ${t(`vl_search_source_${value.source}`)}${value.partial ? ` · ${t('vl_search_partial')}` : ''}${value.approximate ? ` · ${t('vl_search_approximate')}` : ''}${value.conflict ? ` · ${t('vl_search_conflict')}` : ''}${value.assumedDensityUnit ? ` · ${t('vl_search_unit_assumed_short')}` : ''}`;
  });
  for (const fuzzy of match.fuzzy) details.push(`${t('vl_search_similar')}: ${fuzzy.from} → ${fuzzy.to}`);
  return details.join(' | ');
}
