export function loadingLocationParts(value) {
  const text=String(value || '').trim();
  const lines=(text.includes('\n')?text.split(/\r?\n/):text.split(','))
    .map(line=>line.replace(/^\s*(?:pick[\s-]*up\s*(?:address|adress)|loading\s*address|abholadresse|abholort|ladeadresse|abladeadresse|verladeadresse)\s*:?\s*/i,'').trim())
    .filter(Boolean);
  const primary=lines[0] || '–';
  const addressLines=lines.slice(1).filter(line=>! /^(?:only\b|avis\b|time of\b|shipment\b|pickup time\b|opening hours\b|öffnungszeiten\b|hinweis\b|bitte\b)/i.test(line));
  const postal=addressLines.find(line=>/^(?:[A-Z]{1,3}[-\s])?\d{4,6}(?:\s+[A-Z]{2})?\s+\S/i.test(line));
  const secondary=[...new Set([postal,...addressLines.slice(0,2)].filter(Boolean))].join(' · ');
  return {primary,secondary};
}
