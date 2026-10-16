function normalizeDocumentNumber(value) {
  return String(value ?? '').trim().toUpperCase();
}

function documentDateValue(value) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function compareDocumentsByDateDesc(first, second) {
  const firstDate = documentDateValue(first.invoiceDate);
  const secondDate = documentDateValue(second.invoiceDate);
  if (firstDate !== secondDate) return secondDate > firstDate ? 1 : -1;

  const firstNumber = normalizeDocumentNumber(first.invoiceNumber);
  const secondNumber = normalizeDocumentNumber(second.invoiceNumber);
  const numberDifference = secondNumber.localeCompare(firstNumber, 'de', { numeric: true });
  if (numberDifference !== 0) return numberDifference;

  return first.sourceIndex - second.sourceIndex;
}

function getCustomerInvoiceDocumentType(row) {
  const status = String(row?.documentStatus ?? row?.re_Auftragsstatus ?? '').trim().toLowerCase();
  return status === 'gutschrift' ? 'creditNote' : 'invoice';
}

function getCustomerInvoiceDocumentKey(row) {
  const customerId = normalizeDocumentNumber(row?.customerId ?? row?.re_KdNr);
  const invoiceNumber = normalizeDocumentNumber(row?.invoiceNumber ?? row?.re_RgNummer);
  return `${customerId}\u0000${invoiceNumber}`;
}

/**
 * Resolves credits against complete customer history before selecting invoice
 * groups. Exact references take priority over unambiguous calculation positions.
 */
function buildCustomerInvoiceTimeline(rows, { scope = 'all', positionRows = [] } = {}) {
  const documents = (Array.isArray(rows) ? rows : []).map((row, sourceIndex) => {
    const documentType = getCustomerInvoiceDocumentType(row);
    const invoiceNumber = String(row?.invoiceNumber ?? row?.re_RgNummer ?? '').trim();
    const invoiceDate = row?.invoiceDate ?? row?.re_RgDatum ?? null;
    const referenceInvoiceNumber = String(
      row?.referenceInvoiceNumber ?? row?.re_RefRGNr ?? '',
    ).trim();
    return {
      ...row,
      invoiceNumber,
      invoiceDate,
      referenceInvoiceNumber,
      documentType,
      isCreditNote: documentType === 'creditNote',
      sourceIndex,
      documentKey: getCustomerInvoiceDocumentKey({
        ...row,
        invoiceNumber,
      }),
      paymentStatus: getCustomerInvoicePaymentStatus(row),
    };
  });

  const invoiceCandidates = new Map();
  documents
    .filter((document) => !document.isCreditNote && normalizeDocumentNumber(document.invoiceNumber))
    .forEach((invoice) => {
      const key = invoice.documentKey;
      const candidates = invoiceCandidates.get(key) || [];
      candidates.push(invoice);
      invoiceCandidates.set(key, candidates);
    });

  const attachedCredits = new Map();
  const unassignedCredits = [];
  const positions = new Map();
  positionRows.forEach((row) => {
    const key = getCustomerInvoiceDocumentKey(row);
    if (!positions.has(key)) positions.set(key, new Set());
    positions.get(key).add(normalizeDocumentNumber(row.orderPositionId));
  });
  documents
    .filter((document) => document.isCreditNote)
    .forEach((credit) => {
      const reference = normalizeDocumentNumber(credit.referenceInvoiceNumber);
      let candidates = reference
        ? invoiceCandidates.get(getCustomerInvoiceDocumentKey({
          ...credit,
          invoiceNumber: reference,
        })) || []
        : [];
      const creditPositions = positions.get(credit.documentKey);
      // The ERP's sales side of the calculation uses reP_ABposID. Only use
      // this fallback when every credit position has one common invoice.
      if (!reference && creditPositions?.size && !creditPositions.has('')) {
        candidates = [...invoiceCandidates.values()].flat().filter((invoice) => (
          normalizeDocumentNumber(invoice.customerId ?? invoice.re_KdNr)
            === normalizeDocumentNumber(credit.customerId ?? credit.re_KdNr)
          && [...creditPositions].every((id) => positions.get(invoice.documentKey)?.has(id))
        ));
      }

      const invoicePositions = candidates.length === 1 ? positions.get(candidates[0].documentKey) : null;
      const conflictingPositions = creditPositions?.size && invoicePositions?.size
        && [...creditPositions].some((id) => !id || !invoicePositions.has(id));

      if (candidates.length === 1 && !conflictingPositions) {
        const invoice = candidates[0];
        credit.relatedInvoiceNumber = invoice.invoiceNumber;
        credit.isAttachedCredit = true;
        credit.creditKind = getCustomerCreditKind(invoice, credit);
        const children = attachedCredits.get(invoice.documentKey) || [];
        children.push(credit);
        attachedCredits.set(invoice.documentKey, children);
      } else {
        credit.relatedInvoiceNumber = credit.referenceInvoiceNumber || null;
        credit.isAttachedCredit = false;
        credit.invoiceAssignment = candidates.length || conflictingPositions ? 'ambiguous' : 'missing';
        if (matchesScope(credit, scope)) unassignedCredits.push(credit);
      }
    });

  const invoices = documents
    .filter((document) => !document.isCreditNote)
    .filter((invoice) => {
      const credits = attachedCredits.get(invoice.documentKey) || [];
      invoice.isFullyCredited = isFullyCredited(invoice, credits);
      if (scope !== 'open') return matchesScope(invoice, scope);
      // Unpaid full reversals have no remaining group balance. A paid invoice
      // with a still-open credit remains the anchor for that customer credit.
      const openReversal = invoice.isFullyCredited
        && [invoice, ...credits].every((row) => (
          Number(row.paidFlag ?? row.re_Bezahlt) === 3
          && !row.paidDate && Number(row.partialAmount ?? 0) === 0
        ));
      return !openReversal && [invoice, ...credits].some((row) => row.paymentStatus === 'open');
    })
    .sort(compareDocumentsByDateDesc);
  attachedCredits.forEach((credits) => credits.sort(compareDocumentsByDateDesc));
  unassignedCredits.sort(compareDocumentsByDateDesc);

  const timeline = [];
  let unassignedIndex = 0;
  for (const invoice of invoices) {
    while (
      unassignedIndex < unassignedCredits.length
      && documentDateValue(unassignedCredits[unassignedIndex].invoiceDate) > documentDateValue(invoice.invoiceDate)
    ) {
      timeline.push(unassignedCredits[unassignedIndex]);
      unassignedIndex += 1;
    }

    timeline.push(invoice);
    timeline.push(...(attachedCredits.get(invoice.documentKey) || []));
  }

  timeline.push(...unassignedCredits.slice(unassignedIndex));
  return timeline;
}

function getCustomerInvoicePaymentStatus(row) {
  const value = row?.paidFlag ?? row?.re_Bezahlt;
  if (value === null || value === undefined || String(value).trim() === '') return 'unknown';
  const flag = Number(value);
  if (!Number.isFinite(flag)) return 'unknown';
  return flag === 1 ? 'paid' : 'open';
}

function matchesScope(document, scope) {
  if (scope === 'open') return document.paymentStatus === 'open';
  return document.matchesDateFilter === undefined || Number(document.matchesDateFilter) === 1;
}

function comparisonAmount(row) {
  const currency = normalizeDocumentNumber(row.currency || 'EUR');
  const value = currency === 'EUR' ? row.grossEu : row.grossDm;
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function comparableCredit(invoice, credit) {
  return normalizeDocumentNumber(invoice.currency || 'EUR') === normalizeDocumentNumber(credit.currency || 'EUR')
    && comparisonAmount(invoice) > 0
    && comparisonAmount(credit) !== null && comparisonAmount(credit) < 0;
}

function getCustomerCreditKind(invoice, credit) {
  if (!comparableCredit(invoice, credit)) return 'unknown';
  const invoiceAmount = comparisonAmount(invoice);
  const creditAmount = -comparisonAmount(credit);
  if (creditAmount === invoiceAmount) return 'full';
  return creditAmount < invoiceAmount ? 'partial' : 'unknown';
}

function isFullyCredited(invoice, credits) {
  return credits.length > 0 && credits.every((credit) => comparableCredit(invoice, credit))
    && comparisonAmount(invoice) + credits.reduce((sum, credit) => sum + comparisonAmount(credit), 0) === 0;
}

module.exports = {
  buildCustomerInvoiceTimeline,
  compareDocumentsByDateDesc,
  getCustomerInvoiceDocumentType,
  getCustomerInvoicePaymentStatus,
  normalizeDocumentNumber,
};
