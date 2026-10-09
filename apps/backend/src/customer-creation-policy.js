const { createHash } = require('node:crypto');
const { createHttpError } = require('./utils');

// Match the active FX identity on all three fields so a reused short code does
// not grant developer access to customer creation in every tenant.
const CUSTOMER_CREATION_DEVELOPERS = [
  { shortCode: 'AKI', personNumber: 1, userId: 'kimaz' },
  { shortCode: 'MFR', personNumber: 130, userId: 'm.frank' },
  { shortCode: 'NSC', personNumber: 227, userId: 'n.schroeder' },
];
// Rollback is a higher-risk capability than customer creation. Keep its
// allowlist separate and limit it to these exact active developer identities.
const CUSTOMER_ROLLBACK_DEVELOPERS = [
  { shortCode: 'AKI', personNumber: 1, userId: 'kimaz' },
  { shortCode: 'MFR', personNumber: 130, userId: 'm.frank' },
  { shortCode: 'NSC', personNumber: 227, userId: 'n.schroeder' },
];
// EUR countries, including the non-EU European states and French territories
// that use the euro. Bulgaria joined the euro area on 2026-01-01.
const EURO_CURRENCY_COUNTRY_CODES = new Set([
  'AD', 'AT', 'AX', 'BE', 'BG', 'BL', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GF', 'GP',
  'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MC', 'ME', 'MF', 'MQ', 'MT', 'NL',
  'PM', 'PT', 'RE', 'SI', 'SK', 'SM', 'TF', 'VA', 'XK', 'YT',
]);
const text = (value) => value === null || value === undefined ? null : String(value).trim() || null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function canCreateCustomer(identity, database, settings) {
  const shortCode = String(identity?.shortCode || '').trim().toUpperCase();
  const companyId = Number(database?.firmaId);
  const mandant = String(database?.shortName || '').trim().toUpperCase();
  if (settings.enabled !== true || identity?.active !== true
    || !Number.isSafeInteger(companyId) || companyId < 0
    || !Boolean(text(identity.shortCode)) || !Boolean(text(identity.userId))
    || !/^[A-Z0-9]{1,10}$/.test(mandant)) return false;

  const personNumber = Number(identity.personNumber);
  const userId = String(identity.userId || '').trim().toLowerCase();
  if (CUSTOMER_CREATION_DEVELOPERS.some((user) => (
    user.shortCode === shortCode && user.personNumber === personNumber && user.userId === userId
  ))) return true;
  return settings.enabled === true && identity?.active === true
    && Number.isInteger(identity.mainCompanyId) && identity.mainCompanyId > 0
    && companyId === identity.mainCompanyId
    && mandant !== 'TES';
}
function assertCanCreateCustomer(identity, database, settings) {
  if (!canCreateCustomer(identity, database, settings)) {
    throw createHttpError(403, 'Die Kundenanlage ist für diesen Benutzer und Mandanten nicht freigegeben.', { code: 'CUSTOMER_CREATION_FORBIDDEN' });
  }
}
function isCustomerRollbackDeveloper(identity) {
  if (identity?.active !== true) return false;
  const shortCode = String(identity?.shortCode || '').trim().toUpperCase();
  const personNumber = Number(identity?.personNumber);
  const userId = String(identity?.userId || '').trim().toLowerCase();
  return CUSTOMER_ROLLBACK_DEVELOPERS.some((user) => (
    user.shortCode === shortCode && user.personNumber === personNumber && user.userId === userId
  ));
}
function assertCustomerRollbackDeveloper(identity) {
  if (!isCustomerRollbackDeveloper(identity)) {
    throw createHttpError(403, 'Der App-Rückbau ist nur für AKI, MFR und NSC freigegeben.', { code: 'CUSTOMER_ROLLBACK_FORBIDDEN' });
  }
}
function isCustomerRollbackPreviewExecutable(preview) {
  return preview?.ausfuehrbar === true;
}
function pick(source, fields) {
  return Object.fromEntries(fields.map((field) => [field, text(source?.[field])]));
}
function address(source, extra = []) {
  return pick(source, [...extra, 'strasse', 'plz', 'ort', 'land', 'region']);
}
function nullableBoolean(value) { return typeof value === 'boolean' ? value : null; }
function countryUsesEuroCurrency(countryCode) {
  return EURO_CURRENCY_COUNTRY_CODES.has(String(countryCode || '').trim().toUpperCase());
}
function customerTypeForSalutation(value, salutations = []) {
  const selected = salutations.find((entry) => String(entry.schluessel) === String(value));
  const label = String(selected?.bezeichnung || '').trim().toLocaleLowerCase('de-DE');
  if (label === 'herr' || label === 'frau') return 'private';
  if (label === 'firma') return 'company';
  return null;
}
function normalizeCreationRequest(input, identity, database, settings, countries, salutations, operationId, employees = []) {
  assertCanCreateCustomer(identity, database, settings);
  if (!UUID.test(String(operationId || ''))) throw createHttpError(400, 'Ungültiger Vorgangsschlüssel.', { code: 'CUSTOMER_CREATION_KEY_INVALID' });
  const countryValue = String(input?.stammdaten?.anschrift?.land || '').trim().toUpperCase();
  const country = countries.find((entry) => entry.schluessel === countryValue);
  const paymentInput = input?.zahlung || {};
  const base = input?.stammdaten || {};
  const anrede = text(base.anrede);
  const customerType = customerTypeForSalutation(anrede, salutations);
  // Keep already pending operations retryable across the UI change. New requests
  // derive this flag exclusively from the selected ERP salutation.
  const legacyRequest = typeof input?.privatePerson === 'boolean';
  const privatePerson = legacyRequest ? input.privatePerson : customerType === 'private';
  const vat = text(base.steuer?.ustIdNr);
  const steuer = {
    ustIdNr: vat,
    ustIdNrFehltGrund: vat ? null : country?.euLand === false ? 'DRITTLAND' : privatePerson ? 'PRIVATPERSON' : null,
    ustIdNrFehltErlaeuterung: null,
    weitereUstIdNrn: Array.isArray(base.steuer?.weitereUstIdNrn)
      ? base.steuer.weitereUstIdNrn.map((entry) => pick(entry, ['land', 'ustIdNr'])) : null,
  };
  const ownCode = text(identity.shortCode);
  const employeeCodes = new Map((employees || []).map((entry) => {
    const code = text(entry?.schluessel);
    return code ? [code.toUpperCase(), code] : null;
  }).filter(Boolean));
  const requestedOutsideCode = text(input?.vertrieb?.aussendienst) || ownCode;
  const selectedOutsideCode = employeeCodes.get(String(requestedOutsideCode || '').toUpperCase()) || requestedOutsideCode;
  const payload = {
    quelle: { angelegtVon: ownCode, externeReferenz: `BMSAPP-${operationId}` },
    wunschnummer: null,
    kopierenNach: database.shortName === settings.stammMandant ? [] : [database.shortName],
    bestaetigteNichtDubletten: Array.isArray(input?.bestaetigteNichtDubletten)
      ? input.bestaetigteNichtDubletten.map((entry) => pick(entry, ['kundennummer', 'begruendung'])) : null,
    stammdaten: {
      ...pick(base, ['name1', 'name2', 'matchcode', 'anrede', 'sprache']),
      anschrift: { ...address(base.anschrift), land: country?.schluessel || countryValue || null },
      postfach: base.postfach ? { ...pick(base.postfach, ['postfach', 'plz', 'ort']), standardanschrift: nullableBoolean(base.postfach.standardanschrift) } : null,
      kontakt: pick(base.kontakt, ['telefon', 'fax', 'email', 'homepage']), steuer,
    },
    rechnungsanschrift: input?.rechnungsanschrift ? pick(input.rechnungsanschrift, ['anrede', 'name1', 'name2', 'abteilung', 'strasse', 'plz', 'ort', 'land', 'email', 'emailMahnung']) : null,
    vertrieb: { aussendienst: selectedOutsideCode, innendienst: text(input?.vertrieb?.innendienst) || ownCode, verkaufsbuero: text(input?.vertrieb?.verkaufsbuero) },
    zahlung: {
      zahlungsbedingungId: paymentInput.zahlungsbedingungId === null || paymentInput.zahlungsbedingungId === '' || paymentInput.zahlungsbedingungId === undefined
        ? null : Number(paymentInput.zahlungsbedingungId),
      euro: countryUsesEuroCurrency(countryValue),
      bankeinzug: nullableBoolean(paymentInput.bankeinzug),
    },
    bank: input?.bank ? pick(input.bank, ['iban', 'bic', 'bank', 'kontoinhaber', 'info']) : null,
    kennzeichen: { keinSerienbrief: null },
    branchen: [],
    kategorien: [],
    notiz: null,
    ansprechpartner: Array.isArray(input?.ansprechpartner) ? input.ansprechpartner.map((entry) => ({
      ...pick(entry, ['anrede', 'titel', 'vorname', 'name', 'abteilung', 'position', 'telefon', 'fax', 'mobil', 'email', 'sprache', 'notiz', 'geburtstag']),
      ranking: entry.ranking === null || entry.ranking === '' || entry.ranking === undefined ? null : Number(entry.ranking),
      eigeneAnschrift: entry.eigeneAnschrift ? pick(entry.eigeneAnschrift, ['strasse', 'plz', 'ort', 'land']) : null,
    })) : [],
    lieferanschriften: Array.isArray(input?.lieferanschriften) ? input.lieferanschriften.map((entry) => address(entry, ['name1', 'name2'])) : [],
  };
  const fehler = [];
  const requireField = (value, field) => { if (!text(value)) fehler.push({ code: 'FELD.FEHLT', feld: field, nachricht: 'Pflichtfeld fehlt.', abhilfe: 'Bitte dieses Feld ausfüllen.' }); };
  if (!employeeCodes.has(String(selectedOutsideCode || '').toUpperCase())) {
    fehler.push({ code: 'SCHLUESSEL.UNBEKANNT', feld: 'vertrieb.aussendienst', nachricht: 'Der ausgewählte Außendienst ist nicht in der ERP-Mitarbeiterliste enthalten.', abhilfe: 'Bitte einen Mitarbeiter aus der Liste wählen.' });
  }
  requireField(payload.stammdaten.name1, 'stammdaten.name1');
  if (!legacyRequest) {
    if (!anrede) requireField(payload.stammdaten.anrede, 'stammdaten.anrede');
    else if (!customerType) fehler.push({ code: 'SCHLUESSEL.UNBEKANNT', feld: 'stammdaten.anrede', nachricht: 'Bitte Herr, Frau oder Firma auswählen.', abhilfe: 'Bitte eine der drei Anreden aus der Liste wählen.' });
  }
  for (const field of ['strasse', 'land', 'plz', 'ort']) requireField(payload.stammdaten.anschrift[field], `stammdaten.anschrift.${field}`);
  if (countryValue && !country) fehler.push({ code: 'SCHLUESSEL.UNBEKANNT', feld: 'stammdaten.anschrift.land', nachricht: 'Bitte ein Land aus der Liste wählen.' });
  if (!vat && !privatePerson && country?.euLand !== false) requireField(vat, 'stammdaten.steuer.ustIdNr');
  // The app's existing order hand-off needs an invoice email, independently of VAT.
  requireField(payload.rechnungsanschrift?.email, 'rechnungsanschrift.email');
  if (payload.rechnungsanschrift?.email && !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(payload.rechnungsanschrift.email)) {
    fehler.push({ code: 'EMAIL.FORMAT', feld: 'rechnungsanschrift.email', nachricht: 'Bitte eine gültige Rechnungs-E-Mail-Adresse eingeben.' });
  }
  if (fehler.length) throw createHttpError(422, 'Bitte die markierten Kundendaten ergänzen.', { code: 'CUSTOMER_CREATION_VALIDATION', fehler });
  return {
    payload, privatePerson, countryIso: country.schluessel,
    hash: createHash('sha256').update(JSON.stringify({ payload, privatePerson })).digest('hex'),
  };
}
function isUncertainResponse(status, code) {
  return status >= 500 || status === 408 || code === 'IDEMPOTENZ.VORGANG_LAEUFT';
}
module.exports = {
  UUID,
  canCreateCustomer,
  assertCanCreateCustomer,
  isCustomerRollbackDeveloper,
  assertCustomerRollbackDeveloper,
  isCustomerRollbackPreviewExecutable,
  normalizeCreationRequest,
  countryUsesEuroCurrency,
  isUncertainResponse,
};
