import {defaultPurchaseAmount} from './purchaseCart.js';

export function confirmedTotalKg(amount,unit,packaging=null) {
  if(!['kg','t','truck'].includes(unit) || String(amount??'').trim()==='' || unit==='truck' && !packaging?.id)return null;
  const value=Number(amount)*(unit==='t'?1000:unit==='truck'?defaultPurchaseAmount(packaging.text):1);
  if(!Number.isFinite(value) || value<=0 || !Number.isSafeInteger(Math.round(value*1000))
    || Math.abs(value*1000-Math.round(value*1000))>0.00001)return null;
  return Math.round(value*1000)/1000;
}
