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
 * Orders customer invoices and credit notes while attaching only credits with
 * an unambiguous exact reference to an invoice in the same result set.
 */
function buildCustomerInvoiceTimeline(rows) {
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
  documents
    .filter((document) => document.isCreditNote)
    .forEach((credit) => {
      const reference = normalizeDocumentNumber(credit.referenceInvoiceNumber);
      const candidates = reference
        ? invoiceCandidates.get(getCustomerInvoiceDocumentKey({
          ...credit,
          invoiceNumber: reference,
        })) || []
        : [];

      if (candidates.length === 1) {
        const invoice = candidates[0];
        credit.relatedInvoiceNumber = invoice.invoiceNumber;
        credit.isAttachedCredit = true;
        const children = attachedCredits.get(invoice.documentKey) || [];
        children.push(credit);
        attachedCredits.set(invoice.documentKey, children);
      } else {
        credit.relatedInvoiceNumber = credit.referenceInvoiceNumber || null;
        credit.isAttachedCredit = false;
        unassignedCredits.push(credit);
      }
    });

  const invoices = documents
    .filter((document) => !document.isCreditNote)
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

module.exports = {
  buildCustomerInvoiceTimeline,
  compareDocumentsByDateDesc,
  getCustomerInvoiceDocumentType,
  normalizeDocumentNumber,
};
