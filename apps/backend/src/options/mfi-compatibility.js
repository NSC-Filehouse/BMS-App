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
function resolvedMeasurements(position) {
  const output={...position};
  let source;
  try{source=typeof position.sourceMeasurementsJson==='string' ? JSON.parse(position.sourceMeasurementsJson) : position.sourceMeasurementsJson;}catch{return output;}
  if(source?.mfiAmbiguous){output.mfi=null;output.mfiTo=null;output.mfiTestCondition=null;output.measurementSource='Mehrdeutige MFI-Angaben im Original-PDF';}
  else if(source?.mfiMissing){output.mfi=null;output.mfiTo=null;output.mfiTestCondition=null;output.measurementSource='MFI in der Original-PDF-Zeile nicht angegeben';}
  else if(source?.mfiMeasurements?.length){
    const original=method(position.mfiTestCondition);
    const matches=source.mfiMeasurements.filter(m=>['load','temperature'].every(key=>original[key]==null || original[key]===method(m.condition)[key]));
    const chosen=source.mfiMeasurements.length===1 ? source.mfiMeasurements[0] : matches.length===1 ? matches[0] : null;
    if(chosen){output.mfi=chosen.min;output.mfiTo=chosen.max;output.mfiTestCondition=chosen.condition;output.measurementSource='Original-PDF (Charge und Produkt geprüft)';}
    else{output.mfi=null;output.mfiTo=null;output.mfiTestCondition=null;output.measurementSource='Mehrere MFI-Prüfungen im Original; Messwertauswahl ungeklärt';}
  }
  if(source?.density?.value!=null){output.density=source.density.value;output.densityUnit=source.density.unit;}
  delete output.sourceMeasurementsJson;
  return output;
}
function checkMfi(input, article) {
  const position=resolvedMeasurements(input);
  const mfi = number(position.mfi), mfiTo=number(position.mfiTo) ?? mfi, range = mfiRange(article.articleName, article.mfi, article.mfiTo);
  const offered = method(position.mfiTestCondition), named = method(article.articleName), field = method(article.mfiMethod);
  const expected = { load: field.load ?? named.load, temperature: field.temperature ?? named.temperature };
  const reasons = [];
  const declaredRange=text(article.articleName).match(/\b(?:MFI|MFR)\s*([\d.,]+)\s*(?:-|–|—|bis|to)\s*([\d.,]+)/i);
  if(declaredRange && !range)reasons.push('Artikelstamm: MFI-Bereich ungültig');
  if(!declaredRange && number(article.mfi)!=null && number(article.mfiTo)!=null && number(article.mfiTo)<number(article.mfi))reasons.push('Artikelstamm: MFI-Bereich ungültig');
  if(position.mfiTo!=null && number(position.mfiTo)==null)reasons.push('MFI-Obergrenze des Angebots ungültig');
  if(mfi!=null && mfiTo<mfi)reasons.push('MFI-Bereich des Angebots widersprüchlich');
  if (mfi != null && range && (mfi < range[0] || mfiTo > range[1])) reasons.push(`MFI ${mfi}${mfiTo!==mfi ? `–${mfiTo}`:''} außerhalb ${range[0]}–${range[1]}`);
  for (const key of ['load', 'temperature']) {
    if (named[key] != null && field[key] != null && named[key] !== field[key]) reasons.push('Artikelstamm: MFI-Prüfbedingungen widersprüchlich');
    if (offered[key] != null && expected[key] != null && offered[key] !== expected[key]) reasons.push(key === 'load' ? 'MFI-Prüflast widerspricht' : 'MFI-Prüftemperatur widerspricht');
  }
  const complete = mfi != null && range != null && ['load', 'temperature'].every(key => offered[key] != null && expected[key] != null);
  return { status: reasons.length ? 'excluded' : complete ? 'verified' : 'unverified', blocked: reasons.length > 0,
    complete: complete && !reasons.length, reasons: [...new Set(reasons)], mfi, mfiTo, range, offered, expected };
}
module.exports = { number, mfiRange, method, checkMfi, resolvedMeasurements };
