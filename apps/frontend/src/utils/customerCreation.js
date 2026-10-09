export const CREATION_LABELS = {
  name1: ['Name1', 'Name1'], name2: ['Name2', 'Name2'], matchcode: ['MatchCode', 'MatchCode'],
  anrede: ['Anrede', 'Salutation'], sprache: ['Sprache', 'Language'], strasse: ['Straße', 'Street'],
  plz: ['PLZ', 'Postal code'], ort: ['Ort', 'City'], land: ['Land', 'Country'], region: ['Region', 'Region'],
  telefon: ['Telefon', 'Phone'], fax: ['Fax', 'Fax'], email: ['eMail', 'Email'], homepage: ['HomePage', 'Website'],
  ustIdNr: ['USt-ID', 'VAT ID'], emailMahnung: ['Mahnungs-E-Mail', 'Reminder email'], abteilung: ['Abteilung', 'Department'],
  aussendienst: ['Außendienst', 'Sales representative'], innendienst: ['Innendienst', 'Inside sales'], verkaufsbuero: ['Verkaufsbüro', 'Sales office'],
  zahlungsbedingungId: ['Zahlungsbedingung', 'Payment terms'], bankeinzug: ['Bankeinzug', 'Direct debit'],
  iban: ['IBAN', 'IBAN'], bic: ['BIC', 'BIC'], bank: ['Bankname', 'Bank name'], kontoinhaber: ['Kontoinhaber', 'Account holder'],
  info: ['Bankinformation', 'Bank information'], notiz: ['Notiz', 'Note'], keinSerienbrief: ['Kein Serienbrief', 'No mail merge'],
  branchen: ['Branchen', 'Industries'], kategorien: ['Kategorie', 'Category'], postfach: ['Postfach', 'PO box'],
  standardanschrift: ['Postfach ist Standardanschrift', 'Use PO box as default address'], titel: ['Titel', 'Title'],
  vorname: ['Vorname', 'First name'], name: ['Nachname', 'Last name'], position: ['Position', 'Position'], mobil: ['Mobiltelefon', 'Mobile phone'],
  ranking: ['Ranking', 'Rank'], geburtstag: ['Geburtstag', 'Birthday'], wunschnummer: ['Wunschnummer (optional)', 'Requested number (optional)'],
};
export const CREATION_LISTS = { land: 'laender', anrede: 'anreden', sprache: 'sprachen', aussendienst: 'mitarbeiter', innendienst: 'mitarbeiter', verkaufsbuero: 'verkaufsbueros', zahlungsbedingungId: 'zahlungsbedingungen', branchen: 'branchen', kategorien: 'kategorien' };
const CUSTOMER_SALUTATIONS = new Map([['herr', 'private'], ['frau', 'private'], ['firma', 'company']]);
export function getCustomerSalutationType(anrede, entries = []) {
  const selected = entries.find((entry) => String(entry.schluessel) === String(anrede));
  return CUSTOMER_SALUTATIONS.get(String(selected?.bezeichnung || '').trim().toLocaleLowerCase('de-DE')) || null;
}
export function getCustomerSalutationEntries(entries = []) {
  const byLabel = new Map(entries.map((entry) => [String(entry.bezeichnung || '').trim().toLocaleLowerCase('de-DE'), entry]));
  return ['Herr', 'Frau', 'Firma'].map((label) => byLabel.get(label.toLocaleLowerCase('de-DE'))).filter(Boolean);
}
export function createEmptyAddress(extra = {}) { return { ...extra, strasse: '', plz: '', ort: '', land: 'DE', region: '' }; }
export function createEmptyContact() {
  return { anrede: '', titel: '', vorname: '', name: '', abteilung: '', position: '', telefon: '', fax: '', mobil: '', email: '', sprache: '', ranking: '', notiz: '', geburtstag: '', eigeneAnschrift: null };
}
export function createCustomerDraft(context) {
  const paymentDefault = context.lists.zahlungsbedingungen.eintraege.find((entry) => entry.vorgabe);
  return {
    invoiceSame: true, bankEnabled: false,
    stammdaten: {
      name1: '', name2: '', matchcode: '', anrede: '', sprache: 'de', anschrift: createEmptyAddress(), postfach: null,
      kontakt: { telefon: '', fax: '', email: '', homepage: '' }, steuer: { ustIdNr: '', weitereUstIdNrn: [] },
    },
    rechnungsanschrift: { anrede: '', name1: '', name2: '', abteilung: '', ...createEmptyAddress(), email: '', emailMahnung: '' },
    vertrieb: { aussendienst: context.ownShortCode, innendienst: context.ownShortCode, verkaufsbuero: '' },
    zahlung: { zahlungsbedingungId: paymentDefault?.schluessel || '', bankeinzug: false },
    bank: { iban: '', bic: '', bank: '', kontoinhaber: '', info: '' },
    ansprechpartner: [], lieferanschriften: [],
  };
}
export function buildCustomerCreationBody(draft, confirmations = []) {
  const { invoiceSame, bankEnabled, ...body } = structuredClone(draft);
  delete body.privatePerson;
  if (invoiceSame) {
    const base = body.stammdaten;
    body.rechnungsanschrift = {
      ...body.rechnungsanschrift, anrede: base.anrede, name1: base.name1, name2: base.name2,
      strasse: base.anschrift.strasse, plz: base.anschrift.plz, ort: base.anschrift.ort, land: base.anschrift.land,
    };
  }
  if (!bankEnabled) body.bank = null;
  body.bestaetigteNichtDubletten = confirmations;
  return body;
}
export function validateCustomerDraft(draft, context) {
  const body = buildCustomerCreationBody(draft);
  const errors = {};
  const required = (value, path) => { if (!String(value || '').trim()) errors[path] = 'required'; };
  required(body.stammdaten.name1, 'stammdaten.name1');
  required(body.stammdaten.anrede, 'stammdaten.anrede');
  const customerType = getCustomerSalutationType(body.stammdaten.anrede, context.lists.anreden.eintraege);
  if (body.stammdaten.anrede && !customerType) errors['stammdaten.anrede'] = 'required';
  const country = context.lists.laender.eintraege.find((entry) => entry.schluessel === body.stammdaten.anschrift.land);
  for (const key of ['strasse', 'plz', 'ort', 'land']) required(body.stammdaten.anschrift[key], `stammdaten.anschrift.${key}`);
  if (!country) errors['stammdaten.anschrift.land'] = 'required';
  if (customerType !== 'private' && country?.euLand !== false) required(body.stammdaten.steuer.ustIdNr, 'stammdaten.steuer.ustIdNr');
  required(body.rechnungsanschrift.email, 'rechnungsanschrift.email');
  if (!draft.invoiceSame) for (const key of ['name1', 'strasse', 'plz', 'ort', 'land']) required(body.rechnungsanschrift[key], `rechnungsanschrift.${key}`);
  body.ansprechpartner.forEach((contact, index) => {
    required(contact.name, `ansprechpartner[${index}].name`);
    if (contact.eigeneAnschrift) for (const key of ['strasse', 'plz', 'ort', 'land']) required(contact.eigeneAnschrift[key], `ansprechpartner[${index}].eigeneAnschrift.${key}`);
  });
  body.lieferanschriften.forEach((entry, index) => {
    for (const key of ['strasse', 'plz', 'ort', 'land']) required(entry[key], `lieferanschriften[${index}].${key}`);
  });
  body.stammdaten.steuer.weitereUstIdNrn.forEach((entry, index) => {
    for (const key of ['land', 'ustIdNr']) required(entry[key], `stammdaten.steuer.weitereUstIdNrn[${index}].${key}`);
  });
  return errors;
}
export function getCreationFieldLimit(path) {
  const key = path.split('.').at(-1);
  if (key === 'strasse') return path.startsWith('lieferanschriften') || path.includes('eigeneAnschrift') ? 50 : 100;
  if (key === 'plz') return path.startsWith('rechnungsanschrift') || path.startsWith('lieferanschriften') ? 10 : 15;
  if (key === 'name1' || key === 'name2' || key === 'name' || key === 'ort') return 50;
  if (key === 'vorname' || key === 'anrede') return 25;
  if (key === 'matchcode' || key === 'region') return 100;
  if (['telefon', 'fax', 'mobil', 'titel', 'abteilung', 'position'].includes(key)) return 50;
  if (key === 'bank' || key === 'kontoinhaber') return 200;
  if (key === 'postfach') return 15;
  if (key === 'wunschnummer') return 10;
  return undefined;
}
export function setCreationValue(draft, path, value) {
  const result = structuredClone(draft);
  const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let target = result;
  for (const key of keys.slice(0, -1)) target = target[key];
  target[keys.at(-1)] = value;
  return result;
}
export function getCreationValue(draft, path) {
  return path.replace(/\[(\d+)\]/g, '.$1').split('.').reduce((value, key) => value?.[key], draft);
}
// getRandomValues is also available on the app's internal HTTP origin.
export function createCustomerOperationId(cryptoApi = globalThis.crypto) {
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
