import { createReturnTo } from './navigation.js';

export function createVlReturnTo(location, vlReturnState) {
  const state = { ...(location?.state || {}), vlReturnState };
  // A completed customer-selection action must not run again on return.
  delete state.pendingCustomerAction;
  return createReturnTo(location, state);
}
