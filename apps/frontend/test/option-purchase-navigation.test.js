import test from 'node:test';
import assert from 'node:assert/strict';
import {optionPurchaseReturnTo} from '../src/utils/optionPurchaseNavigation.js';
import {navigateToReturn} from '../src/utils/navigation.js';

test('cart detour returns to the option page and position without reopening a saved dialog',()=>{
  const previousList={pathname:'/customers/UK1736',state:{detailView:'supplier'}};
  const origin={pathname:'/options/616',search:'?vlMandantId=3',hash:'#position-1888',state:{returnTo:previousList,optionSupplierId:'UK1736'}};
  const result=optionPurchaseReturnTo(origin,1888),calls=[];
  navigateToReturn((...args)=>calls.push(args),result,'/suppliers');
  assert.equal(calls[0][0],'/options/616?vlMandantId=3#position-1888');
  assert.equal(calls[0][1].state.optionPurchaseDraft,undefined);
  assert.deepEqual(calls[0][1].state.returnTo,previousList);
  assert.equal(origin.state.optionPurchaseDraft,undefined);
  const legacy=optionPurchaseReturnTo({...origin,hash:'',state:{...origin.state,optionPurchaseDraft:{positionId:1888}}},1888);
  assert.equal(legacy.hash,'#position-1888');
  assert.equal(legacy.state.optionPurchaseDraft,undefined);
});
