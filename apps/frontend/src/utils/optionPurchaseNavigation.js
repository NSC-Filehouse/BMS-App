export function optionPurchaseReturnTo(returnTo,positionId) {
  const {optionPurchaseDraft,...state}=returnTo.state || {};
  return {...returnTo,hash:returnTo.hash || `#position-${Number(positionId)}`,state};
}
