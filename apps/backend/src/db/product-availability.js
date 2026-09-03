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
      [base].[beP_Artikelindex] AS [beP_Artikelindex],
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
    FROM (
      SELECT
        [best].[beP_BEposID] AS [Bestell-Pos],
        [best].[beP_VL] AS [beP_VL],
        [best].[beP_Artikelindex] AS [beP_Artikelindex],
        COALESCE(NULLIF(LTRIM(RTRIM([best].[beP_Einheit])), N''), [article].[agA_Einheit]) AS [Einheit],
        COALESCE(NULLIF(LTRIM(RTRIM([best].[beP_Artikel])), N''), [article].[agA_Artikelname]) AS [Artikel],
        [best].[beP_Additive] AS [beP_Additive],
        [best].[beP_MFIgemessen] AS [beP_MFIgemessen],
        [best].[beP_MFI] AS [beP_MFI],
        /* Die Grundtabelle stellt den echten Einstandspreis als beP_EK_EU bereit. */
        [best].[beP_EK_EU] AS [EPtest],
        [stock].[bePL_LagerID] AS [bePL_LagerID],
        CASE
          WHEN COALESCE([warehouse].[kdLa_Strecke], 0) = 1 THEN
            CASE
              WHEN NULLIF(LTRIM(RTRIM([best].[beP_LagerBeiStrecke])), N'') IS NULL THEN N'Strecke'
              ELSE N'Strecke/' + LTRIM(RTRIM([best].[beP_LagerBeiStrecke]))
            END
          ELSE NULLIF(LTRIM(RTRIM(CONCAT([warehouse].[kdLa_PLZ], N' ', [warehouse].[kdLa_Ort]))), N'')
        END AS [Lagerort],
        [best].[beP_VLbemerkung] AS [beP_VLbemerkung],
        [best].[beP_MFI_Pruefmethode] AS [beP_MFI_Pruefmethode],
        [best].[beP_LagerBeiStrecke] AS [beP_LagerBeiStrecke],
        [best].[beP_LagerInfo] AS [txtLagerInfo],
        [article].[agA_ID_Kunststoff] AS [agA_ID_Kunststoff],
        [article].[agA_ID_KunststoffUnter] AS [agA_ID_KunststoffUnter],
        [plastic].[art4_Bezeichnung] AS [Kunststoff],
        [reservation].[bePR_reserviertVon] AS [bePR_reserviertVon],
        [reservation].[bePR_Anzahl] AS [bePR_Anzahl],
        [reservation].[bePR_gueltigBis] AS [bePR_gueltigBis],
        CAST(
          [stock].[BasisMenge]
          - COALESCE([customer_order].[Verplant], 0)
          + COALESCE([material_credit].[Gutschrift], 0)
          AS float
        ) AS [Menge]
      FROM [dbo].[tblBest_Position] AS [best]
      INNER JOIN (
        SELECT
          [bePL_BEposID],
          [bePL_LagerID],
          SUM(COALESCE([bePL_Anzahl], 0)) AS [BasisMenge]
        FROM [dbo].[tblBest_Pos_Lager]
        GROUP BY [bePL_BEposID], [bePL_LagerID]
      ) AS [stock]
        ON [stock].[bePL_BEposID] = [best].[beP_BEposID]
      LEFT JOIN (
        SELECT
          [auP_BEposID],
          [auP_LagerID],
          SUM(COALESCE([auP_Anzahl], 0)) AS [Verplant]
        FROM [dbo].[tblAuf_Position]
        WHERE [auP_BEposID] IS NOT NULL
        GROUP BY [auP_BEposID], [auP_LagerID]
      ) AS [customer_order]
        ON [customer_order].[auP_BEposID] = [stock].[bePL_BEposID]
       AND COALESCE([customer_order].[auP_LagerID], N'') = COALESCE([stock].[bePL_LagerID], N'')
      LEFT JOIN (
        SELECT
          [rechnung_position].[reP_BEposID],
          [rechnung_position].[reP_LagerID],
          SUM(COALESCE([rechnung_position].[reP_Anzahl], 0)) AS [Gutschrift]
        FROM [dbo].[tblRech_Position] AS [rechnung_position]
        INNER JOIN [dbo].[tblRechnung] AS [rechnung]
          ON [rechnung].[re_RgNummer] = [rechnung_position].[reP_RGnummer]
        WHERE [rechnung].[re_Auftragsstatus] = N'Gutschrift'
          AND COALESCE([rechnung].[re_Preisgutschrift], 0) = 0
        GROUP BY [rechnung_position].[reP_BEposID], [rechnung_position].[reP_LagerID]
      ) AS [material_credit]
        ON [material_credit].[reP_BEposID] = [stock].[bePL_BEposID]
       AND COALESCE([material_credit].[reP_LagerID], N'') = COALESCE([stock].[bePL_LagerID], N'')
      LEFT JOIN (
        SELECT
          [bePR_BEposID],
          [bePR_LagerID],
          MAX([bePR_reserviertVon]) AS [bePR_reserviertVon],
          MAX([bePR_Anzahl]) AS [bePR_Anzahl],
          MAX([bePR_gueltigBis]) AS [bePR_gueltigBis]
        FROM [dbo].[tblBest_Pos_Reserviert]
        GROUP BY [bePR_BEposID], [bePR_LagerID]
      ) AS [reservation]
        ON [reservation].[bePR_BEposID] = [stock].[bePL_BEposID]
       AND COALESCE([reservation].[bePR_LagerID], N'') = COALESCE([stock].[bePL_LagerID], N'')
      LEFT JOIN [dbo].[tblArt_Artikel] AS [article]
        ON [article].[agA_Artikelindex] = [best].[beP_Artikelindex]
      LEFT JOIN [dbo].[tblArt4_Kunststoff] AS [plastic]
        ON COALESCE([plastic].[art4_ID_Kunststoff], N'') = COALESCE([article].[agA_ID_Kunststoff], N'')
      LEFT JOIN [dbo].[tblKun_Lager] AS [warehouse]
        ON [warehouse].[kdLa_LagerID] = [stock].[bePL_LagerID]
      WHERE COALESCE([best].[beP_VL], 0) = 1
        AND COALESCE([best].[beP_Pulver], 0) = 0
        AND COALESCE([best].[beP_Produktion], 0) = 0
        AND COALESCE([best].[beP_Vorprodukt], 0) = 0
        AND COALESCE([best].[beP_Abgerechnet], 0) = 0
    ) AS [base]
    LEFT JOIN [dbo].[tblArt5_KunststoffUnter] AS [plastic_sub]
      ON COALESCE([plastic_sub].[art5_ID_Kunststoff], N'') = COALESCE([base].[agA_ID_Kunststoff], N'')
     AND COALESCE([plastic_sub].[art5_ID_KunststoffUnter], N'') = COALESCE([base].[agA_ID_KunststoffUnter], N'')
    WHERE COALESCE([base].[Menge], 0) > 0
  ) AS ${safeAlias}`;
}

module.exports = {
  productAvailabilitySource,
};
