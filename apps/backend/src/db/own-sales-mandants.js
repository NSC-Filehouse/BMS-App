const config = require('../config');
const logger = require('../logger');
const { SALES_MANDANT_IDS } = require('../config/sales-mandants');
const { runSQLQuerySqlServer } = require('./access');

function normalizeCustomerId(value) {
  return String(value ?? '').trim().toUpperCase();
}

function escapeIdentifier(value) {
  const text = String(value || '').trim();
  if (!text || /[^A-Za-z0-9_]/.test(text)) {
    throw new Error(`Invalid SQL identifier: ${value}`);
  }
  return `[${text}]`;
}

function isOwnSalesMandantCustomer(customer) {
  return customer?.interCompany === true
    && SALES_MANDANT_IDS.includes(customer?.ownSalesMandantId);
}

async function loadOwnSalesMandantId(customer) {
  const customerId = normalizeCustomerId(customer?.customerId);
  if (!customerId) return null;

  try {
    const rows = await runSQLQuerySqlServer(config.sql.database, `
      SELECT ${escapeIdentifier(config.sql.columns.firmaId)} AS mandantId,
        [md_KdNR] AS customerId
      FROM [dbo].${escapeIdentifier(config.sql.tables.mandant)}
      WHERE ${escapeIdentifier(config.sql.columns.firmaId)} IN (${SALES_MANDANT_IDS.map(() => '?').join(', ')})
    `, [...SALES_MANDANT_IDS]);
    const matches = (rows || []).filter((row) => (
      SALES_MANDANT_IDS.includes(Number(row.mandantId))
      && normalizeCustomerId(row.customerId) === customerId
    ));
    if (matches.length > 1 || (matches.length === 1 && customer.interCompany !== true)) {
      logger.warn(`Eigener Verkaufsmandant fuer Kunde ${customerId} nicht eindeutig bestaetigt; normale Kreditpruefung bleibt aktiv.`);
      return null;
    }
    return matches.length === 1 ? Number(matches[0].mandantId) : null;
  } catch (error) {
    // Directory failures must not discard the independently loaded credit data.
    logger.warn(`Eigener Verkaufsmandant fuer Kunde ${customerId} konnte nicht bestimmt werden; normale Kreditpruefung bleibt aktiv: ${error.message}`);
    return null;
  }
}

module.exports = { isOwnSalesMandantCustomer, loadOwnSalesMandantId };
