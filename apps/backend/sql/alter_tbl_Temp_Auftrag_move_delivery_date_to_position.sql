SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.tbl_Temp_Auf_Position', 'tap_delivery_date') IS NULL
BEGIN
  ALTER TABLE [dbo].[tbl_Temp_Auf_Position]
  ADD [tap_delivery_date] DATETIME2(7) NULL;
END;

IF COL_LENGTH('dbo.tbl_Temp_Auftrag', 'ta_delivery_date') IS NOT NULL
BEGIN
  UPDATE p
  SET [tap_delivery_date] = COALESCE(p.[tap_delivery_date], o.[ta_delivery_date])
  FROM [dbo].[tbl_Temp_Auf_Position] p
  INNER JOIN [dbo].[tbl_Temp_Auftrag] o
    ON o.[ta_id] = p.[tap_ta_id]
  WHERE p.[tap_delivery_date] IS NULL
    AND o.[ta_delivery_date] IS NOT NULL;
END;

IF EXISTS (
  SELECT 1
  FROM [dbo].[tbl_Temp_Auf_Position]
  WHERE [tap_delivery_date] IS NULL
)
BEGIN
  ROLLBACK TRANSACTION;
  THROW 50000, 'Es gibt Positionen ohne Liefertermin. Bitte erst die fehlenden Werte in tap_delivery_date setzen.', 1;
END;

ALTER TABLE [dbo].[tbl_Temp_Auf_Position]
ALTER COLUMN [tap_delivery_date] DATETIME2(7) NOT NULL;

DECLARE @defaultConstraintName sysname;

SELECT @defaultConstraintName = dc.[name]
FROM sys.default_constraints dc
INNER JOIN sys.columns c
  ON c.[object_id] = dc.[parent_object_id]
 AND c.[column_id] = dc.[parent_column_id]
WHERE dc.[parent_object_id] = OBJECT_ID('dbo.tbl_Temp_Auftrag')
  AND c.[name] = 'ta_delivery_date';

IF @defaultConstraintName IS NOT NULL
BEGIN
  EXEC(N'ALTER TABLE [dbo].[tbl_Temp_Auftrag] DROP CONSTRAINT [' + REPLACE(@defaultConstraintName, ']', ']]') + N']');
END;

IF COL_LENGTH('dbo.tbl_Temp_Auftrag', 'ta_delivery_date') IS NOT NULL
BEGIN
  ALTER TABLE [dbo].[tbl_Temp_Auftrag]
  DROP COLUMN [ta_delivery_date];
END;

COMMIT TRANSACTION;
