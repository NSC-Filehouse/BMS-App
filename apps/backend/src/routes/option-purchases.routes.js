const express = require('express');
const { asyncHandler, createHttpError, sendEnvelope } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { requirePilotFeature } = require('../middlewares/pilot-feature.middleware');
const { loadOptionPosition, loadOptionAvailability, confirmOptionQuantity,supplierCandidates, purchaseCandidates, validateOptionArticle } = require('../options/purchase-source');
const { loadPurchaseOptions, loadSupplierTerms,loadPurchasePackagingOptions,purchaseTruckLoadKg } = require('../db/purchase-order-values');
const { optionPriceNeedsReview } = require('../options/price-plausibility');
const {offeredQuantityKg,quantityAvailability,isTruckOffer,offeredTruckCount}=require('../options/purchase-quantity');
const router = express.Router();
const guard = [requireMandant, requirePilotFeature('options'), requirePilotFeature('purchaseOrders')];
const base = '/options/:id/positions/:positionId/purchase';

router.get(`${base}/suppliers`, ...guard, asyncHandler(async (req,res) => {
  const source = await loadOptionPosition(req.params.id,req.params.positionId);
  const data = await supplierCandidates(req.database,source,{q:String(req.query.q || '').trim().slice(0,150),preferredSupplierId:req.query.supplierId});
  const availability = await loadOptionAvailability(source);
  const packagingTypes=await loadPurchasePackagingOptions(req.header('x-lang')==='en'?'en':'de');
  sendEnvelope(res,{data,meta:{...availability,supplierName:source.supplierName,
    confirmedQuantityKg:source.confirmedQuantityKg,quantitySourceHash:source.quantitySourceHash,
    confirmedPackagingTypeId:source.confirmedPackagingTypeId,confirmedTruckCount:source.confirmedTruckCount,
    truckOffer:isTruckOffer(source),offeredTrucks:offeredTruckCount(source),packagingTypes,
    sourcePackaging:source.opp_Verpackung || source.packagingText || '',
    sourcePackagingTypeId:source.opp_Verpackungsart_id,sourcePackagingSource:source.packagingSource,sourcePackagingEvidence:source.packagingEvidence,
    quantityConfirmationEditable:offeredQuantityKg({...source,confirmedQuantityKg:null})==null,
    quantityText:source.quantityText,truckMin:source.truckMin,truckMax:source.truckMax,maxTruckLoadKg:source.maxTruckLoadKg}});
}));
router.post(`${base}/quantity`, ...guard, asyncHandler(async(req,res)=>{
  const data=await confirmOptionQuantity(req.params.id,req.params.positionId,req.body,req.userIdentity?.shortCode || req.userEmail || 'APP');
  sendEnvelope(res,{data});
}));
router.get(`${base}/articles`, ...guard, asyncHandler(async (req,res) => {
  const source = await loadOptionPosition(req.params.id,req.params.positionId);
  const result = await purchaseCandidates(req.database,source,{q:String(req.query.q || '').trim().slice(0,150),page:Math.max(1,Math.min(10000,parseInt(req.query.page,10)||1))});
  const {data,...meta} = result;
  sendEnvelope(res,{data,meta});
}));
router.post(`${base}/selection`, ...guard, asyncHandler(async (req,res) => {
  if (req.body?.supplierConfirmed !== true || req.body?.articleConfirmed !== true)
    throw createHttpError(422,'Bitte Lieferant und Artikel ausdrücklich bestätigen.',{code:'OPTION_SELECTION_REQUIRED'});
  const source = await loadOptionPosition(req.params.id,req.params.positionId);
  // A manually changed supplier must still be a real, selectable ERP supplier.
  const suppliers = await supplierCandidates(req.database,source,{q:String(req.body.supplierId || '')});
  const supplier = suppliers.find(row => row.id.toLowerCase()===String(req.body.supplierId || '').trim().toLowerCase());
  if (!supplier) throw createHttpError(422,'Der ausgewählte Lieferant ist nicht verfügbar.',{code:'SUPPLIER_NOT_FOUND'});
  const article = await validateOptionArticle(req.database,source,req.body);
  let availability = await loadOptionAvailability(source);
  if (availability.remainingKg == null) throw createHttpError(422,'Die angebotene Gesamtmenge ist nicht eindeutig in kg belegt.',{code:'OPTION_QUANTITY_UNCONFIRMED'});
  if (availability.remainingKg<=0) throw createHttpError(422,'Diese Optionsposition ist bereits vollständig verplant.',{code:'OPTION_QUANTITY_EXCEEDED'});
  const lang = req.header('x-lang')==='en'?'en':'de';
  const [choices,terms] = await Promise.all([loadPurchaseOptions(req.database,lang),loadSupplierTerms(req.database,supplier.id,lang)]);
  const chosenPackaging=(choices.packagingTypes || []).find(row=>row.id===Number(req.body.packagingTypeId));
  if(isTruckOffer(source) && !chosenPackaging)
    throw createHttpError(422,'Bitte zuerst die Verpackungsart auswählen.',{code:'OPTION_PACKAGING_REQUIRED'});
  if(isTruckOffer(source) && offeredTruckCount(source)==null && source.confirmedPackagingTypeId!=null && Number(source.confirmedPackagingTypeId)!==chosenPackaging.id)
    throw createHttpError(422,'Bitte die Gesamtmenge für die gewählte Verpackungsart erneut bestätigen.',{code:'OPTION_PACKAGING_CHANGED'});
  if(isTruckOffer(source) && offeredTruckCount(source)!=null) {
    availability=quantityAvailability(source,availability.orderedKg,purchaseTruckLoadKg(chosenPackaging.text));
    if(availability.remainingKg<=0)throw createHttpError(422,'Diese Optionsposition ist für die gewählte Verpackung bereits vollständig verplant.',{code:'OPTION_QUANTITY_EXCEEDED'});
  }
  const deliveryTerm = choices.incoterms.find(row => row.text.trim().toLowerCase()===String(source.incoterm || '').trim().toLowerCase());
  const price = source.opp_PreisProTonne;
  sendEnvelope(res,{data:{
    header:{deliveryTermId:deliveryTerm?.id || '',deliveryTermText:deliveryTerm?.text || '',
      loadingLocationText:source.loadingLocation || '',loadingLocationSource:source.loadingLocation?'manual':'',
      packagingType:chosenPackaging?.text || source.opp_Verpackung || source.packagingText || '',packagingTypeId:chosenPackaging?.id || source.opp_Verpackungsart_id || '',
      supplierContact:terms.supplierContact},
    position:{optionId:Number(source.opp_op_id),optionPositionId:Number(source.opp_id),
      supplierId:supplier.id,supplierName:supplier.name,articleIndex:article.articleIndex,
      article:source.opp_Artikelname_Lieferant || article.supplierArticleName || article.articleName,masterArticleName:article.articleName,
      amount:Math.min(availability.remainingKg,isTruckOffer(source)?purchaseTruckLoadKg(chosenPackaging.text):Number(source.opp_MengeVonKg)||availability.remainingKg),
      optionPackagingTypeId:isTruckOffer(source)?chosenPackaging.id:null,
      purchasePrice:price==null || optionPriceNeedsReview(price)?'':Number(price),
      originalPackagingType:source.opp_Verpackung || source.packagingText || '',originalPackagingTypeId:source.opp_Verpackungsart_id,
      optionValidUntil:source.validUntil,remainingKg:availability.remainingKg,offeredKg:availability.offeredKg,
      supplierConfirmed:true,articleConfirmed:true,acknowledgeUnverifiedMfi:req.body.acknowledgeUnverifiedMfi===true,
      unit:'kg',currency:'EUR',requestedDeliveryDate:'',reservedFor:'',comment:''},
  }});
}));
module.exports = router;
