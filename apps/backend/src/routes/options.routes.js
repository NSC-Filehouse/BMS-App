const express = require('express');
const config = require('../config');
const { asyncHandler, createHttpError, sendEnvelope } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { requirePilotFeature } = require('../middlewares/pilot-feature.middleware');
const { runSQLQueryAccess, runSQLQuerySqlServer, withSqlTransaction } = require('../db/access');
const { loadOffers } = require('../options/read');
const { resolveVlDatabase } = require('../vl-source');
const { candidatesFor, articleByIndex, storedCandidate, requestRecalculation } = require('../options/matching-service');
const { articleHash, queueSql } = require('../options/matching-contract');
const { checkMfi } = require('../options/mfi-compatibility');
const { appTableSql } = require('../db/app-tables');
const router = express.Router();
const OPTIONS = appTableSql('options'), POSITIONS = appTableSql('optionPositions');
function positiveId(value) {
 const id=Number(value);
 if(!Number.isSafeInteger(id)||id<1)throw createHttpError(400,'Ungültige ID.',{code:'INVALID_ID'});
 return id;
}
router.get('/options',requireMandant,requirePilotFeature('options'),asyncHandler(async(req,res)=>{
 sendEnvelope(res,{data:await loadOffers(null),meta:{mandant:req.mandant}});
}));
router.get('/options/:id',requireMandant,requirePilotFeature('options'),asyncHandler(async(req,res)=>{
 const offers=await loadOffers(null,{optionId:positiveId(req.params.id),includeExpired:req.query?.preview==='1'});
 if(!offers.length)throw createHttpError(404,'Option nicht gefunden.',{code:'OPTION_NOT_FOUND'});
 sendEnvelope(res,{data:{...offers[0],readOnly:Number(offers[0].sourceMandantId)!==Number(req.database.firmaId)},
  meta:{mandant:req.mandant,viewMandantId:offers[0].sourceMandantId,sharedOptions:true,preview:req.query?.preview==='1'}});
}));
async function scopedPosition(req,database=req.database){
 const rows=await runSQLQuerySqlServer(config.sql.database,`SELECT p.opp_id AS id,p.opp_AktuellerAbgleichID AS snapshotId,
  p.opp_MFI AS mfi,p.opp_MFI_bis AS mfiTo,p.opp_MFI_Pruefmethode AS mfiTestCondition,p.opp_QuellaufbereitungJson AS sourceMeasurementsJson,
  CONVERT(NVARCHAR(33),p.opp_GeaendertAm,126) AS originalChanged,
  CONVERT(NVARCHAR(33),r.oab_QuelldatenGeaendertAm,126) AS snapshotChanged,
  r.oab_KandidatenAnzahl AS candidateCount,r.oab_AlgorithmusVersion AS matchVersion,r.oab_BerechnetAm AS matchCalculatedAt,
  r.oab_AnforderungRevision AS snapshotRevision,j.oaa_Revision AS requestRevision
  FROM ${POSITIONS} p JOIN ${OPTIONS} o ON o.op_id=p.opp_op_id
  LEFT JOIN BMSApp.tblOptionenAbgleich r ON r.oab_id=p.opp_AktuellerAbgleichID AND r.oab_opp_id=p.opp_id AND r.oab_MandantID=o.op_MandantID
  LEFT JOIN BMSApp.tblOptionenAbgleichAuftrag j ON j.oaa_MandantID=o.op_MandantID
  WHERE o.op_id=? AND p.opp_id=? AND o.op_MandantID=? AND o.op_GeloeschtAm IS NULL
  AND o.op_Geschaeftsstatus=N'open' AND o.op_Pruefstatus IN(N'approved',N'pending')`,
  [positiveId(req.params.id),positiveId(req.params.positionId),Number(database.firmaId)]);
 if(!rows.length)throw createHttpError(404,'Position nicht gefunden.',{code:'OPTION_POSITION_NOT_FOUND'});
 return rows[0];
}
router.get('/options/:id/positions/:positionId/candidates',requireMandant,requirePilotFeature('options'),asyncHandler(async(req,res)=>{
 const database=await resolveVlDatabase(req,req.query?.vlMandantId);
 const position=await scopedPosition(req,database);
 const q=String(req.query?.q||'').trim().slice(0,150);
 const pageSize=30,page=Math.max(1,Math.min(10000,Number.parseInt(req.query?.page,10)||1));
 const result=await candidatesFor(database,position,{q,page,pageSize});
 const {data,...meta}=result;
 sendEnvelope(res,{data,meta:{mandant:req.mandant,page,pageSize,...meta}});
}));
router.post('/options/:id/positions/:positionId/recalculate',requireMandant,requirePilotFeature('options'),asyncHandler(async(req,res)=>{
 await scopedPosition(req);
 await requestRecalculation(Number(req.database.firmaId),'In der App angeforderte Neuberechnung');
 sendEnvelope(res,{status:202,data:{queued:true},meta:{mandant:req.mandant}});
}));
router.get('/options/:id/positions/:positionId/history/:articleIndex/:evidencePositionId',requireMandant,requirePilotFeature('options'),asyncHandler(async(req,res)=>{
 const database=await resolveVlDatabase(req,req.query?.vlMandantId);
 const position=await scopedPosition(req,database);
 const candidate=await storedCandidate(database,position,String(req.params.articleIndex));
 const evidence=candidate?.history?.examples?.find(example=>example.positionId===req.params.evidencePositionId);
 if(!evidence)throw createHttpError(404,'Historischer Beleg nicht gefunden.',{code:'OPTION_HISTORY_NOT_FOUND'});
 const rows=await runSQLQueryAccess(database,`SELECT p.beP_BEposID AS positionId,p.beP_Artikel AS articleName,
  p.beP_Artikelindex AS articleIndex,p.beP_MFI AS mfi,p.beP_MFIgemessen AS measuredMfi,p.beP_MFI_Pruefmethode AS mfiMethod,
  p.beP_Zusatztext AS additionalText,p.beP_Anzahl AS amount,p.beP_Einheit AS unit,p.beP_WareErhalten AS goodsReceived,
  b.be_Bestelldatum AS orderDate,b.be_Bestellindex AS orderIndex,k.kd_Name1 AS supplierName
  FROM dbo.tblBest_Position p JOIN dbo.tblBestellung b ON b.be_Bestellindex=p.beP_Bestellindex
  LEFT JOIN dbo.tblKunden k ON k.kd_KdNR=b.be_KdNr
  WHERE p.beP_BEposID=? AND b.be_Bestellindex=? AND b.be_KdNr=? AND p.beP_Artikelindex=? AND COALESCE(p.beP_Storno,0)=0`,
  [evidence.positionId,evidence.orderIndex,evidence.supplierId,String(req.params.articleIndex)]);
 if(!rows.length)throw createHttpError(404,'Historischer Beleg ist nicht mehr verfügbar.',{code:'OPTION_HISTORY_NOT_FOUND'});
 sendEnvelope(res,{data:rows[0],meta:{mandant:req.mandant,viewMandantId:database.firmaId}});
}));
router.post('/options/:id/positions/:positionId/article',requireMandant,requirePilotFeature('options'),asyncHandler(async(req,res)=>{
 const position=await scopedPosition(req);
 const index=String(req.body?.articleIndex||'').trim();
 if(!index||index.length>50)throw createHttpError(400,'Artikelindex fehlt.',{code:'ARTICLE_INDEX_REQUIRED'});
 const article=await articleByIndex(req.database,index);
 if(!article)throw createHttpError(404,'Artikel nicht gefunden.',{code:'ARTICLE_NOT_FOUND'});
 const mfiCheck=checkMfi(position,article);
 if(mfiCheck.blocked)throw createHttpError(409,`Artikel wegen MFI nicht zuordenbar: ${mfiCheck.reasons.join('; ')}`,{code:'ARTICLE_MFI_EXCLUDED'});
 if(!mfiCheck.complete && req.body?.acknowledgeUnverifiedMfi!==true)
  throw createHttpError(409,'MFI-Eignung ungeprüft: Messwert, Artikelbereich oder Prüfbedingungen fehlen. Bitte ausdrücklich bestätigen.',{code:'ARTICLE_MFI_UNVERIFIED'});
 const selected=await storedCandidate(req.database,position,index);
 const manual=req.body?.acknowledgeManual===true;
 if(!manual&&(!selected||position.snapshotChanged!==position.originalChanged || position.snapshotRevision<position.requestRevision
   ||(req.body?.snapshotId!=null&&String(req.body.snapshotId)!==String(position.snapshotId))
   ||selected.articleHash!==articleHash(article))){
  await requestRecalculation(Number(req.database.firmaId),'Veralteter oder fehlender Artikelvorschlag');
  throw createHttpError(409,'Artikelvorschlag wird aktualisiert. Bitte anschließend erneut auswählen oder ausdrücklich über die manuelle Artikelsuche zuordnen.',{code:'OPTION_MATCH_STALE'});
 }
 if(!manual&&selected?.conflicts?.length&&req.body?.acknowledgeConflict!==true){
  throw createHttpError(409,selected.conflicts.join('; '),{code:'ARTICLE_MATCH_CONFLICT'});
 }
 const actor=String(req.userIdentity?.shortCode||req.userEmail||'APP').slice(0,100);
 const sub=/\bmLLDPE\b/i.test(article.articleName)?'mLLDPE':article.polymerSubCategory;
 await withSqlTransaction(config.sql.database,async({query})=>{
  await query(`DECLARE @company INT=?,@reason NVARCHAR(200)=?;${queueSql()}`,
   [Number(req.database.firmaId),'Manuelle Artikelzuordnung und Lernregel prüfen']);
  const updated=await query(`UPDATE p SET opp_Artikelindex=?,opp_Artikelname=?,opp_MatchStatus=N'confirmed',
   opp_MatchGrund=N'Manuell in der App zugeordnet',opp_GeaendertVon=?,opp_GeaendertAm=SYSUTCDATETIME(),
   opp_BestaetigtKunststoff=?,opp_BestaetigtUntergruppe=?,opp_ZuordnungRevision=opp_ZuordnungRevision+1,
   opp_LernenAngefordert=1,opp_LernregelHinweis=NULL
   FROM ${POSITIONS} p JOIN ${OPTIONS} o WITH(UPDLOCK,HOLDLOCK) ON o.op_id=p.opp_op_id
   WHERE p.opp_id=? AND o.op_id=? AND o.op_MandantID=? AND o.op_GeloeschtAm IS NULL AND o.op_Geschaeftsstatus=N'open'
   AND p.opp_GeaendertAm=CONVERT(DATETIME2(7),?)`,
   [index,article.articleName,actor,article.polymerCategory||'Optionen',sub??'',Number(position.id),positiveId(req.params.id),Number(req.database.firmaId),position.originalChanged]);
  if(!updated.rowsAffected[0])throw createHttpError(409,'Position wurde zwischenzeitlich geändert.',{code:'OPTION_CHANGED'});
 });
 sendEnvelope(res,{data:{articleIndex:index,articleName:article.articleName,learningPending:true},meta:{mandant:req.mandant}});
}));
router.delete('/options/:id',requireMandant,requirePilotFeature('options'),asyncHandler(async(req,res)=>{
 const actor=String(req.userIdentity?.shortCode||req.userEmail||'APP').slice(0,100);
 const rows=await runSQLQuerySqlServer(config.sql.database,`UPDATE ${OPTIONS} SET op_GeloeschtAm=SYSUTCDATETIME(),op_GeloeschtVon=?,
  op_GeaendertVon=?,op_GeaendertAm=SYSUTCDATETIME() OUTPUT inserted.op_id AS id
  WHERE op_id=? AND op_GeloeschtAm IS NULL AND op_Geschaeftsstatus=N'open'`,[actor,actor,positiveId(req.params.id)]);
 if(!rows.length)throw createHttpError(404,'Option nicht gefunden.',{code:'OPTION_NOT_FOUND'});
 res.status(204).end();
}));
module.exports=router;
