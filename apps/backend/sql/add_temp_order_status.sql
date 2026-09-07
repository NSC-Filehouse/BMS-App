USE [BMS];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'BMSApp.tbl_Temp_Auftrag', N'U') IS NULL
BEGIN
  THROW 50010, 'Die Tabelle BMSApp.tbl_Temp_Auftrag wurde nicht gefunden.', 1;
END;

IF COL_LENGTH(N'BMSApp.tbl_Temp_Auftrag', N'ta_Status') IS NOT NULL
   AND COL_LENGTH(N'BMSApp.tbl_Temp_Auftrag', N'ta_Statsu') IS NOT NULL
BEGIN
  THROW 50011, 'Beide Spalten ta_Status und ta_Statsu existieren.', 1;
END;

IF COL_LENGTH(N'BMSApp.tbl_Temp_Auftrag', N'ta_Status') IS NULL
BEGIN
  IF COL_LENGTH(N'BMSApp.tbl_Temp_Auftrag', N'ta_Statsu') IS NOT NULL
  BEGIN
    EXEC sys.sp_rename
      N'BMSApp.tbl_Temp_Auftrag.ta_Statsu',
      N'ta_Status',
      N'COLUMN';
  END
  ELSE
  BEGIN
    EXEC sys.sp_executesql N'
      ALTER TABLE [BMSApp].[tbl_Temp_Auftrag]
      ADD [ta_Status] INT NOT NULL
        CONSTRAINT [DF_tbl_Temp_Auftrag_ta_Status]
        DEFAULT ((0));';
  END;
END;
GO

-- The status column is the workflow state. There is intentionally no
-- database trigger lock here because the ERP must continue to process
-- finalized orders and positions.

-- Remove the legacy triggers on installations where they still exist.
IF OBJECT_ID(N'BMSApp.TR_tbl_Temp_Auftrag_FinalLock', N'TR') IS NOT NULL
  DROP TRIGGER [BMSApp].[TR_tbl_Temp_Auftrag_FinalLock];

IF OBJECT_ID(N'BMSApp.TR_tbl_Temp_Auf_Position_FinalLock', N'TR') IS NOT NULL
  DROP TRIGGER [BMSApp].[TR_tbl_Temp_Auf_Position_FinalLock];

-- Nur alte, bisher finalisierte Datensätze nachtragen.
UPDATE [BMSApp].[tbl_Temp_Auftrag]
SET [ta_Status] = 1
WHERE [ta_Status] = 0
  AND COALESCE([ta_completed], 0) = 1;
GO

SELECT
  [ta_Status],
  COUNT(*) AS [Anzahl]
FROM [BMSApp].[tbl_Temp_Auftrag]
GROUP BY [ta_Status]
ORDER BY [ta_Status];
