USE [BMS];
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE [name] = N'BMSApp')
BEGIN
  EXEC(N'CREATE SCHEMA [BMSApp] AUTHORIZATION [dbo]');
END;

IF OBJECT_ID(N'BMSApp.DailyVlMailOutbox', N'U') IS NULL
BEGIN
  CREATE TABLE [BMSApp].[DailyVlMailOutbox] (
    [vld_ID] BIGINT IDENTITY(1,1) NOT NULL,
    [vld_RunDate] DATE NOT NULL,
    [vld_CompanyID] INT NOT NULL,
    [vld_CompanyName] NVARCHAR(200) NOT NULL,
    [vld_CompanyShortName] NVARCHAR(100) NOT NULL,
    [vld_RecipientsJson] NVARCHAR(MAX) NOT NULL,
    [vld_Subject] NVARCHAR(255) NOT NULL,
    [vld_Body] NVARCHAR(MAX) NOT NULL,
    [vld_Status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_DailyVlMailOutbox_Status] DEFAULT (N'pending'),
    [vld_AttemptCount] INT NOT NULL CONSTRAINT [DF_DailyVlMailOutbox_AttemptCount] DEFAULT ((0)),
    [vld_NextAttemptAt] DATETIME2(7) NULL,
    [vld_LockedAt] DATETIME2(7) NULL,
    [vld_LastError] NVARCHAR(2000) NULL,
    [vld_SentAt] DATETIME2(7) NULL,
    [vld_CreateDate] DATETIME2(7) NOT NULL CONSTRAINT [DF_DailyVlMailOutbox_CreateDate] DEFAULT (SYSUTCDATETIME()),
    [vld_LastModifiedDate] DATETIME2(7) NOT NULL CONSTRAINT [DF_DailyVlMailOutbox_LastModifiedDate] DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT [PK_DailyVlMailOutbox] PRIMARY KEY CLUSTERED ([vld_ID]),
    CONSTRAINT [UQ_DailyVlMailOutbox_RunDate_Company] UNIQUE ([vld_RunDate], [vld_CompanyID]),
    CONSTRAINT [CK_DailyVlMailOutbox_Status]
      CHECK ([vld_Status] IN (N'pending', N'sending', N'sent', N'failed', N'skipped'))
  );

  CREATE INDEX [IX_DailyVlMailOutbox_Pending]
    ON [BMSApp].[DailyVlMailOutbox] ([vld_RunDate], [vld_Status], [vld_NextAttemptAt], [vld_ID]);
END;

COMMIT TRANSACTION;
GO

SELECT OBJECT_ID(N'BMSApp.DailyVlMailOutbox', N'U') AS [dailyVlMailOutboxObjectId];
