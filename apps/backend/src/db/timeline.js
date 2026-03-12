const config = require('../config');
const logger = require('../logger');
const { runSQLQuerySqlServer } = require('./access');
const { sendPushNotificationsForTimelineEntries } = require('./push');

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function asNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isMissingTimelineTableError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('tblbmsapp_timeline') && (
    msg.includes('invalid object name')
    || msg.includes('ungültiger objektname')
    || msg.includes('ungueltiger objektname')
  );
}

async function appendTimelineEntries(entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) return;
  const insertedEntries = [];

  const sql = `
    INSERT INTO [dbo].[tblBMSApp_Timeline] (
      [tl_CreatedAt],
      [tl_Mandant],
      [tl_MandantKurz],
      [tl_CompanyId],
      [tl_UserEmail],
      [tl_UserShortCode],
      [tl_Type],
      [tl_Product],
      [tl_ProductId],
      [tl_BeNumber],
      [tl_AmountKg],
      [tl_Unit],
      [tl_ReferenceId],
      [tl_PayloadJson]
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  for (const entry of list) {
    try {
      await runSQLQuerySqlServer(config.sql.database, sql, [
        entry.createdAt || new Date().toISOString(),
        asText(entry.mandant),
        asText(entry.mandantShortName) || null,
        asNumberOrNull(entry.companyId),
        asText(entry.userEmail) || null,
        asText(entry.userShortCode),
        asText(entry.type),
        asText(entry.product),
        asText(entry.productId) || null,
        asText(entry.beNumber) || null,
        asNumberOrNull(entry.amountKg),
        asText(entry.unit) || null,
        asText(entry.referenceId) || null,
        entry.payloadJson ? JSON.stringify(entry.payloadJson) : null,
      ]);
      insertedEntries.push(entry);
    } catch (error) {
      if (isMissingTimelineTableError(error)) {
        logger.warn('Timeline table [dbo].[tblBMSApp_Timeline] is missing. Timeline entry skipped.');
        return;
      }
      logger.warn(`Failed to append timeline entry: ${error?.message || error}`);
    }
  }

  if (insertedEntries.length) {
    await sendPushNotificationsForTimelineEntries(insertedEntries);
  }
}

module.exports = {
  appendTimelineEntries,
};
