const config = require('../config');
const { runSQLQuerySqlServer } = require('./access');

const text = (value) => String(value ?? '').trim();

async function loadPackagingTypes(lang = 'de') {
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT [spT_ID] AS id, [spT_SortKey] AS sortKey, [spT_de] AS de, [spT_en] AS en
    FROM [dbo].[tblSprachenTexte]
    WHERE [spT_GruppenID] = 1
      AND LTRIM(RTRIM(COALESCE([spT_Ort], N''))) = N'BE, AB'
      AND NULLIF(LTRIM(RTRIM([spT_de])), N'') IS NOT NULL
    ORDER BY [spT_SortKey], [spT_ID]`, []);
  return rows.map((row) => ({
    id: Number(row.id),
    sortKey: Number(row.sortKey),
    text: lang === 'en' ? text(row.en) || text(row.de) : text(row.de),
    aliases: [text(row.de), text(row.en)].filter(Boolean),
  })).filter((row) => Number.isInteger(row.id) && row.id > 0 && row.text);
}

module.exports = { loadPackagingTypes };
