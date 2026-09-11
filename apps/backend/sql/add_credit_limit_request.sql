USE [BMS];
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'BMSApp.CreditLimitRequestState', N'U') IS NULL
BEGIN
  CREATE TABLE [BMSApp].[CreditLimitRequestState] (
    [clrs_ID] BIGINT IDENTITY(1,1) NOT NULL,
    [clrs_CompanyID] INT NOT NULL,
    [clrs_CustomerID] NVARCHAR(100) NOT NULL,
    [clrs_LastRequestedAt] DATETIME2(7) NULL,
    [clrs_LastRequestedLimit] DECIMAL(18,2) NULL,
    [clrs_LastExposureAmount] DECIMAL(18,2) NULL,
    [clrs_LastCreditMailStatus] NVARCHAR(20) NULL,
    [clrs_LastCreditMailOutboxID] BIGINT NULL,
    [clrs_LastCreditClientMessageID] NVARCHAR(200) NULL,
    [clrs_LastBankReminderAt] DATETIME2(7) NULL,
    [clrs_LastBankReminderStatus] NVARCHAR(20) NULL,
    [clrs_LastBankReminderOutboxID] BIGINT NULL,
    [clrs_CreateDate] DATETIME2(7) NOT NULL CONSTRAINT [DF_CreditLimitRequestState_CreateDate] DEFAULT (SYSUTCDATETIME()),
    [clrs_LastModifiedDate] DATETIME2(7) NOT NULL CONSTRAINT [DF_CreditLimitRequestState_LastModifiedDate] DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT [PK_CreditLimitRequestState] PRIMARY KEY CLUSTERED ([clrs_ID]),
    CONSTRAINT [UQ_CreditLimitRequestState_CompanyCustomer] UNIQUE ([clrs_CompanyID], [clrs_CustomerID])
  );
END;

IF OBJECT_ID(N'BMSApp.CreditLimitMailOutbox', N'U') IS NULL
BEGIN
  CREATE TABLE [BMSApp].[CreditLimitMailOutbox] (
    [clm_ID] BIGINT IDENTITY(1,1) NOT NULL,
    [clm_CompanyID] INT NOT NULL,
    [clm_CustomerID] NVARCHAR(100) NOT NULL,
    [clm_OrderID] INT NULL,
    [clm_Type] NVARCHAR(40) NOT NULL,
    [clm_ToRecipients] NVARCHAR(MAX) NOT NULL,
    [clm_CcRecipients] NVARCHAR(MAX) NULL,
    [clm_BccRecipients] NVARCHAR(MAX) NULL,
    [clm_Subject] NVARCHAR(255) NOT NULL,
    [clm_Body] NVARCHAR(MAX) NOT NULL,
    [clm_ClientMessageID] NVARCHAR(200) NOT NULL,
    [clm_Status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_CreditLimitMailOutbox_Status] DEFAULT (N'pending'),
    [clm_AttemptCount] INT NOT NULL CONSTRAINT [DF_CreditLimitMailOutbox_AttemptCount] DEFAULT (0),
    [clm_NextAttemptAt] DATETIME2(7) NULL,
    [clm_LockedAt] DATETIME2(7) NULL,
    [clm_LastError] NVARCHAR(2000) NULL,
    [clm_SentAt] DATETIME2(7) NULL,
    [clm_CreateDate] DATETIME2(7) NOT NULL CONSTRAINT [DF_CreditLimitMailOutbox_CreateDate] DEFAULT (SYSUTCDATETIME()),
    [clm_LastModifiedDate] DATETIME2(7) NOT NULL CONSTRAINT [DF_CreditLimitMailOutbox_LastModifiedDate] DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT [PK_CreditLimitMailOutbox] PRIMARY KEY CLUSTERED ([clm_ID]),
    CONSTRAINT [UQ_CreditLimitMailOutbox_ClientMessageID] UNIQUE ([clm_ClientMessageID]),
    CONSTRAINT [CK_CreditLimitMailOutbox_Type]
      CHECK ([clm_Type] IN (N'credit_limit_request', N'bank_details_reminder')),
    CONSTRAINT [CK_CreditLimitMailOutbox_Status]
      CHECK ([clm_Status] IN (N'pending', N'sending', N'sent', N'failed'))
  );

  CREATE INDEX [IX_CreditLimitMailOutbox_Pending]
    ON [BMSApp].[CreditLimitMailOutbox] ([clm_Status], [clm_NextAttemptAt], [clm_ID]);

  CREATE INDEX [IX_CreditLimitMailOutbox_Customer]
    ON [BMSApp].[CreditLimitMailOutbox] ([clm_CompanyID], [clm_CustomerID], [clm_CreateDate]);
END;

COMMIT TRANSACTION;
GO

SELECT
  OBJECT_ID(N'BMSApp.CreditLimitRequestState', N'U') AS [requestStateObjectId],
  OBJECT_ID(N'BMSApp.CreditLimitMailOutbox', N'U') AS [mailOutboxObjectId];
