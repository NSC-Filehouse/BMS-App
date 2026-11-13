import test from 'node:test';
import assert from 'node:assert/strict';
import {optionDeliveryTerm,optionPackagingText,optionPackaging} from '../src/utils/optionDisplay.js';
import {optionMailDocument} from '../src/utils/optionSource.js';

test('compact delivery terms omit the Incoterms label while preserving alternatives and location',()=>{
  const original='FCA / DDP (Incoterms 2020)';
  assert.equal(optionDeliveryTerm(original),'FCA / DDP');
  assert.equal(optionDeliveryTerm('FCA (Incoterms® 2020)','Geleen'),'FCA Geleen');
  assert.equal(optionDeliveryTerm(null,'NL'),'NL');
  assert.equal(optionDeliveryTerm('DDP','Porvoo'),'DDP Porvoo');
  assert.equal(original,'FCA / DDP (Incoterms 2020)');
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

test('option views use the selected dictionary language and retain the raw source as fallback',()=>{
  const head={packagingText:'Bags and / or Bulk',packagingDisplay:{de:'Sackware und/oder Siloware',en:'Bags and/or Silo/bulk'}};
  assert.equal(optionPackagingText(head),'Sackware und/oder Siloware');
  assert.equal(optionPackagingText(head,'en'),'Bags and/or Silo/bulk');
  assert.equal(optionPackagingText({packagingText:'Unbekannt'}),'Unbekannt');
  const position={positionPackaging:'BAGS',packagingDisplay:{de:'Sackware',en:'Bags'},bagWeightKg:25};
  assert.equal(optionPackaging(position),'Sackware · 25-kg-Gebinde');
  assert.equal(optionPackaging(position,'en'),'Bags · 25-kg-Gebinde');
  assert.equal(position.positionPackaging,'BAGS');
});
