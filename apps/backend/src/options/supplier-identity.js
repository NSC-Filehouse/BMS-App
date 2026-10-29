// Keep this contract identical to OptionReader/src/supplier-identity.js.
// Keys identify a supplier family, independent of an ERP account or mandant.
const text = value => String(value || '').normalize('NFKC').trim();
const suppliers = [
  { key: 'hanwha-totalenergies', name: 'Hanwha TotalEnergies', pattern: /\bhanwha\s+total(?:energies)?\b/i },
  { key: 'totalenergies', name: 'TotalEnergies', pattern: /\btotal\s*energies\b|\btotal\s+(?:petrochemicals|polymers)\b|^total$|(?:^|[@/.\s])(?:total|totalenergies)\.com(?:$|[/>:\s])/i },
  { key: 'borealis', name: 'Borealis', pattern: /\bborealis\b|(?:^|[@/.\s])borealisgroup\.com(?:$|[/>:\s])/i },
  { key: 'longfield', name: 'Longfield Chemicals', pattern: /\blongfield\b|(?:^|[@/.\s])longchem\.co\.uk(?:$|[/>:\s])/i },
  { key: 'ineos.com', name: 'INEOS', pattern: /\bineos\b/i },
  { key: 'hth-chemicals.nl', name: 'Holland Trading House Chemicals', pattern: /\bholland trading house\b|\bhth(?:\s+chemicals)?\b|(?:^|[@/.\s])hth-chemicals\.nl(?:$|[/>:\s])/i },
  { key: 'hyosung.com', name: 'Hyosung', pattern: /\bhyosung\b/i },
];
function knownSupplier(value) {
  return suppliers.find(supplier => supplier.key === text(value).toLowerCase())
    || suppliers.find(supplier => supplier.pattern.test(text(value))) || null;
}
function internalIdentity(value) {
  return /\b(?:frupack|frupackplastic|ml[\s-]*(?:plastics|holding|polymer|compound|connect)|nordpoly|westpoly|filehouse|elbpolymer)\b/i.test(text(value));
}
function companyKey(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\b(?:gmbh|limited|ltd|bv|nv|sa|sarl|inc|llc|co|kg)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '');
}
function supplierKey(name, hint = '') {
  const named = knownSupplier(name);
  if (named) return named.key;
  if (text(name) && !internalIdentity(name) && !/unbekannt|unknown/i.test(name)) return companyKey(name) || 'unknown';
  const hinted = knownSupplier(hint);
  if (hinted) return hinted.key;
  if (internalIdentity(hint)) return 'unknown';
  const domain = text(hint).toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})\b/)?.[1];
  return domain || 'unknown';
}
module.exports = { knownSupplier, internalIdentity, companyKey, supplierKey };
