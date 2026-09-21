USE [BMS];
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE [name] = N'BMSApp')
BEGIN
  EXEC(N'CREATE SCHEMA [BMSApp] AUTHORIZATION [dbo]');
END;

IF COL_LENGTH(N'BMSApp.tbl_Temp_Auftrag', N'ta_Auftragsindex') IS NULL
BEGIN
  THROW 50041, 'BMSApp.tbl_Temp_Auftrag.ta_Auftragsindex fehlt. Die ERP-Rueckuebertragung muss zuerst eingerichtet werden.', 1;
END;

IF COL_LENGTH(N'BMSApp.tbl_Temp_Auftrag', N'ta_Status') IS NULL
BEGIN
  THROW 50042, 'BMSApp.tbl_Temp_Auftrag.ta_Status fehlt. Bitte zuerst die Status-Migration ausfuehren.', 1;
END;

IF OBJECT_ID(N'BMSApp.VlSalePushState', N'U') IS NULL
BEGIN
  CREATE TABLE [BMSApp].[VlSalePushState] (
    [vps_ID] BIGINT IDENTITY(1,1) NOT NULL,
    [vps_OrderID] INT NOT NULL,
    [vps_CompanyID] INT NOT NULL,
    [vps_OrderIndex] NVARCHAR(40) NULL,
    [vps_SalesRepresentative] NVARCHAR(50) NULL,
    [vps_Status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_VlSalePushState_Status] DEFAULT (N'pending'),
    [vps_AttemptCount] INT NOT NULL CONSTRAINT [DF_VlSalePushState_AttemptCount] DEFAULT ((0)),
    [vps_NextAttemptAt] DATETIME2(7) NULL,
    [vps_LockedAt] DATETIME2(7) NULL,
    [vps_LastError] NVARCHAR(2000) NULL,
    [vps_SentAt] DATETIME2(7) NULL,
    [vps_CreatedAt] DATETIME2(7) NOT NULL CONSTRAINT [DF_VlSalePushState_CreatedAt] DEFAULT (SYSUTCDATETIME()),
    [vps_UpdatedAt] DATETIME2(7) NOT NULL CONSTRAINT [DF_VlSalePushState_UpdatedAt] DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT [PK_VlSalePushState] PRIMARY KEY CLUSTERED ([vps_ID]),
    CONSTRAINT [UQ_VlSalePushState_OrderID] UNIQUE ([vps_OrderID]),
    CONSTRAINT [FK_VlSalePushState_TempOrder]
      FOREIGN KEY ([vps_OrderID]) REFERENCES [BMSApp].[tbl_Temp_Auftrag] ([ta_id]),
    CONSTRAINT [CK_VlSalePushState_Status]
      CHECK ([vps_Status] IN (N'pending', N'sending', N'sent', N'failed', N'skipped'))
  );

  CREATE INDEX [IX_VlSalePushState_Pending]
    ON [BMSApp].[VlSalePushState] ([vps_Status], [vps_NextAttemptAt], [vps_ID]);
END;

-- Existing status-2 orders must not receive a historic sale push after rollout.
INSERT INTO [BMSApp].[VlSalePushState] (
  [vps_OrderID], [vps_CompanyID], [vps_OrderIndex], [vps_Status], [vps_LastError]
)
SELECT
  [o].[ta_id],
  [o].[ta_company_id],
  [o].[ta_Auftragsindex],
  N'skipped',
  N'baseline_before_vl_sale_push'
FROM [BMSApp].[tbl_Temp_Auftrag] AS [o]
WHERE [o].[ta_Status] = 2
  AND NOT EXISTS (
    SELECT 1
    FROM [BMSApp].[VlSalePushState] AS [s]
    WHERE [s].[vps_OrderID] = [o].[ta_id]
  );

-- Existing timeline rows are corrected to the ERP seller as well, but remain
-- baselined above and therefore do not emit historic push notifications.
IF OBJECT_ID(N'BMSApp.Timeline', N'U') IS NOT NULL
BEGIN
  DECLARE @shortName NVARCHAR(128);
  DECLARE mandant_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT [md_FirmaKurz]
    FROM [dbo].[tblMandant]
    WHERE [md_FirmaKurz] IS NOT NULL
      AND [md_FirmaKurz] NOT LIKE '%[^A-Za-z0-9_]%' ;

  OPEN mandant_cursor;
  FETCH NEXT FROM mandant_cursor INTO @shortName;
  WHILE @@FETCH_STATUS = 0
  BEGIN
    DECLARE @tenantDatabase NVARCHAR(258) = QUOTENAME(N'BMS.' + @shortName);
    DECLARE @backfillSql NVARCHAR(MAX) = N'
      UPDATE [timeline]
      SET [timeline].[tl_UserShortCode] = [erp].[au_Aussendienst]
      FROM [BMSApp].[Timeline] AS [timeline]
      INNER JOIN [BMSApp].[tbl_Temp_Auftrag] AS [temp]
        ON [temp].[ta_company_id] = [timeline].[tl_CompanyId]
       AND [timeline].[tl_ReferenceId] = CONVERT(NVARCHAR(100), [temp].[ta_id])
      INNER JOIN ' + @tenantDatabase + N'.[dbo].[tblAuftrag] AS [erp]
        ON [erp].[au_Auftragsindex] = [temp].[ta_Auftragsindex]
      WHERE [temp].[ta_Status] = 2
        AND [timeline].[tl_Type] = N''order''
        AND NULLIF(LTRIM(RTRIM([erp].[au_Aussendienst])), N'''') IS NOT NULL;';
    EXEC sys.sp_executesql @backfillSql;
    FETCH NEXT FROM mandant_cursor INTO @shortName;
  END;
  CLOSE mandant_cursor;
  DEALLOCATE mandant_cursor;
END;

COMMIT TRANSACTION;
GO

SELECT
  OBJECT_ID(N'BMSApp.VlSalePushState', N'U') AS [vlSalePushStateObjectId],
  (SELECT COUNT(*) FROM [BMSApp].[VlSalePushState] WHERE [vps_Status] = N'skipped') AS [baselineCount];
