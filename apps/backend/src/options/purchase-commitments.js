const config = require('../config');
const { runSQLQuerySqlServer } = require('../db/access');
const { appTableSql } = require('../db/app-tables');
const { getCustomerAccessScope } = require('../db/customer-access');
const { purchaseOrderOwnerFilter } = require('../db/purchase-order-access');
const { pilotFeaturesForIdentity } = require('../pilot-features');
const {
  optionAvailableForPurchaseSql, optionPurchaseRowsSql, quantityAvailability, SUM_PURCHASE_KG_SQL,
} = require('./purchase-quantity');

async function loadOptionPurchaseCommitments(database, identity, optionId, position) {
  const companyId = Number(database.firmaId);
  const canReadPurchases = database.firmaId != null && Number.isInteger(companyId) && pilotFeaturesForIdentity(identity, { readOnly: true }).purchaseOrders;
  let orderIdSql = 'NULL';
  const params = [];
  if (canReadPurchases) {
    const { isFullAccess } = await getCustomerAccessScope(identity, database, { readOnly: true });
    const owner = purchaseOrderOwnerFilter(identity?.shortCode, isFullAccess, 'purchase.ownerCode');
    orderIdSql = `CASE WHEN purchase.companyId = ? ${owner.sql} THEN purchase.id END`;
    params.push(companyId, ...owner.params);
  }

  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT ${orderIdSql} AS orderId, purchase.status, purchase.amountKg
    FROM ${appTableSql('options')} o
    OUTER APPLY (
      SELECT b.tb_id AS id, b.tb_company_id AS companyId, b.tb_created_by AS ownerCode,
        COALESCE(b.tb_status, 0) AS status, ${SUM_PURCHASE_KG_SQL} AS amountKg
      ${optionPurchaseRowsSql('?')}
      GROUP BY b.tb_id, b.tb_company_id, b.tb_created_by, b.tb_status
      HAVING ${SUM_PURCHASE_KG_SQL} > 0
    ) purchase
    WHERE o.op_id = ? AND ${optionAvailableForPurchaseSql('o')}
    ORDER BY purchase.id`, [...params, position.id, optionId]);

  if (!rows.length) return null;
  let orderedKg = 0;
  let hasRestrictedPurchaseCommitments = false;
  const purchaseCommitments = [];
  for (const row of rows) {
    const amountKg = Number(row.amountKg);
    if (!(amountKg > 0)) continue;
    orderedKg += amountKg;
    if (row.orderId == null) {
      hasRestrictedPurchaseCommitments = true;
    } else {
      purchaseCommitments.push({ orderId: Number(row.orderId), status: Number(row.status), amountKg });
    }
  }
  return {
    ...quantityAvailability(position, orderedKg, position.truckLoadKg ?? 24750),
    purchaseCommitments,
    hasRestrictedPurchaseCommitments,
  };
}

module.exports = { loadOptionPurchaseCommitments };
