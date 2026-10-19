// Article lookup for manual selection only. Suggestions are produced by OptionReader.
function articleSelect() {
 return `SELECT a.agA_Artikelindex AS articleIndex,a.agA_Artikelname AS articleName,
 a.agA_Artikelname_Lieferant AS supplierArticleName,a.agA_Produktnummer AS productNumber,
 a.agA_Handelsname AS tradeName,a.agA_Beschreibung AS description,a.agA_Farbton AS color,
 a.agA_MFI AS mfi,a.agA_MFI_bis AS mfiTo,a.agA_MFI_Pruefmethode AS mfiMethod,a.agA_Dichte AS density,
 g.ag_Gruppenname AS groupName,k.art4_Bezeichnung AS polymerCategory,u.art5_Bezeichnung AS polymerSubCategory
 FROM dbo.tblArt_Artikel a LEFT JOIN dbo.tblArtikelgruppe g ON g.ag_Gruppenindex=a.agA_Artikelgruppe
 LEFT JOIN dbo.tblArt4_Kunststoff k ON k.art4_ID_Kunststoff=a.agA_ID_Kunststoff
 LEFT JOIN dbo.tblArt5_KunststoffUnter u ON COALESCE(u.art5_ID_Kunststoff,N'')=COALESCE(a.agA_ID_Kunststoff,N'')
 AND COALESCE(u.art5_ID_KunststoffUnter,N'')=COALESCE(a.agA_ID_KunststoffUnter,N'')
 WHERE COALESCE(a.agA_Deaktiv,0)=0 AND a.agA_Artikelname IS NOT NULL`;
}
module.exports={articleSelect};
