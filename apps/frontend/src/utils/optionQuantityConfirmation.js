import {defaultPurchaseAmount} from './purchaseCart.js';

export function defaultOptionPackagingId(meta) {
  if(!meta.truckOffer)return meta.confirmedPackagingTypeId??'';
  if(!(Number(meta.offeredTrucks)>0) && meta.confirmedPackagingTypeId!=null)return meta.confirmedPackagingTypeId;
  const choices=meta.packagingTypes || [];
  if(!['rule','unknown'].includes(meta.sourcePackagingSource)) {
    const detected=choices.find(row=>row.id===Number(meta.sourcePackagingTypeId));
    if(detected)return detected.id;
    const key=value=>String(value || '').trim().toLocaleLowerCase('de-DE').replace(/\s+/g,' ');
    const matches=choices.filter(row=>[row.text,...(row.aliases || [])].some(value=>key(value) && key(value)===key(meta.sourcePackaging)));
    if(matches.length===1)return matches[0].id;
  }
  return choices.find(row=>row.key==='silo' || defaultPurchaseAmount(row.text)===25000)?.id??'';
}

export function truckOptionAvailability(meta,packaging) {
  if(!meta.truckOffer || !(Number(meta.offeredTrucks)>0) || !packaging)return null;
  const truckKg=Math.round(Number(meta.offeredTrucks)*defaultPurchaseAmount(packaging.text)*1000)/1000;
  const offeredKg=meta.offeredKg==null?truckKg:Math.min(Number(meta.offeredKg),truckKg);
  return {offeredKg,orderedKg:Number(meta.orderedKg)||0,remainingKg:Math.max(0,Math.round((offeredKg-(Number(meta.orderedKg)||0))*1000)/1000)};
}

export function confirmedTotalKg(amount,unit,packaging=null) {
  if(!['kg','t','truck'].includes(unit) || String(amount??'').trim()==='' || unit==='truck' && !packaging?.id)return null;
  const value=Number(amount)*(unit==='t'?1000:unit==='truck'?defaultPurchaseAmount(packaging.text):1);
  if(!Number.isFinite(value) || value<=0 || !Number.isSafeInteger(Math.round(value*1000))
    || Math.abs(value*1000-Math.round(value*1000))>0.00001)return null;
  return Math.round(value*1000)/1000;
}
