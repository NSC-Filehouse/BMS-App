const test = require('node:test');
const assert = require('node:assert/strict');
const { createPackagingDisplay } = require('../src/options/packaging-display');
const choices = [
  {id:78,text:'Sackware',aliases:['Sackware','Bags']},
  {id:79,text:'Siloware',aliases:['Siloware','Silo/bulk']},
  {id:80,text:'Big Bags',aliases:['Big Bags','Big Bags']},
  {id:81,text:'Octa',aliases:['Octa','Octabins']},
  {id:82,text:'Andere',aliases:['Andere','Others']},
  {id:153,text:'NEUTRALE Sackware',aliases:['NEUTRALE Sackware','NEUTRAL Bags']},
  {id:154,text:'NEUTRALE Oktabins',aliases:['NEUTRALE Oktabins','NEUTRAL Octas']},
];
const display = createPackagingDisplay(choices);

test('existing bilingual packaging rows define labels in both languages',()=>{
  assert.deepEqual(display(' BAGS '),{de:'Sackware',en:'Bags'});
  assert.deepEqual(display('bulk'),{de:'Siloware',en:'Silo/bulk'});
  assert.deepEqual(display('Silo / bulk'),{de:'Siloware',en:'Silo/bulk'});
  assert.deepEqual(display('Octabins'),{de:'Octa',en:'Octabins'});
  assert.deepEqual(display('Others'),{de:'Andere',en:'Others'});
  assert.deepEqual(display('NEUTRAL Bags'),{de:'NEUTRALE Sackware',en:'NEUTRAL Bags'});
  assert.deepEqual(display('NEUTRAL Octas'),{de:'NEUTRALE Oktabins',en:'NEUTRAL Octas'});
});

test('alternatives, weights and surcharges survive translation without selecting a type',()=>{
  assert.deepEqual(display('Bags and / or Bulk'),{de:'Sackware und/oder Siloware',en:'Bags and/or Silo/bulk'});
  assert.equal(display('Bags or Bulk').de,'Sackware oder Siloware');
  assert.equal(display('25kg bags').de,'25kg Sackware');
  assert.equal(display('bag (25 kg)').de,'Sackware (25 kg)');
  assert.equal(display('Bags and / or Bulk; +30€/ton for Bags').de,'Sackware und/oder Siloware; +30€/ton for Sackware');
  assert.equal(display('Sackware und/oder Siloware').en,'Bags and/or Silo/bulk');
});

test('longer type names win over bags and unknown compounds remain unchanged',()=>{
  assert.equal(display('BIG BAGS').de,'Big Bags');
  assert.equal(display('Big-Bags').de,'Big Bags');
  assert.equal(display('Big Bag / Bags').de,'Big Bags / Sackware');
  assert.equal(display('Big Bags / Bags / Bulk').de,'Big Bags / Sackware / Siloware');
  assert.deepEqual(display('Bulk bags'),{de:'Bulk bags',en:'Bulk bags'});
  assert.equal(display('handbags / bulkhead / octane').de,'handbags / bulkhead / octane');
  assert.equal(display('Unbekannte Verpackung').de,'Unbekannte Verpackung');
  assert.deepEqual(display(null),{de:'',en:''});
});

test('labels follow dictionary changes; absent or conflicting translations are not guessed',()=>{
  const changed=createPackagingDisplay([{aliases:['Säcke','Bags'],text:'Säcke'}]);
  assert.equal(changed('BAGS').de,'Säcke');
  assert.equal(createPackagingDisplay([])('BAGS').de,'BAGS');
  const conflicting=createPackagingDisplay([...choices,{text:'Andere Säcke',aliases:['Andere Säcke','Bags']}]);
  assert.equal(conflicting('Bags').de,'Bags');
  assert.equal(conflicting('Big Bags').de,'Big Bags');
  assert.equal(choices[0].aliases[1],'Bags');
});
