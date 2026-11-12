const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { offeredQuantityKg,quantityAvailability,fitsQuantity,quantitySourceHashSql,confirmedQuantitySql,quantityInputKg,isTruckOffer,offeredTruckCount } = require('../src/options/purchase-quantity');

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
    '../config':{sql:{database:'central'}},'../db/access':{withSqlTransaction:async(_db,work)=>work({query}),runSQLQuerySqlServer:async(_db,sql,params)=>{
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
      candidatesFor:async(database,position,options)=>({data:[],database,position,options})},
    './article-catalog':require('../src/options/article-catalog'),'./mfi-compatibility':require('../src/options/mfi-compatibility'),
    './purchase-quantity':require('../src/options/purchase-quantity'),
    '../db/purchase-order-values':{loadPurchasePackagingOptions:async()=>[{id:78,text:'Sackware'},{id:79,text:'Siloware'},{id:80,text:'Octabins'}],purchaseTruckLoadKg:require('../src/db/purchase-order-values').purchaseTruckLoadKg},
  };
  const mod={exports:{}};
  new Function('require','module',fs.readFileSync(path.join(__dirname,'../src/options/purchase-source.js'),'utf8'))(name=>{
    assert.ok(name in dependencies,name);return dependencies[name];
  },mod);
  return {...mod.exports,query,calls,source};
}

test('offered total uses stock and normalized mass, then the fixed default of 25000 kg per quoted truck',()=>{
  assert.equal(offeredQuantityKg({quantityKind:'minimum-and-stock',quantityMinKg:23375,quantityMaxKg:23375,stockKg:100000}),100000);
  assert.equal(offeredQuantityKg({quantityKind:'minimum-and-stock',quantityMinKg:23375}),null);
  assert.equal(offeredQuantityKg({quantityKind:'truckload',truckMax:2}),50000);
  assert.equal(offeredQuantityKg({quantityKind:'truckload',truckMax:2,confirmedQuantityKg:47000}),50000);
  assert.equal(offeredQuantityKg({quantityKind:'truckload',truckMax:2},24750),49500);
  assert.equal(offeredQuantityKg({quantityKind:'truckload'}),null);
  assert.equal(offeredQuantityKg({quantityKind:'truckload',truckMax:2,stockKg:30000}),30000);
  assert.equal(offeredQuantityKg({quantityMaxKg:25000,confirmedQuantityKg:90000}),25000);
  assert.equal(offeredQuantityKg({stockKg:0,quantityMaxKg:25000,confirmedQuantityKg:90000}),0);
  assert.equal(offeredQuantityKg({quantityMinKg:10000,quantityMaxKg:25000}),25000);
  assert.deepEqual(quantityAvailability({quantityMaxKg:25000},10000),{offeredKg:25000,orderedKg:10000,remainingKg:15000});
  assert.equal(fitsQuantity(1,0.999,0.001),true);
  assert.equal(fitsQuantity(1,0.999,0.002),false);
});

test('manual total is saved under the source lock and becomes the shared cap without changing original import fields',async()=>{
  const f=fixture({orderedKg:1000,sourceOverride:{opp_MengeVonKg:null,opp_MengeBisKg:null,quantitySourceHash:'original',confirmedQuantityKg:null}});
  const result=await f.confirmOptionQuantity(1,10,{totalKg:24750,quantityConfirmed:true,quantitySourceHash:'original'},'NSC');
  assert.equal(result.offeredKg,24750);assert.equal(result.remainingKg,23750);assert.equal(result.confirmedQuantityKg,24750);
  assert.match(f.calls[0].sql,/UPDLOCK,HOLDLOCK/);
  const update=f.calls.find(call=>call.sql.startsWith('UPDATE'));
  assert.deepEqual(update.params,[24750,'original','NSC',null,null,10,1]);
  assert.doesNotMatch(update.sql,/SET opp_MengeVon|opp_GeaendertAm/);
  assert.match(confirmedQuantitySql(),/opp_MengeBestaetigtQuellHash=/);
  assert.doesNotMatch(quantitySourceHashSql(),/opp_MengeVonKg|opp_GeaendertAm|NormalisierungJson/);
});

test('explicit kg/t selection converts only tonnes, persists kg and rejects unspecified units',async()=>{
  assert.equal(quantityInputKg({totalAmount:24,totalUnit:'kg'}),24);
  assert.equal(quantityInputKg({totalAmount:24,totalUnit:'t'}),24000);
  assert.equal(quantityInputKg({totalAmount:24,totalUnit:'',totalKg:24000}),null);
  assert.equal(quantityInputKg({totalAmount:24,totalUnit:'lbs'}),null);
  const f=fixture({orderedKg:1000,sourceOverride:{opp_MengeVonKg:null,opp_MengeBisKg:null,quantitySourceHash:'original'}});
  const result=await f.confirmOptionQuantity(1,10,{totalAmount:24,totalUnit:'t',quantityConfirmed:true,quantitySourceHash:'original'},'NSC');
  assert.equal(result.confirmedQuantityKg,24000);assert.equal(result.remainingKg,23000);
  assert.equal(f.calls.find(call=>call.sql.startsWith('UPDATE')).params[0],24000);
  await assert.rejects(f.confirmOptionQuantity(1,10,{totalAmount:24,totalUnit:'',quantityConfirmed:true,quantitySourceHash:'original'},'NSC'),e=>e.details.code==='OPTION_QUANTITY_CONFIRMATION_REQUIRED');
});

test('confirmation requires explicit input and never overwrites a source-backed total or a concurrent decision',async()=>{
  const f=fixture({sourceOverride:{quantitySourceHash:'original'}});
  for(const totalKg of [null,0,-1,'abc',Infinity,0.0001])await assert.rejects(f.confirmOptionQuantity(1,10,{totalKg,quantityConfirmed:true},'NSC'),e=>e.details.code==='OPTION_QUANTITY_CONFIRMATION_REQUIRED');
  await assert.rejects(f.confirmOptionQuantity(1,10,{totalKg:25000,quantitySourceHash:'original'},'NSC'),e=>e.details.code==='OPTION_QUANTITY_CONFIRMATION_REQUIRED');
  await assert.rejects(f.confirmOptionQuantity(1,10,{totalKg:90000,quantityConfirmed:true,quantitySourceHash:'original'},'NSC'),e=>e.details.code==='OPTION_QUANTITY_ALREADY_KNOWN');
  const manual=fixture({orderedKg:24000,sourceOverride:{opp_MengeVonKg:null,opp_MengeBisKg:null,confirmedQuantityKg:25000,quantitySourceHash:'original'}});
  const body={totalKg:23000,quantityConfirmed:true,quantitySourceHash:'original',expectedConfirmedKg:25000};
  await assert.rejects(manual.confirmOptionQuantity(1,10,{...body,expectedConfirmedKg:null},'NSC'),e=>e.details.code==='OPTION_QUANTITY_CHANGED');
  await assert.rejects(manual.confirmOptionQuantity(1,10,body,'NSC'),e=>e.details.code==='OPTION_QUANTITY_EXCEEDED');
  await assert.rejects(manual.confirmOptionQuantity(1,10,{...body,quantitySourceHash:'old'},'NSC'),e=>e.details.code==='OPTION_CHANGED');
  assert.equal(manual.calls.some(call=>call.sql.startsWith('UPDATE')),false);
  const truck=fixture({sourceOverride:{opp_MengeVonKg:null,opp_MengeBisKg:null,opp_Mengenart:'truckloads',truckMax:1,maxTruckLoadKg:24750,quantitySourceHash:'original'}});
  await assert.rejects(truck.confirmOptionQuantity(1,10,{totalKg:25000,packagingTypeId:78,quantityConfirmed:true,quantitySourceHash:'original'},'NSC'),e=>e.details.code==='OPTION_QUANTITY_ALREADY_KNOWN');
});

test('a truck offer without a quoted count still needs explicit count confirmation and the selected packaging',async()=>{
  const f=fixture({sourceOverride:{opp_MengeVonKg:null,opp_MengeBisKg:null,opp_Mengenart:'truckloads',truckMax:null,maxTruckLoadKg:24750,quantitySourceHash:'original'}});
  const body={totalAmount:2,totalUnit:'truck',quantityConfirmed:true,quantitySourceHash:'original'};
  await assert.rejects(f.confirmOptionQuantity(1,10,body,'NSC'),e=>e.details.code==='OPTION_PACKAGING_REQUIRED');
  const silo=await f.confirmOptionQuantity(1,10,{...body,packagingTypeId:79,kgPerTruck:1},'NSC');
  assert.equal(silo.confirmedQuantityKg,50000);assert.equal(silo.confirmedPackagingTypeId,79);assert.equal(silo.confirmedTruckCount,2);
  const bags=await f.confirmOptionQuantity(1,10,{...body,packagingTypeId:78},'NSC');
  assert.equal(bags.confirmedQuantityKg,49500);
  const octa=await f.confirmOptionQuantity(1,10,{...body,packagingTypeId:80,totalAmount:1},'NSC');
  assert.equal(octa.confirmedQuantityKg,24750);
  assert.equal(isTruckOffer({quantityUnit:'load'}),true);
  assert.equal(offeredTruckCount({quantityUnit:'load',quantityMax:4}),4);
  assert.equal(isTruckOffer({quantityKind:'minimum-and-stock',quantityUnit:'truckload'}),false);
});

test('changing packaging during order editing cannot exceed the truck limit for the chosen packaging',async()=>{
  const f=fixture({sourceOverride:{opp_MengeVonKg:null,opp_MengeBisKg:null,opp_Mengenart:'truckloads',truckMax:1}});
  const line={optionId:1,optionPositionId:10,amount:25000};
  await f.assertOptionQuantities(f.query,[line],null,'Silo/bulk');
  await assert.rejects(f.assertOptionQuantities(f.query,[line],null,'Sackware'),e=>e.details.code==='OPTION_QUANTITY_EXCEEDED'&&e.details.remainingKg===24750);
  const split=fixture({orderedKg:24750,sourceOverride:{opp_MengeVonKg:null,opp_MengeBisKg:null,opp_Mengenart:'truckloads',truckMax:2}});
  await split.assertOptionQuantities(split.query,[{...line,amount:24750}],null,'Sackware');
  await assert.rejects(split.assertOptionQuantities(split.query,[{...line,amount:24750.001}],null,'Sackware'),e=>e.details.code==='OPTION_QUANTITY_EXCEEDED');
  const manual=fixture({sourceOverride:{opp_MengeVonKg:null,opp_MengeBisKg:null,opp_Mengenart:'truckloads',confirmedQuantityKg:50000,confirmedTruckCount:2}});
  await manual.assertOptionQuantities(manual.query,[{...line,amount:49500}],null,'Sackware');
  await assert.rejects(manual.assertOptionQuantities(manual.query,[{...line,amount:50000}],null,'Sackware'),e=>e.details.code==='OPTION_QUANTITY_EXCEEDED');
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

test('all purchase proposals are loaded for both the source and a different active mandant',async()=>{
  const f=fixture();
  const source=await f.purchaseCandidates({firmaId:3},f.source,{all:true});
  assert.equal(source.options.all,true);
  await f.purchaseCandidates({firmaId:10},f.source,{all:true});
  const target=f.calls.find(call=>call.sql.includes('OPENJSON'));
  assert.ok(target);assert.doesNotMatch(target.sql,/OFFSET|FETCH NEXT/);assert.equal(target.params.length,2);
});

test('current target article is rechecked and missing MFI requires explicit acknowledgement',async()=>{
  const f=fixture();
  await assert.rejects(f.validateOptionArticle({},f.source,{articleIndex:'A'}),e=>e.details.code==='ARTICLE_MFI_UNVERIFIED');
  assert.ok(await f.validateOptionArticle({},f.source,{articleIndex:'A',acknowledgeUnverifiedMfi:true}));
  await assert.rejects(f.validateOptionArticle({},{...f.source,mfi:10},{articleIndex:'A',acknowledgeUnverifiedMfi:true}),e=>e.details.code==='ARTICLE_MFI_EXCLUDED');
  await assert.rejects(f.validateOptionArticle({},f.source,{articleIndex:'INVALID'}),e=>e.details.code==='OPTION_ARTICLE_NOT_FOUND');
});
