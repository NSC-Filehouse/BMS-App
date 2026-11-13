import test from 'node:test';
import assert from 'node:assert/strict';
import {optionNormalizationNotes, optionDeliveryTerm, optionReviewWarnings} from '../src/utils/optionDisplay.js';
import {optionMailDocument} from '../src/utils/optionSource.js';

test('calculated truck quantities replace obsolete conversion warnings while preserving other import notes',()=>{
  const old='LKW-Anzahl erhalten; ohne bestätigtes Ladegewicht keine exakte kg-Umrechnung.';
  const position={positionPackaging:'Sackware',truckLoadKg:24750,offeredKg:24750,normalization:{notes:[old,'Preisbezug prüfen.']}};
  assert.equal(optionNormalizationNotes(position),'LKW-Menge gemäß Verpackungsart mit 24.750 kg je LKW berechnet. · Preisbezug prüfen.');
  assert.equal(optionNormalizationNotes({...position,truckLoadKg:null,offeredKg:null}),`${old} · Preisbezug prüfen.`);
  assert.match(optionNormalizationNotes({...position,positionPackaging:null,truckLoadKg:25000}),/Silo-Vorbelegung.*25.000/);
  assert.equal(optionNormalizationNotes({}), '');
});

test('compact delivery terms omit the Incoterms label while preserving alternatives and location',()=>{
  const original='FCA / DDP (Incoterms 2020)';
  assert.equal(optionDeliveryTerm(original),'FCA / DDP');
  assert.equal(optionDeliveryTerm('FCA (Incoterms® 2020)','Geleen'),'FCA Geleen');
  assert.equal(optionDeliveryTerm(null,'NL'),'NL');
  assert.equal(optionDeliveryTerm('DDP','Porvoo'),'DDP Porvoo');
  assert.equal(original,'FCA / DDP (Incoterms 2020)');
});

test('price, quantity and stock problems remain visible when import notes are collapsed',()=>{
  const t=key=>key;
  assert.deepEqual(optionReviewWarnings({price:980,pricePerTonne:null,offeredKg:null,minimumOrderKg:100,stockKg:50},t),[
    'option_price_basis_unconfirmed','option_total_unconfirmed','option_stock_below_minimum',
  ]);
  assert.deepEqual(optionReviewWarnings({price:980,pricePerTonne:980,offeredKg:25000},t),[]);
  assert.deepEqual(optionReviewWarnings({price:980,priceNeedsReview:true,offeredKg:25000},t),[]);
});

test('source text is escaped and original HTML tables render behind a restrictive resource policy',()=>{
  const text=optionMailDocument('<script>alert("x")</script>\nFCA & Bags','Text');
  assert.match(text,/<pre>&lt;script&gt;/);
  assert.doesNotMatch(text,/<script>/);
  assert.match(text,/FCA &amp; Bags/);
  const html=optionMailDocument('<table><tr><td>FCA ex Geleen</td></tr></table>','HTML');
  assert.match(html,/<table><tr><td>FCA ex Geleen/);
  assert.ok(html.indexOf('Content-Security-Policy')<html.indexOf('<table>'));
  assert.match(html,/default-src 'none'/);
  assert.match(html,/img-src data:/);
  assert.match(html,/base-uri 'none'/);
});
