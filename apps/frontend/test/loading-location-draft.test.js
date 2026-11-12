import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLoadingLocationText,loadingLocationDraftErrors} from '../src/utils/loadingLocationDraft.js';

const countries=[{id:'NLD',isoAlpha2:'NL',name:'Niederlande'}];
const draft={name:' SABIC Europe ',street:'Prins Mauritslaan 220',postalCode:'6161 RC',city:'Geleen',countryId:'NLD',pickupTimes:'Mo-Fr 7-21 Uhr',contact:'Tor 6',notes:'Nur Curtainsider'};

test('new loading address retains company, complete address and optional loading instructions as the order text',()=>{
  assert.deepEqual(Object.values(loadingLocationDraftErrors(draft,countries)),[false,false,false,false,false,false]);
  assert.equal(buildLoadingLocationText(draft,countries),'SABIC Europe\nPrins Mauritslaan 220\n6161 RC Geleen\nNL — Niederlande\nLadezeiten: Mo-Fr 7-21 Uhr\nKontakt: Tor 6\nNur Curtainsider');
});

test('address form requires structured address and a real country choice and enforces the existing 1000-character limit',()=>{
  const missing=loadingLocationDraftErrors({},countries);
  for(const field of ['name','street','postalCode','city','countryId'])assert.equal(missing[field],true);
  assert.equal(loadingLocationDraftErrors({...draft,countryId:'NOT_A_COUNTRY'},countries).countryId,true);
  assert.equal(loadingLocationDraftErrors({...draft,notes:'x'.repeat(1000)},countries).tooLong,true);
});
