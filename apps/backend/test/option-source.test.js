const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
let identity, calls, available, source;
require.cache[require.resolve('../src/middlewares/mandant.middleware')] = { exports: {
  requireMandant: (req,res,next) => { req.database={firmaId:19}; req.mandant='19'; req.userIdentity=identity; next(); },
} };
require.cache[require.resolve('../src/db/access')] = { exports: {
  runSQLQuerySqlServer: async (_database,sql,params) => { calls.push({sql,params}); return available ? [source] : []; },
  runSQLQueryAccess: async () => { throw Error('Unexpected ERP access'); },
} };
const { sourceFileType } = require('../src/options/source');
const app=express();
app.use(require('../src/routes/options.routes'));
app.use((error,req,res,next) => res.status(error.status || 500).json({error:{code:error.details?.code,message:error.message}}));
let server,base;
test.before(async () => {
  server=await new Promise(resolve => { const listener=app.listen(0,'127.0.0.1',()=>resolve(listener)); });
  base=`http://127.0.0.1:${server.address().port}/options/614/source`;
});
test.after(()=>new Promise(resolve=>server.close(resolve)));
test.beforeEach(()=>{
  identity={shortCode:'NSC',personNumber:227,userId:'n.schroeder',active:true};
  calls=[]; available=true;
  source={body:'<table><tr><td>FCA ex Geleen</td></tr></table><script>alert(1)</script>',format:'HTML',
    content:Buffer.from('%PDF-1.7\noriginal document'),fileName:'offer.pdf',mime:'application/pdf'};
});

test('shared original mail is returned as uncached JSON, never executable HTML',async()=>{
  const response=await fetch(`${base}/mail`);
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/application\/json/);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.deepEqual((await response.json()).data,{body:source.body,format:'HTML'});
  const {sql,params}=calls[0];
  assert.equal(params[0],614);
  assert.equal((sql.match(/\?/g)||[]).length,params.length);
  assert.match(sql,/op_GeloeschtAm IS NULL/);
  assert.match(sql,/op_IstDemo=0/);
  assert.match(sql,/op_Pruefstatus IN\(N'approved',N'pending'\)/);
  assert.match(sql,/op_Geschaeftsstatus=N'open'/);
  assert.match(sql,/op_GueltigAb<=\?/);
  assert.match(sql,/EXISTS\(SELECT 1 FROM/);
  assert.match(sql,/COALESCE\(p\.opp_GueltigBis,o\.op_GueltigBis\)>=\?/);
  assert.doesNotMatch(sql,/op_MandantID=|op_QuelleDatei AS content/);
});

test('original file keeps its bytes and uses a fixed safe filename and passive MIME',async()=>{
  source.fileName='evil"\r\n<script>.pdf';
  const response=await fetch(`${base}/file`);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'application/pdf');
  assert.equal(response.headers.get('content-disposition'),'inline; filename="option-614.pdf"');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.match(response.headers.get('content-security-policy'),/sandbox/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),source.content);
  assert.doesNotMatch(calls[0].sql,/op_QuelleMailtext AS body/);
});

test('both source routes enforce feature access and ID validation before reading',async()=>{
  identity={...identity,userId:'other',shortCode:'OTHER',personNumber:1};
  for(const kind of ['mail','file']) assert.equal((await fetch(`${base}/${kind}`)).status,403);
  assert.equal(calls.length,0);
  identity={shortCode:'NSC',personNumber:227,userId:'n.schroeder',active:true};
  for(const kind of ['mail','file']) assert.equal((await fetch(`${base.replace('/614/','/invalid/')}/${kind}`)).status,400);
  assert.equal(calls.length,0);
});

test('an unknown browser identity cannot read either original source',async()=>{
  identity=null;
  for(const kind of ['mail','file']) {
    const response=await fetch(`${base}/${kind}`);
    assert.equal(response.status,401);
  }
  assert.equal(calls.length,0);
});

test('unavailable options and missing source contents return 404',async()=>{
  available=false;
  for(const kind of ['mail','file']) assert.equal((await fetch(`${base}/${kind}`)).status,404);
  available=true; source.body=''; source.content=Buffer.alloc(0);
  for(const kind of ['mail','file']) {
    const response=await fetch(`${base}/${kind}`);
    assert.equal(response.status,404);
    assert.equal((await response.json()).error.code,'OPTION_SOURCE_NOT_FOUND');
  }
});

test('active content is rejected; legacy PDFs and source images remain supported',async()=>{
  source.mime='text/html';
  assert.equal((await fetch(`${base}/file`)).status,415);
  assert.equal(sourceFileType({fileName:'Offer.PDF'}),'application/pdf');
  assert.equal(sourceFileType({mime:'image/png'}),'image/png');
  assert.equal(sourceFileType({fileName:'Offer.jpg'}),'image/jpeg');
  assert.throws(()=>sourceFileType({fileName:'offer.html'}),error=>error.status===415);
});
