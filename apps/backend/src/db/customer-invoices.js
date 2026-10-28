const { runSQLQueryAccess } = require('./access');
const { buildCustomerInvoiceTimeline } = require('../customer-invoice-ordering');

async function loadCustomerInvoiceTimeline(database, customerId, { scope, dateFilter }, query = runSQLQueryAccess) {
  // Resolve relationships against the customer's complete history before any
  // scope is applied. Child credits do not inherit the date filter themselves.
  const rows = await query(database, `
    SELECT
      [re_KdNr] AS customerId,
      [re_RgNummer] AS invoiceNumber,
      [re_RgDatum] AS invoiceDate,
      [re_FaelligBis] AS dueDate,
      [re_Bezahlt] AS paidFlag,
      [re_BezahltDatum] AS paidDate,
      [re_TeilBetrag] AS partialAmount,
      [re_BasisValuta] AS currency,
      [re_Auftragsstatus] AS documentStatus,
      [re_RefRGNr] AS referenceInvoiceNumber,
      [re_Zahltext] AS paymentTextId,
      [re_MahnTextID] AS reminderTextId,
      [re_MahnTextIDneu] AS reminderTextIdNew,
      [re_Bruttosumme_EU] AS grossEu,
      [re_Bruttosumme_DM] AS grossDm,
      CASE WHEN 1 = 1 ${dateFilter.sql} THEN 1 ELSE 0 END AS matchesDateFilter
    FROM [dbo].[tblRechnung]
    WHERE [re_KdNr] = ?
    ORDER BY [re_RgDatum] DESC, [re_RgNummer] DESC
  `, [...dateFilter.params, customerId]);

  const positionRows = rows.some((row) => String(row.documentStatus).trim().toLowerCase() === 'gutschrift')
    ? await query(database, `
      SELECT [r].[re_KdNr] AS customerId, [r].[re_RgNummer] AS invoiceNumber,
        [p].[reP_ABposID] AS orderPositionId
      FROM [dbo].[tblRechnung] [r]
      INNER JOIN [dbo].[tblRech_Position] [p] ON [p].[reP_RGnummer] = [r].[re_RgNummer]
      WHERE [r].[re_KdNr] = ?
    `, [customerId])
    : [];

  return buildCustomerInvoiceTimeline(rows, { scope, positionRows });
}

module.exports = { loadCustomerInvoiceTimeline };
