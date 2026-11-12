import test from 'node:test';
import assert from 'node:assert/strict';
import {optionNormalizationNotes} from '../src/utils/optionDisplay.js';

test('calculated truck quantities replace obsolete conversion warnings while preserving other import notes',()=>{
  const old='LKW-Anzahl erhalten; ohne bestätigtes Ladegewicht keine exakte kg-Umrechnung.';
  const position={positionPackaging:'Sackware',truckLoadKg:24750,offeredKg:24750,normalization:{notes:[old,'Preisbezug prüfen.']}};
  assert.equal(optionNormalizationNotes(position),'LKW-Menge gemäß Verpackungsart mit 24.750 kg je LKW berechnet. · Preisbezug prüfen.');
  assert.equal(optionNormalizationNotes({...position,truckLoadKg:null,offeredKg:null}),`${old} · Preisbezug prüfen.`);
  assert.match(optionNormalizationNotes({...position,positionPackaging:null,truckLoadKg:25000}),/Silo-Vorbelegung.*25.000/);
  assert.equal(optionNormalizationNotes({}), '');
});
