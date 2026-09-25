const NOT_CREATED_CODES = new Set([
  'ORDER_PDF_NOT_FOUND',
  'ORDER_NOT_FOUND',
  'TIMELINE_ORDER_INDEX_NOT_AVAILABLE',
  'TEMP_ORDER_ORDER_INDEX_NOT_AVAILABLE',
]);

const BE_NOT_CREATED_CODES = new Set([
  'BE_PDF_NOT_FOUND',
  'PURCHASE_ORDER_PDF_NOT_FOUND',
  'PURCHASE_ORDER_NOT_FOUND',
  'TIMELINE_BE_NUMBER_NOT_AVAILABLE',
  'TEMP_ORDER_BE_NOT_FOUND',
]);

export function getOrderPdfErrorMessage(error, t) {
  if (NOT_CREATED_CODES.has(String(error?.code || ''))) {
    return t('order_pdf_not_created_yet');
  }
  return error?.message || t('order_pdf_unavailable');
}

export function getBePdfErrorMessage(error, t) {
  if (BE_NOT_CREATED_CODES.has(String(error?.code || ''))) {
    return t('be_pdf_not_created_yet');
  }
  return error?.message || t('be_pdf_unavailable');
}
