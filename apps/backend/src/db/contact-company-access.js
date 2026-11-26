const config=require('../config');
const {runSQLQueryAccess,runSQLQuerySqlServer}=require('./access');
const {pilotFeaturesForIdentity}=require('../pilot-features');
const {createHttpError}=require('../utils');

async function requireContactCompany(req,id,requireVisibleCustomerOrSupplier){
 const purchasing=pilotFeaturesForIdentity(req.userIdentity, { readOnly: false }).purchaseOrders;
 try{
  const visible=await requireVisibleCustomerOrSupplier(req,id);
  if(!visible.canManageSupplier && !purchasing)
   throw createHttpError(403,'Die Ansprechpartneranlage für Lieferanten ist nicht freigeschaltet.',{code:'PILOT_FEATURE_FORBIDDEN'});
  return visible.customer;
 }catch(error){
  if(error.status!==404 || !purchasing)throw error;
  // A proven option-supplier account can be selectable before its first order
  // and without the legacy customer/supplier link. Use that same active alias,
  // scoped to the selected mandant, never an arbitrary ERP company number.
  const aliases=await runSQLQuerySqlServer(config.sql.database,`SELECT TOP(1) olk_LieferantenNummer
   FROM BMSApp.tblOptionenLieferantenKonto WHERE olk_MandantID=? AND olk_LieferantenNummer=? AND olk_Aktiv=1`,[req.database.firmaId,id]);
  if(!aliases.length)throw error;
  const rows=await runSQLQueryAccess(req.database,'SELECT TOP(1) k.* FROM dbo.tblKunden k WHERE k.kd_KdNR=?',[id]);
  if(!rows.length)throw error;
  return rows[0];
 }
}
module.exports={requireContactCompany};
