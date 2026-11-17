const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const sqlDirectory=path.resolve(__dirname,'../sql');
const sql=fs.readFileSync(path.join(sqlDirectory,'install_BMSApp.sql'),'utf8');
const tables=[...sql.matchAll(/CREATE TABLE \[BMSApp\]\.\[([^\]]+)\]/g)].map(m=>m[1]);
const requiredTables=[
 'ContactCreationOperation','CreditLimitMailOutbox','CreditLimitRequestState','CustomerCreation','CustomerCreationMandant','CustomerCreationRollback','CustomerCreationSnapshot','DailyVlMailOutbox','DeliveryAddressOperation',
 'OrderMailOutbox','OrderReminderState','PurchaseOrderCsMailOutbox','PurchaseOrderMailOutbox','PushMandantSetting','PushSubscription',
 'tbl_Temp_Ang_Position','tbl_Temp_Angebot','tbl_Temp_Auf_Position','tbl_Temp_Auftrag','tbl_Temp_Auftrag_Anhang','tbl_Temp_Best_Position','tbl_Temp_Bestellung','tbl_Temp_Bestellung_Anhang',
 'tblOptionen','tblOptionenAbgleich','tblOptionenAbgleichAuftrag','tblOptionenArtikelKandidaten','tblOptionenArtikelMapping','tblOptionenLieferantenKonto','tblOptionenLieferantenRegel',
 'tblOptionenMailEreignis','tblOptionenMailVerarbeitung','tblOptionenPositionen','tblOptionenReaderLaufzeit','tblOptionenReaderSteuerung',
 'TempOrderReworkPushState','Timeline','VlMailOrderState','VlMailOutbox','VlMailUserSetting','VlMailWorkerState','VlSalePushState'
];
test('one self-contained installer covers every operational table, including base orders and the Reader',()=>{
 assert.deepEqual(fs.readdirSync(sqlDirectory).filter(name=>name.endsWith('.sql')),['install_BMSApp.sql']);
 assert.deepEqual([...tables].sort(),requiredTables.sort());
 assert.equal(new Set(tables).size,tables.length);
 assert.doesNotMatch(sql,/^\s*(?:USE\s|:r\s)/im,'database is selected by the caller; no include dependencies');
 assert.doesNotMatch(sql,/OptionenReplay_|OptionenTestReplayBackup_|\b(?:DROP\s+TABLE|DELETE\s+FROM|INSERT\s+INTO)\b/i,'installer contains no test fixtures or business-data changes');
});
test('the operator table list covers every installed table exactly once',()=>{
 const documentation=fs.readFileSync(path.resolve(__dirname,'../../../docs/DATENBANKTABELLEN.md'),'utf8');
 const listed=[...documentation.matchAll(/^\| `([^`]+)` \|/gm)].map(m=>m[1]);
 assert.deepEqual(listed.sort(),[...tables].sort());
});
test('current identity keys, order/option relationships and source storage are present',()=>{
 assert.match(sql,/\[ta_id\] \[int\] IDENTITY\(1,1\)/);
 assert.match(sql,/\[tap_id\] \[int\] IDENTITY\(1,1\)/);
 assert.match(sql,/FOREIGN KEY \(\[opp_AktuellerAbgleichID\], \[opp_id\]\) REFERENCES \[BMSApp\]\.\[tblOptionenAbgleich\] \(\[oab_id\], \[oab_opp_id\]\)/);
 for(const column of ['op_AnbieterKontaktJson','op_QuelleMailbilderJson','OptionID','OptionPositionID','ta_delivery_address_id'])assert.ok(sql.includes(`[${column}]`));
});
test('incompatible installations abort atomically instead of altering or deleting existing columns',()=>{
 assert.match(sql,/SET XACT_ABORT ON/);assert.match(sql,/BEGIN TRANSACTION/);assert.match(sql,/IF @@TRANCOUNT>0 ROLLBACK TRANSACTION/);
 assert.match(sql,/THROW 51001/);assert.doesNotMatch(sql,/ALTER TABLE[^\n]*(?:DROP COLUMN|ALTER COLUMN)/i);
 const manifest=JSON.parse(sql.match(/DECLARE @expectedColumns NVARCHAR\(MAX\)=N'((?:''|[^'])*)';/s)[1].replaceAll("''","'"));
 assert.equal(manifest.length,734);
 assert.equal(new Set(manifest.map(c=>c.table)).size,42);
 assert.equal(manifest.find(c=>c.table==='tbl_Temp_Auftrag' && c.column==='ta_delivery_address_id').type,'int');
});
