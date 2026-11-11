const { runSQLQueryAccess, runSQLQuerySqlServer } = require('../db/access');
const config = require('../config');
async function loadOfferOptions(database, lang = 'de') {
  const language = lang === 'en' ? 'en' : 'de';
  const [payments, packagingTypes, incoterms] = await Promise.all([
    runSQLQuerySqlServer(
      config.sql.database,
      `SELECT zaS_ID AS id,zaS_Zahl_Text AS text FROM dbo.tblZahltext_Sprachen WHERE LOWER(zaS_SprachID)=? AND COALESCE(zaS_Zahl_Text,N'')<>N'' ORDER BY zaS_Zahl_Text`,
      [language],
    ),
    runSQLQuerySqlServer(
      config.sql.database,
      `SELECT spT_ID AS id,CASE WHEN ?='en' AND NULLIF(LTRIM(RTRIM(spT_en)),N'') IS NOT NULL THEN LTRIM(RTRIM(spT_en)) ELSE LTRIM(RTRIM(spT_de)) END AS text
      FROM dbo.tblSprachenTexte WHERE spT_GruppenID=1 AND LTRIM(RTRIM(COALESCE(spT_Ort,N'')))=N'BE, AB' AND NULLIF(LTRIM(RTRIM(spT_de)),N'') IS NOT NULL ORDER BY spT_SortKey,spT_ID`,
      [language],
    ),
    runSQLQueryAccess(
      database,
      `SELECT lib_ID AS id,lib_Lieferbedingung AS text FROM dbo.tblLieferbedingungen WHERE LOWER(COALESCE(lib_SprachID,''))=? AND COALESCE(lib_Lieferbedingung,'')<>'' ORDER BY lib_Lieferbedingung`,
      [language],
    ),
  ]);
  return { payments, packagingTypes, incoterms };
}
module.exports = { loadOfferOptions };
