const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { offeredQuantityKg,quantityAvailability,fitsQuantity } = require('../src/options/purchase-quantity');

function fixture({orderedKg=0,available=true,sourceOverride={}}={}) {
  const calls=[];
  const source={opp_id:10,opp_op_id:1,opp_MengeVonKg:10000,opp_MengeBisKg:25000,sourceMandantId:3,
    supplierName:'Borealis',supplierKey:'borealis',...sourceOverride};
  const query=async(sql,params)=>{
    calls.push({sql,params});assert.equal((sql.match(/\?/g)||[]).length,params.length);
    if(sql.includes('SUM(tbp_amount'))return {rows:[{orderedKg}]};
    return {rows:available?[source]:[]};
  };
  const dependencies={
    '../config':{sql:{database:'central'}},'../db/access':{runSQLQuerySqlServer:async(_db,sql,params)=>{
      calls.push({sql,params});return [{supplierId:'LF0124',supplierKey:'borealis'}];
    },runSQLQueryAccess:async(_db,sql,params)=>{
      calls.push({sql,params});return [
        {id:'LF0124',name:'Borealis Polymers N.V.',city:'Mechelen',hasPurchases:1},
        {id:'99938',name:'Borealis Polyolefine GmbH',city:'Linz',hasPurchases:1},
        {id:'OTHER',name:'Unrelated GmbH',city:'Berlin'},
      ];
    }},'../db/app-tables':{appTableSql:key=>key},'../utils':require('../src/utils'),
    './read':{berlinDate:()=> '2026-11-12'},'./supplier-identity':require('../src/options/supplier-identity'),
    './matching-service':{articleByIndex:async(_db,index)=>index==='A'?{articleName:'LDPE MFI 1-4',mfi:1,mfiTo:4,mfiMethod:'190 °C / 2.16 kg'}:null,
      candidatesFor:async(database,position)=>({data:[],database,position})},
    './article-catalog':require('../src/options/article-catalog'),'./mfi-compatibility':require('../src/options/mfi-compatibility'),
    './purchase-quantity':require('../src/options/purchase-quantity'),
  };
  const mod={exports:{}};
  new Function('require','module',fs.readFileSync(path.join(__dirname,'../src/options/purchase-source.js'),'utf8'))(name=>{
    assert.ok(name in dependencies,name);return dependencies[name];
  },mod);
  return {...mod.exports,query,calls,source};
}

test('offered total uses batch stock before minimum call-off quantity and never invents a truck weight',()=>{
  assert.equal(offeredQuantityKg({quantityKind:'minimum-and-stock',quantityMinKg:23375,quantityMaxKg:23375,stockKg:100000}),100000);
  assert.equal(offeredQuantityKg({quantityKind:'minimum-and-stock',quantityMinKg:23375}),null);
  assert.equal(offeredQuantityKg({quantityKind:'truckload',truckMax:2}),null);
  assert.equal(offeredQuantityKg({quantityMinKg:10000,quantityMaxKg:25000}),25000);
  assert.deepEqual(quantityAvailability({quantityMaxKg:25000},10000),{offeredKg:25000,orderedKg:10000,remainingKg:15000});
  assert.equal(fitsQuantity(1,0.999,0.001),true);
  assert.equal(fitsQuantity(1,0.999,0.002),false);
});

test('locks source and sums all saved orders across tenants; own edit is excluded once',async()=>{
  const f=fixture({orderedKg:10000});
  await f.assertOptionQuantities(f.query,[{optionId:1,optionPositionId:10,amount:5000},{optionId:1,optionPositionId:10,amount:10000}],99);
  assert.equal(f.calls.length,2);
  assert.match(f.calls[0].sql,/WITH\(UPDLOCK,HOLDLOCK\)/);
  assert.match(f.calls[0].sql,/op_IstDemo=0/);
  assert.match(f.calls[0].sql,/COALESCE\(p.opp_GueltigBis,o.op_GueltigBis\)>=\?/);
  assert.deepEqual(f.calls[1].params,[10,99,99]);
  assert.doesNotMatch(f.calls[1].sql,/company|Mandant|status/i);
  await assert.rejects(f.assertOptionQuantities(f.query,[{optionId:1,optionPositionId:10,amount:15000.001}]),e=>e.details.code==='OPTION_QUANTITY_EXCEEDED');
});

test('expired or withdrawn options, mismatched references and quantities without a cap fail closed',async()=>{
  const expired=fixture({available:false});
  await assert.rejects(expired.assertOptionQuantities(expired.query,[{optionId:1,optionPositionId:10,amount:1}]),e=>e.details.code==='OPTION_NOT_AVAILABLE');
  const unknown=fixture({sourceOverride:{opp_MengeVonKg:null,opp_MengeBisKg:null}});
  await assert.rejects(unknown.assertOptionQuantities(unknown.query,[{optionId:1,optionPositionId:10,amount:1}]),e=>e.details.code==='OPTION_QUANTITY_UNCONFIRMED');
  const f=fixture();
  await assert.rejects(f.assertOptionQuantities(f.query,[{optionId:1,optionPositionId:10,amount:1},{optionId:2,optionPositionId:10,amount:1}]),/Widersprüchliche/);
  await assert.rejects(f.assertOptionQuantities(f.query,[{optionId:1,optionPositionId:10,amount:0.0001}]),/Gramm/);
  const changed=fixture({sourceOverride:{sourceVersion:'new'}});
  await assert.rejects(changed.assertOptionQuantities(changed.query,[{optionId:1,optionPositionId:10,amount:1,optionSourceChanged:'old'}]),e=>e.details.code==='OPTION_CHANGED');
});

test('supplier proposals include both Borealis accounts and prefer the accordion context without losing alternatives',async()=>{
  const f=fixture();
  const suppliers=await f.supplierCandidates({firmaId:3},f.source,{preferredSupplierId:'LF0124'});
  assert.deepEqual(suppliers.map(s=>s.id),['LF0124','99938']);
  assert.equal(suppliers[0].preferred,true);
  assert.match(f.calls[1].sql,/EXISTS\(SELECT 1 FROM dbo.tblBestellung/);
  const manual=await f.supplierCandidates({firmaId:3},f.source,{q:'Unrelated'});
  assert.equal(manual[0].plausible,false);
});

test('current target article is rechecked and missing MFI requires explicit acknowledgement',async()=>{
  const f=fixture();
  await assert.rejects(f.validateOptionArticle({},f.source,{articleIndex:'A'}),e=>e.details.code==='ARTICLE_MFI_UNVERIFIED');
  assert.ok(await f.validateOptionArticle({},f.source,{articleIndex:'A',acknowledgeUnverifiedMfi:true}));
  await assert.rejects(f.validateOptionArticle({},{...f.source,mfi:10},{articleIndex:'A',acknowledgeUnverifiedMfi:true}),e=>e.details.code==='ARTICLE_MFI_EXCLUDED');
  await assert.rejects(f.validateOptionArticle({},f.source,{articleIndex:'INVALID'}),e=>e.details.code==='OPTION_ARTICLE_NOT_FOUND');
});
