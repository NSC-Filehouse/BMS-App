const AVAILABILITY_FUNCTION_SQL = '[dbo].[tvfMengen_Verf\u00FCgbar_Alle](NULL)';

function quoteAlias(alias) {
  const value = String(alias || '').trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid product availability alias: ${alias}`);
  }
  return `[${value}]`;
}

function productAvailabilitySource(alias = 'availability') {
  const safeAlias = quoteAlias(alias);

  return `(
    SELECT
      [base].[Kunststoff] AS [Kunststoff],
      [plastic_sub].[art5_Bezeichnung] AS [Kunststoff_Untergruppe],
      [base].[beP_VL] AS [beP_VL],
      [base].[Menge] AS [Menge],
      [base].[Einheit] AS [Einheit],
      [base].[Artikel] AS [Artikel],
      [base].[beP_Additive] AS [beP_Additive],
      [base].[beP_MFIgemessen] AS [beP_MFIgemessen],
      [base].[beP_MFI] AS [beP_MFI],
      [base].[EPtest] AS [EPtest],
      ROUND([base].[EPtest] / 5.0, 0) * 5 + 5 AS [EP],
      [base].[bePL_LagerID] AS [bePL_LagerID],
      [base].[Lagerort] AS [Lagerort],
      [base].[Bestell-Pos] AS [Bestell-Pos],
      [base].[beP_VLbemerkung] AS [beP_VLbemerkung],
      [base].[beP_MFI_Pruefmethode] AS [beP_MFI_Pruefmethode],
      [base].[bePR_reserviertVon] AS [bePR_reserviertVon],
      [base].[bePR_Anzahl] AS [bePR_Anzahl],
      [base].[bePR_gueltigBis] AS [bePR_gueltigBis],
      [base].[beP_LagerBeiStrecke] AS [beP_LagerBeiStrecke],
      [base].[txtLagerInfo] AS [txtLagerInfo]
    FROM ${AVAILABILITY_FUNCTION_SQL} AS [base]
    LEFT JOIN [dbo].[tblArt5_KunststoffUnter] AS [plastic_sub]
      ON COALESCE([plastic_sub].[art5_ID_Kunststoff], '') = COALESCE([base].[agA_ID_Kunststoff], '')
     AND COALESCE([plastic_sub].[art5_ID_KunststoffUnter], '') = COALESCE([base].[agA_ID_KunststoffUnter], '')
    WHERE COALESCE([base].[beP_VL], 0) = 1
      AND COALESCE([base].[beP_Produktion], 0) = 0
      AND COALESCE([base].[beP_Vorprodukt], 0) = 0
      AND COALESCE([base].[Menge], 0) > 0
  ) AS ${safeAlias}`;
}

module.exports = {
  AVAILABILITY_FUNCTION_SQL,
  productAvailabilitySource,
};
