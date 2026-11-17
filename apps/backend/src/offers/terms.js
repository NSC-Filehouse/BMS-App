const { runSQLQueryAccess, runSQLQuerySqlServer } = require('../db/access');
const config = require('../config');
const { loadPackagingTypes } = require('../db/packaging-types');
async function loadOfferOptions(database, lang = 'de') {
  const language = lang === 'en' ? 'en' : 'de';
  const [payments, packagingTypes, incoterms] = await Promise.all([
    runSQLQuerySqlServer(
      config.sql.database,
      `SELECT zaS_ID AS id,zaS_Zahl_Text AS text FROM dbo.tblZahltext_Sprachen WHERE LOWER(zaS_SprachID)=? AND COALESCE(zaS_Zahl_Text,N'')<>N'' ORDER BY zaS_Zahl_Text`,
      [language],
    ),
    loadPackagingTypes(language),
    runSQLQueryAccess(
      database,
      `SELECT lib_ID AS id,lib_Lieferbedingung AS text FROM dbo.tblLieferbedingungen WHERE LOWER(COALESCE(lib_SprachID,''))=? AND COALESCE(lib_Lieferbedingung,'')<>'' ORDER BY lib_Lieferbedingung`,
      [language],
    ),
  ]);
  return { payments, packagingTypes, incoterms };
}
module.exports = { loadOfferOptions };
