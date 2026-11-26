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
import * as salePrice from '../src/utils/salePrice.js';
import * as purchaseOrderAttachments from '../src/utils/purchaseOrderAttachments.js';

const i18nSource = readFileSync(new URL('../src/utils/i18n.jsx', import.meta.url), 'utf8');
const dictionary = new Function(`${i18nSource.slice(i18nSource.indexOf('const translations ='), i18nSource.indexOf('function getInitialLang'))}; return translations;`)();
const choices = lang => [{ id: 78, text: lang === 'en' ? 'Bags' : 'Sackware', aliases: ['Sackware', 'Bags'] },
  { id: 79, text: lang === 'en' ? 'Silo/bulk' : 'Siloware', aliases: ['Siloware', 'Silo/bulk'] }];

// Execute the component's hooks and handlers without a browser or live API.
// State and effect cleanup persist across renders, including language changes.
async function mount(relativePath, props, request, params = {}, exportName = 'default', routeState) {
  let cursor = 0, dirty = true, tree;
  const slots = [], effects = [], calls = [], navigations = [], location = { pathname: '/test', state: routeState || {} };
  const navigate = (path, options) => { navigations.push({ path, options }); };
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
    lazy: () => 'LazyPdfDialog',
    Suspense: 'Suspense',
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
    'react-router-dom': { Link: 'Link', useNavigate: () => navigate, useLocation: () => location, useParams: () => params },
    '../api/client.js': { apiRequest: (path, options) => {
      calls.push({ path, lang: env.lang });
      return request(path, env.lang, options);
    }, apiRequestBlob: (path, options) => request(path, env.lang, options) },
    '../utils/i18n.jsx': { useI18n: () => ({ lang: env.lang, t }) },
    '../utils/mandant.js': { getMandant: () => '10' },
    '../utils/customerSelection.js': { getSelectedCustomer: () => null },
    '../utils/offers.js': offers,
    '../utils/purchaseCart.js': purchaseCart,
    '../utils/optionQuantityConfirmation.js': quantities,
    '../utils/optionDisplay.js': optionDisplay,
    '../utils/useOptionValidityRefresh.js': { useOptionValidityRefresh: () => 0 },
    '../utils/loadingLocationDraft.js': loadingLocations,
    '../utils/contactRanking.js': contactRanking,
    '../utils/incoterm.js': incoterm,
    '../utils/loadingLocationDisplay.js': loadingLocationDisplay,
    '../utils/salePrice.js': salePrice,
    '../utils/purchaseOrderAttachments.js': purchaseOrderAttachments,
    '../utils/optionPurchaseNavigation.js': { optionPurchaseReturnTo: () => ({ pathname: '/test' }) },
    '../utils/navigation.js': { createReturnTo: () => ({}), navigateToReturn: navigate },
    '../components/FeatureAccess.jsx': { useFeatureAccess: () => ({ userId: 'nsc' }) },
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
    tree = module.exports[exportName](props);
    if (routeState && typeof tree.type === 'function') tree = tree.type(tree.props);
    effects.splice(0).forEach(fn => fn());
  };
  return {
    calls, env, navigations,
    async flush() {
      // Allow promise chains and state updates from API responses to settle.
      for (let i = 0; i < 16; i++) {
        if (dirty) render();
        await new Promise(resolve => setImmediate(resolve));
      }
      assert.equal(dirty, false, 'Component did not settle');
    },
    switchLanguage(lang) { env.lang = lang; dirty = true; },
    updateProps(patch) { props = { ...props, ...patch }; dirty = true; },
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

test('a supplier article opens the offer position with the option quantity and editable sale price', async () => {
  const view = await mount('../src/pages/TempOfferEditor.jsx', {}, async (path) => {
    if (path === '/me') return { userId: 1 };
    if (path === '/temp-offers/customer-defaults/C1') return { data: { customerId: 'C1', customerName: 'Customer', contacts: [], deliveryAddresses: [] } };
    if (path === '/temp-offers/meta') return { data: { payments: [], packagingTypes: [], incoterms: [
      { id: 1, text: 'FCA' }, { id: 2, text: 'CFR' },
    ] } };
    throw new Error(path);
  }, {}, 'default', { customerId: 'C1', supplierArticle: { mandant: '10', sourceSupplierId: 'LF1', articleIndex: 'A', article: 'Grade' } });
  await view.flush();
  const position = view.find(node => node.props?.position?.articleIndex === 'A').props;
  assert.equal(position.defaultExpanded, true);
  assert.equal(position.position.quantity, '24750');
  assert.equal(position.position.price, '');
  assert.equal(position.position.sourceSupplierId, 'LF1');
  assert.equal(view.field('Incoterm').props.value, 2);
  await view.find(node => node.props.onSubmit).props.onSubmit({ preventDefault() {} });
  await view.flush();
  assert.match(view.text(), /Bitte eine Verpackungsart auswählen/);
  assert.equal(view.field('Verpackungsart').props.required, true);
  assert.equal(view.field('Verpackungsart').props.error, true);
  assert.equal(view.find(node => node.props?.position?.articleIndex === 'A').props.fieldErrors.price, true);
  assert.equal(view.find(node => node.props?.position?.articleIndex === 'A').props.fieldErrors.quantity, false);
  assert.equal(view.calls.some(call => call.path === '/temp-offers'), false);
});

const renderPurchaseDetails = ({ supplierField, purchaseControls, article }) => [
  supplierField, purchaseControls, { type: 'Details', props: { article } },
];

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
  view.find(node => node.type === 'IconButton' && node.props['aria-label'] === 'Artikel suchen').props.onClick();
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
  assert.equal(view.find(node => node.type === 'Details').props.article, article);
});

test('supplier search fills an empty proposal list and passes the chosen supplier to ordering', async () => {
  const supplier = { id: 'LF1', name: 'Longfield Chemicals', selectable: true };
  const article = { articleIndex: 'A', articleName: 'Article A' };
  let customerOrder;
  const view = await mount('../src/components/OptionPurchaseControls.jsx', {
    enabled: true, offer: { id: 1 }, position: { id: 10 }, renderDetails: renderPurchaseDetails,
    onCustomerOrder: (...args) => { customerOrder = args; },
  }, async path => {
    if (path.endsWith('/suppliers?q=&supplierId=')) return { data: [] };
    if (path.endsWith('/suppliers?q=Longfield')) return { data: [supplier] };
    if (path.endsWith('/articles?q=')) return { data: [article] };
    throw new Error(path);
  });
  await view.flush();
  const order = () => view.find(node => node.type === 'Button' && node.props.children.includes('Bestellen'));
  assert.equal(order().props.disabled, true);
  view.find(node => node.type === 'IconButton' && node.props['aria-label'] === 'Lieferanten durchsuchen').props.onClick();
  await view.flush();
  const searchField = () => view.find(node => node.type === 'Autocomplete' && node.props.openOnFocus);
  searchField().props.onInputChange(null, 'Longfield', 'input');
  await view.flush();
  await new Promise(resolve => setTimeout(resolve, 275));
  await view.flush();
  assert.deepEqual(searchField().props.options, [supplier]);
  searchField().props.onChange(null, supplier);
  await view.flush();
  assert.equal(order().props.disabled, false);
  view.find(node => node.type === 'Button' && node.props.children.includes('Auftrag')).props.onClick();
  assert.deepEqual(customerOrder, [article, supplier]);
  order().props.onClick();
  await view.flush();
  const dialog = view.find(node => node.props?.supplier && node.props?.onClose);
  assert.equal(dialog.props.supplier, supplier);
  assert.equal(dialog.props.supplierEditable, false);
});

test('the purchase-first editor saves the fixed option line and opens the customer order with only line data', async () => {
  const clientRequestId = '35f27c04-0b5f-4367-9f79-2ec0259a5331';
  const supplier = { id: 'LF1', name: 'Supplier' };
  const view = await mount('../src/pages/OptionOrderPurchase.jsx', {}, async (path, _lang, request) => {
    if (path.endsWith('/suppliers?q=')) return { data: [supplier], meta: {
      packagingTypes: choices('de'), remainingKg: 24750, sourcePackaging: 'Bags and/or Bulk',
      sourcePackagingDisplay: { de: 'Sackware und/oder Siloware', en: 'Bags and/or Silo/bulk' },
    } };
    assert.equal(path, '/temp-purchase-orders');
    assert.equal(request.body.get('clientRequestId'), clientRequestId);
    assert.equal(request.body.get('reserveOrderPosition'), 'true');
    assert.equal(request.body.get('supplierId'), supplier.id);
    assert.equal(JSON.parse(request.body.get('positions'))[0].articleIndex, 'A1');
    return { data: { id: 27, clientRequestId, packagingType: 'Sackware', packagingTypeId: 78, currency: 'USD',
      supplierId: supplier.id, deliveryTermId: 2, loadingLocationText: 'Supplier pickup', paymentConditionId: 10,
      positions: [{ id: 38, orderPositionId: 77, optionId: 1, optionPositionId: 10, articleIndex: 'A1', amount: 12000, purchasePrice: 1755 }],
    } };
  }, { id: '1', positionId: '10' }, 'default', {
    mandant: '10', clientRequestId, incoterm: 'FCA', loadingLocation: 'Supplier pickup',
    procurementOption: { optionId: 1, optionPositionId: 10, articleIndex: 'A1', article: 'Grade', optionSupplier: supplier, costPrice: 1755 },
  });
  await view.flush();
  assert.match(view.text(), /Artikel nicht auf VL/);
  const editor = view.find((node) => node.props.fixedPosition && node.props.onSave);
  const { initialOrder } = editor.props;
  assert.equal(initialOrder.positions.length, 1);
  assert.equal(initialOrder.positions[0].amount, 24750);
  assert.equal(initialOrder.positions[0].originalPackagingType, 'Sackware und/oder Siloware');
  await editor.props.onSave({ ...initialOrder, positions: [{ ...initialOrder.positions[0], amount: 12000 }] });
  await view.flush();
  const [{ path, options }] = view.navigations;
  assert.equal(path, '/temp-orders/new');
  assert.deepEqual(options.state.procurementOption, {
    optionId: 1, optionPositionId: 10, savedPurchaseId: 27, savedPurchasePositionId: 38, purchaseRequestId: clientRequestId,
    articleIndex: 'A1', article: 'Grade', amountInKg: 12000, price: '', costPrice: null, purchaseCurrency: 'USD',
    originalPackagingType: 'Sackware', originalPackagingTypeId: 78,
  });
});

test('offer conversion opens purchasing only for shortages and returns to the prepared customer order', async () => {
  const returnTo = { pathname: '/temp-offers/25' };
  const version = '0x0000000000000001';
  const stocked = { offerPositionId: 1, articleIndex: 'A', amountInKg: 10000, requiresPurchase: false, beNumber: 'BE1' };
  const shortage = { offerPositionId: 2, articleIndex: 'B', amountInKg: 20000, requiresPurchase: true, candidates: [] };
  const data = { version, clientReferenceId: 'C1', positions: [stocked, shortage] };
  const request = async (path) => {
    assert.equal(path, '/temp-offers/25/order-draft?preparePurchases=1');
    return { data };
  };
  const path = '../src/pages/OfferOrderPurchase.jsx';
  const params = { offerSourceId: '25' };
  const start = await mount(path, {}, request, params, 'OfferOrderStart', { returnTo });
  await start.flush();
  const [paymentNavigation] = start.navigations;
  assert.equal(paymentNavigation.path, '/temp-offers/25/order-purchase');
  assert.deepEqual(paymentNavigation.options.state.positions, [shortage]);
  const purchase = await mount(path, {}, request, params, 'OfferOrderPurchase', paymentNavigation.options.state);
  await purchase.flush();
  const editor = purchase.find((node) => node.props.onPurchaseSaved);
  assert.equal(editor.props.offerPosition, shortage);
  const saved = { savedPurchasePositionId: 38, savedPurchaseId: 27, purchaseRequestId: editor.props.state.clientRequestId };
  editor.props.onPurchaseSaved(saved);
  const [next] = purchase.navigations;
  const finish = await mount(path, {}, request, params, 'OfferOrderPurchase', next.options.state);
  await finish.flush();
  const customerOrder = finish.find((node) => node.props.to === '/temp-offers/25/order/new');
  const resumed = await mount(path, {}, request, params, 'OfferOrderStart', customerOrder.props.state);
  await resumed.flush();
  const form = resumed.find((node) => node.props.preparedOfferOrder);
  assert.equal(form.props.preparedOfferOrder.clientReferenceId, 'C1');
  assert.deepEqual(form.props.preparedOfferOrder.positions, [
    { ...stocked, savedPurchase: null },
    { ...shortage, savedPurchase: saved },
  ]);
});

test('a direct order uses the same purchase editor and sends only after the reserved ID is saved', async () => {
  const clientRequestId = '4f5f5b80-08de-4039-b3cb-08f01999ae52';
  const line = { articleIndex: 'A1', article: 'Grade', amountInKg: 15000, optionSupplier: { id: 'LF1', name: 'Supplier' } };
  const lot = { key: 'lot', beNumber: 'BE1', warehouseId: 'L1', available: 5000 };
  let returned;
  const view = await mount('../src/pages/OptionOrderPurchase.jsx', {
    state: { clientRequestId, procurementOption: line }, directPosition: line, stockLots: [lot],
    onPurchaseSaved: value => { returned = value; }, onBack() {},
  }, async (path, _lang, request) => {
    if (path === '/temp-purchase-orders/27/finalize') {
      return { data: { status: 1, csMail: { queued: true } } };
    }
    assert.equal(path, '/temp-purchase-orders');
    assert.equal(request.body.get('reserveOrderPosition'), 'true');
    return { data: { id: 27, clientRequestId, currency: 'EUR',
      positions: [{ id: 38, orderPositionId: 77, articleIndex: 'A1', amount: 10000, purchasePrice: 900 }] } };
  }, {}, 'PurchaseForOrder');
  await view.flush();
  const editor = view.find(node => node.props.fixedPosition && node.props.onSend);
  const values = { ...editor.props.initialOrder, positions: [{ ...editor.props.initialOrder.positions[0], amount: 10000 }] };
  editor.props.onChange(values);
  await view.flush();
  await view.find(node => node.props.fixedPosition && node.props.onSend).props.onSend(values);
  assert.deepEqual(view.calls.map(call => call.path), ['/temp-purchase-orders', '/temp-purchase-orders/27/finalize']);
  assert.equal(returned.savedPurchasePositionId, 38);
  assert.equal(returned.savedPurchaseAmount, 10000);
  assert.deepEqual(returned.savedPurchaseStock, lot);
});

test('a regular offer line retries BMS handoff for the same saved purchase before opening the order', async () => {
  const line = { offerPositionId: 7, articleIndex: 'A1', article: 'Grade', amountInKg: 12000, candidates: [] };
  const clientRequestId = '35f27c04-0b5f-4367-9f79-2ec0259a5331';
  let saved;
  let creates = 0;
  let handoffs = 0;
  const view = await mount('../src/pages/OptionOrderPurchase.jsx', {
    state: { procurementOption: line, clientRequestId }, offerPosition: line, onPurchaseSaved: (value) => { saved = value; },
  }, async (path, _lang, request) => {
    if (path.startsWith('/customers?')) {
      assert.equal(new URLSearchParams(path.split('?')[1]).get('supplierOnly'), '1');
      return { data: [{ kd_KdNR: 'LF1', kd_Name1: 'Supplier' }] };
    }
    if (path === '/temp-purchase-orders/27/finalize') {
      handoffs += 1;
      return { data: { status: 1, csMail: { queued: handoffs > 1 } } };
    }
    assert.equal(path, '/temp-purchase-orders');
    creates += 1;
    const [position] = JSON.parse(request.body.get('positions'));
    assert.equal(position.optionPositionId, undefined);
    assert.equal(position.amount, 12000);
    return { data: { id: 27, clientRequestId, positions: [{ id: 38, orderPositionId: 77, articleIndex: 'A1', amount: 12000, purchasePrice: 1700 }] } };
  }, {}, 'PurchaseForOrder');
  await view.flush();
  const finder = () => view.find((node) => node.type === 'Autocomplete' && node.props.openOnFocus);
  assert.match(view.text(), /Lieferant nicht eindeutig/);
  finder().props.onInputChange(null, 'Supplier', 'input');
  await view.flush();
  await new Promise((resolve) => setTimeout(resolve, 275));
  await view.flush();
  finder().props.onChange(null, finder().props.options[0]);
  await view.flush();
  const editor = view.find((node) => node.props.fixedQuantity && node.props.onSave);
  assert.equal(editor.props.supplierSelection.props.value.id, 'LF1');
  assert.equal(editor.props.initialOrder.supplierName, 'Supplier');
  assert.doesNotMatch(view.text(), /Lieferant nicht eindeutig/);
  await editor.props.onSend(editor.props.initialOrder);
  await view.flush();
  assert.equal(saved, undefined);
  assert.match(view.text(), /Bestellung 27 wurde gespeichert/);
  const lockedEditor = view.find((node) => node.props.savedForHandoff);
  await lockedEditor.props.onSend(lockedEditor.props.initialOrder);
  assert.equal(saved.savedPurchasePositionId, 38);
  assert.equal(creates, 1);
  assert.equal(handoffs, 2);
  assert.equal(view.navigations.length, 0);
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
    assert.equal(view.find(node => node.type === 'Details').props.article, article);
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

    const articleField = () => view.find(node => node.type === 'Autocomplete' && node.props.getOptionDisabled);
    articleField().props.onChange(null, alternative);
    await view.flush();
    assert.equal(view.find(node => node.type === 'Details').props.article, alternative);
  }
});

test('the preselected article can be confirmed immediately and is kept for ordering', async () => {
  const position = { id: 10, articleName: 'Supplier grade', matchedArticle: null };
  const proposal = { articleIndex: 'OTHER', articleName: 'Other proposal' };
  const target = { articleIndex: 'LOCAL-99', articleName: 'Local article' };
  const renderDetails = props => ({ type: 'Details', props: { children: [props.purchaseControls] } });
  const view = await mount('../src/components/OptionPurchaseControls.jsx', {
    enabled: true, offer: { id: 1 }, position, renderDetails,
    onArticleConfirmed: (matchedArticle, articleConfirmationIndex) => view.updateProps({ position: { ...position, matchedArticle, articleConfirmationIndex } }),
  }, async (path, _lang, options) => {
    if (path.includes('/suppliers?')) return { data: [{ id: 'SUP', name: 'Supplier' }] };
    if (path.includes('/articles?')) return { data: [target, proposal] };
    assert.match(path, /\/article-confirmation$/);
    assert.equal(options.method, 'POST');
    const { confirmed } = JSON.parse(options.body);
    assert.deepEqual(JSON.parse(options.body), { confirmed, articleIndex: 'LOCAL-99', optionArticleName: 'Supplier grade' });
    return { data: confirmed ? target : null };
  });
  await view.flush();
  assert.equal(view.find(node => node.type === 'Autocomplete' && node.props.getOptionDisabled).props.value, target);
  const checkbox = () => view.find(node => node.type === 'FormControlLabel' && node.props.label === 'Hiermit committe ich den Artikel').props.control.props;
  assert.equal(checkbox().checked, false);
  assert.equal(view.calls.some(call => call.path.endsWith('/article-confirmation')), false);
  await checkbox().onChange(null, true);
  await view.flush();
  assert.throws(() => view.find(node => node.type === 'Autocomplete'), /Expected element not found/);
  assert.equal(checkbox().checked, true);
  assert.doesNotMatch(view.text(), /Artikel suchen/);
  view.find(node => node.type === 'Button' && node.props.children.includes('Bestellen')).props.onClick();
  await view.flush();
  assert.deepEqual(view.find(node => node.props?.supplierEditable).props.article, target);
  await checkbox().onChange(null, false);
  await view.flush();
  assert.equal(checkbox().checked, false);
  assert.equal(view.find(node => node.type === 'Autocomplete' && node.props.getOptionDisabled).props.value, target);

  const detail = await mount('../src/pages/OptionDetail.jsx', {
    offer: { id: 1, positions: [] }, position: { ...position, matchedArticle: target },
  }, async () => assert.fail('The resolved article is already present in the detail response'), {}, 'OptionPositionDetails');
  await detail.flush();
  assert.ok(detail.find(node => node.props?.titleAccess === 'Passender Artikel gefunden'));
  assert.ok(detail.find(node => node.props?.variant === 'caption' && node.props.children.includes('Local article')));
});

test('option details reload customers for the selected article and discard late results', async () => {
  const endpoint = '/options/1/positions/10/offer-customers';
  const responseFor = index => ({ data: { article: { index }, matched: false, customers: [{ id: index }] } });
  let resolvePrevious, previousSignal;
  const view = await mount('../src/pages/OptionDetail.jsx', {
    offer: { id: 1, positions: [] }, position: { id: 10 }, audienceEndpoint: endpoint, audienceKey: 'position-10', articleIndex: 'A',
  }, async (path, _lang, options) => {
    const index = new URL(path, 'http://localhost').searchParams.get('articleIndex');
    if (index === 'B') {
      previousSignal = options.signal;
      return new Promise(resolve => { resolvePrevious = resolve; });
    }
    return responseFor(index);
  }, {}, 'OptionPositionDetails');
  const audience = () => view.find(node => Array.isArray(node.props?.customers)).props;
  await view.flush();
  assert.deepEqual(audience().customers, [{ id: 'A' }]);
  assert.throws(() => view.find(node => node.props?.titleAccess), /Expected element not found/);

  view.updateProps({ articleIndex: 'B' });
  await view.flush();
  assert.equal(audience().loading, true);
  assert.deepEqual(audience().customers, []);

  view.updateProps({ articleIndex: 'C+2' });
  await view.flush();
  assert.equal(previousSignal.aborted, true);
  assert.deepEqual(audience().customers, [{ id: 'C+2' }]);
  assert.equal(audience().query, '?articleIndex=C%2B2');

  resolvePrevious(responseFor('B'));
  await view.flush();
  assert.deepEqual(audience().customers, [{ id: 'C+2' }]);
});

test('option details use one list and retain offers while the selected article changes', async () => {
  const recorded = [{ id: 'A', offerStatus: 4 }, { id: 'B', offerStatus: 5 }, { id: 'C', sent: true }];
  let loadNewArticle;
  const newArticle = new Promise(resolve => { loadNewArticle = resolve; });
  const view = await mount('../src/pages/OptionDetail.jsx', {
    offer: { id: 1, positions: [] }, position: { id: 10 },
    audienceEndpoint: '/options/1/positions/10/offer-customers', audienceKey: 'position-10',
  }, async path => path.includes('articleIndex') ? newArticle : { data: { article: null, customers: recorded } }, {}, 'OptionPositionDetails');
  const customers = () => view.find(node => Array.isArray(node.props?.customers)).props.customers;
  await view.flush();
  assert.deepEqual(customers(), recorded);
  view.updateProps({ articleIndex: 'D' });
  await view.flush();
  assert.deepEqual(customers(), recorded);
  loadNewArticle({ data: { article: { index: 'D' }, customers: [...recorded, { id: 'D' }] } });
  await view.flush();
  assert.deepEqual(customers(), [...recorded, { id: 'D' }]);
});

test('the offer ID opens details while PDF is pending and the same link opens the ready PDF', async () => {
  const returnTo = { pathname: '/options/1/positions/10' };
  const pdf = new Blob(['%PDF'], { type: 'application/pdf' });
  let pdfReady = false;
  const view = await mount('../src/components/OptionOfferCustomers.jsx', {
    returnTo,
    customers: [{ id: 'A', name: 'Open', offerId: 101, queued: true, assignments: [{ salesCode: 'RRÖ', mandant: 'FRU' }] },
      { id: 'B', name: 'Restricted', offerStatus: 5 }],
  }, async path => {
    assert.equal(path, '/temp-offers/101/pdf');
    if (!pdfReady) throw Object.assign(new Error('Waiting for PDF'), { code: 'OFFER_PDF_NOT_READY' });
    return pdf;
  });
  await view.flush();
  const link = view.find(node => node.props?.to === '/temp-offers/101');
  assert.deepEqual(link.props.state, { returnTo });
  assert.deepEqual(link.props.children, ['Angebot-101']);
  const linkRow = view.find(node => node.props?.children?.includes(link));
  assert.deepEqual(linkRow.props.children[1].props.children, ['RRÖ(FRU)']);
  assert.throws(() => view.find(node => node.type === 'Checkbox'), /Expected element not found/);
  const click = () => link.props.onClick({ preventDefault() {} });
  await click();
  assert.deepEqual(view.navigations, [{ path: '/temp-offers/101', options: { state: { returnTo } } }]);
  pdfReady = true;
  await click();
  await view.flush();
  assert.equal(view.find(node => node.type === 'LazyPdfDialog').props.pdfBlob, pdf);
  assert.equal(view.navigations.length, 1);
});

test('recorded offers sort with article buyers and remain visible under the sales filter', async () => {
  const view = await mount('../src/components/OptionOfferCustomers.jsx', {
    customers: [{ id: 'Z', name: 'Zeta', salesCode: 'ADM' }, { id: 'B', name: 'Beta', offerId: 11, offerStatus: 4, salesCode: 'TPR' },
      { id: 'A', name: 'Alpha', salesCode: 'ADM' }], salesFilter: { enabled: true },
  }, async () => assert.fail('Unexpected request'));
  await view.flush();
  const list = () => view.find(node => node.props?.component === 'ul').props.children.flat().map(row => row.props.key);
  assert.deepEqual(list(), ['A', 'B', 'Z']);
  view.field('Außendienst').props.onChange({ target: { value: 'ADM' } });
  await view.flush();
  assert.deepEqual(list(), ['A', 'B', 'Z']);
  const beta = view.find(node => node.props?.component === 'li' && node.props.key === 'B');
  const [status, checkbox, label] = beta.props.children[0].props.children;
  assert.equal(status.props.title, 'In einen Auftrag übernommen');
  assert.equal(checkbox, false);
  assert.match(JSON.stringify(label), /Beta/);
});

test('the customer suggestions start with all sales representatives and still support filtering', async () => {
  const view = await mount('../src/components/OptionOfferCustomers.jsx', {
    customers: [{ id: 'A', name: 'Kunde Eins', salesCode: 'ADM' }, { id: 'B', name: 'Kunde Zwei', salesCode: 'AD2',
      assignments: [{ salesCode: 'AD2', mandant: 'FRU' }, { salesCode: 'TPR', mandant: 'POL' }] }],
    salesFilter: { enabled: true, defaultCode: 'ADM' },
  }, async path => { assert.fail(`Unexpected request: ${path}`); });
  const filter = () => view.field('Außendienst').props;
  await view.flush();
  assert.equal(filter().value, '');
  assert.match(view.text(), /Kunde Eins/);
  assert.match(view.text(), /Kunde Zwei/);

  assert.match(view.text(), /AD2\(FRU\) TPR\(POL\)/);
  filter().onChange({ target: { value: 'TPR' } });
  await view.flush();
  assert.equal(filter().value, 'TPR');
  assert.doesNotMatch(view.text(), /Kunde Eins/);
  assert.match(view.text(), /Kunde Zwei/);

  filter().onChange({ target: { value: '' } });
  await view.flush();
  assert.equal(filter().value, '');
  assert.match(view.text(), /Kunde Eins/);
  assert.match(view.text(), /Kunde Zwei/);
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

test('the purchase editor replaces the copy icon with truck planning and recalculates edited quantities', async () => {
  const position = { lineId: 'one', articleIndex: 'A', article: 'Grade', amount: 1400000, amountTouched: true, purchasePrice: 1100 };
  let current;
  const view = await mount('../src/components/PurchaseOrderEditor.jsx', {
    initialOrder: { supplierId: 'LF', packagingTypeId: 78, packagingType: 'Sackware', positions: [position] },
    onChange: order => { current = order; }, isNew: true,
  }, async path => {
    if (path.startsWith('/purchase-order-options')) return { data: { packagingTypes: choices('de'), incoterms: [], defaults: {} } };
    if (path.endsWith('/purchase-defaults')) return { data: { defaults: {} } };
    if (path === '/temp-orders/payment-texts') return { data: [] };
    throw new Error(path);
  });
  await view.flush();
  const summary = () => view.find(node => node.props?.truckCount != null).props;
  assert.doesNotMatch(view.text(), /Position kopieren/);
  assert.equal(summary().truckCount, 57);
  summary().onSplit();
  await view.flush();
  assert.equal(current.positions.length, 57);
  assert.equal(summary().splitDisabled, true);
  view.field('Verpackungsart').props.onChange({ target: { value: 79 } });
  await view.flush();
  assert.equal(summary().truckCount, 56);
  assert.equal(current.positions.length, 57);
  summary().onSplit();
  await view.flush();
  assert.equal(current.positions.length, 56);
  assert.equal(current.positions.at(-1).amount, 25000);
  view.field('Menge (kg)').props.onChange({ target: { value: '26000' } });
  await view.flush();
  assert.equal(summary().truckCount, 57);
  assert.equal(summary().splitDisabled, false);
});

test('a purchase pickup loads its supplier addresses and selects a unique technical ID', async () => {
  let order = { supplierId: 'LF', warehouseId: 'LG0000', deliveryTermId: 1, deliveryTermText: 'FCA' };
  const editor = await mount('../src/components/PurchaseOrderDeliveryFields.jsx', {
    warehouses: [{ id: 'LG0000', label: 'Strecke', isDirect: true, owners: [] }],
    order, update: (apply) => {
      order = apply(order);
      editor.updateProps({ order });
    },
  }, async (path) => {
    const query = new URLSearchParams(path.split('?')[1]);
    assert.equal(query.get('combined'), '1');
    assert.equal(query.get('selectedWarehouseId'), 'LG0000');
    return { data: [{ id: '39', addressId: 39, addressCustomerId: 'LF', warehouseId: 'LG0000', text: 'Stammadresse' }] };
  });
  await editor.flush();
  const selectedKey = JSON.stringify(['LG0000', 'LF', '39']);
  assert.equal(editor.field('Ladeort').props.value, selectedKey);
  assert.equal(order.addressCustomerId, 'LF');
  assert.equal(order.warehouseId, 'LG0000');
  assert.equal(order.addressId, 39);
  assert.equal(order.loadingLocationText, 'Stammadresse');
  const addressOption = editor.find(node => node.type === 'MenuItem' && node.props.value === selectedKey);
  assert.equal(addressOption.props.children[0].props.primary, 'Stammadresse');
  assert.equal(editor.field('Ladeort').props.SelectProps.renderValue().props.primary, 'Stammadresse');
  assert.doesNotMatch(editor.text(), /Adresse anzeigen|Adresse ausblenden/);
});

test('purchase contact dropdown displays the name while retaining the technical contact ID', async () => {
  const contact = { id: 8117, name: 'Mr. Amaury De Coninck', position: 'Geschäftsführer' };
  let changed;
  const view = await mount('../src/components/PurchaseOrderEditor.jsx', {
    initialOrder: { supplierId: 'LF', supplierContactId: contact.id, paymentConditionText: '30 Tage', positions: [] },
    onChange: order => { changed = order; },
  }, async path => {
    if (path.startsWith('/purchase-order-options')) {
      return { data: { packagingTypes: [], incoterms: [], warehouses: [], defaults: { contacts: [contact] } } };
    }
    throw new Error(path);
  });
  await view.flush();
  const dropdown = view.find(node => node.props.getOptionLabel && node.props.options?.[0]?.id === contact.id);
  assert.equal(dropdown.props.getOptionLabel(contact), contact.name);
  const rendered = dropdown.props.renderOption({}, contact);
  const role = rendered.props.children[0].props.children[1];
  assert.equal(role.props.variant, 'caption');
  assert.equal(role.props.color, 'text.secondary');
  assert.deepEqual(role.props.children, ['Geschäftsführer']);
  assert.equal(dropdown.props.value.id, 8117);
  dropdown.props.onChange(null, contact);
  await view.flush();
  assert.equal(changed.supplierContactId, 8117);
  assert.equal(changed.supplierContact, contact.name);
});

test('a saved direct customer delivery keeps its hidden warehouse and address mapping', async () => {
  let order = { supplierId: 'LF', warehouseId: 'LG0000', deliveryTermId: 2, deliveryTermText: 'DAP',
    addressCustomerId: 'C1', addressId: 39, loadingLocationText: 'Customer, Street 1, 12345 Town' };
  const view = await mount('../src/components/PurchaseOrderDeliveryFields.jsx', {
    warehouses: [{ id: 'LG0000', isDirect: true }], order,
    update: apply => {
      order = typeof apply === 'function' ? apply(order) : { ...order, ...apply };
      view.updateProps({ order });
    },
  }, async path => {
    const query = new URLSearchParams(path.split('?')[1]);
    assert.equal(query.get('addressCustomerId'), 'C1');
    return { data: [{ addressId: 39, addressCustomerId: 'C1', warehouseId: 'LG0000', text: order.loadingLocationText }],
      meta: { canDeliverToCustomer: true } };
  });
  await view.flush();
  assert.equal(order.addressId, 39);
  assert.equal(order.warehouseId, 'LG0000');
  assert.equal(view.field('Ladeort').props.SelectProps.renderValue().props.primary, 'Customer');
});

test('the loading location dialog still supports entering an optional offer loading location', async () => {
  const address = { name: 'Supplier', street: 'Plant 1', postalCode: '01234', city: 'Werkstadt', countryCode: 'D' };
  const dialog = await mount('../src/components/LoadingLocationDialog.jsx', { initialAddress: address }, async (path) => {
    assert.equal(path, '/delivery-address-country-types');
    return { data: [{ id: 'D', isoAlpha2: 'DE', name: 'Deutschland' }, { id: 'B', isoAlpha2: 'BE', name: 'Belgien' }] };
  });
  await dialog.flush();
  assert.equal(dialog.field('Firma / Lager').props.value, address.name);
  assert.equal(dialog.field('Straße + Hausnummer').props.value, address.street);
  assert.equal(dialog.field('PLZ').props.value, address.postalCode);
  assert.equal(dialog.field('Ort').props.value, address.city);
  assert.equal(dialog.field('Land').props.value, 'D');
  dialog.field('Land').props.onChange({ target: { value: 'B' } });
  dialog.switchLanguage('en');
  await dialog.flush();
  assert.equal(dialog.field('Country').props.value, 'B');
});

test('a server-rejected non-working delivery date marks the matching field until corrected', async () => {
  const initialOrder = {
    supplierId: 'LF', packagingTypeId: 78, packagingType: 'Sackware', deliveryTermId: 1,
    warehouseId: 'LG0000', addressCustomerId: 'LF', addressId: 39,
    loadingLocationText: 'Warehouse', paymentConditionText: '30 Tage',
    positions: ['2026-11-28', '2026-11-30'].map((requestedDeliveryDate, index) => ({
      lineId: String(index), optionId: 1, articleIndex: 'A', article: 'Grade', amount: 1000, purchasePrice: 50,
      requestedDeliveryDate,
    })),
  };
  const view = await mount('../src/components/PurchaseOrderEditor.jsx', {
    initialOrder,
    onSave: async () => ({
      code: 'PURCHASE_DELIVERY_DATE_NON_WORKING',
      payload: { error: { details: { date: '2026-11-28' } } },
    }),
  }, async (path) => {
    if (path.startsWith('/purchase-order-options')) return { data: { packagingTypes: choices('de'), incoterms: [{ id: 1, text: 'FCA' }], defaults: {} } };
    if (path.startsWith('/purchase-order-loading-locations')) return { data: [] };
    throw new Error(path);
  });
  const dateField = (date) => view.find((node) => node.props.type === 'date' && node.props.value === date);
  await view.flush();
  await view.find((node) => node.type === 'Button' && node.props.children.includes('Speichern')).props.onClick();
  await view.flush();
  assert.equal(dateField('2026-11-28').props.error, true);
  assert.equal(dateField('2026-11-30').props.error, false);
  dateField('2026-11-28').props.onChange({ target: { value: '2026-12-01' } });
  await view.flush();
  assert.equal(dateField('2026-12-01').props.error, false);
});

test('the purchase editor offers standard payment terms if no supplier default is available', async () => {
  const initialOrder = { supplierId: 'LF', positions: [{ lineId: 'one', optionId: 1, articleIndex: 'A' }] };
  let updated;
  const view = await mount('../src/components/PurchaseOrderEditor.jsx', {
    initialOrder, isNew: true, onChange: (order) => { updated = order; },
  }, async (path, lang) => {
    if (path.startsWith('/purchase-order-options')) return { data: { packagingTypes: choices(lang), incoterms: [], defaults: {} } };
    if (path.startsWith('/purchase-order-loading-locations')) return { data: [] };
    if (path === '/temp-orders/payment-texts') return { data: [{ id: 19, text: lang === 'en' ? 'Net 14 days' : '14 Tage netto' }] };
    throw new Error(path);
  });
  await view.flush();
  const field = view.field('Zahlungsziel');
  assert.equal(field.props.select, true);
  assert.equal(field.props.disabled, false);
  field.props.onChange({ target: { value: '19' } });
  view.switchLanguage('en');
  await view.flush();
  assert.equal(view.field('Payment terms').props.value, 19);
  assert.equal(updated.paymentConditionId, 19);
  assert.equal(updated.paymentConditionChanged, true);
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
