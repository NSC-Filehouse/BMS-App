import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePurchaseCartReturnTo} from '../src/utils/purchaseCart.js';
import {navigateToReturn} from '../src/utils/navigation.js';

test('each explicit cart origin retains its route, filters and state despite an older option return target',()=>{
  const context={returnTo:{pathname:'/options/616',state:{optionPurchaseDraft:{positionId:1888}}}};
  const origins=[
    {pathname:'/customers/LF0117',search:'?scope=open',hash:'#articles',state:{detailView:'supplier',supplierArticleState:{q:'LDPE',expanded:['A']}}},
    {pathname:'/temp-purchase-orders',search:'?sort=createdAt',state:{listState:{page:3,q:'Total',status:'draft',ownerScope:'mine',createdPeriod:'week'}}},
    {pathname:'/options/617',hash:'#position-1900',state:{optionPurchaseDraft:{positionId:1900,article:{articleIndex:'A'}}}},
  ];
  for(const origin of origins){
    const target=resolvePurchaseCartReturnTo({returnTo:origin},context,'LF0117'),calls=[];
    assert.equal(target,origin);
    navigateToReturn((...args)=>calls.push(args),target,'/suppliers');
    assert.equal(calls[0][0],`${origin.pathname}${origin.search || ''}${origin.hash || ''}`);
    assert.deepEqual(calls[0][1].state,origin.state);
  }
  assert.equal(context.returnTo.pathname,'/options/616');
});

test('direct cart access uses the saved origin, then the existing supplier fallback',()=>{
  const saved={pathname:'/customers/LF0117',state:{detailView:'supplier'}};
  assert.equal(resolvePurchaseCartReturnTo(null,{returnTo:saved},'UK1736'),saved);
  assert.equal(resolvePurchaseCartReturnTo({returnTo:{}},{returnTo:saved},'UK1736'),saved);
  assert.deepEqual(resolvePurchaseCartReturnTo(null,{},'UK1736'),{pathname:'/customers/UK1736',state:{detailView:'supplier'}});
});
