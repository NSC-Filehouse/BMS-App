const NOT_CREATED_CODES = new Set([
  'ORDER_PDF_NOT_FOUND',
  'ORDER_NOT_FOUND',
  'TIMELINE_ORDER_INDEX_NOT_AVAILABLE',
  'TEMP_ORDER_ORDER_INDEX_NOT_AVAILABLE',
]);

export function getOrderPdfErrorMessage(error, t) {
  if (NOT_CREATED_CODES.has(String(error?.code || ''))) {
    return t('order_pdf_not_created_yet');
  }
  return error?.message || t('order_pdf_unavailable');
}
