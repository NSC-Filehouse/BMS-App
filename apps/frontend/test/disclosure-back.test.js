import test from 'node:test';
import assert from 'node:assert/strict';
import { createDisclosureRegistry, collapseSavedDisclosureState } from '../src/utils/disclosureBack.js';

function section(registry, id, { open = true, active = true, onClose = () => {} } = {}) {
  const state = { open, active, closes: 0 };
  state.unregister = registry.register(id, {
    isOpen: () => state.open,
    isActive: () => state.active,
    close: () => { state.open = false; state.closes++; onClose(); },
  });
  return state;
}

test('one back action closes all parents and children, the next permits navigation even for immediate repeated taps', () => {
  const registry = createDisclosureRegistry();
  let child;
  const parent = section(registry, 'parent', { onClose: () => { child.active = false; } });
  child = section(registry, 'child');
  const other = section(registry, 'invoices');
  assert.equal(registry.collapseOpen(), true);
  assert.equal(parent.open || child.open || other.open, false);
  assert.equal(registry.collapseOpen(), false);
  assert.equal(parent.closes + child.closes + other.closes, 3);
});

test('hidden children and search-expanded results do not consume another back action behind a closed parent', () => {
  const registry = createDisclosureRegistry();
  const searchResults = section(registry, 'search-results', { active: false });
  assert.equal(registry.collapseOpen(), false);
  assert.equal(searchResults.open, true);
  section(registry, 'parent');
  assert.equal(registry.collapseOpen(), true);
  assert.equal(searchResults.open, false);
  assert.equal(registry.collapseOpen(), false);
});

test('dialog/current page cannot collapse the retained background page or another detail page', () => {
  const background = createDisclosureRegistry(), current = createDisclosureRegistry();
  const group = section(background, 'product-category');
  assert.equal(current.collapseOpen(), false);
  assert.equal(group.open, true);
  assert.equal(background.collapseOpen(), true);
});

test('unmounting a section unregisters it; stale effect cleanup cannot remove its replacement', () => {
  const registry = createDisclosureRegistry();
  const old = section(registry, 'same-id');
  const current = section(registry, 'same-id');
  old.unregister();
  assert.equal(registry.collapseOpen(), true);
  assert.equal(current.closes, 1);
  current.open = true;
  current.unregister();
  assert.equal(registry.collapseOpen(), false);
});

test('saved return states stay closed without clearing searches, selected VL positions, cart data or the return destination', () => {
  const state = { returnTo: { pathname: '/suppliers', search: '?page=2' }, cart: [{ amount: 123 }],
    supplierOptionsState: { supplierId: 'TOTAL', expanded: true, scrollTop: 50 },
    supplierArticleState: { query: 'PP', expanded: { vl: true }, expandedVl: ['A'], selectedVl: ['BE-1'], scrollTop: 100 } };
  const closed = collapseSavedDisclosureState(state);
  assert.equal(closed.supplierOptionsState.expanded, false);
  assert.equal(closed.supplierArticleState.expanded, false);
  assert.deepEqual(closed.supplierArticleState.expandedVl, []);
  assert.deepEqual(closed.supplierArticleState.selectedVl, ['BE-1']);
  assert.equal(closed.supplierArticleState.query, 'PP');
  assert.equal(closed.supplierArticleState.scrollTop, 100);
  assert.equal(closed.returnTo, state.returnTo);
  assert.equal(closed.cart, state.cart);
  assert.equal(state.supplierOptionsState.expanded, true);
  assert.equal(collapseSavedDisclosureState(closed), closed);
  assert.equal(collapseSavedDisclosureState(null), null);
  const unrelated = { returnTo: state.returnTo };
  assert.equal(collapseSavedDisclosureState(unrelated), unrelated);
});
