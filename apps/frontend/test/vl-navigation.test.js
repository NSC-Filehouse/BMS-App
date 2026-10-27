import assert from 'node:assert/strict';
import test from 'node:test';
import { createReturnTo, navigateToReturn } from '../src/utils/navigation.js';
import { createVlReturnTo } from '../src/utils/vlNavigation.js';

test('repeated shopping keeps the VL state and the original customer return route', () => {
  const customer = {
    pathname: '/customers/4711', search: '', hash: '',
    state: { detailView: 'customer', fromCustomers: { q: 'Original customer' } },
  };
  let vl = { pathname: '/vl', state: { returnTo: createReturnTo(customer) } };
  for (let visit = 1; visit <= 3; visit += 1) {
    const snapshot = {
      activeMandantName: 'frupack', vlMandantId: '3',
      searchInput: 'LDPE', page: visit, scrollTop: visit * 400, selectedItems: [],
    };
    const returnTo = createVlReturnTo(vl, snapshot);
    const calls = [];
    navigateToReturn((...args) => calls.push(args), returnTo, '/products');
    assert.equal(calls[0][0], '/vl');
    assert.deepEqual(calls[0][1].state.vlReturnState, snapshot);
    assert.deepEqual(calls[0][1].state.returnTo, customer);
    vl = { pathname: '/vl', state: calls[0][1].state };
    // Restoring the list consumes only its snapshot, retaining the parent route.
    delete vl.state.vlReturnState;
  }
  const calls = [];
  navigateToReturn((...args) => calls.push(args), vl.state.returnTo, '/customers');
  assert.deepEqual(calls, [[customer.pathname, { replace: true, state: customer.state }]]);
});

test('returning from the cart never repeats a pending customer-selection action', () => {
  const pendingCustomerAction = { type: 'batchCart', items: [{ id: 'product-1' }] };
  const location = { pathname: '/vl', state: { pendingCustomerAction } };
  const vlReturnState = { searchInput: 'PE', selectedItems: [] };
  const returnTo = createVlReturnTo(location, vlReturnState);
  assert.deepEqual(returnTo.state, { vlReturnState });
  assert.equal(location.state.pendingCustomerAction, pendingCustomerAction);
});

test('VL opened directly has no invented customer return route', () => {
  const vlReturnState = { searchInput: '' };
  assert.deepEqual(createVlReturnTo({ pathname: '/vl', state: null }, vlReturnState), {
    pathname: '/vl', search: '', hash: '', state: { vlReturnState },
  });
});
