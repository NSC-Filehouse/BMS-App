USE [BMS];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'BMSApp.tbl_Temp_Auftrag', N'U') IS NULL
BEGIN
  THROW 50030, 'Die Tabelle BMSApp.tbl_Temp_Auftrag wurde nicht gefunden.', 1;
END;

IF COL_LENGTH(N'BMSApp.tbl_Temp_Auftrag', N'ta_Status') IS NULL
BEGIN
  THROW 50031, 'BMSApp.tbl_Temp_Auftrag.ta_Status fehlt. Bitte zuerst die Status-Migration ausfuehren.', 1;
END;

IF COL_LENGTH(N'BMSApp.tbl_Temp_Auftrag', N'ta_LastModifiedDate') IS NULL
BEGIN
  THROW 50032, 'BMSApp.tbl_Temp_Auftrag.ta_LastModifiedDate fehlt.', 1;
END;

BEGIN TRANSACTION;

IF COL_LENGTH(N'BMSApp.tbl_Temp_Auftrag', N'ta_return_comment') IS NULL
BEGIN
  ALTER TABLE [BMSApp].[tbl_Temp_Auftrag]
  ADD [ta_return_comment] NVARCHAR(MAX) NULL;
END;

IF OBJECT_ID(N'BMSApp.TempOrderReworkPushState', N'U') IS NULL
BEGIN
  CREATE TABLE [BMSApp].[TempOrderReworkPushState] (
    [torps_ID] BIGINT IDENTITY(1,1) NOT NULL,
    [torps_OrderID] BIGINT NOT NULL,
    [torps_CompanyID] BIGINT NULL,
    [torps_LastStatus] INT NULL,
    [torps_LastModifiedDate] DATETIME2(7) NULL,
    [torps_LastReturnComment] NVARCHAR(MAX) NULL,
    [torps_LastNotifiedComment] NVARCHAR(MAX) NULL,
    [torps_LastNotifiedAt] DATETIME2(7) NULL,
    [torps_LockedAt] DATETIME2(7) NULL,
    [torps_LastCheckedAt] DATETIME2(7) NULL,
    [torps_LastError] NVARCHAR(2000) NULL,
    [torps_CreatedAt] DATETIME2(7) NOT NULL CONSTRAINT [DF_TempOrderReworkPushState_CreatedAt] DEFAULT (SYSUTCDATETIME()),
    [torps_UpdatedAt] DATETIME2(7) NOT NULL CONSTRAINT [DF_TempOrderReworkPushState_UpdatedAt] DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT [PK_TempOrderReworkPushState] PRIMARY KEY CLUSTERED ([torps_ID])
  );
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE [object_id] = OBJECT_ID(N'BMSApp.TempOrderReworkPushState')
    AND [name] = N'UX_TempOrderReworkPushState_OrderID'
)
BEGIN
  CREATE UNIQUE INDEX [UX_TempOrderReworkPushState_OrderID]
    ON [BMSApp].[TempOrderReworkPushState] ([torps_OrderID]);
END;

-- Existing status-3 rows are the initial baseline and must not trigger a
-- notification immediately after the migration is installed.
INSERT INTO [BMSApp].[TempOrderReworkPushState] (
  [torps_OrderID], [torps_CompanyID], [torps_LastStatus],
  [torps_LastModifiedDate], [torps_LastReturnComment],
  [torps_LastNotifiedComment], [torps_LastNotifiedAt], [torps_LastCheckedAt]
)
SELECT
  [o].[ta_id], [o].[ta_company_id], COALESCE([o].[ta_Status], 0),
  [o].[ta_LastModifiedDate], [o].[ta_return_comment],
  CASE WHEN COALESCE([o].[ta_Status], 0) = 3 THEN [o].[ta_return_comment] ELSE NULL END,
  CASE WHEN COALESCE([o].[ta_Status], 0) = 3 THEN SYSUTCDATETIME() ELSE NULL END,
  SYSUTCDATETIME()
FROM [BMSApp].[tbl_Temp_Auftrag] AS [o]
WHERE NOT EXISTS (
  SELECT 1
  FROM [BMSApp].[TempOrderReworkPushState] AS [s]
  WHERE [s].[torps_OrderID] = [o].[ta_id]
);

COMMIT TRANSACTION;
GO

SELECT
  COL_LENGTH(N'BMSApp.tbl_Temp_Auftrag', N'ta_return_comment') AS [returnCommentColumn],
  OBJECT_ID(N'BMSApp.TempOrderReworkPushState', N'U') AS [reworkPushStateObjectId];
