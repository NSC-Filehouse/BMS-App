const test = require('node:test');
const assert = require('node:assert/strict');
const planning = require('../src/db/temp-order-planning');

let order;
let savedPositions;
let writes;
let nextId = 42;
let pickupReads;
let sourcePackagingType;
let sourcePackagingError;
let sourceOffer;
let sourceOfferPositions;
let rejectBacklink;
let purchases;
let procurementEnabled;
let failPurchase;
const positionColumns = ['tap_id', 'tap_ta_id', 'tap_line_no', 'tap_be_number', 'tap_Artikelindex', 'tap_article', 'tap_Artikelname_Original',
  'tap_Artikelname_Gewechselt', 'tap_amount_in_kg', 'tap_warehouse', 'tap_price', 'tap_ep', 'tap_delivery_date', 'tap_ValutaDatum',
  'tap_about', 'tap_mfi', 'tap_wpz_id', 'tap_wpz_original', 'tap_wpz_comment', 'tap_Verpackungsart', 'tap_Verpackungsart_id',
  'tap_Verpackungsart_Gewechselt', 'tap_CreatedBy', 'tap_CreateDate'];
const orderColumns = ['ta_id', 'ta_company_id', 'ta_ClientReferenceId', 'ta_KundenAuftragsnummer', 'ta_client_name', 'ta_client_address',
  'ta_client_representative', 'ta_client_representative_id', 'ta_comment', 'ta_special_payment_condition', 'ta_special_payment_text',
  'ta_special_payment_id', 'ta_delivery_type_id', 'ta_delivery_type', 'ta_packaging_type', 'ta_packaging_type_id', 'ta_delivery_address',
  'ta_delivery_address_id', 'ta_delivery_address_changed', 'ta_completed', 'ta_Status', 'ta_CreatedBy', 'ta_CreateDate', 'ta_LastModifiedBy', 'ta_LastModifiedDate'];

function reset() {
  order = null; savedPositions = []; writes = []; pickupReads = 0;
  sourcePackagingType = 'Sackware'; sourcePackagingError = false;
  sourceOffer = null; sourceOfferPositions = []; rejectBacklink = false;
  purchases = []; procurementEnabled = false; failPurchase = false;
}
function insertFields(sql, params) {
  const columns = sql.match(/INSERT INTO[^\n]+\(([\s\S]*?)\)\s*(?:OUTPUT|VALUES)/i)[1];
  return Object.fromEntries([...columns.matchAll(/\[([^\]]+)\]/g)].map((match, index) => [match[1], params[index]]));
}
function updateFields(sql, params) {
  return Object.fromEntries([...sql.split(/\bWHERE\b/i)[0].matchAll(/\[([^\]]+)\]\s*=\s*\?/g)].map((match, index) => [match[1], params[index]]));
}
function mappedPosition(row) {
  return {
    id: row.tap_id, lineNo: row.tap_line_no, beNumber: row.tap_be_number, articleIndex: row.tap_Artikelindex,
    article: row.tap_article, articleOriginal: row.tap_Artikelname_Original, articleChanged: row.tap_Artikelname_Gewechselt,
    amountInKg: row.tap_amount_in_kg, price: row.tap_price, costPrice: row.tap_ep,
    warehouse: row.tap_warehouse, warehouseId: row.tap_warehouse, deliveryDate: row.tap_delivery_date, valutaDate: row.tap_ValutaDatum,
    originalPackagingType: row.tap_Verpackungsart, originalPackagingTypeId: row.tap_Verpackungsart_id,
    about: row.tap_about, mfi: row.tap_mfi, createdBy: row.tap_CreatedBy, createdAt: row.tap_CreateDate,
    offerPositionId: row.tap_offer_position_id, purchasePositionId: row.tap_purchase_position_id, orderCustomerId: order?.ta_ClientReferenceId,
  };
}
async function sqlQuery(database, sql, params = []) {
  if (sql.includes('COL_LENGTH')) return [{ ready: Number(sql.includes('ta_procurement_notified_at') ? procurementEnabled : Boolean(sourceOffer)) }];
  if (sql.includes('SET ta_procurement_request_id=?')) {
    order.ta_procurement_request_id = params[0];
    return [];
  }
  if (sql.includes('WHERE ta_company_id=? AND ta_CreatedBy=? AND ta_procurement_request_id=?')) {
    return order?.ta_procurement_request_id === params[2] ? [order] : [];
  }
  if (sql.includes('SET tbp_order_position_id=?')) {
    purchases.find((purchase) => purchase.positionId === params[1]).orderPositionId = params[0];
    return [];
  }
  if (sql.includes('linkedOrderPositionId') && sql.includes('b.tb_client_request_id=?')) {
    return purchases.filter((purchase) => purchase.positionId === params[0] && purchase.companyId === params[1]
      && purchase.owner === params[2] && purchase.requestId === params[3]).map((purchase) => ({
      ...purchase, id: purchase.positionId, linkedOrderPositionId: purchase.orderPositionId,
    }));
  }
  if (sql.includes('AS savedSeparately')) {
    return purchases.filter((purchase) => savedPositions.some((position) => position.tap_id === purchase.orderPositionId
      && position.tap_ta_id === params[0])).map((purchase) => ({
      id: purchase.id, status: purchase.status,
      savedSeparately: sql.includes('TRY_CONVERT') && purchase.requestId === order.ta_procurement_request_id,
    }));
  }
  if (sql.includes('UPDATE pp SET tbp_order_position_id=NULL')) {
    for (const purchase of purchases) purchase.orderPositionId = null;
    return [];
  }
  if (sql.includes('DELETE FROM') && sql.includes('tb_status=0')) {
    purchases = purchases.filter((purchase) => purchase.id !== params[0]);
    return [];
  }
  if (sql.includes('tbp_bms_position_id AS bmsPositionId')) {
    return purchases.filter((purchase) => savedPositions.some((position) => position.tap_id === purchase.orderPositionId
      && position.tap_ta_id === params[0])).map((purchase) => ({
      purchaseStatus: purchase.status, purchaseId: purchase.id, beNumber: '', warehouseId: '',
    }));
  }
  if (sql.includes('UPDATE offer SET tag_status=4')) {
    assert.deepEqual(params, ['NSC', sourceOffer.id, 3]);
    if (sourceOfferPositions.every((row) => row.orderPositionId)) sourceOffer.status = 4;
    return [];
  }
  if (sql.includes('FROM [BMSApp].[tbl_Temp_Angebot]')) {
    return sourceOffer?.id === params[0] && params[1] === 3 && params[2] === 'NSC' ? [sourceOffer] : [];
  }
  if (sql.includes('FROM [BMSApp].[tbl_Temp_Ang_Position]')) {
    if (sql.includes('UPDATE p SET')) {
      const removeIds = savedPositions.filter((row) => row.tap_ta_id === params[0] && !params.slice(1).includes(row.tap_id))
        .map((row) => row.tap_id);
      for (const row of sourceOfferPositions) {
        if (removeIds.includes(row.orderPositionId)) row.orderPositionId = null;
      }
      return [];
    }
    if (sql.includes('IS NOT NULL')) return sourceOfferPositions.filter((row) => row.orderPositionId);
    return sourceOfferPositions;
  }
  if (sql.includes('UPDATE [BMSApp].[tbl_Temp_Ang_Position]')) {
    const row = sourceOfferPositions.find((position) => position.id === params[1]);
    if (rejectBacklink || !row || row.orderPositionId) return [];
    row.orderPositionId = params[0];
    return [{ id: row.id }];
  }
  if (sql.includes('sp_getapplock')) return [{ lockResult: 0 }];
  if (sql.includes('[INFORMATION_SCHEMA].[COLUMNS]')) return (params[1] === 'tbl_Temp_Auftrag'
    ? [...orderColumns, ...(procurementEnabled ? ['ta_procurement_request_id'] : [])]
    : [...positionColumns, ...(sourceOffer ? ['tap_offer_position_id'] : []),
      ...(procurementEnabled ? ['tap_purchase_position_id'] : [])]).map(col => ({ col }));
  if (sql.includes('[spT_ID]')) return params.length === 5 && params[0] === 'big bags'
    ? [{ id: 2, text: 'Big Bags' }] : [{ id: 1, text: 'Sackware' }];
  if (sql.includes('[tblZahltext_Sprachen]')) return [{ id: 1, text: '30 Tage' }];
  if (sql.includes('INSERT INTO') && sql.includes('[tbl_Temp_Auftrag]')) {
    writes.push(sql); order = { ...insertFields(sql, params), ta_id: nextId++ }; return [order];
  }
  if (sql.includes('INSERT INTO') && sql.includes('[tbl_Temp_Auf_Position]')) {
    writes.push(sql);
    const row = { ...insertFields(sql, params), tap_id: savedPositions.length + 1 };
    savedPositions.push(row);
    return sql.includes('OUTPUT INSERTED.tap_id') ? [{ id: row.tap_id }] : [];
  }
  if (sql.includes('UPDATE') && sql.includes('[tbl_Temp_Auftrag]')) { writes.push(sql); Object.assign(order, updateFields(sql, params)); return []; }
  if (sql.includes('UPDATE') && sql.includes('[tbl_Temp_Auf_Position]')) {
    writes.push(sql);
    if (sql.includes('WHERE tap_id=? AND tap_ta_id=?')) {
      const reserved = savedPositions.find(row => row.tap_id === params.at(-2) && row.tap_ta_id === params.at(-1));
      if (!reserved) return [];
      Object.assign(reserved, updateFields(sql, params));
      return [{ id: reserved.tap_id }];
    }
    Object.assign(savedPositions[0], updateFields(sql, params)); return [];
  }
  if (sql.includes('DELETE FROM') && sql.includes('[tbl_Temp_Auf_Position]')) {
    savedPositions = savedPositions.filter((row) => row.tap_ta_id !== params[0] || params.slice(1).includes(row.tap_id));
    return [];
  }
  if (sql.includes('DELETE FROM') && sql.includes('[tbl_Temp_Auftrag]')) {
    if (sql.includes('ta_Status=-1')) {
      const reserved = purchases.find(item => item.reservedOrderId === params[0]);
      if (reserved) reserved.reservedOrderId = null;
      return [];
    }
    order = null; return [];
  }
  if (sql.includes('FROM') && sql.includes('[tbl_Temp_Auf_Position]')) return savedPositions.filter(row => row.tap_ta_id === params[0]).map(mappedPosition);
  if (sql.includes('FROM') && sql.includes('[tbl_Temp_Auftrag]') && !sql.includes('[tbl_Temp_Auftrag_Anhang]')) {
    return order ? [{ ...order, id: order.ta_id, completed: false, orderStatus: 0 }] : [];
  }
  return [];
}

require.cache[require.resolve('../src/db/access')] = { exports: {
  canConnectToDatabase: async () => { throw new Error('Unexpected database availability query'); },
  runSQLQueryFx: async () => { throw new Error('Unexpected FX query'); },
  runSQLQuerySqlServer: sqlQuery,
  runSQLQueryAccess: async (database, sql, params) => {
    if (sql.includes('AS warehouseName1')) {
      pickupReads++;
      return [{ warehouseId: 'L1', isStrecke: true, pickupName1: 'Factory', pickupStreet: params[0].includes('002') ? 'Other road 2' : 'Plant road 1', pickupPostalCode: '7190', pickupCity: 'Feluy', countryCode: 'BE' }];
    }
    if (sql.includes('[tblLieferbedingungen]')) return [{ id: params[0], text: Number(params[0]) === 1 ? 'FCA / Free Carrier' : 'CPT / Frachtfrei' }];
    if (sql.includes('[tblKunden]')) return [{ paymentTextId: 1 }];
    if (sql.includes('AS packagingType')) {
      if (sourcePackagingError) throw new Error('Original packaging lookup unavailable');
      return [{ packagingType: sourcePackagingType }];
    }
    if (sql.includes('AS mfiBase')) return [{ articleIndex: 'A1', article: 'Product', warehouse: 'Strecke/Feluy', amount: 1000, reserved: 0, mfiBase: 2 }];
    return [];
  },
  withSqlTransaction: async (database, work) => {
    const prior = structuredClone({ order, savedPositions, sourceOfferPositions, purchases });
    try {
      return await work({ query: async (sql, params) => ({ rows: await sqlQuery(database, sql, params), rowsAffected: [1] }) });
    } catch (error) {
      ({ order, savedPositions, sourceOfferPositions, purchases } = prior);
      throw error;
    }
  },
} };
require.cache[require.resolve('../src/db/customer-access')] = { exports: {
  getCustomerAccessScope: async () => ({ isFullAccess: true }), loadVisibleCustomer: async () => ({ kd_KdNR: 'C1' }),
} };
require.cache[require.resolve('../src/db/delivery-addresses')] = { exports: {
  loadCustomerDeliveryAddresses: async () => [{ id: 51, text: 'Customer warehouse' }],
} };
require.cache[require.resolve('../src/db/temp-order-planning')] = { exports: { ...planning, loadTempOrderPlanning: async () => new Map() } };
require.cache[require.resolve('../src/routes/temp-purchase-orders.routes')] = { exports: {
  preparePurchaseDraft: async (request) => ({
    positions: request.body.positions,
    packaging: { text: 'Sackware', id: 1 },
  }),
  savePurchaseDraft: async (_query, _request, draft) => {
    if (failPurchase) throw new Error('Simulated purchase insert failure');
    const purchase = { id: 100 + purchases.length, positionId: 200 + purchases.length, amount: draft.positions[0].amount, status: 0 };
    purchases.push(purchase);
    return { id: purchase.id, positions: [{ id: purchase.positionId }] };
  },
  finalizePurchase: async (_request, id) => {
    purchases.find((purchase) => purchase.id === id).status = 1;
  },
} };
const router = require('../src/routes/temp-orders.routes');

function payload(overrides = {}) {
  return { clientReferenceId: 'C1', clientName: 'Sales customer', clientAddress: 'Sales customer registered address',
    incotermId: 1, packagingTypeId: 1, specialPaymentId: 1,
    deliveryAddress: 'Customer warehouse', deliveryAddressId: 51,
    positions: [{ beNumber: '3-02-26-001-01', warehouseId: 'L1', article: 'Product', amountInKg: 100, salePricePerKg: 2000, costPricePerKg: 1000, deliveryDate: '2026-11-02' }],
    ...overrides };
}
function request(method, body, userIdentity = { shortCode: 'NSC', personNumber: 227, userId: 'n.schroeder', active: true }) {
  const route = router.stack.find(layer => layer.route?.path === (method === 'post' ? '/temp-orders' : '/temp-orders/:id') && layer.route.methods[method]).route;
  return new Promise((resolve, reject) => {
    const req = { body, params: { id: String(order?.ta_id || 42) }, query: {}, files: [], userIdentity, mandant: 'Frupack', database: { firmaId: 3, databaseName: 'BMS.FRU' } };
    const res = { status: () => res, json: resolve };
    route.stack.at(-1).handle(req, res, reject);
  });
}

test('the order route links only retained offer lines and frees them on removal or draft deletion', async () => {
  reset();
  sourceOffer = { id: 29, customerId: 'C1', version: '0x0000000000000001', status: 2 };
  sourceOfferPositions = [13, 14].map((id) => ({ id, articleIndex: 'A1', unit: 'KG', quantity: 100, price: 2000, priceBasis: 1000 }));
  const ordinaryLine = payload().positions[0];
  const conversion = payload({
    incotermId: 2, offerSourceId: sourceOffer.id, offerSourceVersion: sourceOffer.version,
    positions: [{ ...ordinaryLine, offerPositionId: 13 }, ordinaryLine],
  });
  await assert.rejects(request('post', conversion, { shortCode: 'NSC' }), { status: 403 });
  rejectBacklink = true;
  await assert.rejects(request('post', conversion), { status: 409 });
  assert.equal(order, null);
  assert.equal(savedPositions.length, 0);
  assert.equal(sourceOffer.status, 2);
  rejectBacklink = false;

  const created = await request('post', conversion);
  assert.equal(sourceOffer.status, 2);
  assert.equal(created.data.positions[0].offerPositionId, 13);
  assert.equal(created.data.positions[1].offerPositionId, undefined);
  assert.equal(sourceOfferPositions[0].orderPositionId, created.data.positions[0].id);
  assert.equal(sourceOfferPositions[1].orderPositionId, undefined);
  const retained = created.data.positions[1].id;
  await request('put', payload({ incotermId: 2, positions: [{ ...ordinaryLine, id: retained }] }));
  assert.equal(sourceOfferPositions[0].orderPositionId, null);
  assert.equal(savedPositions[0].tap_id, retained);

  await request('post', { ...conversion, positions: [{ ...ordinaryLine, offerPositionId: 14 }] });
  await request('delete');
  assert.equal(sourceOfferPositions[1].orderPositionId, null);
  assert.equal(order, null);
});

test('coupled creation stores an explicit VL remainder, both references and one handoff across a retry', async () => {
  reset();
  procurementEnabled = true;
  const base = payload().positions[0];
  const position = {
    ...base, articleIndex: 'A1', beNumber: '', warehouseId: '', amountInKg: 100,
    procurement: {
      header: { supplierId: 'S1' },
      position: { articleIndex: 'A1', optionPositionId: 9, amount: 60, purchasePrice: 900 },
      stock: { beNumber: base.beNumber, warehouseId: base.warehouseId },
    },
  };
  const input = payload({
    incotermId: 2, procurementRequestId: '35f27c04-0b5f-4367-9f79-2ec0259a5331', positions: [position],
  });
  await assert.rejects(request('post', input, { shortCode: 'AD' }), { status: 403 });
  failPurchase = true;
  await assert.rejects(request('post', input), /Simulated purchase insert failure/);
  assert.equal(order, null);
  assert.equal(savedPositions.length, 0);
  assert.equal(purchases.length, 0);

  failPurchase = false;
  const result = await request('post', input);
  assert.equal(result.data.procurement.status, 'purchase');
  assert.equal(purchases[0].status, 1);
  assert.equal(purchases[0].amount, 60);
  assert.equal(purchases[0].orderPositionId, savedPositions[0].tap_id);
  assert.equal(savedPositions[0].tap_purchase_position_id, purchases[0].positionId);
  assert.equal(savedPositions[0].tap_option_position_id, 9);
  assert.equal(savedPositions[0].tap_be_number, '');
  assert.equal(savedPositions[1].tap_be_number, base.beNumber);
  assert.deepEqual(savedPositions.map((row) => row.tap_amount_in_kg), [60, 40]);

  const retry = await request('post', input);
  assert.equal(retry.data.id, result.data.id);
  assert.equal(purchases.length, 1);
  assert.equal(savedPositions.length, 2);
});

test('an already saved option purchase links once without sending it or inheriting supplier terms', async () => {
  reset();
  procurementEnabled = true;
  const requestId = '35f27c04-0b5f-4367-9f79-2ec0259a5331';
  purchases.push({ id: 100, positionId: 200, companyId: 3, owner: 'NSC', requestId, status: 0,
    amount: 100, unit: 'kg', articleIndex: 'A1', purchasePrice: 1300, optionPositionId: 9, packagingType: 'Sackware', packagingTypeId: 1 });
  const position = { ...payload().positions[0], articleIndex: 'A1', beNumber: '', warehouseId: '', savedPurchasePositionId: 200 };
  const input = payload({ incotermId: 2, procurementRequestId: requestId, positions: [position] });
  await assert.rejects(request('post', { ...input, positions: [{ ...position, amountInKg: 101 }] }), { status: 409 });
  assert.equal(order, null);
  await assert.rejects(request('post', input, { shortCode: 'AD' }), { status: 403 });
  const result = await request('post', input);
  assert.equal(order.ta_ClientReferenceId, 'C1');
  assert.equal(order.ta_delivery_type_id, 2);
  assert.equal(order.ta_delivery_address_id, 51);
  assert.equal(savedPositions[0].tap_purchase_position_id, 200);
  assert.equal(savedPositions[0].tap_ep, 1300);
  assert.equal(savedPositions[0].tap_option_position_id, 9);
  assert.equal(savedPositions[0].tap_be_number, '');
  assert.equal(purchases[0].orderPositionId, savedPositions[0].tap_id);
  assert.equal(purchases[0].status, 0);
  assert.equal((await request('post', input)).data.id, result.data.id);
  assert.equal(purchases.length, 1);
  assert.equal(savedPositions.length, 1);
  assert.equal(purchases[0].status, 0);
  await request('delete');
  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].orderPositionId, null);
});

test('an offer conversion links multiple separately saved purchases once and retains them if the order is deleted', async () => {
  reset();
  procurementEnabled = true;
  sourceOffer = { id: 29, customerId: 'C1', version: '0x0000000000000001', status: 2 };
  sourceOfferPositions = [13, 14].map((id) => ({ id, articleIndex: 'A1', unit: 'KG', quantity: 100, price: 2000, priceBasis: 1000 }));
  const requestIds = ['35f27c04-0b5f-4367-9f79-2ec0259a5331', '35f27c04-0b5f-4367-9f79-2ec0259a5332'];
  for (const [index, requestId] of requestIds.entries()) {
    savedPositions.push({ tap_id: 71 + index, tap_ta_id: 80 + index, tap_line_no: 1 });
    purchases.push({ id: 100 + index, positionId: 200 + index, companyId: 3, owner: 'NSC', requestId, status: 0,
      amount: 100, unit: 'kg', articleIndex: 'A1', purchasePrice: 1300 + index, optionPositionId: null,
      packagingType: 'Sackware', packagingTypeId: 1, orderPositionId: 71 + index, reservedOrderId: 80 + index });
  }
  const input = payload({
    incotermId: 2, offerSourceId: sourceOffer.id, offerSourceVersion: sourceOffer.version, procurementRequestId: requestIds[0],
    positions: sourceOfferPositions.map((line, index) => ({
      ...payload().positions[0], articleIndex: 'A1', beNumber: '', warehouseId: '', offerPositionId: line.id,
      savedPurchasePositionId: purchases[index].positionId, purchaseRequestId: requestIds[index],
    })),
  });
  const created = await request('post', input);
  assert.equal(sourceOffer.status, 4);
  assert.deepEqual(sourceOfferPositions.map((line) => line.orderPositionId), [71, 72]);
  assert.deepEqual(purchases.map((p) => [p.orderPositionId, p.status, p.reservedOrderId]), [[71, 0, null], [72, 0, null]]);
  assert.deepEqual(savedPositions.map((line) => line.tap_purchase_position_id), [200, 201]);
  assert.deepEqual(savedPositions.map((line) => line.tap_ep), [1300, 1301]);
  assert.equal((await request('post', input)).data.id, created.data.id);
  await request('delete');
  assert.deepEqual(purchases.map((p) => p.orderPositionId), [null, null]);
  assert.deepEqual(sourceOfferPositions.map((line) => line.orderPositionId), [null, null]);
});

test('saving a direct order keeps the reserved position ID and adds a separate stock remainder', async () => {
  reset();
  procurementEnabled = true;
  const requestId = '35f27c04-0b5f-4367-9f79-2ec0259a5771';
  savedPositions.push({ tap_id: 77, tap_ta_id: 80, tap_line_no: 1 });
  purchases.push({ id: 100, positionId: 200, companyId: 3, owner: 'NSC', requestId, status: 1,
    amount: 60, unit: 'kg', articleIndex: 'A1', purchasePrice: 1200, packagingType: 'Sackware', packagingTypeId: 1,
    orderPositionId: 77, reservedOrderId: 80 });
  const stock = payload().positions[0];
  const input = payload({ incotermId: 2, procurementRequestId: requestId, positions: [{
    ...stock, articleIndex: 'A1', beNumber: '', warehouseId: '', amountInKg: 100,
    savedPurchasePositionId: 200, purchaseRequestId: requestId, savedPurchaseAmount: 60,
    savedPurchaseStock: { beNumber: stock.beNumber, warehouseId: stock.warehouseId, costPrice: 1100 },
  }] });
  const saved = await request('post', input);
  assert.equal(purchases[0].orderPositionId, 77);
  assert.equal(purchases[0].reservedOrderId, null);
  assert.equal(savedPositions[0].tap_ta_id, saved.data.id);
  assert.deepEqual(savedPositions.map(row => [row.tap_amount_in_kg, row.tap_be_number]), [[60, ''], [40, stock.beNumber]]);
  assert.equal((await request('post', input)).data.id, saved.data.id);
  assert.equal(savedPositions.length, 2);
});

test('create, edit and copy persist FCA pickup text in the existing fields without the sales customer FK', async () => {
  reset();
  const created = await request('post', payload());
  assert.equal(order.ta_delivery_address, 'Factory, Plant road 1, 7190 Feluy, BE');
  assert.equal(order.ta_delivery_address_id, null);
  assert.equal(order.ta_delivery_address_changed, 1);
  assert.equal(savedPositions[0].tap_warehouse, 'L1');
  assert.equal(created.data.deliveryAddress, order.ta_delivery_address);
  assert.equal(created.data.deliveryAddressId, null);

  const edited = await request('put', payload({ deliveryAddress: 'Factory, corrected loading entrance', deliveryAddressId: '', deliveryAddressChanged: 'true', positions: [{ ...payload().positions[0], id: 1 }] }));
  assert.equal(order.ta_delivery_address, 'Factory, corrected loading entrance');
  assert.equal(order.ta_delivery_address_id, null);
  assert.equal(edited.data.deliveryAddress, 'Factory, corrected loading entrance');
  const previousId = edited.data.id;
  const copied = await request('post', payload({ deliveryAddress: edited.data.deliveryAddress, deliveryAddressId: edited.data.deliveryAddressId, deliveryAddressChanged: true }));
  assert.notEqual(copied.data.id, previousId);
  assert.equal(copied.data.deliveryAddress, 'Factory, corrected loading entrance');
  assert.equal(copied.data.deliveryAddressId, null);
  assert.equal(copied.data.positions.length, 1);
  assert.equal(copied.data.positions[0].warehouse, 'L1');
});

test('ordinary CPT orders retain the validated customer delivery-address ID', async () => {
  reset();
  const response = await request('post', payload({ incotermId: 2 }));
  assert.equal(response.data.deliveryAddress, 'Customer warehouse');
  assert.equal(response.data.deliveryAddressId, 51);
  assert.equal(pickupReads, 0);
});

test('zero sales prices survive creating, editing and copying an order', async () => {
  reset();
  const zeroPayload = payload({ positions: [{ ...payload().positions[0], salePricePerKg: 0 }] });
  const created = await request('post', zeroPayload);
  assert.equal(savedPositions[0].tap_price, 0);
  assert.equal(created.data.positions[0].price, 0);

  const edited = await request('put', { ...zeroPayload, positions: [{ ...zeroPayload.positions[0], id: 1, salePricePerKg: '0.00' }] });
  assert.equal(savedPositions[0].tap_price, 0);
  assert.equal(edited.data.positions[0].price, 0);

  const copied = await request('post', { ...zeroPayload, positions: [{ ...zeroPayload.positions[0], salePricePerKg: edited.data.positions[0].price }] });
  assert.notEqual(copied.data.id, created.data.id);
  assert.equal(savedPositions.at(-1).tap_price, 0);
  assert.equal(copied.data.positions[0].price, 0);
});

test('the legacy pricePerKg input accepts an explicit zero when creating and editing', async () => {
  reset();
  const legacyPayload = payload({ positions: [{ ...payload().positions[0], salePricePerKg: undefined, pricePerKg: 0 }] });
  const created = await request('post', legacyPayload);
  assert.equal(created.data.positions[0].price, 0);
  const edited = await request('put', { ...legacyPayload, positions: [{ ...legacyPayload.positions[0], id: 1 }] });
  assert.equal(edited.data.positions[0].price, 0);
});

test('create and update reject missing, negative and invalid sales prices before writing', async () => {
  for (const price of [undefined, null, '', ' ', -1, -0.01, '-0.01', 'abc', 'Infinity', false, true, [], [0], {}]) {
    reset();
    const invalidPayload = payload({ positions: [{ ...payload().positions[0], salePricePerKg: price }] });
    await assert.rejects(request('post', invalidPayload), error => error.status === 400 && error.details.code === 'INVALID_TEMP_ORDER_PAYLOAD');
    assert.equal(writes.length, 0);

    await request('post', payload());
    writes.length = 0;
    await assert.rejects(request('put', invalidPayload), error => error.status === 400 && error.details.code === 'INVALID_TEMP_ORDER_PAYLOAD');
    assert.equal(writes.length, 0);
    assert.equal(savedPositions[0].tap_price, 2000);
  }
});

test('create, edit and copy use the order packaging when the original is missing or unavailable', async () => {
  for (const lookupFails of [false, true]) {
    reset();
    sourcePackagingType = null;
    sourcePackagingError = lookupFails;
    const created = await request('post', payload({ incotermId: 2 }));
    assert.equal(created.data.packagingType, 'Sackware');
    assert.equal(savedPositions[0].tap_Verpackungsart, null);
    assert.equal(savedPositions[0].tap_Verpackungsart_id, null);
    assert.equal(Boolean(savedPositions[0].tap_Verpackungsart_Gewechselt), false);

    const edited = await request('put', payload({ incotermId: 2, positions: [{ ...payload().positions[0], id: 1 }] }));
    assert.equal(edited.data.packagingType, 'Sackware');
    assert.equal(savedPositions[0].tap_Verpackungsart, null);
    assert.equal(Boolean(savedPositions[0].tap_Verpackungsart_Gewechselt), false);

    await request('post', payload({ incotermId: 2 }));
    assert.equal(savedPositions.at(-1).tap_Verpackungsart, null);
    assert.equal(Boolean(savedPositions.at(-1).tap_Verpackungsart_Gewechselt), false);
  }
});

test('known original packaging and its change marker survive editing even if the source is later missing', async () => {
  reset();
  sourcePackagingType = 'Big Bags';
  await request('post', payload({ incotermId: 2 }));
  assert.equal(savedPositions[0].tap_Verpackungsart, 'Big Bags');
  assert.equal(Boolean(savedPositions[0].tap_Verpackungsart_Gewechselt), true);
  sourcePackagingError = true;
  await request('put', payload({ incotermId: 2, positions: [{ ...payload().positions[0], id: 1 }] }));
  assert.equal(savedPositions[0].tap_Verpackungsart, 'Big Bags');
  assert.equal(Boolean(savedPositions[0].tap_Verpackungsart_Gewechselt), true);
});

test('unknown original packaging still requires a valid order packaging selection', async () => {
  reset();
  sourcePackagingType = null;
  await assert.rejects(request('post', payload({ incotermId: 2, packagingTypeId: null })), error => error.status === 400);
  assert.equal(writes.length, 0);
});

test('different FCA source addresses reject the create before any SQL write', async () => {
  reset();
  await assert.rejects(request('post', payload({ positions: [payload().positions[0], { ...payload().positions[0], beNumber: '3-02-26-002-01' }] })), error => error.details.code === 'TEMP_ORDER_PICKUP_ADDRESS_CONFLICT');
  assert.equal(writes.length, 0);
});
