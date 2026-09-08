const config = require('../config');
const { runSQLQuerySqlServer } = require('./access');
const { appTableSql } = require('./app-tables');

const TEMP_ORDER_TABLE = appTableSql('tempOrder');
const TEMP_ORDER_POSITION_TABLE = appTableSql('tempOrderPosition');
// Status 2 is already booked in the ERP. Keeping it here would subtract the
// same quantity a second time from the current VL.
const ACTIVE_TEMP_ORDER_STATUSES = Object.freeze([0, 1]);

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function asAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function buildTempPlanningKey(beNumber, warehouseId) {
  return `${asText(beNumber)}\u001f${asText(warehouseId)}`;
}

function normalizePlanningKeys(keys) {
  const unique = new Map();
  for (const key of Array.isArray(keys) ? keys : []) {
    const beNumber = asText(key?.beNumber ?? key?.be_number);
    const warehouseId = asText(key?.warehouseId ?? key?.warehouse ?? key?.tap_warehouse);
    if (!beNumber || !warehouseId) continue;
    unique.set(buildTempPlanningKey(beNumber, warehouseId), { beNumber, warehouseId });
  }
  return Array.from(unique.values());
}

function buildTempOrderPlanningQuery({ companyId, keys = [], excludeOrderId = null } = {}) {
  const normalizedKeys = normalizePlanningKeys(keys);
  const params = [companyId];
  const clauses = [
    'o.[ta_company_id] = ?',
    'COALESCE(o.[ta_Status], 0) IN (0, 1)',
  ];

  if (excludeOrderId !== null && excludeOrderId !== undefined && asText(excludeOrderId)) {
    clauses.push('o.[ta_id] <> ?');
    params.push(excludeOrderId);
  }

  if (normalizedKeys.length) {
    clauses.push(`EXISTS (
      SELECT 1
      FROM (VALUES ${normalizedKeys.map(() => '(?, ?)').join(', ')}) AS requested([beNumber], [warehouseId])
      WHERE COALESCE(p.[tap_be_number], N'') = requested.[beNumber]
        AND COALESCE(p.[tap_warehouse], N'') = requested.[warehouseId]
    )`);
    normalizedKeys.forEach(({ beNumber, warehouseId }) => params.push(beNumber, warehouseId));
  }

  return {
    sql: `
      SELECT
        p.[tap_be_number] AS beNumber,
        p.[tap_warehouse] AS warehouseId,
        LTRIM(RTRIM(COALESCE(o.[ta_CreatedBy], N''))) AS ownerShortCode,
        SUM(COALESCE(p.[tap_amount_in_kg], 0)) AS amountInKg
      FROM ${TEMP_ORDER_POSITION_TABLE} AS p
      INNER JOIN ${TEMP_ORDER_TABLE} AS o
        ON o.[ta_id] = p.[tap_ta_id]
      WHERE ${clauses.join('\n        AND ')}
      GROUP BY
        p.[tap_be_number],
        p.[tap_warehouse],
        o.[ta_CreatedBy]
    `,
    params,
    keys: normalizedKeys,
  };
}

function mapTempOrderPlanningRows(rows, currentOwnerShortCode = '') {
  const planning = new Map();
  const currentOwner = asText(currentOwnerShortCode).toLowerCase();

  for (const row of Array.isArray(rows) ? rows : []) {
    const beNumber = asText(row?.beNumber ?? row?.tap_be_number);
    const warehouseId = asText(row?.warehouseId ?? row?.tap_warehouse);
    const amountInKg = asAmount(row?.amountInKg ?? row?.tap_amount_in_kg);
    if (!beNumber || !warehouseId || amountInKg <= 0) continue;

    const key = buildTempPlanningKey(beNumber, warehouseId);
    const entry = planning.get(key) || {
      beNumber,
      warehouseId,
      totalAmountKg: 0,
      byOwner: new Map(),
    };
    entry.totalAmountKg += amountInKg;

    const ownerShortCode = asText(row?.ownerShortCode ?? row?.ta_CreatedBy);
    if (ownerShortCode) {
      const ownerKey = ownerShortCode.toLowerCase();
      const owner = entry.byOwner.get(ownerKey) || {
        shortCode: ownerShortCode,
        amountInKg: 0,
        isOtherOwner: ownerKey !== currentOwner,
      };
      owner.amountInKg += amountInKg;
      entry.byOwner.set(ownerKey, owner);
    }

    planning.set(key, entry);
  }

  for (const entry of planning.values()) {
    entry.byOwner = Array.from(entry.byOwner.values())
      .sort((left, right) => left.shortCode.localeCompare(right.shortCode, 'de'));
    entry.otherOwners = entry.byOwner.filter((owner) => owner.isOtherOwner);
    entry.otherAmountKg = entry.otherOwners.reduce((sum, owner) => sum + owner.amountInKg, 0);
  }

  return planning;
}

async function loadTempOrderPlanning({ companyId, keys = [], excludeOrderId = null, currentOwnerShortCode = '' } = {}) {
  const query = buildTempOrderPlanningQuery({ companyId, keys, excludeOrderId });
  if (!query.keys.length) return new Map();
  const rows = await runSQLQuerySqlServer(config.sql.database, query.sql, query.params);
  return mapTempOrderPlanningRows(rows, currentOwnerShortCode);
}

function getTempOrderPlanningEntry(planning, beNumber, warehouseId) {
  return planning?.get(buildTempPlanningKey(beNumber, warehouseId)) || {
    beNumber: asText(beNumber),
    warehouseId: asText(warehouseId),
    totalAmountKg: 0,
    otherAmountKg: 0,
    byOwner: [],
    otherOwners: [],
  };
}

module.exports = {
  ACTIVE_TEMP_ORDER_STATUSES,
  buildTempPlanningKey,
  buildTempOrderPlanningQuery,
  getTempOrderPlanningEntry,
  loadTempOrderPlanning,
  mapTempOrderPlanningRows,
  normalizePlanningKeys,
};
