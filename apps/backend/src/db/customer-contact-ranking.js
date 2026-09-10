const { runSQLQueryAccess } = require('./access');

const SET_CUSTOMER_CONTACT_RANKING_SQL = `
  EXEC [dbo].[usp_KundeAnsprech_RankingSetzen]
       @KdNr = ?, @lfdNR = ?, @Rang = ?
`;

function getRankingMessage(rows) {
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row || typeof row !== 'object') return '';
  const value = row.meldung ?? row.Meldung ?? row.MELDUNG ?? '';
  return String(value || '').trim();
}

async function setCustomerContactRanking(
  database,
  customerId,
  contactId,
  ranking,
  queryRunner = runSQLQueryAccess,
) {
  const rows = await queryRunner(database, SET_CUSTOMER_CONTACT_RANKING_SQL, [
    customerId,
    contactId,
    ranking,
  ]);
  return { message: getRankingMessage(rows) };
}

module.exports = {
  SET_CUSTOMER_CONTACT_RANKING_SQL,
  getRankingMessage,
  setCustomerContactRanking,
};
