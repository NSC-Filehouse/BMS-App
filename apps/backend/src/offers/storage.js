const { appTableSql } = require('../db/app-tables');
const headerFields = {
  customerId: 'tag_customer_id',
  customerName: 'tag_customer_name',
  customerAddress: 'tag_customer_address',
  contactId: 'tag_contact_id',
  contact: 'tag_contact',
  customerReference: 'tag_customer_reference',
  paymentId: 'tag_payment_id',
  paymentText: 'tag_payment_text',
  specialPaymentCondition: 'tag_special_payment_condition',
  deliveryTermsId: 'tag_delivery_terms_id',
  deliveryTerms: 'tag_delivery_terms',
  packagingId: 'tag_packaging_id',
  packaging: 'tag_packaging',
  deliveryAddressId: 'tag_delivery_address_id',
  deliveryAddress: 'tag_delivery_address',
  deliveryAddressManual: 'tag_delivery_address_manual',
  internalNote: 'tag_internal_note',
};
const positionFields = {
  lineNo: 'tagp_line_no',
  lineKey: 'tagp_line_key',
  articleIndex: 'tagp_article_index',
  article: 'tagp_article',
  masterArticle: 'tagp_master_article',
  quantity: 'tagp_quantity',
  unit: 'tagp_unit',
  price: 'tagp_price',
  priceBasis: 'tagp_price_basis',
  deliveryDate: 'tagp_delivery_date',
  valutaDate: 'tagp_valuta_date',
  costPrice: 'tagp_cost_price',
  wpzOriginal: 'tagp_wpz_original',
  wpzComment: 'tagp_wpz_comment',
  reserve: 'tagp_reserve',
  beNumber: 'tagp_be_number',
  warehouseId: 'tagp_warehouse_id',
  reserveQuantity: 'tagp_reserve_quantity',
  reserveUntil: 'tagp_reserve_until',
};
const H = appTableSql('tempOffer');
const P = appTableSql('tempOfferPosition');
function select(fields, alias = '') {
  return Object.entries(fields)
    .map(([key, col]) => `${alias}[${col}] AS [${key}]`)
    .join(', ');
}
const headerSelect = `${select(headerFields, 'h.')},h.tag_id AS id,h.tag_status AS status,h.tag_created_by AS createdBy,h.tag_created_at AS createdAt,
 h.tag_modified_at AS modifiedAt,h.tag_bms_offer_number AS bmsOfferNumber,h.tag_copy_source_id AS copySourceId,h.tag_return_comment AS returnComment,
 sys.fn_varbintohexstr(h.tag_version) AS version`;
const positionSelect = `${select(positionFields)},tagp_id AS id,sys.fn_varbintohexstr(tagp_reservation_version) AS reservationVersion`;
function dbIdentifier(value) {
  if (!/^[\w.]+$/.test(value || '')) throw new Error('Invalid tenant database');
  return `[${value}]`;
}
async function insert(query, table, fields, values, extras = {}) {
  const columns = {
    ...Object.fromEntries(
      Object.entries(fields).map(([key, col]) => [col, values[key] ?? null]),
    ),
    ...extras,
  };
  return query(
    `INSERT INTO ${table} (${Object.keys(columns)
      .map((c) => `[${c}]`)
      .join(',')}) OUTPUT INSERTED.* VALUES (${Object.keys(columns)
      .map((column) =>
        column === 'tagp_reservation_version' ? 'CONVERT(binary(8),?,1)' : '?',
      )
      .join(',')})`,
    Object.values(columns),
  );
}
async function read(query, id, companyId, owner, locked = false) {
  const row = (
    await query(
      `SELECT ${headerSelect} FROM ${H} h ${locked ? 'WITH (UPDLOCK,HOLDLOCK)' : ''}
    WHERE h.tag_id=? AND h.tag_company_id=? AND h.tag_created_by=?`,
      [id, companyId, owner],
    )
  ).rows[0];
  if (!row) return null;
  row.positions = (
    await query(
      `SELECT ${positionSelect} FROM ${P} WHERE tagp_offer_id=? ORDER BY tagp_line_no`,
      [id],
    )
  ).rows;
  const { totals } = require('./values');
  row.totalAmount = totals(row.positions, 0, 0).netAmount;
  row.currency = 'EUR';
  return row;
}
module.exports = {
  H,
  P,
  headerFields,
  positionFields,
  select,
  headerSelect,
  positionSelect,
  dbIdentifier,
  insert,
  read,
};
