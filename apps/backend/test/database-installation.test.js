const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const sqlDirectory=path.resolve(__dirname,'../sql');
const sql=fs.readFileSync(path.join(sqlDirectory,'install_BMSApp.sql'),'utf8');
const tables=[...sql.matchAll(/CREATE TABLE \[BMSApp\]\.\[([^\]]+)\]/g)].map(m=>m[1]);
const requiredTables=[
 'ContactCreationOperation','CreditLimitMailOutbox','CreditLimitRequestState','CustomerCreation','CustomerCreationMandant','CustomerCreationRollback','CustomerCreationSnapshot','DailyVlMailOutbox','DeliveryAddressOperation',
 'OptionOfferDocument','OptionOfferMailOutbox','OrderMailOutbox','OrderReminderState','PurchaseOrderCsMailOutbox','PurchaseOrderMailOutbox','PushMandantSetting','PushSubscription',
 'tbl_Temp_Aktivitaet','tbl_Temp_Ang_Position','tbl_Temp_Angebot','tbl_Temp_Auf_Position','tbl_Temp_Auftrag','tbl_Temp_Auftrag_Anhang','tbl_Temp_Best_Position','tbl_Temp_Bestellung','tbl_Temp_Bestellung_Anhang',
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
test('position references are nullable, upgradeable and checked against the target position keys',()=>{
 const relationships=[
  ['tbl_Temp_Ang_Position','tagp_order_position_id','tbl_Temp_Auf_Position','tap_id'],
  ['tbl_Temp_Auf_Position','tap_purchase_position_id','tbl_Temp_Best_Position','tbp_id'],
  ['tbl_Temp_Auf_Position','tap_offer_position_id','tbl_Temp_Ang_Position','tagp_id'],
  ['tbl_Temp_Auf_Position','tap_option_position_id','tblOptionenPositionen','opp_id'],
  ['tbl_Temp_Best_Position','tbp_order_position_id','tbl_Temp_Auf_Position','tap_id'],
 ];
 for(const [table,column,target,key] of relationships){
  const definition=sql.split(`CREATE TABLE [BMSApp].[${table}] (`)[1].split(");');")[0];
  assert.ok(definition.includes(`[${column}] [int] NULL`),column);
  const upgrade=sql.indexOf(`ALTER TABLE [BMSApp].[${table}] ADD [${column}] [int] NULL;`);
  assert.ok(upgrade>=0 && upgrade<sql.indexOf('DECLARE @expectedColumns'),column);
  assert.ok(sql.includes(`WITH CHECK ADD CONSTRAINT [FK_${table}_${column}] FOREIGN KEY ([${column}]) REFERENCES [BMSApp].[${target}] ([${key}]);`),column);
 }
});
test('incompatible installations abort atomically instead of altering or deleting existing columns',()=>{
 assert.match(sql,/SET XACT_ABORT ON/);assert.match(sql,/BEGIN TRANSACTION/);assert.match(sql,/IF @@TRANCOUNT>0 ROLLBACK TRANSACTION/);
 assert.match(sql,/THROW 51001/);
 const supportedOfferUpgrade='ALTER TABLE [BMSApp].[OptionOfferMailOutbox] ALTER COLUMN [OptionPositionId] INT NULL;';
 assert.doesNotMatch(sql.replace(supportedOfferUpgrade,''),/ALTER TABLE[^\n]*(?:DROP COLUMN|ALTER COLUMN)/i);
 const manifest=JSON.parse(sql.match(/DECLARE @expectedColumns NVARCHAR\(MAX\)=N'((?:''|[^'])*)';/s)[1].replaceAll("''","'"));
 assert.equal(manifest.length,783);
 assert.equal(new Set(manifest.map(c=>c.table)).size,45);
 assert.equal(manifest.find(c=>c.table==='tbl_Temp_Auftrag' && c.column==='ta_delivery_address_id').type,'int');
 const pdf=manifest.find(c=>c.table==='tbl_Temp_Angebot' && c.column==='tag_offer_pdf');
 assert.deepEqual([pdf.type,pdf.length,pdf.nullable],['varbinary',-1,true]);
 const snapshot=manifest.find(c=>c.table==='tbl_Temp_Bestellung_Anhang' && c.column==='tba_OptionSnapshot');
 assert.deepEqual([snapshot.type,snapshot.length,snapshot.nullable],['nvarchar',-1,true]);
 const upgrade=fs.readFileSync(path.join(sqlDirectory,'upgrades/purchase-option-pdf.sql'),'utf8');
 const definition='[tba_OptionSnapshot] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL';
 assert.equal(sql.split(definition).length-1,2,'new and existing databases get the same nullable column');
 assert.ok(upgrade.includes(definition));
 assert.match(upgrade,/IF COL_LENGTH\(N'BMSApp\.tbl_Temp_Bestellung_Anhang', N'tba_OptionSnapshot'\) IS NULL/);
 assert.match(sql,/FOREIGN KEY \(\[TempOfferId\]\) REFERENCES \[BMSApp\]\.\[tbl_Temp_Angebot\] \(\[tag_id\]\)/);
});
