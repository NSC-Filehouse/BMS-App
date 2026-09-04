const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildTempOrderOwnerFilter,
  buildTempOrderStatusFilter,
  normalizeTempOrderOwnerScope,
  normalizeTempOrderStatus,
  normalizeStoredTempOrderStatus,
  isTempOrderEditableStatus,
  isTempOrderFinalizedStatus,
  normalizeTempOrderCompanyId,
} = require('../src/routes/temp-orders.routes');

test('normalizes temp-order list filters to supported values', () => {
  assert.equal(normalizeTempOrderOwnerScope('mine'), 'mine');
  assert.equal(normalizeTempOrderOwnerScope('unexpected'), 'all');
  assert.equal(normalizeTempOrderStatus('sent'), 'sent');
  assert.equal(normalizeTempOrderStatus('rework'), 'rework');
  assert.equal(normalizeTempOrderStatus('unexpected'), 'all');
});

test('full-access users can switch between all and own temp orders', () => {
  assert.deepEqual(
    buildTempOrderOwnerFilter('NSC', true, '[o].[ta_CreatedBy]', 'all'),
    { whereSql: '', params: [], scope: 'all' },
  );
  assert.deepEqual(
    buildTempOrderOwnerFilter('NSC', true, '[o].[ta_CreatedBy]', 'mine'),
    {
      whereSql: " AND LOWER(COALESCE([o].[ta_CreatedBy], '')) = ?",
      params: ['nsc'],
      scope: 'mine',
    },
  );
});

test('non-full-access users are always restricted to their own temp orders', () => {
  const result = buildTempOrderOwnerFilter('DBE', false, '[o].[ta_CreatedBy]', 'all');
  assert.equal(result.scope, 'mine');
  assert.deepEqual(result.params, ['dbe']);
  assert.match(result.whereSql, /ta_CreatedBy/);
});

test('temp-order status filter distinguishes drafts and orders sent to BMS', () => {
  assert.deepEqual(buildTempOrderStatusFilter('all'), { whereSql: '', status: 'all' });
  assert.deepEqual(buildTempOrderStatusFilter('draft'), {
    whereSql: ' AND COALESCE([o].[ta_Status], 0) = 0',
    status: 'draft',
  });
  assert.deepEqual(buildTempOrderStatusFilter('sent'), {
    whereSql: ' AND COALESCE([o].[ta_Status], 0) IN (1, 2)',
    status: 'sent',
  });
  assert.deepEqual(buildTempOrderStatusFilter('rework'), {
    whereSql: ' AND COALESCE([o].[ta_Status], 0) = 3',
    status: 'rework',
  });
});

test('temp-order workflow status controls edit and finalization permissions', () => {
  assert.equal(normalizeStoredTempOrderStatus(null), 0);
  assert.equal(normalizeStoredTempOrderStatus(null, true), 1);
  assert.equal(isTempOrderEditableStatus(0), true);
  assert.equal(isTempOrderEditableStatus(3), true);
  assert.equal(isTempOrderEditableStatus(1), false);
  assert.equal(isTempOrderEditableStatus(2), false);
  assert.equal(isTempOrderEditableStatus(4), false);
  assert.equal(isTempOrderFinalizedStatus(1), true);
  assert.equal(isTempOrderFinalizedStatus(2), true);
  assert.equal(isTempOrderFinalizedStatus(3), false);
});

test('accepts test mandant company id 0 while rejecting missing or invalid ids', () => {
  assert.equal(normalizeTempOrderCompanyId(0), 0);
  assert.equal(normalizeTempOrderCompanyId('0'), 0);
  assert.equal(normalizeTempOrderCompanyId(1), 1);
  assert.equal(normalizeTempOrderCompanyId(null), null);
  assert.equal(normalizeTempOrderCompanyId(''), null);
  assert.equal(normalizeTempOrderCompanyId(-1), null);
  assert.equal(normalizeTempOrderCompanyId('1.5'), null);
  assert.equal(normalizeTempOrderCompanyId('not-a-number'), null);
});
