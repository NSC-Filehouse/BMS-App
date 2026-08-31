const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildTempOrderOwnerFilter,
  buildTempOrderStatusFilter,
  normalizeTempOrderOwnerScope,
  normalizeTempOrderStatus,
} = require('../src/routes/temp-orders.routes');

test('normalizes temp-order list filters to supported values', () => {
  assert.equal(normalizeTempOrderOwnerScope('mine'), 'mine');
  assert.equal(normalizeTempOrderOwnerScope('unexpected'), 'all');
  assert.equal(normalizeTempOrderStatus('sent'), 'sent');
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
    whereSql: ' AND COALESCE([o].[ta_completed], 0) = 0',
    status: 'draft',
  });
  assert.deepEqual(buildTempOrderStatusFilter('sent'), {
    whereSql: ' AND COALESCE([o].[ta_completed], 0) = 1',
    status: 'sent',
  });
});
