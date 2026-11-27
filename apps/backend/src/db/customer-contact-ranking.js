const { runSQLQueryAccess, withSqlTransaction } = require('./access');
const config = require('../config');
const logger = require('../logger');

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

async function rememberFirstContact(database, companyId, contactId, selected, transact = withSqlTransaction) {
  if ((selected !== true && selected !== 'true') || !companyId || !contactId) return false;
  const databaseName = database?.databaseName || database?.name || database?.database || config.sql.database;
  try {
    return await transact(databaseName, async ({ query }) => {
      const { rows } = await query(`SELECT kdA_lfdNR AS id, kdA_Ranking AS ranking
        FROM dbo.tblKun_Ansprech WITH (UPDLOCK,HOLDLOCK)
        WHERE kdA_KdNR = ?`, [companyId]);
      if (rows.some(row => Number(row.ranking) === 1) || !rows.some(row => Number(row.id) === Number(contactId))) {
        return false;
      }
      const { message } = await setCustomerContactRanking(database, companyId, contactId, 1,
        async (_database, sql, params) => (await query(sql, params)).rows);
      if (message) throw new Error(message);
      return true;
    });
  } catch (error) {
    logger.warn('Top-1-Ansprechpartner konnte nicht gemerkt werden.', error);
    return false;
  }
}

module.exports = {
  rememberFirstContact,
  SET_CUSTOMER_CONTACT_RANKING_SQL,
  getRankingMessage,
  setCustomerContactRanking,
};
