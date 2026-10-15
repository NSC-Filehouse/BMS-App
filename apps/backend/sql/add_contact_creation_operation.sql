USE [BMS];
GO
SET XACT_ABORT ON;
IF DB_NAME() <> N'BMS' OR UPPER(CONVERT(NVARCHAR(128), SERVERPROPERTY('MachineName'))) <> N'DB04'
  THROW 51000, 'Contact creation migration is restricted to DB04 / BMS.', 1;
IF SCHEMA_ID(N'BMSApp') IS NULL
  THROW 51000, 'Existing BMSApp schema is required.', 1;

BEGIN TRANSACTION;
IF OBJECT_ID(N'BMSApp.ContactCreationOperation', N'U') IS NULL
BEGIN
  CREATE TABLE [BMSApp].[ContactCreationOperation] (
    [OperationId] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    [UserId] NVARCHAR(100) NOT NULL,
    [Mandant] NVARCHAR(10) NOT NULL,
    [CustomerNumber] NVARCHAR(10) NOT NULL,
    [RequestHash] CHAR(64) NOT NULL,
    [InputJson] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([InputJson])=1),
    [RequestJson] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([RequestJson])=1),
    [ResponseJson] NVARCHAR(MAX) NULL CHECK (ISJSON([ResponseJson])=1),
    [Status] NVARCHAR(20) NOT NULL CHECK ([Status] IN (N'sending',N'unknown',N'failed',N'created')),
    [HttpStatus] INT NULL,
    [ContactId] INT NULL,
    [ErpOperationId] NVARCHAR(100) NULL,
    [AttemptCount] INT NOT NULL DEFAULT (0),
    [LockedAt] DATETIME2(7) NULL,
    [CreatedAt] DATETIME2(7) NOT NULL DEFAULT SYSUTCDATETIME(),
    [UpdatedAt] DATETIME2(7) NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX [IX_ContactCreationOperation_Scope]
    ON [BMSApp].[ContactCreationOperation] ([UserId],[Mandant],[CustomerNumber],[CreatedAt] DESC);
END;
COMMIT TRANSACTION;
GO
