const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCustomerScopeFilter,
  normalizeUserGroup,
  resolveCustomerAccessMode,
} = require('../src/db/customer-access');

function scope(userGroup, shortCode = 'DBE') {
  return {
    isMainTenant: false,
    userGroup,
    shortCode,
  };
}

test('normalizes user groups for case and whitespace differences', () => {
  assert.equal(normalizeUserGroup(' gr03 '), 'GR03');
});

test('keeps the main tenant unrestricted', () => {
  assert.deepEqual(buildCustomerScopeFilter({ isMainTenant: true }), {
    whereSql: '',
    params: [],
    mode: 'main_tenant_all',
  });
});

test('maps GR01 to all assigned inside-sales customers', () => {
  const result = buildCustomerScopeFilter(scope('GR01'));
  assert.equal(result.mode, 'all_assigned_innendienst');
  assert.match(result.whereSql, /kd_Innendienst/);
  assert.deepEqual(result.params, []);
});

test('maps GR02 to the own inside-sales code', () => {
  const result = buildCustomerScopeFilter(scope('GR02', 'DBE'));
  assert.equal(result.mode, 'own_innendienst');
  assert.match(result.whereSql, /kd_Innendienst/);
  assert.deepEqual(result.params, ['DBE']);
});

test('maps GR03 to own inside- or outside-sales code', () => {
  const result = buildCustomerScopeFilter(scope('GR03', 'BDO'));
  assert.equal(result.mode, 'own_innendienst_or_aussendienst');
  assert.match(result.whereSql, /kd_Innendienst/);
  assert.match(result.whereSql, /kd_Aussendienst/);
  assert.deepEqual(result.params, ['BDO', 'BDO']);
});

test('maps GR04 to all assigned outside-sales customers', () => {
  const result = buildCustomerScopeFilter(scope('GR04'));
  assert.equal(result.mode, 'all_assigned_aussendienst');
  assert.match(result.whereSql, /kd_Aussendienst/);
  assert.deepEqual(result.params, []);
});

test('maps GR05 to the own outside-sales code', () => {
  const result = buildCustomerScopeFilter(scope('GR05', 'DBE'));
  assert.equal(result.mode, 'own_aussendienst');
  assert.match(result.whereSql, /kd_Aussendienst/);
  assert.deepEqual(result.params, ['DBE']);
});

test('falls back to the previous outside-sales filter for excluded groups', () => {
  for (const userGroup of ['AD01', 'GR06', 'GR09', 'UNKNOWN', null]) {
    const result = buildCustomerScopeFilter(scope(userGroup, 'DBE'));
    assert.equal(result.mode, 'legacy_own_aussendienst');
    assert.deepEqual(result.params, ['DBE']);
    assert.match(result.whereSql, /kd_Aussendienst/);
  }
});

test('does not expose foreign customers without a required own-code', () => {
  for (const userGroup of ['GR02', 'GR03', 'GR05']) {
    const result = buildCustomerScopeFilter(scope(userGroup, ''));
    assert.equal(result.mode, 'no_customer_access');
    assert.equal(result.whereSql, '1 = 0');
    assert.deepEqual(result.params, []);
  }
});

test('resolves the configured group modes', () => {
  assert.equal(resolveCustomerAccessMode('GR01'), 'all_assigned_innendienst');
  assert.equal(resolveCustomerAccessMode('GR02'), 'own_innendienst');
  assert.equal(resolveCustomerAccessMode('GR03'), 'own_innendienst_or_aussendienst');
  assert.equal(resolveCustomerAccessMode('GR04'), 'all_assigned_aussendienst');
  assert.equal(resolveCustomerAccessMode('GR05'), 'own_aussendienst');
});
