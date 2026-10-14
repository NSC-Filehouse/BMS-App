USE [BMS];
GO

SET XACT_ABORT ON;

IF OBJECT_ID(N'BMSApp.CreditLimitMailOutbox', N'U') IS NULL
BEGIN
  THROW 51000, 'Run add_credit_limit_request.sql before add_credit_limit_mail_sender.sql.', 1;
END;

BEGIN TRANSACTION;

IF COL_LENGTH(N'BMSApp.CreditLimitMailOutbox', N'clm_FromAddress') IS NULL
BEGIN
  ALTER TABLE [BMSApp].[CreditLimitMailOutbox]
    ADD [clm_FromAddress] NVARCHAR(320) NULL;
END;

IF COL_LENGTH(N'BMSApp.CreditLimitMailOutbox', N'clm_FromDisplayName') IS NULL
BEGIN
  ALTER TABLE [BMSApp].[CreditLimitMailOutbox]
    ADD [clm_FromDisplayName] NVARCHAR(255) NULL;
END;

COMMIT TRANSACTION;
GO

SELECT
  COL_LENGTH(N'BMSApp.CreditLimitMailOutbox', N'clm_FromAddress') AS [fromAddressLength],
  COL_LENGTH(N'BMSApp.CreditLimitMailOutbox', N'clm_FromDisplayName') AS [fromDisplayNameLength];
