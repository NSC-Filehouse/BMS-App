const { resolveProductGroup } = require('../product-grouping');
const { compareVlPositions } = require('../mfi-sort');

function compact(value) {
  return String(value ?? '')
    .toLocaleLowerCase('de-DE')
    .replace(/[\s._\-/]/g, '');
}
function catalogWhere(query = {}) {
  const clauses = ['COALESCE(a.agA_Deaktiv,0)=0'];
  const params = [];
  // Search article identities, not category labels. Compact product codes also
  // match the spellings "ML 1803" and "ML-1803".
  const fields =
    "CONCAT(a.agA_Artikelindex,N' ',a.agA_Artikelname,N' ',a.agA_Artikelname_Lieferant,N' ',a.agA_Handelsname,N' ',a.agA_Produktnummer,N' ',a.agA_AlteBezeichnung)";
  const normalized = `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(${fields}),N' ',N''),N'-',N''),N'_',N''),N'.',N''),N'/',N'')`;
  for (const term of String(query.q || '')
    .trim()
    .slice(0, 200)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 10)) {
    clauses.push(`${normalized} LIKE ?`);
    params.push(`%${compact(term).replace(/[\[\]%_]/g, (c) => `[${c}]`)}%`);
  }
  if (query.articleIndex) {
    clauses.push('a.agA_Artikelindex=?');
    params.push(String(query.articleIndex));
  }
  return { sql: clauses.join(' AND '), params };
}
const catalogSelect = `SELECT a.agA_Artikelindex AS articleIndex,COALESCE(NULLIF(a.agA_Artikelname,N''),a.agA_Artikelindex) AS article,
 a.agA_Artikelname AS masterArticleName,a.agA_Einheit AS unit,a.agA_NettoEK_EU AS costPrice,
 a.agA_MFI AS mfi,a.agA_MFI_bis AS mfiTo,a.agA_Produktnummer AS productNumber,
 a.agA_Artikelgruppe AS articleGroupId,g.ag_Gruppenname AS articleGroupName,k.art4_Bezeichnung AS plastic,u.art5_Bezeichnung AS plasticSubCategory
 FROM dbo.tblArt_Artikel a LEFT JOIN dbo.tblArtikelgruppe g ON g.ag_Gruppenindex=a.agA_Artikelgruppe
 LEFT JOIN dbo.tblArt4_Kunststoff k ON k.art4_ID_Kunststoff=a.agA_ID_Kunststoff
 LEFT JOIN dbo.tblArt5_KunststoffUnter u ON u.art5_ID_Kunststoff=a.agA_ID_Kunststoff AND u.art5_ID_KunststoffUnter=a.agA_ID_KunststoffUnter`;
function groupArticles(rows) {
  const groups = new Map();
  for (const article of rows) {
    const group = resolveProductGroup(article);
    if (!groups.has(group.key))
      groups.set(group.key, {
        key: group.key,
        name: group.name,
        positions: [],
      });
    groups.get(group.key).positions.push(article);
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      positions: g.positions.sort(compareVlPositions),
      availableCount: g.positions.length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}
module.exports = { compact, catalogWhere, catalogSelect, groupArticles };
