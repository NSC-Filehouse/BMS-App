const { runSQLQueryAccess,runSQLQuerySqlServer }=require('../db/access');
const config=require('../config');
const {articleSelect}=require('./article-catalog');
const {queueSql}=require('./matching-contract');
const {checkMfi}=require('./mfi-compatibility');
async function articleByIndex(database,index){
 return (await runSQLQueryAccess(database,`${articleSelect()} AND a.agA_Artikelindex=?`,[index]))[0] || null;
}
async function requestRecalculation(company,reason){
 await runSQLQuerySqlServer(config.sql.database,`SET XACT_ABORT ON;BEGIN TRANSACTION;
 DECLARE @company INT=?,@reason NVARCHAR(200)=?;${queueSql()} COMMIT;`,[company,reason]);
}
function parseCandidate(row){return {...JSON.parse(row.oak_DatenJson),snapshotId:String(row.oak_oab_id)};}
async function candidatesFor(database,position,{q='',page=1,pageSize=30}={}){
 if(q){
  const terms=q.trim().split(/\s+/).slice(0,10);
  const params=terms.map(term=>`%${term.replace(/[\[\]%_]/g,char=>`[${char}]`)}%`);
  const base=`${articleSelect()} ${terms.map(()=>"AND CONCAT(a.agA_Artikelindex,N' ',a.agA_Artikelname,N' ',a.agA_Produktnummer) LIKE ?").join(' ')}`;
  const totalRows=await runSQLQueryAccess(database,`SELECT COUNT(*) AS total FROM (${base}) searched`,params);
  const rows=await runSQLQueryAccess(database,`${base} ORDER BY a.agA_Artikelname,a.agA_Artikelindex OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`,[...params,(page-1)*pageSize,pageSize]);
  return {data:rows.map(article=>{
    const mfiCheck=checkMfi(position,article);
    return {...article,score:0,reason:'Manuelle Artikelsuche – technische Eignung ungeprüft',mfiCheck,
      confidence:'manual',warnings:mfiCheck.complete?[]:['MFI-Eignung ungeprüft'],conflicts:mfiCheck.reasons,snapshotId:null};
  }),total:Number(totalRows[0]?.total || 0),version:null};
 }
 if(!position.snapshotId)return {data:[],total:0,processingStatus:'pending',version:null};
 const rows=await runSQLQuerySqlServer(config.sql.database,`SELECT k.* FROM BMSApp.tblOptionenArtikelKandidaten k
 JOIN BMSApp.tblOptionenAbgleich r ON r.oab_id=k.oak_oab_id
 WHERE r.oab_id=? AND r.oab_opp_id=? AND r.oab_MandantID=?
 ORDER BY k.oak_Rang OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`,
 [String(position.snapshotId),Number(position.id),Number(database.firmaId),(page-1)*pageSize,pageSize]);
 return {data:rows.map(parseCandidate),total:Number(position.candidateCount || 0),version:position.matchVersion,
  snapshotId:String(position.snapshotId),computedAt:position.matchCalculatedAt};
}
async function storedCandidate(database,position,index){
 if(!position.snapshotId)return null;
 const rows=await runSQLQuerySqlServer(config.sql.database,`SELECT k.* FROM BMSApp.tblOptionenArtikelKandidaten k
 JOIN BMSApp.tblOptionenAbgleich r ON r.oab_id=k.oak_oab_id
 WHERE r.oab_id=? AND r.oab_opp_id=? AND r.oab_MandantID=? AND k.oak_Artikelindex=?`,
 [String(position.snapshotId),Number(position.id),Number(database.firmaId),index]);
 return rows[0] ? parseCandidate(rows[0]) : null;
}
module.exports={articleByIndex,candidatesFor,storedCandidate,requestRecalculation};
