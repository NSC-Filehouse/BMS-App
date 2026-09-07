SET NOCOUNT ON;

IF OBJECT_ID(N'BMSApp.tbl_Temp_Auf_Position', N'U') IS NULL
BEGIN
    THROW 50010, N'Die Tabelle BMSApp.tbl_Temp_Auf_Position wurde nicht gefunden.', 1;
END;

IF COL_LENGTH(
    N'BMSApp.tbl_Temp_Auf_Position',
    N'tap_Verpackungsart_Gewechselt'
) IS NULL
BEGIN
    ALTER TABLE [BMSApp].[tbl_Temp_Auf_Position]
      ADD [tap_Verpackungsart_Gewechselt] bit NOT NULL
          CONSTRAINT [DF_tbl_Temp_Auf_Position_tap_Verpackungsart_Gewechselt]
          DEFAULT ((0)) WITH VALUES;
END;

SELECT
    COL_LENGTH(
        N'BMSApp.tbl_Temp_Auf_Position',
        N'tap_Verpackungsart_Gewechselt'
    ) AS [ColumnExists],
    dc.name AS [DefaultConstraint]
FROM sys.default_constraints dc
INNER JOIN sys.columns c
    ON c.default_object_id = dc.object_id
INNER JOIN sys.tables t
    ON t.object_id = c.object_id
INNER JOIN sys.schemas s
    ON s.schema_id = t.schema_id
WHERE s.name = N'BMSApp'
  AND t.name = N'tbl_Temp_Auf_Position'
  AND c.name = N'tap_Verpackungsart_Gewechselt';
