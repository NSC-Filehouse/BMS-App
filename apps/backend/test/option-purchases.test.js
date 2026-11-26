const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { offeredQuantityKg,quantityAvailability,fitsQuantity,quantitySourceHashSql,confirmedQuantitySql,quantityInputKg,isTruckOffer,offeredTruckCount } = require('../src/options/purchase-quantity');

function fixture({orderedKg=0,available=true,sourceOverride={},articleOverride={},articleCandidates=[]}={}) {
  const calls=[];
  const source={opp_id:10,opp_op_id:1,opp_MengeVonKg:10000,opp_MengeBisKg:25000,sourceMandantId:3,
    supplierName:'Borealis',supplierKey:'borealis',...sourceOverride};
  const query=async(sql,params)=>{
    calls.push({sql,params});assert.equal((sql.match(/\?/g)||[]).length,params.length);
    if(sql.includes('SUM(tbp_amount'))return {rows:[{orderedKg}]};
    const excluded = source.sourceMandantId === 0 && sql.includes('AND o.op_MandantID <> 0');
    return {rows:available && !excluded?[source]:[]};
  };
  const dependencies={
    '../config':{sql:{database:'central'}},'../db/access':{withSqlTransaction:async(_db,work)=>work({query}),runSQLQuerySqlServer:async(_db,sql,params)=>{
      calls.push({sql,params});return [{supplierId:'LF0124',supplierKey:'borealis'}];
    },runSQLQueryAccess:async(_db,sql,params)=>{
      calls.push({sql,params});
      if(sql.includes('dbo.tblArt_Artikel'))return articleCandidates;
      return [
        {id:'LF0124',name:'Borealis Polymers N.V.',city:'Mechelen',hasPurchases:1},
        {id:'99938',name:'Borealis Polyolefine GmbH',city:'Linz',hasPurchases:1},
        {id:'OTHER',name:'Unrelated GmbH',city:'Berlin'},
      ];
    }},'../db/app-tables':{appTableSql:key=>key},'../utils':require('../src/utils'),
    '../executive-access':require('../src/executive-access'),
    './read':{berlinDate:()=> '2026-11-12'},'./supplier-identity':require('../src/options/supplier-identity'),
    './matching-service':{articleByIndex:async(_db,index)=>index==='A'?{articleName:'LDPE MFI 1-4',mfi:1,mfiTo:4,mfiMethod:'190 °C / 2.16 kg',...articleOverride}:null,
      candidatesFor:async(database,position,options)=>({data:articleCandidates,total:articleCandidates.length,database,position,options})},
    './article-catalog':require('../src/options/article-catalog'),'./mfi-compatibility':require('../src/options/mfi-compatibility'),
    './material-facts':require('../src/options/material-facts'),
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
  assert.equal(offeredQuantityKg({quantityKind:'truckload'}),25000);
  assert.equal(offeredQuantityKg({quantityKind:'truckload',stockKg:30000}),30000);
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

test('executives cannot confirm quantities or order from a Test option by ID', async () => {
  const f = fixture({ sourceOverride: { sourceMandantId: 0 } });
  const identity = { active: true, shortCode: 'OBA', personNumber: 276, userId: 'Bader' };
  await assert.rejects(f.confirmOptionQuantity(1, 10, {
    totalKg: 20000, quantityConfirmed: true, quantitySourceHash: 'original',
  }, identity.shortCode, identity), { details: { code: 'OPTION_NOT_AVAILABLE' } });
  await assert.rejects(f.assertOptionQuantities(f.query, [
    { optionId: 1, optionPositionId: 10, amount: 1000 },
  ], null, null, identity), { details: { code: 'OPTION_NOT_AVAILABLE' } });
  assert.ok(f.calls.every(call => call.sql.includes('AND o.op_MandantID <> 0')));
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

test('a truck offer without a quoted count defaults to one load without confirmation',async()=>{
  const source={opp_MengeVonKg:null,opp_MengeBisKg:null,opp_Mengenart:'truckloads',truckMax:null,quantitySourceHash:'original'};
  const f=fixture({sourceOverride:source});
  const line={optionId:1,optionPositionId:10,amount:24750};
  assert.equal(offeredTruckCount(source),1);
  await f.assertOptionQuantities(f.query,[line],null,'Sackware');
  await assert.rejects(f.assertOptionQuantities(f.query,[{...line,amount:24750.001}],null,'Sackware'),e=>e.details.code==='OPTION_QUANTITY_EXCEEDED');
  await f.assertOptionQuantities(f.query,[{...line,amount:25000}],null,'Siloware');
  await assert.rejects(f.confirmOptionQuantity(1,10,{totalAmount:2,totalUnit:'truck',quantityConfirmed:true,quantitySourceHash:'original',packagingTypeId:79},'NSC'),e=>e.details.code==='OPTION_QUANTITY_ALREADY_KNOWN');
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

test('automatic purchase proposals omit NT articles for an option without an NT label in either mandant', async () => {
  const articleCandidates = [
    { articleIndex: 'REGULAR', articleName: 'LDPE Plant 02' },
    { articleIndex: 'NT', articleName: 'LDPE NT' },
    { articleIndex: 'OFFGRADE', articleName: 'LDPE Offgrade' },
    { articleIndex: 'NTP', articleName: 'LDPE Near-to-Prime' },
    { articleIndex: 'OFFSPEC', articleName: 'LDPE MFI 7', groupName: 'Off Spec' },
    { articleIndex: 'OFFLABEL', articleName: 'LDPE MFI 9', description: 'Off-label' },
  ];
  const f = fixture({ articleCandidates, sourceOverride: { articleName: 'LDPE Plant 02' } });
  for (const firmaId of [3, 10]) {
    const result = await f.purchaseCandidates({ firmaId }, f.source, { all: true });
    assert.deepEqual(result.data.map(article => article.articleIndex), ['REGULAR']);
    assert.equal(result.total, 1);
  }
  const manual = await f.purchaseCandidates({ firmaId: 3 }, f.source, { q: 'LDPE', all: true });
  assert.deepEqual(manual.data, articleCandidates);
});

test('NT labels in the product name, material properties or recorded quality keep NT proposals', async () => {
  const articleCandidates = [{ articleIndex: 'NT', articleName: 'LDPE NT' }];
  const f = fixture({ articleCandidates });
  const labels = [
    { articleName: 'LDPE near–to–prime' },
    { quality: 'Off spec' },
    { qualityNorm: 'NT' },
    { propertiesText: 'Off-label' },
    { articleName: 'LDPE Off Grade' },
  ];
  for (const label of labels) {
    const result = await f.purchaseCandidates({ firmaId: 3 }, { ...f.source, ...label }, { all: true });
    assert.deepEqual(result.data, articleCandidates);
    assert.equal(result.total, 1);
  }
});

test('supplier selection prefers the proven account and rejects unrelated suppliers',async()=>{
  const f=fixture();
  const rows=await f.supplierCandidates({firmaId:3},f.source,{preferredSupplierId:'99938'});
  assert.equal(rows.find(row=>row.preferred).id,'LF0124');
  assert.equal((await f.validateOptionSupplier({firmaId:3},f.source,'LF0124')).id,'LF0124');
  await assert.rejects(f.validateOptionSupplier({firmaId:3},f.source,'OTHER'),error=>error.details.code==='OPTION_SUPPLIER_MISMATCH');
});

test('supplier search allows a catalog supplier when the option has no supplier proposals',async()=>{
  const f=fixture({sourceOverride:{supplierName:'Longfield Chemicals',supplierKey:'longfield'}});
  const database={firmaId:3};
  assert.deepEqual(await f.supplierCandidates(database,f.source),[]);
  const [result]=await f.supplierCandidates(database,f.source,{q:'Berlin'});
  assert.equal(result.id,'OTHER');
  assert.equal(result.selectable,true);
  assert.equal((await f.validateOptionSupplier(database,f.source,result.id)).id,result.id);
  await assert.rejects(f.validateOptionSupplier(database,f.source,'MISSING'),error=>error.details.code==='OPTION_SUPPLIER_MISMATCH');
});

test('material conflicts cannot be acknowledged away during purchase validation',async()=>{
  const f=fixture();
  await assert.rejects(f.validateOptionArticle({}, {...f.source,articleName:'LDPE NTP ex SABIC',quality:'NTP'},
    {articleIndex:'A',acknowledgeUnverifiedMfi:true}),error=>error.details.code==='ARTICLE_MATERIAL_EXCLUDED');
});

test('purchase validation treats an offspec catalog article as NT', async () => {
  const f = fixture({articleOverride:{articleName:'LDPE Offspec MFI 1-4'}});
  const position = {...f.source,articleName:'LDPE',quality:'Offgrade',mfi:2};
  const line = {articleIndex:'A'};
  assert.ok(await f.validateOptionArticle({},position,line));
  await assert.rejects(f.validateOptionArticle({},{...position,quality:'1A'},line),
    error => error.details.code==='ARTICLE_MATERIAL_EXCLUDED');
  await assert.rejects(f.validateOptionArticle({},{...position,mfi:5},line),
    error => error.details.code==='ARTICLE_MFI_EXCLUDED');
});

test('current target article is rechecked; incomplete facts need no extra acknowledgement but contradictions still block',async()=>{
  const f=fixture();
  assert.ok(await f.validateOptionArticle({},f.source,{articleIndex:'A'}));
  assert.ok(await f.validateOptionArticle({},f.source,{articleIndex:'A',acknowledgeUnverifiedMfi:true}));
  await assert.rejects(f.validateOptionArticle({},{...f.source,mfi:10},{articleIndex:'A',acknowledgeUnverifiedMfi:true}),e=>e.details.code==='ARTICLE_MFI_EXCLUDED');
  await assert.rejects(f.validateOptionArticle({},f.source,{articleIndex:'INVALID'}),e=>e.details.code==='OPTION_ARTICLE_NOT_FOUND');
});
