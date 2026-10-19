// Shared single-article validation. No ranking or catalog scan in the App.
const text = value => String(value ?? '').trim();
function number(value) {
  if (value == null || text(value) === '') return null;
  const parsed = Number(text(value).replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
function mfiRange(name, fallback, end) {
  const match = text(name).match(/\b(?:MFI|MFR)\s*([\d.,]+)\s*(?:-|–|—|bis|to)\s*([\d.,]+)/i);
  let range;
  if (match) range = [number(match[1]), number(match[2])];
  else if (number(fallback) != null) range = [number(fallback), number(end) ?? number(fallback)];
  else {
    const single = text(name).match(/\b(?:MFI|MFR)\s*([\d.,]+)/i);
    range = single ? [number(single[1]), number(single[1])] : null;
  }
  return range && range.every(v => v != null) && range[0] <= range[1] ? range : null;
}
function method(value) {
  const input = text(value);
  const load = input.match(/(\d+(?:[.,]\d+)?)\s*kg\b/i);
  const temperature = input.match(/(\d{2,3})\s*(?:[°℃]|C\b)/i) || input.match(/(\d{2,3})\s*\//);
  return { load: load ? number(load[1]) : null, temperature: temperature ? number(temperature[1]) : null };
}
function checkMfi(position, article) {
  const mfi = number(position.mfi), range = mfiRange(article.articleName, article.mfi, article.mfiTo);
  const offered = method(position.mfiTestCondition), named = method(article.articleName), field = method(article.mfiMethod);
  const expected = { load: field.load ?? named.load, temperature: field.temperature ?? named.temperature };
  const reasons = [];
  if (mfi != null && range && (mfi < range[0] || mfi > range[1])) reasons.push(`MFI ${mfi} außerhalb ${range[0]}–${range[1]}`);
  for (const key of ['load', 'temperature']) {
    if (named[key] != null && field[key] != null && named[key] !== field[key]) reasons.push('Artikelstamm: MFI-Prüfbedingungen widersprüchlich');
    if (offered[key] != null && expected[key] != null && offered[key] !== expected[key]) reasons.push(key === 'load' ? 'MFI-Prüflast widerspricht' : 'MFI-Prüftemperatur widerspricht');
  }
  const complete = mfi != null && range != null && ['load', 'temperature'].every(key => offered[key] != null && expected[key] != null);
  return { status: reasons.length ? 'excluded' : complete ? 'verified' : 'unverified', blocked: reasons.length > 0,
    complete: complete && !reasons.length, reasons: [...new Set(reasons)], mfi, range, offered, expected };
}
module.exports = { number, mfiRange, method, checkMfi };
