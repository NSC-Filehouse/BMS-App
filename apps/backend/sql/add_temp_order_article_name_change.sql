SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

IF OBJECT_ID(N'BMSApp.tbl_Temp_Auf_Position', N'U') IS NULL
BEGIN
    THROW 50020, N'Die Tabelle BMSApp.tbl_Temp_Auf_Position wurde nicht gefunden.', 1;
END;

IF COL_LENGTH(
    N'BMSApp.tbl_Temp_Auf_Position',
    N'tap_Artikelname_Original'
) IS NULL
BEGIN
    ALTER TABLE [BMSApp].[tbl_Temp_Auf_Position]
      ADD [tap_Artikelname_Original] NVARCHAR(MAX) NULL;
END;

IF COL_LENGTH(
    N'BMSApp.tbl_Temp_Auf_Position',
    N'tap_Artikelname_Gewechselt'
) IS NULL
BEGIN
    ALTER TABLE [BMSApp].[tbl_Temp_Auf_Position]
      ADD [tap_Artikelname_Gewechselt] bit NOT NULL
          CONSTRAINT [DF_tbl_Temp_Auf_Position_tap_Artikelname_Gewechselt]
          DEFAULT ((0)) WITH VALUES;
END;

COMMIT TRANSACTION;

SELECT
    COUNT_BIG(*) AS [Positionen],
    SUM(CASE WHEN [tap_Artikelname_Original] IS NULL THEN 1 ELSE 0 END) AS [OhneOriginalname],
    SUM(CASE WHEN [tap_Artikelname_Gewechselt] = 1 THEN 1 ELSE 0 END) AS [NameGeaendert]
FROM [BMSApp].[tbl_Temp_Auf_Position];
