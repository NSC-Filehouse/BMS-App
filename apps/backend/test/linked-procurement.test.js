const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { procurementStatus, selectBmsPosition } = require('../src/db/linked-procurement');

test('the sales order waits for the purchase status and a complete VL assignment', () => {
  const ready = { purchaseStatus: 2, beNumber: '3-02-26-001-01', warehouseId: 'L1' };
  assert.equal(procurementStatus([]), null);
  assert.equal(procurementStatus([ready, { ...ready, purchaseStatus: 0 }]), 'purchase');
  assert.equal(procurementStatus([ready, { ...ready, purchaseStatus: 1 }]), 'purchase');
  assert.equal(procurementStatus([ready, { ...ready, purchaseStatus: 3 }]), 'rework');
  assert.equal(procurementStatus([ready, { ...ready, warehouseId: '' }]), 'stock');
  assert.equal(procurementStatus([ready, ready]), 'ready');
});

test('the exact BMS position is used even if the ERP order has repeated articles', () => {
  const purchase = { articleIndex: 'A', purchaseArticleIndex: 'A', purchaseLineCount: 2 };
  const rows = [{ beNumber: 'BE-1', articleIndex: 'A' }, { beNumber: 'BE-2', articleIndex: 'A' }];
  assert.equal(selectBmsPosition(purchase, rows), null);
  assert.equal(selectBmsPosition({ ...purchase, bmsPositionId: 'BE-2' }, rows), 'BE-2');
  assert.equal(selectBmsPosition({ ...purchase, bmsPositionId: 'OTHER' }, rows), null);
});

test('the single-position fallback requires a matching active article on an unambiguous BMS order', () => {
  const purchase = { articleIndex: 'A', purchaseArticleIndex: 'A', purchaseLineCount: 1 };
  assert.equal(selectBmsPosition(purchase, [{ beNumber: 'BE-1', articleIndex: 'a' }]), 'BE-1');
  assert.equal(selectBmsPosition(purchase, [{ beNumber: 'BE-1', articleIndex: 'AB' }]), null);
  assert.equal(selectBmsPosition(purchase, [{ beNumber: 'BE-1', articleIndex: 'A', cancelled: true }]), null);
  assert.equal(selectBmsPosition(purchase, [{ beNumber: 'BE-1', articleIndex: 'A' }, { beNumber: 'BE-2', articleIndex: 'B' }]), null);
  assert.equal(selectBmsPosition({ ...purchase, purchaseLineCount: 2 }, [{ beNumber: 'BE-1', articleIndex: 'A' }]), null);
});

test('the background check binds the exact USD lot and EUR cost and sends a single ready notification', async () => {
  const purchase = {
    id: 1, purchaseId: 42, purchasePositionId: 11, purchaseStatus: 1, purchaseLineCount: 2,
    bmsPurchaseIndex: 'BE', bmsPositionId: 'BE-2', supplierId: 'SUP', articleIndex: 'A',
    purchaseArticleIndex: 'A', amountInKg: 16000, beNumber: '', warehouseId: '', purchaseCurrency: 'USD',
  };
  let stockKg = 8000;
  let notified = false;
  let pushes = 0;
  let orderStatus = 0;
  let euroCost;
  const identity = { active: true, shortCode: 'NSC', personNumber: 227, userId: 'n.schroeder', email: 'nsc@example.test' };
  const database = { firmaId: 3 };
  const dependencies = {
    '../config': { sql: { database: 'test' } },
    '../logger': { warn(message) { throw new Error(message); } },
    './access': {
      async runSQLQueryAccess(_database, sql, params) {
        if (sql.includes('COALESCE(p.beP_Storno')) return [
          { beNumber: 'BE-1', articleIndex: 'A', euroCostPrice: 700 },
          { beNumber: 'BE-2', articleIndex: 'A', euroCostPrice: euroCost },
        ];
        assert.equal(params[1], 'BE-2');
        return [{ beNumber: 'BE-2', warehouseId: 'L1', packaging: 'Sackware' }];
      },
      async runSQLQuerySqlServer(_database, sql) {
        if (sql.includes('COL_LENGTH')) return [{ ready: 1 }];
        if (sql.includes('SELECT o.ta_id AS id')) {
          assert.match(sql, /o.ta_Status=1 AND b.tb_status=2/);
          return purchase.purchaseStatus === 2 && !notified ? [{ id: 10, companyId: 3, owner: 'NSC', orderStatus }] : [];
        }
        throw new Error('Unexpected SQL outside transaction');
      },
    },
    './databases': { getDatabaseConnectionForCompanyId: async () => database },
    './product-availability': { productAvailabilitySource: () => '(SELECT 1) AS v' },
    './temp-order-availability': {
      loadCurrentOrderPositions: async (_database, positions) => positions,
      async assertTempOrderPositionsAvailable({ positions }) {
        if (positions.some((position) => position.amountInKg > stockKg)) throw Object.assign(new Error('not enough'), { status: 409 });
      },
      withTempOrderAvailabilityLock: async (_company, task) => task({
        async query(sql, params) {
          if (sql.includes('SELECT ta_packaging_type')) {
            assert.match(sql, /ta_Status IN \(0,1,3\)/);
            return { rows: [{ packaging: 'Sackware', orderStatus }] };
          }
          if (sql.includes('purchaseLineCount')) return { rows: [{ ...purchase }] };
          if (sql.includes('SELECT tap_id AS id')) return { rows: purchase.beNumber ? [{ ...purchase }] : [] };
          if (sql.includes('SET tap_be_number=')) {
            [purchase.beNumber, purchase.warehouseId] = params;
            assert.match(sql, /tap_ep=COALESCE/);
            assert.equal(params.at(-4), 911);
            return { rows: [] };
          }
          if (sql.includes('SET ta_procurement_notified_at=')) {
            notified = true;
            return { rows: [{ claimedAt: '2026-11-24T10:00:00.0000000' }] };
          }
          throw new Error('Unexpected SQL in transaction');
        },
      }),
    },
    './users': { getUserIdentityByShortCode: async () => identity },
    './push': { sendDirectPushNotificationToUser: async ({ email }) => {
      assert.equal(email, identity.email);
      pushes += 1;
      return { delivered: 1 };
    } },
  };
  const moduleSource = readFileSync(require.resolve('../src/db/linked-procurement'), 'utf8');
  const fixture = { exports: {} };
  const fallback = require('node:module').createRequire(require.resolve('../src/db/linked-procurement'));
  new Function('require', 'module', moduleSource)((name) => dependencies[name] ?? fallback(name), fixture);

  await fixture.exports.runLinkedProcurement();
  assert.equal(purchase.beNumber, '');
  purchase.purchaseStatus = 2;
  await fixture.exports.runLinkedProcurement();
  assert.equal(purchase.beNumber, '');
  assert.equal(pushes, 0);

  stockKg = 17000;
  await fixture.exports.runLinkedProcurement();
  assert.equal(purchase.beNumber, '');
  assert.equal(pushes, 0);
  euroCost = 911.25;
  await fixture.exports.runLinkedProcurement();
  assert.equal(purchase.beNumber, 'BE-2');
  assert.equal(purchase.warehouseId, 'L1');
  assert.equal(pushes, 1);
  await fixture.exports.runLinkedProcurement();
  assert.equal(pushes, 1);
  orderStatus = 1;
  notified = false;
  purchase.beNumber = '';
  purchase.warehouseId = '';
  await fixture.exports.runLinkedProcurement(async () => assert.fail('Do not send a purchase for an already submitted order'));
  assert.equal(purchase.beNumber, 'BE-2');
  assert.equal(purchase.warehouseId, 'L1');
  assert.equal(pushes, 1);
});
