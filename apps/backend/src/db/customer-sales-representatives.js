const config = require('../config');
const { runSQLQuerySqlServer } = require('./access');

// These mandants must not appear as responsible mandants on the employee
// detail reached from a customer. The AD assignment itself remains visible.
const HIDDEN_CUSTOMER_DETAIL_MANDANT_IDS = new Set([17, 18]);

function normalizeShortCode(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeMandant(row) {
  const mandantId = Number(row?.MandantID ?? row?.mandantId);
  const shortCode = normalizeShortCode(row?.MandantKuerzel ?? row?.mandantKurz);
  const name = String(row?.MandantName ?? row?.mandantName ?? '').trim();
  if (!Number.isInteger(mandantId) && !shortCode && !name) return null;

  return {
    id: Number.isInteger(mandantId) ? mandantId : null,
    shortCode,
    name,
  };
}

function buildSalesRepresentativeList(primaryShortCode, rows, primaryMandant = null) {
  const result = [];
  const byShortCode = new Map();

  const add = (value, primary = false, mandant = null) => {
    const shortCode = normalizeShortCode(value);
    const key = shortCode.toLowerCase();
    if (!key) return;

    let representative = byShortCode.get(key);
    if (!representative) {
      representative = { shortCode, primary: Boolean(primary), mandants: [] };
      byShortCode.set(key, representative);
      result.push(representative);
    } else if (primary) {
      representative.primary = true;
    }

    const normalizedMandant = normalizeMandant(mandant);
    if (!normalizedMandant || HIDDEN_CUSTOMER_DETAIL_MANDANT_IDS.has(normalizedMandant.id)) return;
    const mandantKey = [
      normalizedMandant.id ?? '',
      normalizedMandant.shortCode.toLowerCase(),
      normalizedMandant.name.toLowerCase(),
    ].join('|');
    if (!representative.mandants.some((item) => (
      [item.id ?? '', item.shortCode.toLowerCase(), item.name.toLowerCase()].join('|') === mandantKey
    ))) {
      representative.mandants.push(normalizedMandant);
    }
  };

  add(primaryShortCode, true, primaryMandant);
  for (const row of (Array.isArray(rows) ? rows : [])) {
    add(
      row?.Aussendienst ?? row?.aussendienst,
      false,
      row,
    );
  }

  return result;
}

async function loadCustomerSalesRepresentatives(database, customerId, primaryShortCode) {
  const activeMandantId = Number(database?.firmaId);
  const excludeMandant = Number.isInteger(activeMandantId) && activeMandantId >= 0
    ? activeMandantId
    : null;

  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT
      [MandantID],
      [MandantKuerzel],
      [MandantName],
      [Aussendienst]
    FROM [dbo].[tvfKundeBetreuerMandanten](?, ?, 0, 0)
    ORDER BY [MandantKuerzel] ASC, [Aussendienst] ASC
  `, [String(customerId || '').trim(), excludeMandant]);

  return buildSalesRepresentativeList(primaryShortCode, rows, {
    MandantID: database?.firmaId,
    MandantKuerzel: database?.shortName,
    MandantName: database?.name,
  });
}

module.exports = {
  buildSalesRepresentativeList,
  loadCustomerSalesRepresentatives,
  normalizeShortCode,
};
