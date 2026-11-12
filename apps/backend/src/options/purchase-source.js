const config = require('../config');
const { runSQLQueryAccess, runSQLQuerySqlServer,withSqlTransaction } = require('../db/access');
const { appTableSql } = require('../db/app-tables');
const { createHttpError } = require('../utils');
const { berlinDate } = require('./read');
const { supplierKey, companyKey, knownSupplier } = require('./supplier-identity');
const { articleByIndex, candidatesFor } = require('./matching-service');
const { articleSelect } = require('./article-catalog');
const { checkMfi } = require('./mfi-compatibility');
const { quantityAvailability, fitsQuantity,offeredQuantityKg,quantitySourceHashSql,confirmedQuantitySql,quantityInputKg,isTruckOffer,offeredTruckCount } = require('./purchase-quantity');
const {loadPurchasePackagingOptions,purchaseTruckLoadKg}=require('../db/purchase-order-values');

const text = value => String(value ?? '').trim();
function positiveId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw createHttpError(400, 'Ungültige Optionsreferenz.', { code: 'OPTION_REFERENCE_INVALID' });
  return id;
}

async function loadOptionPosition(optionId, positionId, query = null, { lock = false } = {}) {
  const execute = query || (async (sql, params) => ({ rows: await runSQLQuerySqlServer(config.sql.database, sql, params) }));
  const today = berlinDate();
  const result = await execute(`SELECT p.opp_id,p.opp_op_id,p.opp_Artikelname_Lieferant,p.opp_Artikelname,
    p.opp_Verpackung,p.opp_Verpackungsart_id,p.opp_MengeVonKg,p.opp_MengeBisKg,p.opp_Mengenart,
    p.opp_ChargenbestandKg,p.opp_PreisProTonne,p.opp_GeaendertAm,p.opp_AktuellerAbgleichID,
    p.opp_MengeRohtext AS quantityText,p.opp_LKWAnzahlVon AS truckMin,p.opp_LKWAnzahlBis AS truckMax,
    p.opp_Mengeneinheit AS quantityUnit,p.opp_MengeVon AS quantityMin,p.opp_MengeBis AS quantityMax,
    CASE WHEN p.opp_MengeBestaetigtQuellHash=${quantitySourceHashSql()} THEN p.opp_MengeBestaetigtVerpackungsartID END AS confirmedPackagingTypeId,
    CASE WHEN p.opp_MengeBestaetigtQuellHash=${quantitySourceHashSql()} THEN p.opp_MengeBestaetigtTrucks END AS confirmedTruckCount,
    TRY_CONVERT(DECIMAL(18,3),JSON_VALUE(p.opp_NormalisierungJson,'$.maxTruckLoadKg')) AS maxTruckLoadKg,
    JSON_VALUE(p.opp_NormalisierungJson,'$.provenance.packaging.source') AS packagingSource,
    JSON_VALUE(p.opp_NormalisierungJson,'$.provenance.packaging.evidence') AS packagingEvidence,
    ${quantitySourceHashSql()} AS quantitySourceHash,${confirmedQuantitySql()} AS confirmedQuantityKg,
    CONVERT(NVARCHAR(33),p.opp_GeaendertAm,126) AS sourceVersion,
    o.op_MandantID AS sourceMandantId,o.op_Lieferantenname AS supplierName,
    o.op_Lieferantenkennung AS supplierKey,o.op_Antwortadresse AS supplierReplyTo,o.op_Ladeort AS loadingLocation,
    o.op_Incoterm AS incoterm,o.op_Verpackung AS packagingText,
    p.opp_MFI AS mfi,p.opp_MFI_bis AS mfiTo,p.opp_MFI_Pruefmethode AS mfiTestCondition,
    COALESCE(p.opp_GueltigBis,o.op_GueltigBis) AS validUntil,
    r.oab_KandidatenAnzahl AS candidateCount,r.oab_AlgorithmusVersion AS matchVersion,r.oab_BerechnetAm AS matchCalculatedAt,
    p.opp_QuellaufbereitungJson AS sourceMeasurementsJson
    FROM ${appTableSql('optionPositions')} p ${lock ? 'WITH(UPDLOCK,HOLDLOCK)' : ''}
    JOIN ${appTableSql('options')} o ${lock ? 'WITH(HOLDLOCK)' : ''} ON o.op_id=p.opp_op_id
    LEFT JOIN BMSApp.tblOptionenAbgleich r ON r.oab_id=p.opp_AktuellerAbgleichID AND r.oab_opp_id=p.opp_id AND r.oab_MandantID=o.op_MandantID
    WHERE o.op_id=? AND p.opp_id=? AND o.op_IstDemo=0 AND o.op_GeloeschtAm IS NULL
      AND o.op_Pruefstatus IN(N'approved',N'pending') AND o.op_Geschaeftsstatus=N'open'
      AND o.op_GueltigAb<=? AND COALESCE(p.opp_GueltigBis,o.op_GueltigBis)>=?`,
  [positiveId(optionId), positiveId(positionId), today, today]);
  const row = (result.rows || result)[0];
  if (!row) throw createHttpError(422, 'Diese Option ist nicht mehr gültig oder verfügbar.', { code: 'OPTION_NOT_AVAILABLE' });
  return row;
}

async function loadOptionAvailability(position, excludeOrderId = null, query = null) {
  const execute = query || (async (sql, params) => ({ rows: await runSQLQuerySqlServer(config.sql.database, sql, params) }));
  // All saved temp rows count, including drafts, rework and ERP-accepted rows.
  // Do not add ERP positions again: accepted temp rows already represent them.
  const result = await execute(`SELECT COALESCE(SUM(tbp_amount * CASE WHEN LOWER(tbp_unit) IN(N't',N'to',N'tonne',N'tonnen') THEN 1000 ELSE 1 END),0) AS orderedKg
    FROM ${appTableSql('tempPurchaseOrderPosition')} WHERE OptionPositionID=? AND (? IS NULL OR tbp_tb_id<>?)`,
  [Number(position.opp_id), excludeOrderId, excludeOrderId]);
  return quantityAvailability(position, Number((result.rows || result)[0]?.orderedKg || 0));
}

async function confirmOptionQuantity(optionId,positionId,body,actor) {
  let totalKg=quantityInputKg(body,body?.totalUnit==='truck'?1:null);
  if(body?.quantityConfirmed!==true || !Number.isFinite(totalKg) || totalKg<=0
    || !Number.isSafeInteger(Math.round(totalKg*1000)) || Math.abs(totalKg*1000-Math.round(totalKg*1000))>0.00001)
    throw createHttpError(422,'Bitte die angebotene Gesamtmenge und Einheit (kg oder t) auf Gramm genau eingeben und ausdrücklich bestätigen.',{code:'OPTION_QUANTITY_CONFIRMATION_REQUIRED'});
  return withSqlTransaction(config.sql.database,async({query})=>{
    const source=await loadOptionPosition(optionId,positionId,query,{lock:true});
    let packaging=null;
    if(isTruckOffer(source) || body.totalUnit==='truck') {
      if(!isTruckOffer(source))throw createHttpError(422,'Diese Option enthält keine Truck-Mengenangabe.',{code:'OPTION_TRUCK_UNIT_INVALID'});
      const choices=await loadPurchasePackagingOptions();
      packaging=choices.find(choice=>choice.id===Number(body.packagingTypeId));
      if(!packaging)throw createHttpError(422,'Bitte zuerst die Verpackungsart auswählen.',{code:'OPTION_PACKAGING_REQUIRED'});
      totalKg=quantityInputKg(body,purchaseTruckLoadKg(packaging.text));
      if(!Number.isFinite(totalKg) || totalKg<=0 || !Number.isSafeInteger(Math.round(totalKg*1000)) || Math.abs(totalKg*1000-Math.round(totalKg*1000))>0.00001)
        throw createHttpError(422,'Die Truck-Menge ergibt keine gültige kg-Menge auf Gramm genau.',{code:'OPTION_QUANTITY_CONFIRMATION_REQUIRED'});
    }
    if(!body.quantitySourceHash || source.quantitySourceHash!==body.quantitySourceHash)
      throw createHttpError(422,'Die ursprüngliche Mengenangabe wurde geändert. Bitte die Option erneut laden.',{code:'OPTION_CHANGED'});
    if(offeredQuantityKg({...source,confirmedQuantityKg:null})!=null)
      throw createHttpError(422,'Die Option hat bereits eine belegte Gesamtmenge. Diese kann hier nicht überschrieben werden.',{code:'OPTION_QUANTITY_ALREADY_KNOWN'});
    const truckLimit=offeredTruckCount(source);
    if(packaging && truckLimit!=null && totalKg>Math.round(truckLimit*purchaseTruckLoadKg(packaging.text)*1000)/1000)
      throw createHttpError(422,'Die bestätigte Gesamtmenge überschreitet die angebotene LKW-Anzahl mit dem maximalen Ladegewicht.',{code:'OPTION_QUANTITY_TRUCK_LIMIT'});
    const current=source.confirmedQuantityKg==null?null:Number(source.confirmedQuantityKg);
    if(current!==totalKg && current!==(body.expectedConfirmedKg==null?null:Number(body.expectedConfirmedKg)))
      throw createHttpError(422,'Die Gesamtmenge wurde zwischenzeitlich von jemand anderem bestätigt. Bitte die Option erneut laden.',{code:'OPTION_QUANTITY_CHANGED'});
    if(packaging && (source.confirmedPackagingTypeId??null)!==(body.expectedConfirmedPackagingTypeId??null)
      && Number(source.confirmedPackagingTypeId)!==packaging.id)
      throw createHttpError(422,'Die Verpackungsart wurde zwischenzeitlich bestätigt. Bitte die Option erneut laden.',{code:'OPTION_QUANTITY_CHANGED'});
    const before=await loadOptionAvailability(source,null,query);
    if(totalKg<before.orderedKg)
      throw createHttpError(422,`Es sind bereits ${before.orderedKg.toLocaleString('de-DE')} kg verplant. Die bestätigte Gesamtmenge darf nicht kleiner sein.`,{code:'OPTION_QUANTITY_EXCEEDED'});
    await query(`UPDATE ${appTableSql('optionPositions')} SET opp_GesamtmengeBestaetigtKg=?,opp_MengeBestaetigtQuellHash=?,
      opp_MengeBestaetigtVon=?,opp_MengeBestaetigtAm=SYSUTCDATETIME(),opp_MengeBestaetigtVerpackungsartID=?,opp_MengeBestaetigtTrucks=? WHERE opp_id=? AND opp_op_id=?`,
    [totalKg,source.quantitySourceHash,text(actor).slice(0,100),packaging?.id || null,body.totalUnit==='truck'?Number(body.totalAmount):null,positiveId(positionId),positiveId(optionId)]);
    return {...quantityAvailability({...source,confirmedQuantityKg:totalKg},before.orderedKg),confirmedQuantityKg:totalKg,quantitySourceHash:source.quantitySourceHash,
      confirmedPackagingTypeId:packaging?.id || null,confirmedTruckCount:body.totalUnit==='truck'?Number(body.totalAmount):null};
  });
}

async function supplierCandidates(database, position, { q = '', preferredSupplierId = '' } = {}) {
  const accounts = await runSQLQuerySqlServer(config.sql.database, `SELECT olk_LieferantenNummer AS supplierId,
    olk_Lieferantenkennung AS supplierKey FROM BMSApp.tblOptionenLieferantenKonto WHERE olk_MandantID=? AND olk_Aktiv=1`, [Number(database.firmaId)]);
  const rows = await runSQLQueryAccess(database, `SELECT k.kd_KdNR AS id,k.kd_Name1 AS name,k.kd_Name2 AS name2,
    k.kd_Ort AS city,k.kd_HomePage AS website,k.kd_eMail AS email,
    CASE WHEN EXISTS(SELECT 1 FROM dbo.tblBestellung b WHERE b.be_KdNr=k.kd_KdNR) THEN 1 ELSE 0 END AS hasPurchases
    FROM dbo.tblKunden k WHERE (EXISTS(SELECT 1 FROM dbo.tblKun_Lieferanten l WHERE l.kdLi_Lieferanten_Nr=k.kd_KdNR)
      OR EXISTS(SELECT 1 FROM dbo.tblBestellung b WHERE b.be_KdNr=k.kd_KdNR)
      OR k.kd_KdNR IN(SELECT [value] FROM OPENJSON(?)))
    AND CONCAT(COALESCE(k.kd_Name1,N''),N' ',COALESCE(k.kd_Name2,N'')) NOT LIKE N'%gelöscht%'
    ORDER BY k.kd_Name1,k.kd_KdNR`, [JSON.stringify(accounts.map(a => a.supplierId))]);
  const key = supplierKey(position.supplierName, position.supplierReplyTo || position.supplierKey);
  const search = text(q).toLocaleLowerCase('de-DE');
  return rows.flatMap(row => {
    const mapped = accounts.some(a => text(a.supplierId).toLowerCase() === text(row.id).toLowerCase()
      && (knownSupplier(a.supplierKey)?.key || a.supplierKey) === key);
    const identified = [row.name, row.name2, row.website, row.email].filter(Boolean)
      .some(name => supplierKey(name) === key || companyKey(name) === companyKey(position.supplierName));
    const plausible = key !== 'unknown' && (mapped || identified);
    if (search ? !`${row.id} ${row.name} ${row.name2 || ''} ${row.city || ''}`.toLocaleLowerCase('de-DE').includes(search) : !plausible) return [];
    return [{ id: text(row.id), name: text(row.name), name2: text(row.name2), city: text(row.city), plausible,
      preferred: plausible && text(row.id).toLowerCase() === text(preferredSupplierId).toLowerCase(),
      reason: mapped ? 'Gespeicherte Lieferantenzuordnung' : identified ? 'Lieferantenidentität passt zur Option' : 'Manuelle Lieferantenauswahl' }];
  }).sort((a,b) => Number(b.preferred)-Number(a.preferred) || Number(b.plausible)-Number(a.plausible) || a.name.localeCompare(b.name,'de'));
}

async function purchaseCandidates(database, position, { q = '', page = 1, pageSize = 30 } = {}) {
  const input = { id: Number(position.opp_id), snapshotId: position.opp_AktuellerAbgleichID,
    candidateCount:position.candidateCount,matchVersion:position.matchVersion,matchCalculatedAt:position.matchCalculatedAt,
    mfi: position.mfi,mfiTo: position.mfiTo,mfiTestCondition: position.mfiTestCondition,sourceMeasurementsJson: position.sourceMeasurementsJson };
  if (q || Number(database.firmaId) === Number(position.sourceMandantId)) {
    return candidatesFor(database, input, { q, page, pageSize });
  }
  // Source-mandant article indexes are never accepted as target-mandant proposals.
  // Exact product identities in the active catalog are safe suggestions; further
  // target articles are available through the existing manual search.
  const names = [position.opp_Artikelname_Lieferant, position.opp_Artikelname].map(text).filter(Boolean);
  const rows = await runSQLQueryAccess(database, `${articleSelect()}
    AND (a.agA_Artikelname IN(SELECT [value] FROM OPENJSON(?)) OR a.agA_Artikelname_Lieferant IN(SELECT [value] FROM OPENJSON(?)))
    ORDER BY a.agA_Artikelname,a.agA_Artikelindex OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`,
  [JSON.stringify(names),JSON.stringify(names),(page-1)*pageSize,pageSize]);
  return { data: rows.map(article => ({ ...article, mfiCheck: checkMfi(input, article), reason: 'Passender Produktname im aktiven Mandanten' })), total: rows.length };
}

async function validateOptionArticle(database, position, line) {
  const article = await articleByIndex(database, text(line.articleIndex));
  if (!article) throw createHttpError(422, 'Der ausgewählte Artikel ist nicht aktiv oder nicht vorhanden.', { code: 'OPTION_ARTICLE_NOT_FOUND' });
  const mfi = checkMfi(position, article);
  if (mfi.blocked) throw createHttpError(422, `Artikel passt technisch nicht zur Option: ${mfi.reasons.join('; ')}`, { code: 'ARTICLE_MFI_EXCLUDED' });
  if (!mfi.complete && line.acknowledgeUnverifiedMfi !== true) throw createHttpError(422, 'Bitte die ungeprüfte MFI-Eignung ausdrücklich bestätigen.', { code: 'ARTICLE_MFI_UNVERIFIED' });
  return article;
}

async function assertOptionQuantities(query, positions, excludeOrderId = null,packagingType=null) {
  const grouped = new Map();
  for (const line of positions.filter(p => p.optionId != null)) {
    const id = positiveId(line.optionPositionId);
    const prior = grouped.get(id);
    if (prior && prior.optionId !== line.optionId) throw createHttpError(422, 'Widersprüchliche Optionsreferenzen.');
    if (!Number.isSafeInteger(Math.round(line.amount * 1000)) || Math.abs(line.amount*1000-Math.round(line.amount*1000))>0.00001)
      throw createHttpError(422, 'Optionsmengen müssen auf Gramm genau angegeben werden.');
    grouped.set(id, { optionId: line.optionId, amount: (prior?.amount || 0) + line.amount });
  }
  // Deterministic source locks serialize competing orders across ALL mandants.
  for (const [id, request] of [...grouped].sort(([a],[b]) => a-b)) {
    const source = await loadOptionPosition(request.optionId,id,query,{lock:true});
    if (positions.some(line => line.optionPositionId===id && line.optionSourceChanged
      && line.optionSourceChanged!==source.sourceVersion))
      throw createHttpError(422,'Die Option wurde zwischenzeitlich geändert. Bitte erneut laden.',{code:'OPTION_CHANGED'});
    const available = await loadOptionAvailability(source,excludeOrderId,query);
    if (available.offeredKg == null) throw createHttpError(422, 'Die angebotene Gesamtmenge ist nicht eindeutig in kg belegt. Die Option kann noch nicht bestellt werden.', { code: 'OPTION_QUANTITY_UNCONFIRMED' });
    const trucks=offeredTruckCount(source) || (Number(source.confirmedTruckCount)>0?Number(source.confirmedTruckCount):null);
    const cap=packagingType && trucks!=null?Math.min(available.offeredKg,trucks*purchaseTruckLoadKg(packagingType)):available.offeredKg;
    const remainingKg=Math.max(0,Math.round((cap-available.orderedKg)*1000)/1000);
    if (!fitsQuantity(cap,available.orderedKg,request.amount)) throw createHttpError(422,
      `Optionsmenge überschritten. Noch verfügbar: ${remainingKg.toLocaleString('de-DE')} kg.`,
      { code: 'OPTION_QUANTITY_EXCEEDED', optionPositionId:id,...available,offeredKg:cap,remainingKg });
  }
}

module.exports = { positiveId,loadOptionPosition,loadOptionAvailability,confirmOptionQuantity,supplierCandidates,purchaseCandidates,validateOptionArticle,assertOptionQuantities };
