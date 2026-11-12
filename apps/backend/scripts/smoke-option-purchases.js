// Real schema/quantity check using the current Windows login. Every test row
// remains uncommitted and is rolled back; no order hand-off or mail code runs.
const path = require('node:path');
const assert = require('node:assert/strict');
const odbc = require('odbc');
require('dotenv').config({ path:path.join(__dirname,'../.env'),quiet:true });
const { loadOptionPosition,loadOptionAvailability,assertOptionQuantities } = require('../src/options/purchase-source');
const { berlinDate } = require('../src/options/read');
const {offeredTruckCount}=require('../src/options/purchase-quantity');
const config = require('../src/config');

async function main() {
  const server = process.env.OPTION_SMOKE_SQL_SERVER || config.sql.server || config.sql.host || config.sql.instance;
  const target = server.includes('\\') || !config.sql.instanceName ? server : `${server}\\${config.sql.instanceName}`;
  const connectionString = `Driver={ODBC Driver 18 for SQL Server};Server=${target};Database=${config.sql.database};Trusted_Connection=Yes;Encrypt=Yes;TrustServerCertificate=Yes;`;
  const db = await odbc.connect(connectionString);
  const query = async (sql,params=[]) => {
    try {return {rows:await db.query(sql,params)};}
    catch(error){console.error(`Failed smoke query: ${sql.trim().slice(0,100)}`);throw error;}
  };
  let open = false;
  try {
    const login = (await db.query('SELECT ORIGINAL_LOGIN() AS loginName'))[0].loginName;
    assert.ok(login.includes('\\'),'Expected integrated Windows identity');
    await db.beginTransaction();open=true;
    const today = berlinDate();
    const candidates = await db.query(`SELECT TOP 1 o.op_id,p.opp_id FROM BMSApp.tblOptionenPositionen p
      JOIN BMSApp.tblOptionen o ON o.op_id=p.opp_op_id WHERE o.op_IstDemo=0 AND o.op_GeloeschtAm IS NULL
      AND o.op_Geschaeftsstatus=N'open' AND o.op_Pruefstatus IN(N'approved',N'pending')
      AND o.op_GueltigAb<=? AND COALESCE(p.opp_GueltigBis,o.op_GueltigBis)>=?
      AND COALESCE(p.opp_ChargenbestandKg,p.opp_MengeBisKg,p.opp_MengeVonKg)>10 ORDER BY p.opp_id`,[today,today]);
    assert.equal(candidates.length,1,'Requires a current real option with a confirmed quantity');
    const ref=candidates[0];
    const source=await loadOptionPosition(ref.op_id,ref.opp_id,query,{lock:true});
    const contender=await odbc.connect(connectionString);
    try {
      await contender.query('SET LOCK_TIMEOUT 1000');
      await contender.beginTransaction();
      try {
        await assert.rejects(assertOptionQuantities(async(sql,params)=>({rows:await contender.query(sql,params)}),[
          {optionId:Number(ref.op_id),optionPositionId:Number(ref.opp_id),amount:1},
        ]),error=>error.odbcErrors?.some(detail=>detail.code===1222),'Concurrent source allocation must wait for the first transaction');
      } finally {await contender.rollback();}
    } finally {await contender.close();}
    const before=await loadOptionAvailability(source,null,query);
    assert.ok(before.remainingKg>1);
    const amount=Math.min(1,Math.floor(before.remainingKg*1000)/1000);
    const orders=[];
    for(const companyId of [3,10]) {
      const order=(await db.query(`INSERT BMSApp.tbl_Temp_Bestellung(tb_company_id,tb_client_request_id,tb_supplier_id,tb_supplier_name,tb_created_by,tb_last_modified_by)
        OUTPUT inserted.tb_id AS id VALUES(?,NEWID(),N'ROLLBACK',N'Rollback verification',N'CODEX_CHECK',N'CODEX_CHECK')`,[companyId]))[0];
      orders.push(Number(order.id));
      await db.query(`INSERT BMSApp.tbl_Temp_Best_Position(tbp_tb_id,tbp_line_no,tbp_article_index,tbp_article,tbp_amount,tbp_unit,tbp_purchase_price,
        tbp_requested_delivery_date,tbp_created_by,tbp_last_modified_by,OptionID,OptionPositionID)
        VALUES(?,1,N'ROLLBACK',N'Rollback verification',?,N'kg',1,?,N'CODEX_CHECK',N'CODEX_CHECK',?,?)`,[order.id,amount,today,ref.op_id,ref.opp_id]);
    }
    const after=await loadOptionAvailability(source,null,query);
    assert.equal(after.orderedKg,before.orderedKg+2*amount,'Both mandants count together');
    const line={optionId:Number(ref.op_id),optionPositionId:Number(ref.opp_id),amount:before.remainingKg-amount};
    await assertOptionQuantities(query,[line],orders[0]); // replace own amount, not double count
    await assert.rejects(assertOptionQuantities(query,[{...line,amount:before.remainingKg-amount+0.001}],orders[0]),e=>e.details?.code==='OPTION_QUANTITY_EXCEEDED');
    const pair=(await db.query('SELECT OptionID,OptionPositionID FROM BMSApp.tbl_Temp_Best_Position WHERE tbp_tb_id=?',[orders[0]]))[0];
    assert.equal(Number(pair.OptionID),Number(ref.op_id));assert.equal(Number(pair.OptionPositionID),Number(ref.opp_id));
    const trucks=await db.query(`SELECT TOP 1 o.op_id,p.opp_id FROM BMSApp.tblOptionenPositionen p
      JOIN BMSApp.tblOptionen o ON o.op_id=p.opp_op_id WHERE o.op_IstDemo=0 AND o.op_GeloeschtAm IS NULL
      AND o.op_Geschaeftsstatus=N'open' AND o.op_Pruefstatus IN(N'approved',N'pending')
      AND o.op_GueltigAb<=? AND COALESCE(p.opp_GueltigBis,o.op_GueltigBis)>=?
      AND p.opp_Mengenart=N'truckloads' AND COALESCE(p.opp_LKWAnzahlBis,p.opp_LKWAnzahlVon)>0 ORDER BY p.opp_id`,[today,today]);
    if(trucks.length){
      const truck=trucks[0],position=await loadOptionPosition(truck.op_id,truck.opp_id,query,{lock:true});
      const capacity=await loadOptionAvailability(position,null,query);
      assert.ok(capacity.offeredKg>0 && capacity.offeredKg<=offeredTruckCount(position)*25000);
      const bagsRemaining=Math.max(0,Math.min(capacity.offeredKg,offeredTruckCount(position)*24750)-capacity.orderedKg);
      const truckLine={optionId:Number(truck.op_id),optionPositionId:Number(truck.opp_id),amount:bagsRemaining};
      if(bagsRemaining>0)await assertOptionQuantities(query,[truckLine],null,'Sackware');
      await assert.rejects(assertOptionQuantities(query,[{...truckLine,amount:bagsRemaining+0.001}],null,'Sackware'),e=>e.details?.code==='OPTION_QUANTITY_EXCEEDED');
    }
    const unclear=await db.query(`SELECT TOP 1 o.op_id,p.opp_id FROM BMSApp.tblOptionenPositionen p
      JOIN BMSApp.tblOptionen o ON o.op_id=p.opp_op_id WHERE o.op_IstDemo=0 AND o.op_GeloeschtAm IS NULL
      AND o.op_Geschaeftsstatus=N'open' AND o.op_Pruefstatus IN(N'approved',N'pending')
      AND o.op_GueltigAb<=? AND COALESCE(p.opp_GueltigBis,o.op_GueltigBis)>=?
      AND p.opp_MengeVonKg IS NULL AND p.opp_MengeBisKg IS NULL AND p.opp_ChargenbestandKg IS NULL
      AND p.opp_GesamtmengeBestaetigtKg IS NULL ORDER BY p.opp_id`,[today,today]);
    if(unclear.length){
      const candidate=unclear[0];
      const unknown=await loadOptionPosition(candidate.op_id,candidate.opp_id,query,{lock:true});
      assert.equal((await loadOptionAvailability(unknown,null,query)).offeredKg,null);
      await db.query(`UPDATE BMSApp.tblOptionenPositionen SET opp_GesamtmengeBestaetigtKg=24000,opp_MengeBestaetigtQuellHash=?,
        opp_MengeBestaetigtVon=N'CODEX_CHECK',opp_MengeBestaetigtAm=SYSUTCDATETIME() WHERE opp_id=?`,[unknown.quantitySourceHash,candidate.opp_id]);
      let confirmed=await loadOptionPosition(candidate.op_id,candidate.opp_id,query);
      assert.equal((await loadOptionAvailability(confirmed,null,query)).offeredKg,24000);
      await assertOptionQuantities(query,[{optionId:Number(candidate.op_id),optionPositionId:Number(candidate.opp_id),amount:24000}]);
      await assert.rejects(assertOptionQuantities(query,[{optionId:Number(candidate.op_id),optionPositionId:Number(candidate.opp_id),amount:24000.001}]),e=>e.details?.code==='OPTION_QUANTITY_EXCEEDED');
      await db.query('UPDATE BMSApp.tblOptionenPositionen SET opp_GeaendertAm=DATEADD(MILLISECOND,1,opp_GeaendertAm) WHERE opp_id=?',[candidate.opp_id]);
      confirmed=await loadOptionPosition(candidate.op_id,candidate.opp_id,query);
      assert.equal((await loadOptionAvailability(confirmed,null,query)).offeredKg,24000,'Background timestamps do not discard the confirmation');
      await db.query("UPDATE BMSApp.tblOptionenPositionen SET opp_MengeRohtext=CONCAT(LEFT(opp_MengeRohtext,450),N' changed smoke source') WHERE opp_id=?",[candidate.opp_id]);
      confirmed=await loadOptionPosition(candidate.op_id,candidate.opp_id,query);
      assert.equal((await loadOptionAvailability(confirmed,null,query)).offeredKg,null,'A changed original quantity requires confirmation again');
    }
    await db.rollback();open=false;
    const remaining=(await db.query('SELECT COUNT(*) AS countRows FROM BMSApp.tbl_Temp_Bestellung WHERE tb_id IN(?,?)',orders))[0];
    assert.equal(Number(remaining.countRows),0);
    console.log(JSON.stringify({windowsLogin:login,passed:'Concurrent source lock, cross-mandant totals, own-edit exclusion, excess rejection, automatic truck capacity by packaging, manual total and source hash invalidation, references and rollback',testRowsRemaining:0}));
  } finally {
    if(open)await db.rollback();
    await db.close();
  }
}
if(require.main===module)main().then(()=>process.exit(0)).catch(error=>{console.error(error.message);if(error.odbcErrors)console.error(JSON.stringify(error.odbcErrors));process.exit(1);});
