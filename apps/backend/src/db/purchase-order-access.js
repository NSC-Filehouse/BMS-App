function purchaseOrderOwnerFilter(userShortCode, isFullAccess, ownerColumn = '[tb_created_by]') {
  return isFullAccess ? { sql: '', params: [] }
    : { sql: `AND ${ownerColumn} = ?`, params: [String(userShortCode ?? '').trim()] };
}

module.exports = { purchaseOrderOwnerFilter };
