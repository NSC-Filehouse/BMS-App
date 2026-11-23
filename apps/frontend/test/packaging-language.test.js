import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformWithEsbuild } from 'vite';
import * as offers from '../src/utils/offers.js';
import * as purchaseCart from '../src/utils/purchaseCart.js';
import * as quantities from '../src/utils/optionQuantityConfirmation.js';
import * as optionDisplay from '../src/utils/optionDisplay.js';
import * as loadingLocations from '../src/utils/loadingLocationDraft.js';
import * as contactRanking from '../src/utils/contactRanking.js';
import * as incoterm from '../src/utils/incoterm.js';
import * as loadingLocationDisplay from '../src/utils/loadingLocationDisplay.js';

const i18nSource = readFileSync(new URL('../src/utils/i18n.jsx', import.meta.url), 'utf8');
const dictionary = new Function(`${i18nSource.slice(i18nSource.indexOf('const translations ='), i18nSource.indexOf('function getInitialLang'))}; return translations;`)();
const choices = lang => [{ id: 78, text: lang === 'en' ? 'Bags' : 'Sackware', aliases: ['Sackware', 'Bags'] },
  { id: 79, text: lang === 'en' ? 'Silo/bulk' : 'Siloware', aliases: ['Siloware', 'Silo/bulk'] }];

// Execute the component's hooks and handlers without a browser or live API.
// State and effect cleanup persist across renders, including language changes.
async function mount(relativePath, props, request, params = {}) {
  let cursor = 0, dirty = true, tree;
  const slots = [], effects = [], calls = [], location = { pathname: '/test', state: {} };
  const navigate = () => {};
  const env = { lang: 'de' };
  const state = initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], value => {
      const next = typeof value === 'function' ? value(slots[index]) : value;
      if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; }
    }];
  };
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((value, index) => !Object.is(value, b[index]));
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: state,
    useRef: initial => state(() => ({ current: initial }))[0],
    useId: () => state('test-id')[0],
    useMemo: (fn, deps) => {
      const index = cursor++;
      if (!slots[index] || changed(slots[index].deps, deps)) slots[index] = { deps, value: fn() };
      return slots[index].value;
    },
    useCallback: (fn, deps) => React.useMemo(() => fn, deps),
    useEffect: (fn, deps) => {
      const index = cursor++;
      if (!slots[index] || changed(slots[index].deps, deps)) {
        slots[index]?.cleanup?.();
        const entry = { deps };
        slots[index] = entry;
        effects.push(() => { entry.cleanup = fn(); });
      }
    },
  };
  const t = (key, vars = {}) => {
    assert.ok(dictionary[env.lang][key], `Missing ${env.lang} translation: ${key}`);
    return Object.entries(vars).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), dictionary[env.lang][key]);
  };
  const dependencies = {
    react: React,
    'react-router-dom': { useNavigate: () => navigate, useLocation: () => location, useParams: () => params },
    '../api/client.js': { apiRequest: (path, options) => {
      calls.push({ path, lang: env.lang });
      return request(path, env.lang, options);
    } },
    '../utils/i18n.jsx': { useI18n: () => ({ lang: env.lang, t }) },
    '../utils/mandant.js': { getMandant: () => '10' },
    '../utils/customerSelection.js': { getSelectedCustomer: () => null },
    '../utils/offers.js': offers,
    '../utils/purchaseCart.js': purchaseCart,
    '../utils/optionQuantityConfirmation.js': quantities,
    '../utils/optionDisplay.js': optionDisplay,
    '../utils/loadingLocationDraft.js': loadingLocations,
    '../utils/contactRanking.js': contactRanking,
    '../utils/incoterm.js': incoterm,
    '../utils/loadingLocationDisplay.js': loadingLocationDisplay,
    '../utils/optionPurchaseNavigation.js': { optionPurchaseReturnTo: () => ({ pathname: '/test' }) },
    '../utils/navigation.js': { createReturnTo: () => ({}), navigateToReturn: navigate },
  };
  const module = { exports: {} };
  const source = (await transformWithEsbuild(readFileSync(new URL(relativePath, import.meta.url), 'utf8'), relativePath, { loader: 'jsx', format: 'cjs' })).code;
  new Function('require', 'module', 'sessionStorage', 'window', source)(name => {
    if (name in dependencies) return dependencies[name];
    if (name.startsWith('@mui/') || name.includes('/components/') || name.endsWith('.jsx')) return new Proxy({}, { get: (_target, key) => String(key) });
    throw new Error(`Unexpected dependency: ${name}`);
  }, module, { getItem: () => null, setItem() {} }, { addEventListener() {}, removeEventListener() {} });
  const render = () => {
    cursor = 0; dirty = false;
    tree = module.exports.default(props);
    effects.splice(0).forEach(fn => fn());
  };
  return {
    calls, env,
    async flush() {
      // Allow promise chains and state updates from API responses to settle.
      for (let i = 0; i < 16; i++) {
        if (dirty) render();
        await new Promise(resolve => setImmediate(resolve));
      }
      assert.equal(dirty, false, 'Component did not settle');
    },
    switchLanguage(lang) { env.lang = lang; dirty = true; },
    find(predicate) {
      const visit = node => {
        if (!node || typeof node !== 'object') return undefined;
        if (Array.isArray(node)) return node.map(visit).find(Boolean);
        return predicate(node) ? node : visit(node.props?.children);
      };
      const result = visit(tree);
      assert.ok(result, 'Expected element not found');
      return result;
    },
    field(label) { return this.find(node => node.props?.label === label); },
    text() { return JSON.stringify(tree); },
  };
}

test('an open offer reloads English choices without resetting packaging, comments or positions', async () => {
  const order = { ...offers.blankOffer(), id: 7, status: 0, packagingId: 79, packaging: 'Siloware',
    positions: [{ ...offers.newOfferPosition({ articleIndex: 'A', article: 'Grade' }), lineKey: 'one', quantity: 1000 }] };
  const view = await mount('../src/pages/TempOfferEditor.jsx', {}, async (path, lang) => {
    if (path === '/me') return { userId: 1 };
    if (path === '/temp-offers/meta') return { data: { payments: [], packagingTypes: choices(lang), incoterms: [{ id: 1, text: 'FCA' }] } };
    if (path === '/temp-offers/7') return { data: order };
    throw new Error(path);
  }, { id: '7' });
  await view.flush();
  view.field('Verpackungsart').props.onChange({ target: { value: 78 } });
  view.field('Interne Bemerkungen').props.onChange({ target: { value: 'Unsaved note' } });
  view.find(node => node.props?.position?.lineKey === 'one').props.onChange({ quantity: 2345 });
  await view.flush();
  view.switchLanguage('en');
  await view.flush();
  assert.equal(view.field('Packaging type').props.value, 78);
  assert.ok(view.text().includes('Bags'));
  assert.equal(view.field('Internal note').props.value, 'Unsaved note');
  assert.equal(view.find(node => node.props?.position?.lineKey === 'one').props.position.quantity, 2345);
  assert.equal(view.calls.filter(call => call.path === '/temp-offers/7').length, 1);
  assert.equal(view.calls.filter(call => call.path === '/temp-offers/meta').length, 2);
});

const renderPurchaseDetails = ({ supplierField, purchaseControls }) => [supplierField, purchaseControls];

test('an ambiguous option requires inline supplier and compatible article choices before opening the order', async () => {
  const suppliers = [{ id: 'LF1', name: 'Supplier 1' }, { id: 'LF2', name: 'Supplier 2' }];
  const blocked = { articleIndex: 'A', articleName: 'Article A', mfiCheck: { blocked: true } };
  const article = { articleIndex: 'B', articleName: 'Article B' };
  const view = await mount('../src/components/OptionPurchaseControls.jsx', {
    enabled: true, offer: { id: 1, supplierName: 'Supplier' }, position: { id: 10 }, renderDetails: renderPurchaseDetails,
  }, async path => {
    if (path.includes('/suppliers?')) return { data: suppliers };
    if (path.endsWith('/articles?q=')) return { data: [blocked] };
    if (path.endsWith('/articles?q=Article')) return { data: [article] };
    throw new Error(path);
  });
  const order = () => view.find(node => node.type === 'Button' && node.props.children.includes('Bestellen'));
  const supplierField = () => view.find(node => node.type === 'Autocomplete' && node.props.options === suppliers);
  const articleField = () => view.find(node => node.type === 'Autocomplete' && node.props.getOptionDisabled);
  await view.flush();
  assert.equal(order().props.disabled, true);
  assert.equal(supplierField().props.value, null);
  assert.equal(articleField().props.value, null);
  assert.equal(articleField().props.getOptionDisabled(blocked), true);

  supplierField().props.onChange(null, suppliers[1]);
  view.find(node => node.type === 'IconButton' && node.props['aria-expanded'] === false).props.onClick();
  await view.flush();
  const searchField = () => view.find(node => node.type === 'Autocomplete' && node.props.openOnFocus);
  searchField().props.onInputChange(null, 'Article', 'input');
  await view.flush();
  assert.equal(searchField().props.loading, true);
  await new Promise(resolve => setTimeout(resolve, 275));
  await view.flush();
  assert.deepEqual(searchField().props.options, [article]);
  assert.equal(order().props.disabled, true);
  searchField().props.onChange(null, article);
  await view.flush();
  assert.equal(order().props.disabled, false);
  order().props.onClick();
  await view.flush();
  const dialog = view.find(node => node.props?.supplier && node.props?.onClose);
  assert.equal(dialog.props.supplier, suppliers[1]);
  assert.equal(dialog.props.article, article);
  dialog.props.onClose();
  await view.flush();
  assert.equal(supplierField().props.value, suppliers[1]);
  assert.equal(articleField().props.value, article);
});

test('the first selectable article is preselected and a resolved supplier appears in the order dialog', async () => {
  const supplier = { id: 'LF1', name: 'Supplier 1', city: 'Feluy' };
  const article = { articleIndex: 'A', articleName: 'Article A' };
  const blocked = { articleIndex: 'B', articleName: 'Blocked article', mfiCheck: { blocked: true } };
  const alternative = { articleIndex: 'C', articleName: 'Article C' };
  const props = { enabled: true, offer: { id: 1 }, position: { id: 10 }, renderDetails: renderPurchaseDetails };
  for (const suppliers of [[supplier], [{ ...supplier, preferred: true }, { id: 'LF2', name: 'Supplier 2' }]]) {
    const view = await mount('../src/components/OptionPurchaseControls.jsx', props, async path => {
      if (path.includes('/suppliers?')) return { data: suppliers };
      if (path.includes('/articles?')) return { data: [blocked, article, alternative] };
      throw new Error(path);
    });
    await view.flush();
    assert.throws(() => view.find(node => node.type === 'Autocomplete' && node.props.options === suppliers), /Expected element not found/);
    const order = view.find(node => node.type === 'Button' && node.props.children.includes('Bestellen'));
    assert.equal(order.props.disabled, false);
    order.props.onClick();
    await view.flush();
    const dialog = view.find(node => node.props?.supplierEditable);
    assert.equal(dialog.props.supplier, suppliers[0]);
    assert.equal(dialog.props.article, article);

    const popup = await mount('../src/components/OptionPurchaseDialog.jsx', dialog.props, async path => {
      if (path.includes('/suppliers?')) return { data: suppliers };
      if (path.includes('/contacts?')) return { data: [] };
      if (path === '/packaging-types') return { data: choices('de') };
      throw new Error(path);
    });
    await popup.flush();
    assert.equal(popup.find(node => node.type === 'Autocomplete' && node.props.options === suppliers).props.value, suppliers[0]);
  }
});

test('option purchase waits for the matching menu item before displaying the default packaging', async () => {
  let resolvePackaging;
  const packagingResponse = new Promise(resolve => { resolvePackaging = resolve; });
  const view = await mount('../src/components/OptionPurchaseDialog.jsx', { offer: { id: 1 }, position: { id: 10 } }, async (path, lang) => {
    if (path === '/packaging-types') return packagingResponse;
    if (path.includes('/suppliers?')) return { data: [], meta: {
      packagingTypes: choices(lang), sourcePackagingSource: 'original', sourcePackagingTypeId: 78,
      offeredKg: 50000, remainingKg: 50000, orderedKg: 0, truckOffer: true, offeredTrucks: 2,
    } };
    if (path.includes('/articles?')) return { data: [] };
    throw new Error(path);
  });
  await view.flush();
  assert.equal(view.field('Verpackungsart').props.disabled, true);
  assert.equal(view.field('Verpackungsart').props.value, '');

  resolvePackaging({ data: choices('de') });
  await view.flush();
  assert.equal(view.field('Verpackungsart').props.disabled, false);
  assert.equal(view.field('Verpackungsart').props.value, 78);
  assert.equal(view.field('Bestellmenge (kg)').props.value, 49500);
});

test('an open option purchase refreshes packaging labels while retaining manual quantity and selected ID', async () => {
  const view = await mount('../src/components/OptionPurchaseDialog.jsx', { offer: { id: 1 }, position: { id: 10 } }, async (path, lang) => {
    if (path === '/packaging-types') return { data: choices(lang) };
    if (path.endsWith('/suppliers?'+new URLSearchParams({ q: '', supplierId: '' }))) return { data: [], meta: {
      packagingTypes: choices(lang), sourcePackagingSource: 'original', sourcePackagingTypeId: 78,
      offeredKg: 50000, remainingKg: 50000, orderedKg: 0, truckOffer: true, offeredTrucks: 2,
    } };
    if (path.includes('/articles?')) return { data: [] };
    throw new Error(path);
  });
  await view.flush();
  view.field('Verpackungsart').props.onChange({ target: { value: 79 } });
  await view.flush();
  view.field('Bestellmenge (kg)').props.onChange({ target: { value: '12345' } });
  await view.flush();
  view.switchLanguage('en');
  await view.flush();
  assert.equal(view.field('Packaging type').props.value, 79);
  assert.equal(view.field('Order quantity (kg)').props.value, '12345');
  assert.ok(view.text().includes('Silo/bulk'));
  assert.equal(view.calls.filter(call => call.path === '/packaging-types').length, 2);
  assert.equal(view.calls.filter(call => call.path.includes('/suppliers?')).length, 1);
});

test('purchase editor and totals use English labels and preserve positions during a language refresh', async () => {
  const initialOrder = { supplierId: 'LF', packagingTypeId: 78, packagingType: 'Sackware', positions: [{ lineId: 'one', articleIndex: 'A', article: 'Grade', amount: 1000, purchasePrice: 50 }] };
  const view = await mount('../src/components/PurchaseOrderEditor.jsx', { initialOrder, locked: true }, async (path, lang) => {
    if (path.startsWith('/purchase-order-options')) return { data: { packagingTypes: choices(lang), incoterms: [], defaults: {} } };
    if (path.startsWith('/purchase-order-loading-locations')) return { data: [] };
    if (path.endsWith('/purchase-defaults')) return { data: { defaults: {} } };
    throw new Error(path);
  });
  await view.flush();
  view.switchLanguage('en');
  await view.flush();
  assert.equal(view.field('Packaging type').props.value, 78);
  assert.equal(view.field('Quantity (kg)').props.value, 1000);
  assert.equal(view.field('Reserved for').props.label, 'Reserved for');
  assert.ok(view.text().includes('Original packaging type'));
  assert.ok(view.text().includes('Continue shopping'));
  const summary = await mount('../src/components/PurchaseOrderSummary.jsx', { positions: initialOrder.positions }, async () => { throw new Error('Unexpected request'); });
  summary.switchLanguage('en');
  await summary.flush();
  assert.ok(summary.text().includes('Total quantity'));
  assert.ok(summary.text().includes('Total amount'));
});

test('an option purchase keeps its Incoterm code when ERP IDs and labels change with the language', async () => {
  const de = { id: 29, text: 'FCA / Frei Frachtführer' };
  const en = { id: 40, text: 'FCA / Free Carrier' };
  const initialOrder = { supplierId: 'LF', deliveryTermId: de.id, deliveryTermText: de.text,
    positions: [{ lineId: 'one', optionId: 1, articleIndex: 'A', article: 'Grade' }] };
  const view = await mount('../src/components/PurchaseOrderEditor.jsx', { initialOrder, isNew: true }, async (path, lang) => {
    if (path.startsWith('/purchase-order-options')) return { data: { packagingTypes: choices(lang),
      incoterms: [lang === 'en' ? en : de], defaults: {} } };
    if (path.startsWith('/purchase-order-loading-locations')) return { data: [] };
    throw new Error(path);
  });
  await view.flush();
  assert.equal(view.field('Incoterm').props.value, de.id);
  view.switchLanguage('en');
  await view.flush();
  assert.equal(view.field('Incoterm').props.value, en.id);
  assert.ok(view.text().includes(en.text));
  view.switchLanguage('de');
  await view.flush();
  assert.equal(view.field('Incoterm').props.value, de.id);
});

test('a purchase without an Incoterm uses supplier history only for regular positions', async () => {
  const priorTerm = { id: 24, text: 'DAP / Geliefert Benannter Ort' };
  for (const [optionId, expectedId] of [[1, ''], [null, priorTerm.id]]) {
    const initialOrder = { supplierId: 'LF', positions: [{ lineId: 'one', optionId, articleIndex: 'A', article: 'Grade' }] };
    const view = await mount('../src/components/PurchaseOrderEditor.jsx', { initialOrder, isNew: true }, async (path, lang) => {
      if (path.startsWith('/purchase-order-options')) return { data: { packagingTypes: choices(lang),
        incoterms: [priorTerm], defaults: { deliveryTermText: priorTerm.text } } };
      if (path.startsWith('/purchase-order-loading-locations')) return { data: [] };
      if (path.endsWith('/purchase-defaults')) return { data: { defaults: {} } };
      throw new Error(path);
    });
    await view.flush();
    assert.equal(view.field('Incoterm').props.value, expectedId);
  }
});
