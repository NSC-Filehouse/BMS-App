const { runSQLQueryAccess } = require('./access');

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

async function loadErpSalesRepresentative(database, orderIndex) {
  const normalizedOrderIndex = asText(orderIndex);
  if (!normalizedOrderIndex) return null;

  const rows = await runSQLQueryAccess(database, `
    SELECT TOP 1
      [au_Auftragsindex] AS orderIndex,
      [au_Aussendienst] AS salesRepresentative
    FROM [dbo].[tblAuftrag]
    WHERE [au_Auftragsindex] = ?
  `, [normalizedOrderIndex]);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  const shortCode = asText(row?.salesRepresentative ?? row?.au_Aussendienst);
  if (!shortCode) return null;

  return {
    orderIndex: asText(row?.orderIndex ?? row?.au_Auftragsindex) || normalizedOrderIndex,
    shortCode,
  };
}

module.exports = {
  loadErpSalesRepresentative,
};
