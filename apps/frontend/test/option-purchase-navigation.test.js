import test from 'node:test';
import assert from 'node:assert/strict';
import {optionPurchaseReturnTo} from '../src/utils/optionPurchaseNavigation.js';
import {navigateToReturn} from '../src/utils/navigation.js';

test('cart detour preserves the exact option route, previous list return and selected dialog fields',()=>{
  const previousList={pathname:'/customers/UK1736',state:{detailView:'supplier'}};
  const origin={pathname:'/options/616',search:'?vlMandantId=3',hash:'#position-1888',state:{returnTo:previousList,optionSupplierId:'UK1736'}};
  const draft={supplier:{id:'UK1736'},article:{articleIndex:'A'},packagingTypeId:78,acknowledgeUnverifiedMfi:true,totalAmount:'24',totalUnit:'t',quantitySourceHash:'original'};
  const result=optionPurchaseReturnTo(origin,1888,draft),calls=[];
  navigateToReturn((...args)=>calls.push(args),result,'/suppliers');
  assert.equal(calls[0][0],'/options/616?vlMandantId=3#position-1888');
  assert.deepEqual(calls[0][1].state.optionPurchaseDraft,{...draft,positionId:1888});
  assert.deepEqual(calls[0][1].state.returnTo,previousList);
  assert.equal(origin.state.optionPurchaseDraft,undefined);
  const repeat=optionPurchaseReturnTo(result,1888,{...draft,packagingTypeId:79});
  assert.equal(repeat.state.optionPurchaseDraft.packagingTypeId,79);
  assert.equal(repeat.state.optionPurchaseDraft.optionPurchaseDraft,undefined);
});
