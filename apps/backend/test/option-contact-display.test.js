const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

function fixture({suppliers=[{id:'LF0117',plausible:true}],contacts=[],fail=false}={}) {
  const calls=[],warnings=[],mod={exports:{}};
  const database={firmaId:3,databaseName:'BMS.FRU'};
  const deps={
    '../db/access':{runSQLQueryAccess:async(db,sql,params)=>{
      assert.equal(db,database);calls.push({sql,params});
      if(fail)throw Error('ERP unavailable');
      return contacts;
    }},
    './purchase-source':{supplierCandidates:async(db)=>{assert.equal(db,database);calls.push({suppliers:true});return suppliers;}},
    './supplier-contacts':require('../src/options/supplier-contacts'),
    '../logger':{warn:message=>warnings.push(message)},
  };
  new Function('require','module',fs.readFileSync(path.join(__dirname,'../src/options/contact-display.js'),'utf8'))(name=>{
    assert.ok(name in deps,name);return deps[name];
  },mod);
  return {...mod.exports,database,calls,warnings};
}
const offer=()=>({id:625,supplierName:'TotalEnergies',contact:{name:'Carsten DORSCH',email:'carsten.dorsch@totalenergies.com',phone:''}});
const contact=(patch={})=>({id:20244,supplierId:'LF0117',firstName:'Carsten',lastName:'Dorsch',email:'carsten.dorsch@totalenergies.com',mobile:'+491722164144',...patch});

test('an offer phone takes precedence and absent source persons trigger no ERP lookup',async()=>{
  const f=fixture();
  for(const original of [{...offer(),contact:null},{...offer(),contact:{...offer().contact,phone:'+43 123 456'}}]) {
    assert.equal(await f.enrichOptionContactPhone(f.database,original),original);
  }
  assert.equal(f.calls.length,0);
});

test('an exact supplier contact adds its ERP mobile without mutating the source, scoped to the active tenant and supplier',async()=>{
  const f=fixture({contacts:[contact(),contact({supplierId:'OTHER',mobile:'+49 999'})]});
  const original=offer();
  const result=await f.enrichOptionContactPhone(f.database,original);
  assert.equal(result.contact.phone,'+491722164144');
  assert.equal(original.contact.phone,'');
  assert.equal(result.contact.name,'Carsten DORSCH');
  assert.deepEqual(f.calls[1].params,['["LF0117"]']);
  assert.match(f.calls[1].sql,/kdA_KdNR IN\(SELECT \[value\] FROM OPENJSON\(\?\)\)/);
  assert.equal(f.warnings.length,0);
});

test('unique full names support changed email and phone precedence matches the customer view',async()=>{
  for(const [patch,expected]of [[{phone:' +49 111 ',privatePhone:'+49 222'},'+49 111'],[{phone:' ',privatePhone:'+49 222'},'+49 222'],[{phone:'',privatePhone:''},'+491722164144']]) {
    const f=fixture({contacts:[contact({email:'old@totalenergies.com',...patch})]});
    assert.equal((await f.enrichOptionContactPhone(f.database,offer())).contact.phone,expected);
  }
});

test('missing matches, ambiguous people and conflicting numbers leave the offer unchanged',async()=>{
  for(const config of [
    {suppliers:[]},
    {contacts:[contact({firstName:'Other',lastName:'Person',email:'other@totalenergies.com'})]},
    {contacts:[contact(),contact({id:99})]},
    {suppliers:[{id:'LF0117',plausible:true},{id:'TOTAL2',plausible:true}],contacts:[contact(),contact({supplierId:'TOTAL2',mobile:'+49 999'})]},
    {suppliers:[{id:'OTHER',plausible:false}],contacts:[contact({supplierId:'OTHER'})]},
  ]) {
    const f=fixture(config),original=offer();
    assert.equal(await f.enrichOptionContactPhone(f.database,original),original);
  }
});

test('the same number in two supplier accounts remains usable and an optional lookup failure preserves the source',async()=>{
  const f=fixture({suppliers:[{id:'LF0117',plausible:true},{id:'TOTAL2',plausible:true}],contacts:[contact(),contact({supplierId:'TOTAL2',mobile:'+49 172 2164144'})]});
  assert.equal((await f.enrichOptionContactPhone(f.database,offer())).contact.phone.replace(/\s/g,''),'+491722164144');
  const failed=fixture({fail:true}),original=offer();
  assert.equal(await failed.enrichOptionContactPhone(failed.database,original),original);
  assert.equal(failed.warnings.length,1);
});
