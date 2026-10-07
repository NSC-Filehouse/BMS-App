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
  const authoritative = customer?.customerRequirements;
  if (authoritative?.available && authoritative?.customerFound && Array.isArray(authoritative.missingFields)) {
    return authoritative.missingFields.filter((field) => Object.hasOwn(CUSTOMER_ORDER_REQUIREMENTS, field));
  }
  return Object.entries(CUSTOMER_ORDER_REQUIREMENTS)
    .filter(([, requirement]) => !String(customer?.[requirement.field] ?? '').trim())
    .map(([key]) => key);
}
