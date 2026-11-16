import test from 'node:test';
import assert from 'node:assert/strict';
import {optionDeliveryTerm,optionPackagingText,optionPackaging,optionPackagingLayout,optionArticleBlocked,optionArticleUnverified,optionPositionTitle,optionCategory,optionPositionPath} from '../src/utils/optionDisplay.js';
import {optionMailDocument} from '../src/utils/optionSource.js';

test('titles include the prepared MFI once with spaces and categories use BMS names',()=>{
 assert.equal(optionPositionTitle({articleName:'PPH 3000 OG',mfi:1}),'PPH 3000 OG MFI 1');
 assert.equal(optionPositionTitle({articleName:'PPCP near to prime mfi 8.0',mfi:8}),'PPCP near to prime MFI 8');
 assert.equal(optionPositionTitle({articleName:'PPH 3000 OG',mfi:null}),'PPH 3000 OG');
 assert.equal(optionCategory({materialCategory:'PPCP'}),'PP Copo');
 assert.equal(optionPositionPath(621,1895),'/options/621/positions/1895');
});
test('mail images resolve only stored safe CID images while external requests remain blocked',()=>{
 const html=optionMailDocument('<img src="cid:IMAGE%40mail"><img src="https://example.test/tracker">','html',[{cid:'image@mail',mime:'image/png',data:'AA=='}]);
 assert.match(html,/src="data:image\/png;base64,AA=="/);assert.match(html,/img-src data:/);
 assert.doesNotMatch(optionMailDocument('<img src="cid:x">','html',[{cid:'x',mime:'image/svg+xml',data:'AA=='}]),/data:image\/svg/);
});

test('packaging is shown once while different per-position packages and alternatives survive',()=>{
  const offer={packagingDisplay:{de:'Sackware und/oder Siloware'},positions:[{id:1,positionPackaging:'Mehrere Verpackungsarten'},{id:2,positionPackaging:'Mehrere Verpackungsarten'}]};
  assert.deepEqual(optionPackagingLayout(offer),{common:'Sackware und/oder Siloware',positions:{}});
  assert.deepEqual(optionPackagingLayout({positions:[{id:1,positionPackaging:'Sackware'},{id:2,positionPackaging:'Siloware'}]}),{common:'',positions:{1:'Sackware',2:'Siloware'}});
});
test('both material and MFI determine whether an article can be selected automatically',()=>{
  assert.equal(optionArticleBlocked({materialCheck:{blocked:true}}),true);
  assert.equal(optionArticleUnverified({mfiCheck:{complete:true},materialCheck:{complete:false}}),true);
  assert.equal(optionArticleUnverified({mfiCheck:{complete:true},materialCheck:{complete:true}}),false);
});

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
