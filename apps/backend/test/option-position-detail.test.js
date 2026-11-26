const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
let identity,offers,writes,contactLookups;
const pilot={shortCode:'NSC',personNumber:227,userId:'n.schroeder',active:true};
require.cache[require.resolve('../src/middlewares/mandant.middleware')]={exports:{requireMandant:(req,res,next)=>{req.database={firmaId:3};req.userIdentity=identity;next();}}};
require.cache[require.resolve('../src/options/read')]={exports:{berlinDate:()=> '2026-11-16',loadOffers:async(_scope,{optionId})=>offers.filter(o=>o.id===optionId)}};
require.cache[require.resolve('../src/options/contact-display')]={exports:{enrichOptionContactPhone:async(database,offer)=>{
 contactLookups.push(database.firmaId);
 return offer.contact?{...offer,contact:{...offer.contact,phone:'+491722164144'}}:offer;
}}};
require.cache[require.resolve('../src/db/access')]={exports:{runSQLQueryAccess:async()=>[],runSQLQuerySqlServer:async(_db,sql,params)=>{
 writes.push({sql,params});const offer=offers.find(o=>o.id===params[2]),position=offer?.positions.find(p=>p.id===params[3]);
 if(!position)return [];offer.positions=offer.positions.filter(p=>p.id!==position.id);return [{id:position.id}];
}}};
const app=express();app.use(express.json());app.use(require('../src/routes/options.routes'));app.use((e,req,res,next)=>res.status(e.status || 500).json({code:e.details?.code}));
let server,base;
test.before(async()=>{server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});base=`http://127.0.0.1:${server.address().port}`;});
test.after(()=>new Promise(resolve=>server.close(resolve)));
test.beforeEach(()=>{identity={...pilot};writes=[];contactLookups=[];offers=[{id:621,sourceMandantId:3,positions:[{id:1895},{id:1896}]}];});

test('both detail endpoints enrich the offer phone in the active tenant',async()=>{
 offers[0].contact={name:'Carsten Dorsch',phone:''};
 for(const suffix of ['', '/positions/1895']) {
  const response=await fetch(`${base}/options/621${suffix}`);
  assert.equal(response.status,200);
  assert.equal((await response.json()).data.contact.phone,'+491722164144');
 }
 assert.deepEqual(contactLookups,[3,3]);
});
test('a position detail contains only that position and rejects a wrong parent',async()=>{
 Object.assign(offers[0].positions[0],{sourceMeasurementsJson:'{}',singleCandidateIndex:'INTERNAL'});
 const response=await fetch(`${base}/options/621/positions/1895`);assert.equal(response.status,200);
 assert.deepEqual((await response.json()).data.positions,[{id:1895,matchedArticle:null}]);
 assert.equal((await fetch(`${base}/options/622/positions/1895`)).status,404);
});
test('deletion requires confirmation and affects only the selected position',async()=>{
 const url=`${base}/options/621/positions/1895`;
 assert.equal((await fetch(url,{method:'DELETE'})).status,422);assert.equal(writes.length,0);
 assert.equal((await fetch(url,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmed:true})})).status,204);
 assert.deepEqual(offers[0].positions,[{id:1896}]);
 assert.match(writes[0].sql,/p\.opp_GeloeschtAm IS NULL/);assert.match(writes[0].sql,/WHERE o\.op_id=\? AND p\.opp_id=\?/);
 assert.equal((await fetch(url)).status,404);
});
test('unknown and unauthorized identities cannot read or delete position data',async()=>{
 identity=null;assert.equal((await fetch(`${base}/options/621/positions/1895`)).status,401);
 identity={shortCode:'OTHER',active:true};assert.equal((await fetch(`${base}/options/621/positions/1895`,{method:'DELETE'})).status,403);
 assert.equal(writes.length,0);
});
