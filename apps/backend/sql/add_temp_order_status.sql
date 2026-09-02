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

-- Status 1 und 2 sowie unbekannte Status >= 4 sind gesperrt.
-- Ein Statuswechsel durch den CS darf einen gesperrten Auftrag
-- in einen anderen Status überführen; Inhaltsänderungen bleiben
-- für gesperrte Status blockiert.
CREATE OR ALTER TRIGGER [BMSApp].[TR_tbl_Temp_Auftrag_FinalLock]
ON [BMSApp].[tbl_Temp_Auftrag]
AFTER UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;

  IF EXISTS (
    SELECT 1
    FROM deleted d
    LEFT JOIN inserted i
      ON i.[ta_id] = d.[ta_id]
    WHERE COALESCE(d.[ta_Status], CASE WHEN d.[ta_completed] = 1 THEN 1 ELSE 0 END) NOT IN (0, 3)
      AND (
        i.[ta_id] IS NULL
        OR COALESCE(i.[ta_Status], CASE WHEN i.[ta_completed] = 1 THEN 1 ELSE 0 END)
           = COALESCE(d.[ta_Status], CASE WHEN d.[ta_completed] = 1 THEN 1 ELSE 0 END)
      )
  )
  BEGIN
    THROW 50001, 'Ein gesperrter Auftrag darf nicht geaendert oder geloescht werden.', 1;
  END;
END;
GO

CREATE OR ALTER TRIGGER [BMSApp].[TR_tbl_Temp_Auf_Position_FinalLock]
ON [BMSApp].[tbl_Temp_Auf_Position]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT [tap_ta_id] FROM inserted
      UNION
      SELECT [tap_ta_id] FROM deleted
    ) changed
    INNER JOIN [BMSApp].[tbl_Temp_Auftrag] orders
      ON orders.[ta_id] = changed.[tap_ta_id]
    WHERE COALESCE(orders.[ta_Status], CASE WHEN orders.[ta_completed] = 1 THEN 1 ELSE 0 END) NOT IN (0, 3)
  )
  BEGIN
    THROW 50002, 'Positionen eines gesperrten Auftrags duerfen nicht geaendert werden.', 1;
  END;
END;
GO

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
