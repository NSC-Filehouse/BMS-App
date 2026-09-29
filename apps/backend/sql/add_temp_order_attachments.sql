SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
SET XACT_ABORT ON;

IF OBJECT_ID(N'BMSApp.tbl_Temp_Auftrag', N'U') IS NULL
  THROW 50030, 'Die Tabelle BMSApp.tbl_Temp_Auftrag wurde nicht gefunden.', 1;

IF COL_LENGTH(N'BMSApp.tbl_Temp_Auftrag', N'ta_id') IS NULL
   OR COL_LENGTH(N'BMSApp.tbl_Temp_Auftrag', N'ta_Attachment') IS NULL
   OR COL_LENGTH(N'BMSApp.tbl_Temp_Auftrag', N'ta_AttachmentFileName') IS NULL
   OR COL_LENGTH(N'BMSApp.tbl_Temp_Auftrag', N'ta_AttachmentMimeType') IS NULL
   OR COL_LENGTH(N'BMSApp.tbl_Temp_Auftrag', N'ta_CreatedBy') IS NULL
   OR COL_LENGTH(N'BMSApp.tbl_Temp_Auftrag', N'ta_CreateDate') IS NULL
  THROW 50031, 'Die erwarteten Auftrags- oder Altanhang-Spalten wurden nicht gefunden.', 1;

DECLARE @typeName SYSNAME;
DECLARE @maxLength SMALLINT;
DECLARE @precision TINYINT;
DECLARE @scale TINYINT;
DECLARE @orderIdType NVARCHAR(300);

SELECT
  @typeName = TYPE_NAME([c].[system_type_id]),
  @maxLength = [c].[max_length],
  @precision = [c].[precision],
  @scale = [c].[scale]
FROM [sys].[columns] AS [c]
WHERE [c].[object_id] = OBJECT_ID(N'BMSApp.tbl_Temp_Auftrag')
  AND [c].[name] = N'ta_id';

IF @typeName IS NULL
  THROW 50032, 'Der Datentyp von BMSApp.tbl_Temp_Auftrag.ta_id konnte nicht ermittelt werden.', 1;

SET @orderIdType = CASE
  WHEN @typeName IN (N'decimal', N'numeric')
    THEN QUOTENAME(@typeName) + N'(' + CONVERT(NVARCHAR(10), @precision) + N',' + CONVERT(NVARCHAR(10), @scale) + N')'
  WHEN @typeName IN (N'varchar', N'char', N'varbinary', N'binary')
    THEN QUOTENAME(@typeName) + N'(' + CASE WHEN @maxLength = -1 THEN N'MAX' ELSE CONVERT(NVARCHAR(10), @maxLength) END + N')'
  WHEN @typeName IN (N'nvarchar', N'nchar')
    THEN QUOTENAME(@typeName) + N'(' + CASE WHEN @maxLength = -1 THEN N'MAX' ELSE CONVERT(NVARCHAR(10), @maxLength / 2) END + N')'
  WHEN @typeName IN (N'datetime2', N'datetimeoffset', N'time')
    THEN QUOTENAME(@typeName) + N'(' + CONVERT(NVARCHAR(10), @scale) + N')'
  ELSE QUOTENAME(@typeName)
END;

BEGIN TRANSACTION;

IF OBJECT_ID(N'BMSApp.tbl_Temp_Auftrag_Anhang', N'U') IS NULL
BEGIN
  DECLARE @createTableSql NVARCHAR(MAX) =
    N'CREATE TABLE [BMSApp].[tbl_Temp_Auftrag_Anhang] (' +
    N'  [tfa_ID] BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_tbl_Temp_Auftrag_Anhang] PRIMARY KEY CLUSTERED,' +
    N'  [tfa_ta_id] ' + @orderIdType + N' NOT NULL,' +
    N'  [tfa_FileName] NVARCHAR(1024) NOT NULL,' +
    N'  [tfa_MimeType] NVARCHAR(255) NOT NULL CONSTRAINT [DF_tbl_Temp_Auftrag_Anhang_MimeType] DEFAULT (N''application/octet-stream''),' +
    N'  [tfa_Content] VARBINARY(MAX) NOT NULL,' +
    N'  [tfa_SizeBytes] BIGINT NOT NULL,' +
    N'  [tfa_IsLegacy] BIT NOT NULL CONSTRAINT [DF_tbl_Temp_Auftrag_Anhang_IsLegacy] DEFAULT ((0)),' +
    N'  [tfa_CreatedBy] NVARCHAR(100) NULL,' +
    N'  [tfa_CreatedAt] DATETIME2(7) NOT NULL CONSTRAINT [DF_tbl_Temp_Auftrag_Anhang_CreatedAt] DEFAULT (SYSUTCDATETIME()),' +
    N'  [tfa_DeletedAt] DATETIME2(7) NULL,' +
    N'  [tfa_DeletedBy] NVARCHAR(100) NULL,' +
    N'  CONSTRAINT [FK_tbl_Temp_Auftrag_Anhang_tbl_Temp_Auftrag] FOREIGN KEY ([tfa_ta_id])' +
    N'    REFERENCES [BMSApp].[tbl_Temp_Auftrag] ([ta_id])' +
    N');';
  EXEC [sys].[sp_executesql] @createTableSql;
END;

IF COL_LENGTH(N'BMSApp.tbl_Temp_Auftrag_Anhang', N'tfa_DeletedAt') IS NULL
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Auftrag_Anhang] ADD [tfa_DeletedAt] DATETIME2(7) NULL;');
IF COL_LENGTH(N'BMSApp.tbl_Temp_Auftrag_Anhang', N'tfa_DeletedBy') IS NULL
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Auftrag_Anhang] ADD [tfa_DeletedBy] NVARCHAR(100) NULL;');

IF NOT EXISTS (
  SELECT 1 FROM [sys].[indexes]
  WHERE [object_id] = OBJECT_ID(N'BMSApp.tbl_Temp_Auftrag_Anhang')
    AND [name] = N'IX_tbl_Temp_Auftrag_Anhang_Order'
)
  EXEC(N'CREATE INDEX [IX_tbl_Temp_Auftrag_Anhang_Order]
    ON [BMSApp].[tbl_Temp_Auftrag_Anhang] ([tfa_ta_id], [tfa_ID])
    INCLUDE ([tfa_FileName], [tfa_MimeType], [tfa_SizeBytes], [tfa_CreatedAt]);');

IF NOT EXISTS (
  SELECT 1 FROM [sys].[indexes]
  WHERE [object_id] = OBJECT_ID(N'BMSApp.tbl_Temp_Auftrag_Anhang')
    AND [name] = N'UX_tbl_Temp_Auftrag_Anhang_LegacyOrder'
)
  EXEC(N'CREATE UNIQUE INDEX [UX_tbl_Temp_Auftrag_Anhang_LegacyOrder]
    ON [BMSApp].[tbl_Temp_Auftrag_Anhang] ([tfa_ta_id])
    WHERE [tfa_IsLegacy] = 1;');

DECLARE @backfillSql NVARCHAR(MAX) = N'
INSERT INTO [BMSApp].[tbl_Temp_Auftrag_Anhang] (
  [tfa_ta_id], [tfa_FileName], [tfa_MimeType], [tfa_Content], [tfa_SizeBytes],
  [tfa_IsLegacy], [tfa_CreatedBy], [tfa_CreatedAt]
)
SELECT
  [o].[ta_id],
  COALESCE(NULLIF(LTRIM(RTRIM([o].[ta_AttachmentFileName])), N''''), CONCAT(N''temp-order-'', [o].[ta_id], N''-attachment'')),
  COALESCE(NULLIF(LTRIM(RTRIM([o].[ta_AttachmentMimeType])), N''''), N''application/octet-stream''),
  CONVERT(VARBINARY(MAX), [o].[ta_Attachment]),
  CONVERT(BIGINT, DATALENGTH([o].[ta_Attachment])),
  1,
  NULLIF(LTRIM(RTRIM([o].[ta_CreatedBy])), N''''),
  COALESCE(TRY_CONVERT(DATETIME2(7), [o].[ta_CreateDate]), SYSUTCDATETIME())
FROM [BMSApp].[tbl_Temp_Auftrag] AS [o]
WHERE [o].[ta_Attachment] IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM [BMSApp].[tbl_Temp_Auftrag_Anhang] AS [a]
    WHERE [a].[tfa_ta_id] = [o].[ta_id]
      AND [a].[tfa_IsLegacy] = 1
  );';
EXEC [sys].[sp_executesql] @backfillSql;

COMMIT TRANSACTION;

EXEC(N'
SELECT
  (SELECT COUNT_BIG(*) FROM [BMSApp].[tbl_Temp_Auftrag] WHERE [ta_Attachment] IS NOT NULL) AS [legacySourceCount],
  (SELECT COUNT_BIG(*) FROM [BMSApp].[tbl_Temp_Auftrag_Anhang] WHERE [tfa_IsLegacy] = 1) AS [migratedLegacyCount],
  (
    SELECT COUNT_BIG(*)
    FROM [BMSApp].[tbl_Temp_Auftrag] AS [o]
    LEFT JOIN [BMSApp].[tbl_Temp_Auftrag_Anhang] AS [a]
      ON [a].[tfa_ta_id] = [o].[ta_id]
     AND [a].[tfa_IsLegacy] = 1
    WHERE [o].[ta_Attachment] IS NOT NULL
      AND (
        [a].[tfa_ID] IS NULL
        OR [a].[tfa_SizeBytes] <> DATALENGTH([o].[ta_Attachment])
        OR [a].[tfa_Content] <> CONVERT(VARBINARY(MAX), [o].[ta_Attachment])
      )
  ) AS [legacyMismatchCount];');
