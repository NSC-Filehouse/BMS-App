const { runSQLQueryAccess } = require('./access');
const text = value => String(value ?? '').trim();

async function loadSupplierInvoiceLinks(database, supplierNumbers, { scopeSql = '', dateSql = '', dateParams = [] } = {}) {
  if (!supplierNumbers.length) return new Map();
  // A supplier invoice number is only meaningful together with its supplier.
  // beP_LieferantRG is the invoice date; exclude another year's reused number.
  const rows = await runSQLQueryAccess(database, `SELECT [x].[be_LfdNR] AS receiptId,
      [b].[be_Bestellindex] AS orderNumber,[p].[beP_BEposID] AS positionNumber,
      [p].[beP_Artikelindex] AS articleIndex,[p].[beP_Artikel] AS article,
      [a].[agA_Artikelname_Lieferant] AS supplierArticleName,[a].[agA_Artikelname] AS masterArticleName
    FROM [dbo].[tblBelege] [x]
    JOIN [dbo].[tblBestellung] [b] ON [b].[be_KdNr]=[x].[be_Firma_KdNR]
    JOIN [dbo].[tblBest_Position] [p] ON [p].[beP_Bestellindex]=[b].[be_Bestellindex]
      AND NULLIF(LTRIM(RTRIM([p].[beP_LiefRGnr])),N'')=NULLIF(LTRIM(RTRIM([x].[be_RgNR])),N'')
      AND (CONVERT(date,[p].[beP_LieferantRG])=CONVERT(date,[x].[be_Datum])
        OR [p].[beP_LieferantRG] IS NULL AND NOT EXISTS (
          SELECT 1 FROM [dbo].[tblBelege] [other]
          WHERE [other].[be_EinAus]=2 AND [other].[be_Firma_KdNR]=[x].[be_Firma_KdNR]
            AND NULLIF(LTRIM(RTRIM([other].[be_RgNR])),N'')=NULLIF(LTRIM(RTRIM([x].[be_RgNR])),N'')
            AND CONVERT(date,[other].[be_Datum])<>CONVERT(date,[x].[be_Datum])))
    LEFT JOIN [dbo].[tblArt_Artikel] [a] ON [a].[agA_Artikelindex]=[p].[beP_Artikelindex]
    WHERE [x].[be_EinAus]=2 AND [x].[be_Firma_KdNR] IN (${supplierNumbers.map(() => '?').join(',')})
      AND COALESCE([p].[beP_Storno],0)<>1 ${scopeSql} ${dateSql}
    ORDER BY [x].[be_LfdNR],[b].[be_Bestellindex],[p].[beP_BEposID]`, [...supplierNumbers, ...dateParams]);
  const result = new Map();
  for (const row of rows) {
    const id = text(row.receiptId);
    if (!result.has(id)) result.set(id, { orderNumbers: [], positionNumbers: [], materials: [] });
    const entry = result.get(id);
    for (const [key, value] of [['orderNumbers', row.orderNumber], ['positionNumbers', row.positionNumber]]) {
      const name = text(value);
      if (name && !entry[key].includes(name)) entry[key].push(name);
    }
    const material = { articleIndex: text(row.articleIndex), article: text(row.supplierArticleName) || text(row.article),
      purchaseArticle: text(row.article), masterArticleName: text(row.masterArticleName) };
    if (!entry.materials.some(existing => existing.articleIndex === material.articleIndex && existing.article === material.article)) entry.materials.push(material);
  }
  return result;
}
module.exports = { loadSupplierInvoiceLinks };
