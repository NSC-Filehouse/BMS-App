import assert from 'node:assert/strict';
import test from 'node:test';

import { createReturnTo, navigateToReturn } from '../src/utils/navigation.js';

test('createReturnTo keeps the route and caller state', () => {
  const location = {
    pathname: '/products',
    search: '?q=abc',
    hash: '#top',
    state: { listState: { q: 'abc' } },
  };

  assert.deepEqual(createReturnTo(location), location);
  assert.deepEqual(createReturnTo(location, { custom: true }), {
    pathname: '/products',
    search: '?q=abc',
    hash: '#top',
    state: { custom: true },
  });
});

test('navigateToReturn replaces the detail route with the caller route', () => {
  const calls = [];
  const navigate = (...args) => calls.push(args);

  navigateToReturn(
    navigate,
    { pathname: '/orders', search: '?page=2', hash: '#open', state: { listState: { page: 2 } } },
    '/customers',
  );

  assert.deepEqual(calls, [[
    '/orders?page=2#open',
    { replace: true, state: { listState: { page: 2 } } },
  ]]);
});

test('navigateToReturn uses the explicit fallback when no caller route exists', () => {
  const calls = [];
  const navigate = (...args) => calls.push(args);

  navigateToReturn(navigate, null, '/orders', { sourceMandantId: 2 });

  assert.deepEqual(calls, [[
    '/orders',
    { replace: true, state: { sourceMandantId: 2 } },
  ]]);
});
