import test from 'node:test';
import assert from 'node:assert/strict';
import { contactStorageKey, readContactPending, validateContactDraft, contactDraft, contactProblemFields } from '../src/utils/contactCreation.js';
import { CONTACT_FIELDS, getCreationFieldLimit } from '../src/utils/customerCreation.js';
import { submitContact } from '../src/utils/contactSubmission.js';

const id = '44d1d586-c395-46b9-8b0b-8b3da41e6d64';
const body = { contact: { name: 'Muster', vorname: 'Max' }, confirmed: false, reason: '', warningsAccepted: false };
const pending = { id, body };
function fixture(responses) {
  const calls = [], events = [];
  const storage = new Map();
  const options = { base: '/customers/10001/contacts', body, pending: null, send: true, writeEnabled: true,
    storage: { setItem: (key, value) => { storage.set(key, value); events.push('saved'); } }, storageKey: 'pending' };
  const deps = { isCurrent: () => true, onPreflight: () => {}, onFrozen: (value) => { events.push('frozen'); options.pending = value; },
    onFailed: (value) => events.push(['failed', value]), onCreated: (value) => events.push(['created', value]),
    request: async (path, input) => {
      calls.push({ path, ...input }); events.push(path);
      const response = responses.shift();
      if (response instanceof Error) throw response;
      assert.ok(response, 'unexpected request'); return { data: response };
    } };
  return { options, deps, calls, events, storage };
}
test('contact fields match new-customer fields and retain all optional values', () => {
  const draft = contactDraft({ name: 'Muster', notiz: 'Notiz', ranking: 2, eigeneAnschrift: { land: 'DE' } });
  for (const key of CONTACT_FIELDS) assert.ok(Object.hasOwn(draft, key));
  assert.equal(draft.ranking, 2);
  assert.equal(getCreationFieldLimit('ansprechpartner.email'), 150);
  assert.equal(getCreationFieldLimit('ansprechpartner.eigeneAnschrift.strasse'), 50);
  assert.ok(validateContactDraft(draft)['eigeneAnschrift.strasse']);
  assert.ok(validateContactDraft(draft, true, 'kurz').reason);
  assert.deepEqual(contactProblemFields({ fehler: [{ feld: 'ansprechpartner.name', nachricht: 'Pflicht' }] }), { name: 'Pflicht' });
});
test('pending contacts are isolated by user, tenant and customer and reject invalid data', () => {
  const key = contactStorageKey('user', 'FRU', '10001');
  assert.notEqual(key, contactStorageKey('other', 'FRU', '10001'));
  assert.notEqual(key, contactStorageKey('user', 'PLA', '10001'));
  assert.notEqual(key, contactStorageKey('user', 'FRU', '10002'));
  assert.deepEqual(readContactPending({ getItem: () => JSON.stringify(pending) }, key), pending);
  for (const value of ['bad', '{}', JSON.stringify({ ...pending, id: 'bad' })]) assert.equal(readContactPending({ getItem: () => value }, key), null);
});
test('first creation checks input and persists frozen payload before sending', async () => {
  const f = fixture([{ ergebnis: 'anlegbar' }, { contact: { id: 9003 }, warnings: [] }]);
  await submitContact(f.options, f.deps);
  assert.equal(f.calls.length, 2);
  assert.ok(f.events.indexOf('saved') < f.events.indexOf(f.options.base));
  assert.equal(f.calls[1].headers['Idempotency-Key'], f.options.pending.id);
  assert.deepEqual(JSON.parse(f.calls[1].body), body);
  assert.deepEqual(f.events.at(-1), ['created', { contact: { id: 9003 }, warnings: [] }]);
});
test('duplicates, invalid input and unaccepted warnings prevent creation', async () => {
  for (const checked of [{ergebnis:'dubletten'}, {ergebnis:'ungueltig'}, {ergebnis:'anlegbar',warnungen:[{code:'REVIEW'}]}]) {
    const f = fixture([checked]); await submitContact(f.options, f.deps);
    assert.equal(f.calls.length, 1); assert.equal(f.storage.size, 0);
  }
});
test('accepted duplicate confirmation and warnings are preserved in the sent body', async () => {
  const f = fixture([{ergebnis:'anlegbar',vorhanden:[{lfdNr:1}],warnungen:[{code:'REVIEW'}]}, {contact:{id:9003}}]);
  f.options.body = { ...body, confirmed:true, reason:'Andere Person mit gleichem Namen', warningsAccepted:true };
  await submitContact(f.options, f.deps);
  assert.deepEqual(JSON.parse(f.calls[1].body), f.options.body);
});
test('readonly checks and storage failure never send the business write', async () => {
  const f = fixture([{ergebnis:'anlegbar'}]); f.options.send=false; f.options.writeEnabled=false;
  await submitContact(f.options,f.deps); assert.equal(f.calls.length,1);
  const broken = fixture([{ergebnis:'anlegbar'}]); broken.options.storage.setItem=()=>{throw new Error('storage blocked');};
  await assert.rejects(()=>submitContact(broken.options,broken.deps), /storage blocked/);
  assert.equal(broken.calls.length,1);
});
test('timeout retries retain the same key and payload and skip another precheck', async () => {
  const f=fixture([{ergebnis:'anlegbar'},new Error('timeout')]);
  await assert.rejects(()=>submitContact(f.options,f.deps),/timeout/);
  const saved=JSON.parse(f.storage.get('pending')); assert.deepEqual(saved,f.options.pending);
  const retry=fixture([{state:'unknown'},{contact:{id:9003}}]); retry.options.pending=saved;
  await submitContact(retry.options,retry.deps);
  assert.equal(retry.calls[1].headers['Idempotency-Key'],saved.id);
  assert.equal(retry.calls.some((call)=>call.path.endsWith('/check')),false);
});
test('confirmed creation only refreshes, even when writing is disabled; ranking warning survives', async () => {
  const f=fixture([{state:'created',contact:{id:9003},warnings:[{code:'ANSPRECHPARTNER.RANKING_NICHT_GESETZT'}]}]);
  f.options.pending=pending; f.options.writeEnabled=false;
  await submitContact(f.options,f.deps); assert.equal(f.calls.length,1);
  assert.equal(f.events.at(-1)[1].warnings[0].code,'ANSPRECHPARTNER.RANKING_NICHT_GESETZT');
});
test('refresh failure after creation retains pending data and never starts a new creation', async () => {
  const f=fixture([{ergebnis:'anlegbar'},{contact:{id:9003}}]); f.deps.onCreated=()=>{throw new Error('refresh failed');};
  await assert.rejects(()=>submitContact(f.options,f.deps),/refresh failed/);
  assert.ok(f.storage.get('pending'));
  const retry=fixture([{state:'created',contact:{id:9003}}]); retry.options.pending=f.options.pending;
  await submitContact(retry.options,retry.deps); assert.equal(retry.calls.length,1);
});
test('server-restored operations are saved locally before a status refresh can fail', async () => {
  const f=fixture([{state:'created',contact:{id:9003}}]); f.options.pending=pending;
  f.deps.onCreated=()=>{throw new Error('refresh failed');};
  await assert.rejects(()=>submitContact(f.options,f.deps),/refresh failed/);
  assert.deepEqual(JSON.parse(f.storage.get('pending')),pending);
  assert.equal(f.events[0],'saved');
});
test('terminal failure releases only the failed operation; authorization failure keeps it frozen', async () => {
  const failed=fixture([{state:'failed',problem:{detail:'Invalid'}}]); failed.options.pending=pending;
  await submitContact(failed.options,failed.deps); assert.deepEqual(failed.events.at(-1),['failed',{detail:'Invalid'}]);
  const denied=fixture([Object.assign(new Error('Denied'),{status:403})]); denied.options.pending=pending;
  await assert.rejects(()=>submitContact(denied.options,denied.deps),/Denied/); assert.equal(denied.options.pending,pending);
});
test('customer or tenant changes during preflight prevent saving and writing', async () => {
  const f=fixture([{ergebnis:'anlegbar'}]); let count=0; f.deps.isCurrent=()=>++count===1;
  await submitContact(f.options,f.deps); assert.equal(f.calls.length,1); assert.equal(f.storage.size,0);
});
