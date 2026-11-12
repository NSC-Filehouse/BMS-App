export function optionPurchaseReturnTo(returnTo,positionId,draft) {
  return {...returnTo,state:{...returnTo.state,optionPurchaseDraft:{...draft,positionId:Number(positionId)}}};
}
