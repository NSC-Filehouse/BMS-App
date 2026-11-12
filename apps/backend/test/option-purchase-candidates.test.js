const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

function fixture(){
  const calls=[];
  const rows=Array.from({length:42},(_,i)=>({articleIndex:String(i),articleName:`Artikel ${i}`}));
  const execute=async(_db,sql,params)=>{
    calls.push({sql,params});assert.equal((sql.match(/\?/g)||[]).length,params.length);
    if(sql.includes('COUNT(*)'))return [{total:42}];
    const result=sql.includes('OFFSET')?rows.slice(0,30):rows;
    return sql.includes('tblOptionenArtikelKandidaten')?result.map(row=>({oak_DatenJson:JSON.stringify(row),oak_oab_id:7})):result;
  };
  const dependencies={
    '../db/access':{runSQLQueryAccess:execute,runSQLQuerySqlServer:execute},
    '../config':{sql:{database:'central'}},'./article-catalog':{articleSelect:()=> 'SELECT articleIndex FROM articles WHERE active=1'},
    './matching-contract':{queueSql:()=>''},'./mfi-compatibility':{checkMfi:()=>({complete:true,blocked:false})},
  };
  const mod={exports:{}};
  new Function('require','module',fs.readFileSync(path.join(__dirname,'../src/options/matching-service.js'),'utf8'))(name=>{
    assert.ok(name in dependencies,name);return dependencies[name];
  },mod);
  return {calls,candidatesFor:mod.exports.candidatesFor};
}
const position={id:10,snapshotId:7,candidateCount:42};

test('option purchase receives all 42 stored suggestions in one query without paging',async()=>{
  const f=fixture(),result=await f.candidatesFor({firmaId:3},position,{all:true});
  assert.equal(result.data.length,42);assert.equal(result.total,42);assert.equal(f.calls.length,1);
  assert.doesNotMatch(f.calls[0].sql,/OFFSET|FETCH NEXT/);assert.deepEqual(f.calls[0].params,['7',10,3]);
});
test('manual purchase search also receives all results while other candidate consumers retain paging',async()=>{
  const f=fixture(),result=await f.candidatesFor({firmaId:3},position,{q:'LDPE',all:true});
  assert.equal(result.data.length,42);assert.equal(result.total,42);assert.equal(f.calls.length,1);
  assert.doesNotMatch(f.calls[0].sql,/OFFSET|FETCH NEXT/);
  const ordinary=await f.candidatesFor({firmaId:3},position);
  assert.equal(ordinary.data.length,30);assert.equal(ordinary.total,42);assert.match(f.calls[1].sql,/OFFSET/);
});
