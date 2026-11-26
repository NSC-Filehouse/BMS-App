const express = require('express');
const { asyncHandler, createHttpError, sendEnvelope } = require('../utils');
const { findIncotermByCode } = require('../incoterm');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { requirePilotFeature } = require('../middlewares/pilot-feature.middleware');
const { loadOptionPosition, loadOptionAvailability, confirmOptionQuantity,supplierCandidates, purchaseCandidates, validateOptionArticle, validateOptionSupplier } = require('../options/purchase-source');
const { loadPurchaseOptions, loadSupplierTerms,loadPurchasePackagingOptions,purchaseTruckLoadKg } = require('../db/purchase-order-values');
const { optionPriceNeedsReview } = require('../options/price-plausibility');
const { createPackagingDisplay } = require('../options/packaging-display');
const {offeredQuantityKg,quantityAvailability,isTruckOffer,offeredTruckCount}=require('../options/purchase-quantity');
const {resolveSupplierContact}=require('../options/supplier-contacts');
const { confirmArticleNameRule, revokeArticleNameConfirmation } = require('../options/article-name-rules');
const router = express.Router();
const guard = [requireMandant, requirePilotFeature('options'), requirePilotFeature('purchaseOrders')];
const base = '/options/:id/positions/:positionId/purchase';
router.get(`${base}/contacts`,...guard,asyncHandler(async(req,res)=>{
 const source=await loadOptionPosition(req.params.id,req.params.positionId,null,{identity:req.userIdentity});
 const supplier=await validateOptionSupplier(req.database,source,req.query.supplierId);
 const terms=await loadSupplierTerms(req.database,supplier.id,req.header('x-lang')==='en'?'en':'de');
 const contacts=terms.contacts || [];
 sendEnvelope(res,{data:contacts,meta:resolveSupplierContact(source.sourceContactsJson,contacts)});
}));

router.get(`${base}/suppliers`, ...guard, asyncHandler(async (req,res) => {
  const source = await loadOptionPosition(req.params.id,req.params.positionId,null,{identity:req.userIdentity});
  const data = await supplierCandidates(req.database,source,{q:String(req.query.q || '').trim().slice(0,150),preferredSupplierId:req.query.supplierId});
  const availability = await loadOptionAvailability(source);
  const packagingTypes=await loadPurchasePackagingOptions(req.header('x-lang')==='en'?'en':'de');
  sendEnvelope(res,{data,meta:{...availability,supplierName:source.supplierName,
    sourceIncoterm:source.incoterm,sourceLoadingLocation:source.loadingLocation,sourceArticleName:source.opp_Artikelname_Lieferant,
    confirmedQuantityKg:source.confirmedQuantityKg,quantitySourceHash:source.quantitySourceHash,
    confirmedPackagingTypeId:source.confirmedPackagingTypeId,confirmedTruckCount:source.confirmedTruckCount,
    truckOffer:isTruckOffer(source),offeredTrucks:offeredTruckCount(source),packagingTypes,
    sourcePackaging:source.opp_Verpackung || source.packagingText || '',
    sourcePackagingDisplay:createPackagingDisplay(packagingTypes)(source.opp_Verpackung || source.packagingText || ''),
    sourcePackagingTypeId:source.opp_Verpackungsart_id,sourcePackagingSource:source.packagingSource,sourcePackagingEvidence:source.packagingEvidence,
    quantityConfirmationEditable:offeredQuantityKg({...source,confirmedQuantityKg:null})==null,
    quantityText:source.quantityText,truckMin:source.truckMin,truckMax:source.truckMax,maxTruckLoadKg:source.maxTruckLoadKg}});
}));
router.post(`${base}/quantity`, ...guard, asyncHandler(async(req,res)=>{
  const data=await confirmOptionQuantity(req.params.id,req.params.positionId,req.body,req.userIdentity?.shortCode || req.userEmail || 'APP',req.userIdentity);
  sendEnvelope(res,{data});
}));
router.get(`${base}/articles`, ...guard, asyncHandler(async (req,res) => {
  const source = await loadOptionPosition(req.params.id,req.params.positionId,null,{identity:req.userIdentity});
  const result = await purchaseCandidates(req.database,source,{q:String(req.query.q || '').trim().slice(0,150),all:true});
  const {data,...meta} = result;
  sendEnvelope(res,{data,meta});
}));
router.post(`${base}/article-confirmation`, ...guard, asyncHandler(async (req, res) => {
  const { articleIndex, optionArticleName, confirmed } = req.body || {};
  if (typeof confirmed !== 'boolean' || typeof articleIndex !== 'string' || !articleIndex.trim() || articleIndex.length > 50
    || typeof optionArticleName !== 'string' || !optionArticleName.trim() || optionArticleName.length > 500) {
    throw createHttpError(422, 'Bitte die Artikelzuordnung ausdrücklich bestätigen.', { code: 'OPTION_ARTICLE_CONFIRMATION_REQUIRED' });
  }
  const actor = String(req.userIdentity?.shortCode || req.userEmail || 'APP').slice(0, 100);
  const changeRule = confirmed ? confirmArticleNameRule : revokeArticleNameConfirmation;
  const data = await changeRule(req.database, req.params.id, req.params.positionId, { articleIndex, optionArticleName }, req.userIdentity, actor);
  sendEnvelope(res, { data });
}));
router.post(`${base}/selection`, ...guard, asyncHandler(async (req,res) => {
  if (req.body?.supplierConfirmed !== true || req.body?.articleConfirmed !== true)
    throw createHttpError(422,'Bitte Lieferant und Artikel ausdrücklich bestätigen.',{code:'OPTION_SELECTION_REQUIRED'});
  const source = await loadOptionPosition(req.params.id,req.params.positionId,null,{identity:req.userIdentity});
  // A manually changed supplier must still be a real, selectable ERP supplier.
  const supplier=await validateOptionSupplier(req.database,source,req.body.supplierId);
  const article = await validateOptionArticle(req.database,source,req.body);
  let availability = await loadOptionAvailability(source);
  if (availability.remainingKg == null) throw createHttpError(422,'Die angebotene Gesamtmenge ist nicht eindeutig in kg belegt.',{code:'OPTION_QUANTITY_UNCONFIRMED'});
  if (availability.remainingKg<=0) throw createHttpError(422,'Diese Optionsposition ist bereits vollständig verplant.',{code:'OPTION_QUANTITY_EXCEEDED'});
  const lang = req.header('x-lang')==='en'?'en':'de';
  const [choices,terms] = await Promise.all([loadPurchaseOptions(req.database,lang),loadSupplierTerms(req.database,supplier.id,lang)]);
  const resolvedContact=resolveSupplierContact(source.sourceContactsJson,terms.contacts || []);
  const contactId=Object.hasOwn(req.body,'contactId')?(req.body.contactId===null?null:Number(req.body.contactId)):resolvedContact.selectedId;
  const contact=(terms.contacts || []).find(row=>row.id===contactId);
  if(contactId!=null && !contact)throw createHttpError(422,'Der Ansprechpartner gehört nicht zum gewählten Lieferanten. Bitte erneut auswählen.',{code:'OPTION_CONTACT_INVALID'});
  const chosenPackaging=(choices.packagingTypes || []).find(row=>row.id===Number(req.body.packagingTypeId));
  if(!chosenPackaging)
    throw createHttpError(422,'Bitte zuerst die Verpackungsart auswählen.',{code:'OPTION_PACKAGING_REQUIRED'});
  if(isTruckOffer(source) && offeredTruckCount(source)==null && source.confirmedPackagingTypeId!=null && Number(source.confirmedPackagingTypeId)!==chosenPackaging.id)
    throw createHttpError(422,'Bitte die Gesamtmenge für die gewählte Verpackungsart erneut bestätigen.',{code:'OPTION_PACKAGING_CHANGED'});
  if(isTruckOffer(source) && offeredTruckCount(source)!=null) {
    availability=quantityAvailability(source,availability.orderedKg,purchaseTruckLoadKg(chosenPackaging.text));
    if(availability.remainingKg<=0)throw createHttpError(422,'Diese Optionsposition ist für die gewählte Verpackung bereits vollständig verplant.',{code:'OPTION_QUANTITY_EXCEEDED'});
  }
  const sourceIncoterm = String(source.incoterm ?? '').trim().toLowerCase();
  const exactTerms = choices.incoterms.filter(row => row.text.trim().toLowerCase() === sourceIncoterm);
  const deliveryTerm = exactTerms.length === 1 ? exactTerms[0] : findIncotermByCode(choices.incoterms, sourceIncoterm);
  const amount=Object.hasOwn(req.body,'amount')?Number(req.body.amount):availability.remainingKg;
  if(!Number.isFinite(amount) || amount<=0 || !Number.isSafeInteger(Math.round(amount*1000))
    || Math.abs(amount*1000-Math.round(amount*1000))>0.00001 || amount>availability.remainingKg)
    throw createHttpError(422,'Bitte eine gültige Bestellmenge bis zur verfügbaren Restmenge eingeben.',{code:'OPTION_QUANTITY_EXCEEDED',remainingKg:availability.remainingKg});
  const price = source.opp_PreisProTonne;
  sendEnvelope(res,{data:{
    header:{deliveryTermId:deliveryTerm?.id || '',deliveryTermText:deliveryTerm?.text || '',
      loadingLocationText:source.loadingLocation || '',loadingLocationSource:source.loadingLocation?'manual':'',
      packagingType:chosenPackaging?.text || source.opp_Verpackung || source.packagingText || '',packagingTypeId:chosenPackaging?.id || source.opp_Verpackungsart_id || '',
      supplierContact:contact?.name || ''},
    position:{optionId:Number(source.opp_op_id),optionPositionId:Number(source.opp_id),
      supplierId:supplier.id,supplierName:supplier.name,articleIndex:article.articleIndex,
      article:source.opp_Artikelname_Lieferant || article.supplierArticleName || article.articleName,masterArticleName:article.articleName,
      amount,
      optionPackagingTypeId:chosenPackaging.id,
      purchasePrice:price==null || optionPriceNeedsReview(price)?'':Number(price),
      originalPackagingType:source.opp_Verpackung || source.packagingText || '',originalPackagingTypeId:source.opp_Verpackungsart_id,
      optionValidUntil:source.validUntil,remainingKg:availability.remainingKg,offeredKg:availability.offeredKg,
      supplierConfirmed:true,articleConfirmed:true,acknowledgeUnverifiedMfi:req.body.acknowledgeUnverifiedMfi===true,
      unit:'kg',currency:'EUR',requestedDeliveryDate:'',reservedFor:'',comment:''},
  }});
}));
module.exports = router;
