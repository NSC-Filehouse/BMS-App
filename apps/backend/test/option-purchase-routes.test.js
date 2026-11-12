const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const {createHttpError}=require('../src/utils');
let identity={shortCode:'NSC',personNumber:227,userId:'n.schroeder',active:true};
let price=987,expired=false,remainingKg=10000,quantityRequests=[],truckOffer=false;
const source={opp_id:10,opp_op_id:1,opp_Artikelname_Lieferant:'Supplier grade',opp_Verpackung:'Sackware',sourceMandantId:3,incoterm:'FCA',loadingLocation:'Werk',supplierName:'Borealis'};
const mod={exports:{}};
const deps={
  express,'../utils':require('../src/utils'),
  '../middlewares/mandant.middleware':{requireMandant:(req,res,next)=>{req.database={firmaId:10};req.userIdentity=identity;next();}},
  '../middlewares/pilot-feature.middleware':require('../src/middlewares/pilot-feature.middleware'),
  '../options/purchase-source':{
    confirmOptionQuantity:async(id,positionId,body,actor)=>{quantityRequests.push({id,positionId,body,actor});return {offeredKg:25000,orderedKg:0,remainingKg:25000,confirmedQuantityKg:25000};},
    loadOptionPosition:async()=>{if(expired)throw createHttpError(422,'Expired',{code:'OPTION_NOT_AVAILABLE'});return {...source,opp_PreisProTonne:price,...(truckOffer?{opp_Mengenart:'truckloads',truckMax:2,confirmedPackagingTypeId:79}: {})};},
    loadOptionAvailability:async()=>({offeredKg:truckOffer?50000:25000,orderedKg:(truckOffer?50000:25000)-remainingKg,remainingKg}),
    supplierCandidates:async(database)=>{assert.equal(database.firmaId,10);return [{id:'LF0124',name:'Borealis Polymers N.V.'}];},
    purchaseCandidates:async()=>({data:[{articleIndex:'TARGET',articleName:'Target article'}],total:1}),
    validateOptionArticle:async(database,_source,line)=>{assert.equal(database.firmaId,10);assert.equal(line.articleIndex,'TARGET');return {articleIndex:'TARGET',articleName:'Target article'};},
  },
  '../db/purchase-order-values':{loadPurchaseOptions:async()=>({packagingTypes:[{id:78,text:'Sackware'},{id:79,text:'Siloware'}],incoterms:[{id:1,text:'FCA'}]}),loadPurchasePackagingOptions:async()=>[{id:78,text:'Sackware'},{id:79,text:'Siloware'}],purchaseTruckLoadKg:require('../src/db/purchase-order-values').purchaseTruckLoadKg,loadSupplierTerms:async()=>({supplierContact:'Einkauf'})},
  '../options/price-plausibility':require('../src/options/price-plausibility'),
  '../options/purchase-quantity':require('../src/options/purchase-quantity'),
};
new Function('require','module',fs.readFileSync(path.join(__dirname,'../src/routes/option-purchases.routes.js'),'utf8'))(name=>{assert.ok(name in deps,name);return deps[name];},mod);
const app=express();app.use(express.json());app.use(mod.exports);app.use((e,req,res,next)=>res.status(e.status||500).json({error:{message:e.message,code:e.details?.code}}));
let server,base;
test.before(async()=>{server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});base=`http://127.0.0.1:${server.address().port}/options/1/positions/10/purchase`;});
test.after(()=>new Promise(resolve=>server.close(resolve)));
test.beforeEach(()=>{identity={shortCode:'NSC',personNumber:227,userId:'n.schroeder',active:true};expired=false;price=987;remainingKg=10000;quantityRequests=[];truckOffer=false;});
const select=body=>fetch(`${base}/selection`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const choice=()=>({supplierId:'LF0124',articleIndex:'TARGET',supplierConfirmed:true,articleConfirmed:true});

test('one supplier or article never replaces explicit selection',async()=>{
  assert.equal((await fetch(`${base}/suppliers`)).status,200);
  assert.equal((await fetch(`${base}/articles`)).status,200);
  assert.equal((await select({...choice(),supplierConfirmed:false})).status,422);
  assert.equal((await select({...choice(),articleConfirmed:false})).status,422);
});
test('selection returns confirmed target data and preserves offer price and manual source location',async()=>{
  const response=await select(choice());assert.equal(response.status,200);const {data}=await response.json();
  assert.equal(data.position.optionId,1);assert.equal(data.position.optionPositionId,10);assert.equal(data.position.articleIndex,'TARGET');
  assert.equal(data.position.purchasePrice,987);assert.equal(data.position.amount,10000);
  assert.equal(data.header.loadingLocationSource,'manual');assert.equal(data.header.deliveryTermId,1);
  assert.equal('windowsUser' in data.position,false);
});
test('unknown price never becomes zero and an exhausted or expired option cannot be selected',async()=>{
  price=null;const response=await(await select(choice())).json();assert.equal(response.data.position.purchasePrice,'');
  remainingKg=0;assert.equal((await select(choice())).status,422);
  expired=true;assert.equal((await fetch(`${base}/articles`)).status,422);
});
test('all purchase selection endpoints enforce existing feature access',async()=>{
  identity={shortCode:'OTHER',active:true};
  assert.equal((await fetch(`${base}/suppliers`)).status,403);
  assert.equal((await fetch(`${base}/articles`)).status,403);
  assert.equal((await select(choice())).status,403);
  assert.equal((await fetch(`${base}/quantity`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({totalKg:25000,quantityConfirmed:true})})).status,403);
  assert.equal(quantityRequests.length,0);
});
test('quantity confirmation uses the same guarded option context and authenticated actor',async()=>{
  const response=await fetch(`${base}/quantity`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({totalKg:25000,quantityConfirmed:true,actor:'forged'})});
  assert.equal(response.status,200);assert.equal((await response.json()).data.confirmedQuantityKg,25000);
  assert.equal(quantityRequests[0].id,'1');assert.equal(quantityRequests[0].positionId,'10');assert.equal(quantityRequests[0].actor,'NSC');
});
test('truck selection calculates kg from source count and packaging without a manual quantity confirmation',async()=>{
  truckOffer=true;remainingKg=50000;
  const response=await(await fetch(`${base}/suppliers`)).json();
  assert.equal(response.meta.truckOffer,true);assert.equal(response.meta.offeredTrucks,2);assert.equal(response.meta.packagingTypes.length,2);
  assert.equal((await select(choice())).status,422);
  const bags=await(await select({...choice(),packagingTypeId:78})).json();
  assert.equal(bags.data.position.offeredKg,49500);assert.equal(bags.data.position.remainingKg,49500);assert.equal(bags.data.position.amount,24750);
  const chosen=await(await select({...choice(),packagingTypeId:79})).json();
  assert.equal(chosen.data.header.packagingTypeId,79);assert.equal(chosen.data.header.packagingType,'Siloware');
  assert.equal(chosen.data.position.originalPackagingType,'Sackware');assert.equal(chosen.data.position.amount,25000);
  assert.equal(chosen.data.position.optionPackagingTypeId,79);
  assert.equal(chosen.data.position.offeredKg,50000);assert.equal(quantityRequests.length,0);
  remainingKg=250;
  assert.equal((await select({...choice(),packagingTypeId:78})).status,422);
});
