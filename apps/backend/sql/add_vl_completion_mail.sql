USE [BMS];
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE [name] = N'BMSApp')
BEGIN
  EXEC(N'CREATE SCHEMA [BMSApp] AUTHORIZATION [dbo]');
END;

IF COL_LENGTH(N'BMSApp.tbl_Temp_Auftrag', N'ta_Status') IS NULL
BEGIN
  THROW 50021, 'BMSApp.tbl_Temp_Auftrag.ta_Status is missing. Apply the temp-order status migration first.', 1;
END;

IF COL_LENGTH(N'BMSApp.tbl_Temp_Auftrag', N'ta_LastModifiedDate') IS NULL
BEGIN
  THROW 50022, 'BMSApp.tbl_Temp_Auftrag.ta_LastModifiedDate is missing.', 1;
END;

IF OBJECT_ID(N'BMSApp.VlMailUserSetting', N'U') IS NULL
BEGIN
  CREATE TABLE [BMSApp].[VlMailUserSetting] (
    [vms_ID] BIGINT IDENTITY(1,1) NOT NULL,
    [vms_UserEmail] NVARCHAR(320) NOT NULL,
    [vms_VlMailsEnabled] BIT NOT NULL CONSTRAINT [DF_VlMailUserSetting_VlMailsEnabled] DEFAULT ((1)),
    [vms_CreatedAt] DATETIME2(7) NOT NULL CONSTRAINT [DF_VlMailUserSetting_CreatedAt] DEFAULT (SYSUTCDATETIME()),
    [vms_UpdatedAt] DATETIME2(7) NOT NULL CONSTRAINT [DF_VlMailUserSetting_UpdatedAt] DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT [PK_VlMailUserSetting] PRIMARY KEY CLUSTERED ([vms_ID])
  );

  CREATE UNIQUE INDEX [UX_VlMailUserSetting_UserEmail]
    ON [BMSApp].[VlMailUserSetting] ([vms_UserEmail]);
END;

IF OBJECT_ID(N'BMSApp.VlMailOutbox', N'U') IS NULL
BEGIN
  CREATE TABLE [BMSApp].[VlMailOutbox] (
    [vmo_ID] BIGINT IDENTITY(1,1) NOT NULL,
    [vmo_OrderID] INT NOT NULL,
    [vmo_CompanyID] INT NOT NULL,
    [vmo_EventKey] NVARCHAR(200) NOT NULL,
    [vmo_Recipient] NVARCHAR(320) NOT NULL,
    [vmo_RecipientSource] NVARCHAR(50) NOT NULL,
    [vmo_Subject] NVARCHAR(255) NOT NULL,
    [vmo_Body] NVARCHAR(MAX) NOT NULL,
    [vmo_Status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_VlMailOutbox_Status] DEFAULT (N'pending'),
    [vmo_AttemptCount] INT NOT NULL CONSTRAINT [DF_VlMailOutbox_AttemptCount] DEFAULT ((0)),
    [vmo_NextAttemptAt] DATETIME2(7) NULL,
    [vmo_LockedAt] DATETIME2(7) NULL,
    [vmo_LastError] NVARCHAR(2000) NULL,
    [vmo_SentAt] DATETIME2(7) NULL,
    [vmo_CreateDate] DATETIME2(7) NOT NULL CONSTRAINT [DF_VlMailOutbox_CreateDate] DEFAULT (SYSUTCDATETIME()),
    [vmo_LastModifiedDate] DATETIME2(7) NOT NULL CONSTRAINT [DF_VlMailOutbox_LastModifiedDate] DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT [PK_VlMailOutbox] PRIMARY KEY CLUSTERED ([vmo_ID]),
    CONSTRAINT [UQ_VlMailOutbox_OrderID_Event_Recipient] UNIQUE ([vmo_OrderID], [vmo_EventKey], [vmo_Recipient]),
    CONSTRAINT [FK_VlMailOutbox_TempOrder] FOREIGN KEY ([vmo_OrderID])
      REFERENCES [BMSApp].[tbl_Temp_Auftrag] ([ta_id]),
    CONSTRAINT [CK_VlMailOutbox_Status]
      CHECK ([vmo_Status] IN (N'pending', N'sending', N'sent', N'failed', N'skipped'))
  );

  CREATE INDEX [IX_VlMailOutbox_Pending]
    ON [BMSApp].[VlMailOutbox] ([vmo_Status], [vmo_NextAttemptAt], [vmo_ID]);

  CREATE INDEX [IX_VlMailOutbox_OrderID]
    ON [BMSApp].[VlMailOutbox] ([vmo_OrderID], [vmo_ID]);
END;

IF OBJECT_ID(N'BMSApp.VlMailOrderState', N'U') IS NULL
BEGIN
  CREATE TABLE [BMSApp].[VlMailOrderState] (
    [vmos_ID] BIGINT IDENTITY(1,1) NOT NULL,
    [vmos_OrderID] INT NOT NULL,
    [vmos_CompanyID] INT NOT NULL,
    [vmos_LastStatus] INT NULL,
    [vmos_LastModifiedDate] DATETIME2(7) NULL,
    [vmos_CreatedAt] DATETIME2(7) NOT NULL CONSTRAINT [DF_VlMailOrderState_CreatedAt] DEFAULT (SYSUTCDATETIME()),
    [vmos_UpdatedAt] DATETIME2(7) NOT NULL CONSTRAINT [DF_VlMailOrderState_UpdatedAt] DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT [PK_VlMailOrderState] PRIMARY KEY CLUSTERED ([vmos_ID]),
    CONSTRAINT [UQ_VlMailOrderState_OrderID] UNIQUE ([vmos_OrderID]),
    CONSTRAINT [FK_VlMailOrderState_TempOrder] FOREIGN KEY ([vmos_OrderID])
      REFERENCES [BMSApp].[tbl_Temp_Auftrag] ([ta_id])
  );

  CREATE INDEX [IX_VlMailOrderState_Status]
    ON [BMSApp].[VlMailOrderState] ([vmos_LastStatus], [vmos_LastModifiedDate], [vmos_OrderID]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE [object_id] = OBJECT_ID(N'BMSApp.VlMailWorkerState') AND [type] = N'U')
BEGIN
  CREATE TABLE [BMSApp].[VlMailWorkerState] (
    [vmws_Key] NVARCHAR(50) NOT NULL,
    [vmws_Value] NVARCHAR(200) NULL,
    [vmws_CreatedAt] DATETIME2(7) NOT NULL CONSTRAINT [DF_VlMailWorkerState_CreatedAt] DEFAULT (SYSUTCDATETIME()),
    [vmws_UpdatedAt] DATETIME2(7) NOT NULL CONSTRAINT [DF_VlMailWorkerState_UpdatedAt] DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT [PK_VlMailWorkerState] PRIMARY KEY CLUSTERED ([vmws_Key])
  );
END;

-- Status-2-Aufträge, die vor Einführung dieser Funktion bereits existieren,
-- werden als bekannt markiert und lösen keine nachträgliche Mail aus.
IF NOT EXISTS (
  SELECT 1
  FROM [BMSApp].[VlMailWorkerState]
  WHERE [vmws_Key] = N'status2_baseline'
)
BEGIN
  INSERT INTO [BMSApp].[VlMailOrderState] (
    [vmos_OrderID], [vmos_CompanyID], [vmos_LastStatus], [vmos_LastModifiedDate]
  )
  SELECT
    [ta_id], [ta_company_id], [ta_Status], [ta_LastModifiedDate]
  FROM [BMSApp].[tbl_Temp_Auftrag] AS o
  WHERE [ta_Status] = 2
    AND NOT EXISTS (
      SELECT 1
      FROM [BMSApp].[VlMailOrderState] AS s
      WHERE s.[vmos_OrderID] = o.[ta_id]
    );

  INSERT INTO [BMSApp].[VlMailWorkerState] ([vmws_Key], [vmws_Value])
  VALUES (N'status2_baseline', CONVERT(NVARCHAR(30), SYSUTCDATETIME(), 127));
END;

COMMIT TRANSACTION;
GO

SELECT
  OBJECT_ID(N'BMSApp.VlMailUserSetting', N'U') AS [vlMailUserSettingObjectId],
  OBJECT_ID(N'BMSApp.VlMailOutbox', N'U') AS [vlMailOutboxObjectId],
  OBJECT_ID(N'BMSApp.VlMailOrderState', N'U') AS [vlMailOrderStateObjectId],
  OBJECT_ID(N'BMSApp.VlMailWorkerState', N'U') AS [vlMailWorkerStateObjectId],
  (SELECT COUNT(*) FROM [BMSApp].[VlMailOrderState] WHERE [vmos_LastStatus] = 2) AS [status2BaselineCount];
