const test=require('node:test'),assert=require('node:assert/strict');
const {createHttpError}=require('../src/utils');
let alias=true,customer=true,calls=[];
require.cache[require.resolve('../src/config')]={exports:{sql:{database:'BMS'}}};
require.cache[require.resolve('../src/db/access')]={exports:{
 runSQLQuerySqlServer:async(db,sql,params)=>{calls.push({db,sql,params});return alias?[{olk_LieferantenNummer:'LF0124'}]:[];},
 runSQLQueryAccess:async(db,sql,params)=>{calls.push({db,sql,params});return customer?[{kd_KdNR:'LF0124'}]:[];},
}};
const {requireContactCompany}=require('../src/db/contact-company-access');
const req={database:{firmaId:3,shortName:'FRU'},userIdentity:{shortCode:'NSC',personNumber:227,userId:'n.schroeder',active:true}};
const absent=async()=>{throw createHttpError(404,'Not visible');};
test.beforeEach(()=>{alias=true;customer=true;calls=[];});
test('visible customers retain existing permissions, suppliers require purchasing access',async()=>{
 assert.equal(await requireContactCompany({},'10001',async()=>({customer:'customer',canManageSupplier:true})),'customer');
 await assert.rejects(requireContactCompany({},'LF0124',async()=>({customer:'supplier',canManageSupplier:false})),e=>e.status===403);
 assert.equal(calls.length,0);
});
test('first-order supplier account must have an active alias in the active mandant and an ERP row',async()=>{
 assert.equal((await requireContactCompany(req,'LF0124',absent)).kd_KdNR,'LF0124');
 assert.deepEqual(calls[0].params,[3,'LF0124']);assert.equal(calls[1].db,req.database);
 alias=false;await assert.rejects(requireContactCompany(req,'OTHER',absent),e=>e.status===404);
 alias=true;customer=false;await assert.rejects(requireContactCompany(req,'MISSING',absent),e=>e.status===404);
});
test('non-pilot identities and other authorization failures never use the alias fallback',async()=>{
 await assert.rejects(requireContactCompany({database:req.database},'LF0124',absent),e=>e.status===404);
 await assert.rejects(requireContactCompany(req,'LF0124',async()=>{throw createHttpError(403,'denied');}),e=>e.status===403);
 assert.equal(calls.length,0);
});
