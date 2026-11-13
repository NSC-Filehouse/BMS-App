const config = require('../config');
const { runSQLQuerySqlServer } = require('../db/access');
const { appTableSql } = require('../db/app-tables');
const { supplierKey } = require('./supplier-identity');
const { normalizePosition } = require('./normalization');
const { optionPriceNeedsReview, optionPriceWarning } = require('./price-plausibility');
const { quantityAvailability,confirmedQuantitySql,offeredTruckCount } = require('./purchase-quantity');
const {purchaseTruckLoadKg,loadPurchasePackagingOptions}=require('../db/purchase-order-values');
const {createPackagingDisplay}=require('./packaging-display');
function berlinDate() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function dateOnly(value) { return value instanceof Date ? value.toISOString().slice(0, 10) : value ? String(value).slice(0, 10) : null; }
const numeric = value => value == null ? null : Number(value);
function mapPosition(row,today) {
  const position = {...row};
  for (const key of ['quantityMin', 'quantityMax', 'price', 'mfi', 'density', 'quantityMinKg', 'quantityMaxKg', 'pricePerTonne', 'c2',
    'minimumOrderKg','stockKg','truckMin','truckMax','bagWeightKg','palletWeightKg','mfiTo','confirmedQuantityKg']) position[key] = numeric(position[key]);
  position.normalization = row.normalizationJson ? JSON.parse(row.normalizationJson) : null;
  delete position.normalizationJson;
  position.assignmentMfiCheck = row.assignedMfiCheckJson ? JSON.parse(row.assignedMfiCheckJson) : null;
  delete position.assignedMfiCheckJson;
  position.priceNeedsReview = (position.normalization ? position.normalization.priceNeedsReview : normalizePosition(position).priceNeedsReview)
    || optionPriceNeedsReview(position.pricePerTonne);
  if (position.priceNeedsReview) {
    position.pricePerTonne = null;
    position.priceWarning = optionPriceWarning();
  }
  position.id = Number(row.id);
  position.validUntil = dateOnly(row.validUntil);
  position.expired = Boolean(position.validUntil && position.validUntil < today);
  position.matchCalculatedAt = row.matchCalculatedAt instanceof Date ? row.matchCalculatedAt.toISOString() : row.matchCalculatedAt;
  position.snapshotId = row.snapshotId == null ? null : String(row.snapshotId);
  position.candidateCount = Number(row.candidateCount || 0);
  position.matchStatus = row.matchStatus || 'unmatched';
  const normalizedTruckLoad=Number(position.normalization?.maxTruckLoadKg);
  const packaging=String(position.positionPackaging || position.normalization?.packaging || '').trim();
  const truckLoadKg=[24750,25000].includes(normalizedTruckLoad)?normalizedTruckLoad:
    Number(position.packagingTypeId)>0 && packaging?purchaseTruckLoadKg(packaging):packaging?null:25000;
  position.truckLoadKg=offeredTruckCount(position)!=null?truckLoadKg:null;
  // The list/detail quantity describes the recognized packaging. Purchase
  // allocation still checks the packaging explicitly selected for that order.
  Object.assign(position,quantityAvailability(position,Number(row.orderedKg || 0),truckLoadKg));
  return position;
}
async function loadOffers(companyIds = [], { optionId = null } = {}) {
  if (companyIds && !companyIds.length) return [];
  // null selects the shared pool; arrays retain explicit source filtering.
  const today = berlinDate();
  const scope = companyIds ? `o.op_MandantID IN (${companyIds.map(() => '?').join(',')})` : '1=1';
  const scopeParams = companyIds || [];
  const heads = await runSQLQuerySqlServer(config.sql.database, `SELECT o.op_id AS id, o.op_MandantID AS sourceMandantId,
    o.op_Lieferantenname AS supplierName, o.op_Lieferantenkennung AS supplierKey, o.op_Antwortadresse AS supplierReplyTo, o.op_Angebotsnummer AS externalOfferNo,
    o.op_GueltigBis AS validUntil, o.op_QuellGueltigBis AS sourceValidUntil, o.op_IstDemo AS isDemo,
    o.op_Incoterm AS incoterm, o.op_Ladeort AS loadingLocation, o.op_Verpackung AS packagingText,
    o.op_Konditionen AS termsText, o.op_Kommentar AS comment, o.op_Nachverhandelbar AS negotiable,
    o.op_NachverhandelbarQuelle AS negotiableEvidence,
    CASE WHEN DATALENGTH(o.op_QuelleMailtext)>0 THEN 1 ELSE 0 END AS hasSourceMail,
    CASE WHEN DATALENGTH(o.op_QuelleDatei)>0 THEN 1 ELSE 0 END AS hasSourceFile,
    o.op_QuelleDateiname AS sourceFileName,o.op_QuelleDateiMime AS sourceFileMime
    FROM ${appTableSql('options')} o WHERE ${scope}
      AND o.op_Pruefstatus IN (N'approved',N'pending') AND o.op_Geschaeftsstatus=N'open'
      AND o.op_GeloeschtAm IS NULL AND o.op_IstDemo=0 AND o.op_GueltigAb<=? ${optionId == null ? '' : 'AND o.op_id=?'}
    ORDER BY o.op_GueltigBis,o.op_id DESC`, [...scopeParams, today, ...(optionId == null ? [] : [optionId])]);
  if (!heads.length) return [];
  // Scope positions through their header, without a potentially >2100-ID IN list.
  const positions = await runSQLQuerySqlServer(config.sql.database, `SELECT p.opp_id AS id,p.opp_op_id AS optionId,
    p.opp_Artikelname_Lieferant AS articleName,p.opp_Artikelnummer_Lieferant AS supplierArticleNo,p.opp_Artikelname AS internalArticleName,
    p.opp_Kunststofftyp AS materialCategory,p.opp_Zustand AS quality,p.opp_ZustandNorm AS qualityNorm,p.opp_Charge AS batchNo,
    p.opp_MengeVon AS quantityMin,p.opp_MengeBis AS quantityMax,p.opp_Mengeneinheit AS quantityUnit,p.opp_MengeRohtext AS quantityText,
    p.opp_PreisRoh AS price,p.opp_PreiseinheitRoh AS priceUnit,p.opp_Waehrung AS currency,p.opp_PreisProTonne AS pricePerTonne,
    p.opp_MengeVonKg AS quantityMinKg,p.opp_MengeBisKg AS quantityMaxKg,
    CASE WHEN r.oab_MesswerteVorbereitet=1 THEN r.oab_MFI ELSE p.opp_MFI END AS mfi,
    CASE WHEN r.oab_MesswerteVorbereitet=1 THEN r.oab_MFI_bis ELSE p.opp_MFI_bis END AS mfiTo,
    CASE WHEN r.oab_MesswerteVorbereitet=1 THEN r.oab_MFI_Pruefmethode ELSE p.opp_MFI_Pruefmethode END AS mfiTestCondition,
    r.oab_Messwertquelle AS measurementSource,
    p.opp_NormalisierungJson AS normalizationJson,p.opp_MindestabnahmeKg AS minimumOrderKg,p.opp_ChargenbestandKg AS stockKg,
    p.opp_LKWAnzahlVon AS truckMin,p.opp_LKWAnzahlBis AS truckMax,p.opp_Mengenart AS quantityKind,
    p.opp_Verpackung AS positionPackaging,p.opp_Verpackungsart_id AS packagingTypeId,
    p.opp_GebindegewichtKg AS bagWeightKg,p.opp_PalettengewichtKg AS palletWeightKg,
    JSON_QUERY(r.oab_MerkmaleJson,'$.assignedMfiCheck') AS assignedMfiCheckJson,
    CASE WHEN r.oab_MesswerteVorbereitet=1 THEN r.oab_Dichte ELSE p.opp_Dichte END AS density,
    CASE WHEN r.oab_MesswerteVorbereitet=1 THEN r.oab_DichteEinheit ELSE p.opp_DichteEinheit END AS densityUnit,
    p.opp_C2 AS c2,p.opp_Eigenschaften AS propertiesText,
    p.opp_Ladehinweis AS loadingText,p.opp_Kommentar AS comment,p.opp_Artikelindex AS articleIndex,
    r.oab_ArtikelindexVorschlag AS suggestedArticleIndex,r.oab_ArtikelnameVorschlag AS suggestedArticleName,
    p.opp_MatchStatus AS matchStatus,CASE WHEN p.opp_Artikelindex IS NOT NULL THEN p.opp_MatchGrund ELSE r.oab_VorschlagGrund END AS matchReason,
    r.oab_id AS snapshotId,r.oab_KandidatenAnzahl AS candidateCount,r.oab_BerechnetAm AS matchCalculatedAt,
    r.oab_AlgorithmusVersion AS matchVersion,r.oab_KategorieQuelle AS categorySource,
    COALESCE(p.opp_BestaetigtKunststoff,r.oab_Kunststoff,N'Optionen') AS plastic,
    COALESCE(p.opp_BestaetigtUntergruppe,r.oab_KunststoffUntergruppe,N'Zuordnung offen') AS plasticSubCategory,
    CASE WHEN j.oaa_Status=N'error' OR j.oaa_GesperrtBis<SYSUTCDATETIME()
      OR COALESCE(j.oaa_LetzterErfolgAm,j.oaa_GeaendertAm)<DATEADD(MINUTE,-5,SYSUTCDATETIME()) THEN N'stale'
      WHEN r.oab_id IS NULL THEN N'pending'
      WHEN r.oab_QuelldatenGeaendertAm<>p.opp_GeaendertAm OR j.oaa_Revision>r.oab_AnforderungRevision THEN N'updating' ELSE N'ready' END AS matchProcessingStatus,
    p.opp_LernenAngefordert AS learningPending,p.opp_LernregelHinweis AS learningNotice,
    COALESCE(p.opp_GueltigBis,o.op_GueltigBis) AS validUntil,${confirmedQuantitySql()} AS confirmedQuantityKg,
    (SELECT COALESCE(SUM(bp.tbp_amount * CASE WHEN LOWER(bp.tbp_unit) IN(N't',N'to',N'tonne',N'tonnen') THEN 1000 ELSE 1 END),0)
      FROM ${appTableSql('tempPurchaseOrderPosition')} bp WHERE bp.OptionPositionID=p.opp_id) AS orderedKg
    FROM ${appTableSql('optionPositions')} p JOIN ${appTableSql('options')} o ON o.op_id=p.opp_op_id
    LEFT JOIN BMSApp.tblOptionenAbgleich r ON r.oab_id=p.opp_AktuellerAbgleichID AND r.oab_opp_id=p.opp_id AND r.oab_MandantID=o.op_MandantID
    LEFT JOIN BMSApp.tblOptionenAbgleichAuftrag j ON j.oaa_MandantID=o.op_MandantID
    WHERE ${scope} AND o.op_Pruefstatus IN (N'approved',N'pending') AND o.op_Geschaeftsstatus=N'open'
      AND o.op_GeloeschtAm IS NULL AND o.op_IstDemo=0 AND o.op_GueltigAb<=? ${optionId == null ? '' : 'AND o.op_id=?'}
      AND COALESCE(p.opp_GueltigBis,o.op_GueltigBis)>=?
    ORDER BY p.opp_op_id,p.opp_Positionsnummer`, [...scopeParams, today, ...(optionId == null ? [] : [optionId]), today]);
  const packagingDisplay = createPackagingDisplay(await loadPurchasePackagingOptions());
  const byId = new Map(heads.map(row => [Number(row.id), { ...row, id: Number(row.id), sourceMandantId: Number(row.sourceMandantId),
    packagingDisplay: packagingDisplay(row.packagingText),
    supplierKey: supplierKey(row.supplierName, row.supplierReplyTo || row.supplierKey),
    isDemo: Boolean(row.isDemo), validUntil: dateOnly(row.validUntil), sourceValidUntil: dateOnly(row.sourceValidUntil), positions: [] }]));
  positions.forEach(row => byId.get(Number(row.optionId))?.positions.push({ ...mapPosition(row,today), packagingDisplay: packagingDisplay(row.positionPackaging) }));
  return [...byId.values()].filter(offer => offer.positions.length);
}
module.exports = { loadOffers, berlinDate, dateOnly };
