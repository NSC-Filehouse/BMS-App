// Display-only calculation from the invoice's payment-term master data.
// Keep calendar arithmetic in UTC so daylight-saving changes cannot shift days.
function calculateCustomerInvoiceDueDate(invoiceDate, paymentTerm) {
  if (!invoiceDate || !paymentTerm) return null;
  const rawDays = paymentTerm.netDays;
  if (rawDays === null || rawDays === undefined || String(rawDays).trim() === '') return null;
  const netDays = Number(rawDays);
  const basis = Number(paymentTerm.basis);
  if (!Number.isSafeInteger(netDays) || netDays < 0 || ![1, 2].includes(basis)) return null;

  const value = invoiceDate instanceof Date
    ? (Number.isNaN(invoiceDate.getTime()) ? '' : invoiceDate.toISOString())
    : String(invoiceDate);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T| )/);
  if (!match || Number(match[1]) < 1000) return null;
  const datePart = match[0].slice(0, 10);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== datePart) return null;

  // Basis 2: count from the end of the invoice month ("ab Ultimo").
  if (basis === 2) date.setUTCMonth(date.getUTCMonth() + 1, 0);
  date.setUTCDate(date.getUTCDate() + netDays);

  const monthEnd = paymentTerm.monthEnd === true || paymentTerm.monthEnd === 1;
  const halfMonthEnd = paymentTerm.halfMonthEnd === true || paymentTerm.halfMonthEnd === 1;
  if (monthEnd) {
    date.setUTCMonth(date.getUTCMonth() + 1, 0);
  } else if (halfMonthEnd) {
    if (date.getUTCDate() <= 15) date.setUTCDate(15);
    else date.setUTCMonth(date.getUTCMonth() + 1, 0);
  }

  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() > 9999) return null;
  return date.toISOString().slice(0, 10);
}

module.exports = { calculateCustomerInvoiceDueDate };
