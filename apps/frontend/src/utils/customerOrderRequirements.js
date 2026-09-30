export const CUSTOMER_ORDER_REQUIREMENTS = Object.freeze({
  invoiceEmail: Object.freeze({
    field: 'kd_RG_Email',
    labelKey: 'customer_invoice_email_label',
  }),
  vatId: Object.freeze({
    field: 'kd_UST_Ident_Nr',
    labelKey: 'customer_vat_id_label',
  }),
});

export function getMissingCustomerOrderRequirements(customer = {}) {
  return Object.entries(CUSTOMER_ORDER_REQUIREMENTS)
    .filter(([, requirement]) => !String(customer?.[requirement.field] ?? '').trim())
    .map(([key]) => key);
}
