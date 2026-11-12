import test from 'node:test';
import assert from 'node:assert/strict';
import {loadingLocationParts} from '../src/utils/loadingLocationDisplay.js';

test('loading places show company and location instead of repeated pickup headers and long transport instructions',()=>{
  const first='PICK UP ADDRESS:\nSabic Petrochemicals B.V.\nChemelot Gate 6\nPr. Mauritslaan 220\n6161 Geleen\nNETHERLANDS';
  const second='PICK UP ADDRESS:\nSABIC Europe\nChemelot Gate 6 (bags) Gate 7 (silo)\nONLY curtain-sided trailer !!\nAvis für Container 48 h vorher!\nPrins Mauritslaan 220\n6161 RC Sittard-Geleen\nNETHERLANDS\nTime of Shipment/Pickup: MO - FR: 7:00 - 21:00 Uhr';
  assert.deepEqual(loadingLocationParts(first),{primary:'Sabic Petrochemicals B.V.',secondary:'6161 Geleen · Chemelot Gate 6 · Pr. Mauritslaan 220'});
  const compact=loadingLocationParts(second);
  assert.equal(compact.primary,'SABIC Europe');assert.match(compact.secondary,/^6161 RC Sittard-Geleen/);
  assert.match(compact.secondary,/Gate 6 \(bags\) Gate 7 \(silo\)/);assert.doesNotMatch(compact.secondary,/ONLY|Avis|Time of/);
});

test('German labels, single-line addresses and empty values remain readable',()=>{
  assert.deepEqual(loadingLocationParts('ABHOLADRESSE:\nSabic Gelsenkirchen\nFeldhauser Str. Tor Süd\n45896 Gelsenkirchen'),{primary:'Sabic Gelsenkirchen',secondary:'45896 Gelsenkirchen · Feldhauser Str. Tor Süd'});
  assert.deepEqual(loadingLocationParts('Firma, Hauptstraße 1, 12345 Ort'),{primary:'Firma',secondary:'12345 Ort · Hauptstraße 1'});
  assert.deepEqual(loadingLocationParts(''),{primary:'–',secondary:''});
});
