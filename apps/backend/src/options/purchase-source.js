const config = require('../config');
const { runSQLQueryAccess, runSQLQuerySqlServer,withSqlTransaction } = require('../db/access');
const { appTableSql } = require('../db/app-tables');
const { excludeTestMandantSql } = require('../executive-access');
const { createHttpError } = require('../utils');
const { berlinDate } = require('./read');
const { optionDeliveryDataSql } = require('./delivery-data');
const { supplierKey, companyKey, knownSupplier } = require('./supplier-identity');
const { articleByIndex, candidatesFor } = require('./matching-service');
const { articleSelect } = require('./article-catalog');
const { checkMfi } = require('./mfi-compatibility');
const { checkMaterial, deriveMaterialFacts, quality } = require('./material-facts');
const { quantityAvailability, fitsQuantity,offeredQuantityKg,quantitySourceHashSql,confirmedQuantitySql,orderedOptionKgSql,optionAvailableForPurchaseSql,quantityInputKg,isTruckOffer,offeredTruckCount } = require('./purchase-quantity');
const {loadPurchasePackagingOptions,purchaseTruckLoadKg}=require('../db/purchase-order-values');

const text = value => String(value ?? '').trim();
function positiveId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw createHttpError(400, 'Ungültige Optionsreferenz.', { code: 'OPTION_REFERENCE_INVALID' });
  return id;
}

async function loadOptionPosition(optionId, positionId, query = null, { lock = false, identity } = {}) {
  const execute = query || (async (sql, params) => ({ rows: await runSQLQuerySqlServer(config.sql.database, sql, params) }));
  const today = berlinDate();
  const delivery = optionDeliveryDataSql();
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
    o.op_MandantID AS sourceMandantId,o.op_LieferantID AS sourceSupplierId,o.op_Lieferantenname AS supplierName,
    o.op_Lieferantenkennung AS supplierKey,o.op_Antwortadresse AS supplierReplyTo,o.op_AnbieterKontaktJson AS sourceContactsJson,
    ${delivery.loadingLocation} AS loadingLocation,${delivery.incoterm} AS incoterm,o.op_Verpackung AS packagingText,o.op_Angebotsnummer AS externalOfferNo,
    o.op_Konditionen AS termsText,p.opp_Ladehinweis AS loadingText,p.opp_Charge AS batchNo,
    p.opp_PreisRoh AS rawPrice,p.opp_PreiseinheitRoh AS rawPriceUnit,p.opp_Waehrung AS rawCurrency,
    p.opp_MFI AS mfi,p.opp_MFI_bis AS mfiTo,p.opp_MFI_Pruefmethode AS mfiTestCondition,
    p.opp_Artikelname_Lieferant AS articleName,p.opp_Kunststofftyp AS materialCategory,p.opp_Zustand AS quality,
    p.opp_ZustandNorm AS qualityNorm,p.opp_Eigenschaften AS propertiesText,p.opp_Dichte AS density,p.opp_DichteEinheit AS densityUnit,
    COALESCE(p.opp_GueltigBis,o.op_GueltigBis) AS validUntil,
    r.oab_KandidatenAnzahl AS candidateCount,r.oab_AlgorithmusVersion AS matchVersion,r.oab_BerechnetAm AS matchCalculatedAt,
    p.opp_QuellaufbereitungJson AS sourceMeasurementsJson
    FROM ${appTableSql('optionPositions')} p ${lock ? 'WITH(UPDLOCK,HOLDLOCK)' : ''}
    JOIN ${appTableSql('options')} o ${lock ? 'WITH(HOLDLOCK)' : ''} ON o.op_id=p.opp_op_id
    LEFT JOIN BMSApp.tblOptionenAbgleich r ON r.oab_id=p.opp_AktuellerAbgleichID AND r.oab_opp_id=p.opp_id AND r.oab_MandantID=o.op_MandantID
    WHERE o.op_id=? AND p.opp_id=? AND p.opp_GeloeschtAm IS NULL AND o.op_IstDemo=0 AND o.op_GeloeschtAm IS NULL
      AND o.op_Pruefstatus IN(N'approved',N'pending') AND o.op_Geschaeftsstatus=N'open'
      AND o.op_GueltigAb<=? AND COALESCE(p.opp_GueltigBis,o.op_GueltigBis)>=?
      AND ${optionAvailableForPurchaseSql('o', { lock })}
      ${excludeTestMandantSql(identity, 'o.op_MandantID')}`,
  [positiveId(optionId), positiveId(positionId), today, today]);
  const row = (result.rows || result)[0];
  if (!row) throw createHttpError(422, 'Diese Option ist nicht mehr gültig oder verfügbar.', { code: 'OPTION_NOT_AVAILABLE' });
  return row;
}

async function loadOptionAvailability(position, excludeOrderId = null, query = null) {
  const execute = query || (async (sql, params) => ({ rows: await runSQLQuerySqlServer(config.sql.database, sql, params) }));
  // Do not add ERP positions again: accepted temp rows already represent them.
  const params = [Number(position.opp_id)];
  if (excludeOrderId != null) params.push(excludeOrderId);
  const result = await execute(orderedOptionKgSql('?', { excludeOrder: excludeOrderId != null }), params);
  return quantityAvailability(position, Number((result.rows || result)[0]?.orderedKg || 0));
}

async function confirmOptionQuantity(optionId,positionId,body,actor,identity) {
  let totalKg=quantityInputKg(body,body?.totalUnit==='truck'?1:null);
  if(body?.quantityConfirmed!==true || !Number.isFinite(totalKg) || totalKg<=0
    || !Number.isSafeInteger(Math.round(totalKg*1000)) || Math.abs(totalKg*1000-Math.round(totalKg*1000))>0.00001)
    throw createHttpError(422,'Bitte die angebotene Gesamtmenge und Einheit (kg oder t) auf Gramm genau eingeben und ausdrücklich bestätigen.',{code:'OPTION_QUANTITY_CONFIRMATION_REQUIRED'});
  return withSqlTransaction(config.sql.database,async({query})=>{
    const source=await loadOptionPosition(optionId,positionId,query,{lock:true,identity});
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
  const suppliers=rows.map(row => {
    const mapped = accounts.some(a => text(a.supplierId).toLowerCase() === text(row.id).toLowerCase()
      && (knownSupplier(a.supplierKey)?.key || a.supplierKey) === key);
    const identified = [row.name, row.name2, row.website, row.email].filter(Boolean)
      .some(name => supplierKey(name) === key || companyKey(name) === companyKey(position.supplierName));
    const plausible = key !== 'unknown' && (mapped || identified);
    return { id: text(row.id), name: text(row.name), name2: text(row.name2), city: text(row.city), plausible,mapped,
      preferred: plausible && text(row.id).toLowerCase() === text(preferredSupplierId).toLowerCase(),
      reason: mapped ? 'Gespeicherte Lieferantenzuordnung' : identified ? 'Lieferantenidentität passt zur Option' : 'Manuelle Lieferantenauswahl' };
  });
  const hasPlausibleSupplier = suppliers.some(row => row.plausible);
  const candidates = suppliers.filter(row => search
    ? `${row.id} ${row.name} ${row.name2} ${row.city}`.toLocaleLowerCase('de-DE').includes(search)
    : row.plausible
  ).sort((a,b) => Number(b.preferred)-Number(a.preferred) || Number(b.plausible)-Number(a.plausible) || a.name.localeCompare(b.name,'de'));
  const same=(a,b)=>text(a).toLowerCase()===text(b).toLowerCase();
  const source=candidates.find(row=>row.plausible && Number(database.firmaId)===Number(position.sourceMandantId) && same(row.id,position.sourceSupplierId));
  const mapped=candidates.filter(row=>row.plausible && row.mapped);
  const exact=candidates.filter(row=>row.plausible && companyKey(row.name)===companyKey(position.supplierName));
  const selected=source || (mapped.length===1?mapped[0]:null) || (exact.length===1?exact[0]:null);
  return candidates.map(row=>({...row,preferred:selected?same(row.id,selected.id):row.preferred,
    selectable: row.plausible || !hasPlausibleSupplier}));
}

async function exactNameCandidates(database, position, names, { page = 1, pageSize = 30, all = false } = {}) {
  const namesJson = JSON.stringify(names);
  const rows = await runSQLQueryAccess(database, `${articleSelect()}
    AND (a.agA_Artikelname IN(SELECT [value] FROM OPENJSON(?)) OR a.agA_Artikelname_Lieferant IN(SELECT [value] FROM OPENJSON(?)))
    ORDER BY a.agA_Artikelname,a.agA_Artikelindex${all ? '' : ' OFFSET ? ROWS FETCH NEXT ? ROWS ONLY'}`,
  [namesJson, namesJson, ...(all ? [] : [(page - 1) * pageSize, pageSize])]);
  return rows.map(article => ({
    ...article,
    mfiCheck: checkMfi(position, article),
    materialCheck: checkMaterial(position, article),
    reason: 'Passender Produktname im aktiven Mandanten',
  })).filter(article => !article.materialCheck.blocked);
}

function hasNtLabel(value) {
  const label = text(value).replace(/[\u2010-\u2015]/g, '-');
  return quality(label, 'NT') === 'NT' || /\boff[\s-]*label\b/i.test(label);
}

async function purchaseCandidates(database, position, { q = '', page = 1, pageSize = 30,all=false } = {}) {
  const input = { ...position,id: Number(position.opp_id), snapshotId: position.opp_AktuellerAbgleichID,
    candidateCount:position.candidateCount,matchVersion:position.matchVersion,matchCalculatedAt:position.matchCalculatedAt,
    mfi: position.mfi,mfiTo: position.mfiTo,mfiTestCondition: position.mfiTestCondition,sourceMeasurementsJson: position.sourceMeasurementsJson };
  const options = { q, page, pageSize, all };
  if (q) return candidatesFor(database, input, options);

  const sourceMandant = Number(database.firmaId) === Number(position.sourceMandantId);
  let result;
  if (sourceMandant) {
    result = await candidatesFor(database, input, options);
  } else {
    // Only propose article IDs from the active mandant's catalog.
    const names = [position.opp_Artikelname_Lieferant, position.opp_Artikelname].map(text).filter(Boolean);
    const data = await exactNameCandidates(database, input, names, options);
    result = { data, total: data.length };
  }

  const optionLabels = [position.articleName, position.quality, position.qualityNorm, position.propertiesText];
  if (optionLabels.some(hasNtLabel) || deriveMaterialFacts(input).quality.value === 'NT') return result;

  const data = result.data.filter(article =>
    ![article.articleName, article.supplierArticleName, article.description, article.groupName].some(hasNtLabel));
  return { ...result, data, total: all || !sourceMandant ? data.length : result.total };
}

async function validateOptionArticle(database, position, line) {
  const article = await articleByIndex(database, text(line.articleIndex));
  if (!article) throw createHttpError(422, 'Der ausgewählte Artikel ist nicht aktiv oder nicht vorhanden.', { code: 'OPTION_ARTICLE_NOT_FOUND' });
  const mfi = checkMfi(position, article);
  const material=checkMaterial(position,article);
  if(material.blocked)throw createHttpError(422,`Artikel passt nicht zur Option: ${material.reasons.join('; ')}`,{code:'ARTICLE_MATERIAL_EXCLUDED'});
  if (mfi.blocked) throw createHttpError(422, `Artikel passt technisch nicht zur Option: ${mfi.reasons.join('; ')}`, { code: 'ARTICLE_MFI_EXCLUDED' });
  return article;
}

async function validateOptionSupplier(database,position,supplierId) {
  const candidates=await supplierCandidates(database,position,{q:text(supplierId)});
  const match=candidates.find(row=>text(row.id).toLowerCase()===text(supplierId).toLowerCase() && row.selectable);
  if(!match)throw createHttpError(422,'Der Lieferant gehört nicht zum Anbieter dieser Option.',{code:'OPTION_SUPPLIER_MISMATCH'});
  return match;
}

async function assertOptionQuantities(query, positions, excludeOrderId = null,packagingType=null,identity) {
  const grouped = new Map();
  const sources = new Map();
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
    const source = await loadOptionPosition(request.optionId,id,query,{lock:true,identity});
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
    sources.set(id, source);
  }
  return sources;
}

module.exports = { positiveId,loadOptionPosition,loadOptionAvailability,confirmOptionQuantity,supplierCandidates,purchaseCandidates,exactNameCandidates,validateOptionArticle,validateOptionSupplier,assertOptionQuantities };
