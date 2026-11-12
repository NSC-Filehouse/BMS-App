import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedTotalKg,defaultOptionPackagingId,truckOptionAvailability} from '../src/utils/optionQuantityConfirmation.js';

test('truck offers default to silo and recalculate the complete kg total when packaging changes',()=>{
  const packagingTypes=[{id:78,text:'Sackware'},{id:79,text:'Siloware',key:'silo'}];
  const meta={truckOffer:true,offeredTrucks:2,packagingTypes,offeredKg:50000,orderedKg:1000,confirmedPackagingTypeId:78};
  assert.equal(defaultOptionPackagingId(meta),79);
  assert.deepEqual(truckOptionAvailability(meta,packagingTypes[1]),{offeredKg:50000,orderedKg:1000,remainingKg:49000});
  assert.deepEqual(truckOptionAvailability(meta,packagingTypes[0]),{offeredKg:49500,orderedKg:1000,remainingKg:48500});
  assert.equal(truckOptionAvailability({...meta,offeredTrucks:null},packagingTypes[1]),null);
  assert.equal(truckOptionAvailability({...meta,offeredTrucks:1},packagingTypes[1]).offeredKg,25000);
  assert.equal(truckOptionAvailability({...meta,offeredKg:24000},packagingTypes[1]).offeredKg,24000);
  assert.equal(defaultOptionPackagingId({...meta,offeredTrucks:null}),78);
  assert.equal(defaultOptionPackagingId({...meta,offeredTrucks:null,confirmedPackagingTypeId:null}),79);
  assert.equal(defaultOptionPackagingId({truckOffer:false}), '');
});

test('recognized packaging precedes the silo fallback; uncertain families never select a concrete type',()=>{
  const packagingTypes=[{id:78,text:'Sackware',aliases:['Sackware','Bags']},{id:79,text:'Siloware',key:'silo',aliases:['Silo/bulk']},{id:80,text:'Big Bags',aliases:['Big Bags']},{id:81,text:'Octa',aliases:['Octabins']}];
  const meta={truckOffer:true,offeredTrucks:1,packagingTypes,offeredKg:25000,orderedKg:0,sourcePackaging:'Sackware',sourcePackagingTypeId:78,sourcePackagingSource:'original'};
  assert.equal(defaultOptionPackagingId(meta),78);
  assert.equal(truckOptionAvailability(meta,packagingTypes[0]).offeredKg,24750);
  assert.equal(defaultOptionPackagingId({...meta,sourcePackagingSource:'history'}),78);
  assert.equal(defaultOptionPackagingId({...meta,sourcePackagingTypeId:null,sourcePackaging:' Bags '}),78);
  assert.equal(defaultOptionPackagingId({...meta,sourcePackagingTypeId:null,sourcePackaging:'Big Bags'}),80);
  assert.equal(defaultOptionPackagingId({...meta,sourcePackagingTypeId:null,sourcePackaging:'Octabins'}),81);
  assert.equal(defaultOptionPackagingId({...meta,sourcePackagingTypeId:null,sourcePackaging:'Sackware / Big Bags / Octabins'}),79);
  assert.equal(defaultOptionPackagingId({...meta,sourcePackagingTypeId:null,sourcePackaging:'Siloware wahrscheinlich',sourcePackagingSource:'rule'}),79);
  assert.equal(defaultOptionPackagingId({...meta,sourcePackagingSource:'unknown'}),79);
  assert.equal(defaultOptionPackagingId({...meta,sourcePackagingTypeId:999,sourcePackaging:''}),79);
  assert.equal(defaultOptionPackagingId({...meta,offeredTrucks:null,confirmedPackagingTypeId:80}),80);
});

test('choosing kg versus tonnes changes the confirmed total by the correct factor',()=>{
  assert.equal(confirmedTotalKg('24','kg'),24);
  assert.equal(confirmedTotalKg('24','t'),24000);
  assert.equal(confirmedTotalKg('24.75','t'),24750);
  assert.equal(confirmedTotalKg('1.234567','t'),1234.567);
});
test('confirmation needs a positive amount, an explicit unit and at most gram precision',()=>{
  for(const [amount,unit]of [['','kg'],['24',''],['24','truckload'],['bad','t'],['0','kg'],['-1','t'],['0.0000001','t'],['Infinity','kg']])
    assert.equal(confirmedTotalKg(amount,unit),null);
  assert.equal(confirmedTotalKg('0.001','kg'),0.001);
  assert.equal(confirmedTotalKg('0.000001','t'),0.001);
});
test('truck quantities only become kg after choosing packaging, including translated silo names',()=>{
  assert.equal(confirmedTotalKg('1','truck'),null);
  assert.equal(confirmedTotalKg('1','truck',{id:79,text:'Siloware'}),25000);
  assert.equal(confirmedTotalKg('1','truck',{id:79,text:'Silo/bulk'}),25000);
  assert.equal(confirmedTotalKg('2','truck',{id:78,text:'Sackware'}),49500);
  assert.equal(confirmedTotalKg('1','truck',{id:80,text:'Big Bags'}),24750);
});
