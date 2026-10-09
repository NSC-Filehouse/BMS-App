import test from 'node:test';
import assert from 'node:assert/strict';
import { CREATION_LABELS, CREATION_LISTS, createCustomerDraft, buildCustomerCreationBody, validateCustomerDraft, getCreationFieldLimit, getCustomerSalutationEntries, setCreationValue } from '../src/utils/customerCreation.js';
import { getMissingCustomerOrderRequirements } from '../src/utils/customerOrderRequirements.js';
const context = { ownShortCode: 'TST', lists: { laender: { eintraege: [{ schluessel: 'DE', euLand: true }, { schluessel: 'US', euLand: false }] }, anreden: { eintraege: [{ schluessel: 'H', bezeichnung: 'Herr' }, { schluessel: 'F', bezeichnung: 'Frau' }, { schluessel: 'FI', bezeichnung: 'Firma' }, { schluessel: 'D', bezeichnung: 'Divers' }] }, zahlungsbedingungen: { eintraege: [{ schluessel: '57', vorgabe: true }] } } };
function filled() { const draft = createCustomerDraft(context); draft.stammdaten.name1 = 'Müller'; draft.stammdaten.anrede = 'FI'; Object.assign(draft.stammdaten.anschrift, { strasse: 'Straße 1', plz: '12345', ort: 'München' }); draft.stammdaten.steuer.ustIdNr = 'DE123456789'; draft.rechnungsanschrift.email = 'invoice@example.com'; return draft; }
test('creation labels follow ERP field names and both sales representatives use the employee list', () => {
  assert.deepEqual(CREATION_LABELS.name1, ['Name1', 'Name1']);
  assert.deepEqual(CREATION_LABELS.name2, ['Name2', 'Name2']);
  assert.deepEqual(CREATION_LABELS.matchcode, ['MatchCode', 'MatchCode']);
  assert.deepEqual(CREATION_LABELS.email, ['eMail', 'Email']);
  assert.equal(CREATION_LISTS.aussendienst, 'mitarbeiter');
  assert.equal(CREATION_LISTS.innendienst, 'mitarbeiter');
});
test('new draft defaults both sales representatives to the signed-in employee and omits removed controls', () => {
  const draft = createCustomerDraft(context);
  assert.equal(draft.vertrieb.aussendienst, 'TST');
  assert.equal(draft.vertrieb.innendienst, 'TST');
  assert.equal(draft.zahlung.euro, undefined);
  for (const key of ['branchen', 'kategorien', 'wunschnummer', 'notiz', 'kennzeichen']) assert.equal(key in draft, false);
  const request = buildCustomerCreationBody(filled());
  assert.equal(request.zahlung.euro, undefined);
  assert.equal(request.kategorien, undefined);
});
test('same invoice address supplies the complete address plus separate invoice email', () => {
  const request = buildCustomerCreationBody(filled());
  assert.equal(request.rechnungsanschrift.name1, 'Müller'); assert.equal(request.rechnungsanschrift.strasse, 'Straße 1');
  assert.equal(request.rechnungsanschrift.email, 'invoice@example.com'); assert.equal(request.invoiceSame, undefined); assert.equal(request.bank, null);
});
test('invoice address follows edits to the main address only when linked', () => {
  const draft = filled(); draft.stammdaten.anschrift.ort = 'Berlin'; assert.equal(buildCustomerCreationBody(draft).rechnungsanschrift.ort, 'Berlin');
  draft.invoiceSame = false; draft.rechnungsanschrift.ort = 'Hamburg'; assert.equal(buildCustomerCreationBody(draft).rechnungsanschrift.ort, 'Hamburg');
});
test('VAT is required for EU companies but not private individuals or non-EU customers', () => {
  const draft = filled(); draft.stammdaten.steuer.ustIdNr = '';
  assert.ok(validateCustomerDraft(draft, context)['stammdaten.steuer.ustIdNr']);
  draft.stammdaten.anrede = 'H'; assert.equal(validateCustomerDraft(draft, context)['stammdaten.steuer.ustIdNr'], undefined);
  draft.stammdaten.anrede = 'F'; assert.equal(validateCustomerDraft(draft, context)['stammdaten.steuer.ustIdNr'], undefined);
  draft.stammdaten.anrede = 'FI'; draft.stammdaten.anschrift.land = 'US'; assert.equal(validateCustomerDraft(draft, context)['stammdaten.steuer.ustIdNr'], undefined);
});
test('main customer salutation offers only Herr, Frau and Firma and is mandatory', () => {
  const draft = filled();
  assert.deepEqual(getCustomerSalutationEntries(context.lists.anreden.eintraege).map((entry) => entry.bezeichnung), ['Herr', 'Frau', 'Firma']);
  draft.privatePerson = true;
  assert.equal(buildCustomerCreationBody(draft).privatePerson, undefined);
  draft.stammdaten.anrede = '';
  assert.equal(validateCustomerDraft(draft, context)['stammdaten.anrede'], 'required');
});
test('repeated contacts and delivery addresses get indexed mandatory field errors', () => {
  const draft = filled(); draft.ansprechpartner = [{ name: '', eigeneAnschrift: { land: 'DE' } }]; draft.lieferanschriften = [{ land: 'DE' }];
  const errors = validateCustomerDraft(draft, context);
  assert.ok(errors['ansprechpartner[0].name']); assert.ok(errors['ansprechpartner[0].eigeneAnschrift.strasse']); assert.ok(errors['lieferanschriften[0].plz']);
});
test('nested edits keep the draft immutable and preserve Unicode', () => {
  const draft = filled(); const next = setCreationValue(draft, 'stammdaten.anschrift.ort', 'Düsseldorf');
  assert.equal(draft.stammdaten.anschrift.ort, 'München'); assert.equal(next.stammdaten.anschrift.ort, 'Düsseldorf');
});
test('field limits distinguish main, invoice, delivery and contact addresses', () => {
  assert.equal(getCreationFieldLimit('stammdaten.anschrift.strasse'), 100);
  assert.equal(getCreationFieldLimit('lieferanschriften[0].strasse'), 50);
  assert.equal(getCreationFieldLimit('rechnungsanschrift.plz'), 10);
  assert.equal(getCreationFieldLimit('ansprechpartner[0].eigeneAnschrift.plz'), 15);
});
test('order forms use authoritative backend VAT exemptions without dropping invoice requirements', () => {
  assert.deepEqual(getMissingCustomerOrderRequirements({ customerRequirements: { available: true, customerFound: true, missingFields: ['invoiceEmail'] } }), ['invoiceEmail']);
  assert.deepEqual(getMissingCustomerOrderRequirements({ kd_RG_Email: 'invoice@example.com' }), ['vatId']);
});
test('customer operation UUIDs remain cryptographically random on internal HTTP origins', async () => {
  const { createCustomerOperationId } = await import('../src/utils/customerCreation.js');
  const fakeCrypto = { getRandomValues: (bytes) => { bytes.fill(255); return bytes; } };
  assert.equal(createCustomerOperationId(fakeCrypto), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
  assert.match(createCustomerOperationId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
