const { appTableSql } = require('./app-tables');
const { createHttpError } = require('../utils');

// Holds the position ID while the sales order is still being filled out.
const PURCHASE_RESERVATION_STATUS = -1;
const orders = appTableSql('tempOrder');
const orderPositions = appTableSql('tempOrderPosition');
const purchasePositions = appTableSql('tempPurchaseOrderPosition');

async function reservePurchaseOrderPosition(query, { companyId, user, purchaseId, position }) {
  const [order] = (await query(`
    INSERT INTO ${orders} (
      ta_company_id,ta_ClientReferenceId,ta_client_name,ta_client_address,
      ta_completed,ta_Status,ta_IsConfirmed,ta_CreatedBy,ta_CreateDate,ta_LastModifiedBy,ta_LastModifiedDate
    )
    OUTPUT INSERTED.ta_id AS id
    VALUES (?,N'',N'',N'',0,${PURCHASE_RESERVATION_STATUS},0,?,SYSUTCDATETIME(),?,SYSUTCDATETIME())
  `, [companyId, user, user])).rows;
  const [reserved] = (await query(`
    INSERT INTO ${orderPositions} (
      tap_ta_id,tap_line_no,tap_be_number,tap_Artikelindex,tap_article,tap_amount_in_kg,tap_warehouse,tap_price,
      tap_mfi,tap_CreatedBy,tap_CreateDate,tap_LastModifiedBy,tap_LastModifiedDate
    )
    OUTPUT INSERTED.tap_id AS id
    VALUES (?,1,N'',?,?,?,N'',0,N'',?,SYSUTCDATETIME(),?,SYSUTCDATETIME())
  `, [order.id, position.articleIndex, position.article, position.amount, user, user])).rows;
  const linked = await query(`
    UPDATE ${purchasePositions} SET tbp_order_position_id=?
    OUTPUT INSERTED.tbp_id AS id
    WHERE tbp_tb_id=? AND tbp_line_no=1 AND tbp_order_position_id IS NULL
  `, [reserved.id, purchaseId]);
  if (linked.rows.length !== 1) {
    throw createHttpError(409, 'Die Auftragsposition konnte nicht für die Bestellung reserviert werden.', {
      code: 'PURCHASE_RESERVATION_FAILED',
    });
  }
}

async function removePurchaseReservation(query, orderId, companyId) {
  await query(`
    DELETE FROM ${orders}
    WHERE ta_id=? AND ta_company_id=? AND ta_Status=${PURCHASE_RESERVATION_STATUS}
  `, [orderId, companyId]);
}

module.exports = { PURCHASE_RESERVATION_STATUS, reservePurchaseOrderPosition, removePurchaseReservation };
