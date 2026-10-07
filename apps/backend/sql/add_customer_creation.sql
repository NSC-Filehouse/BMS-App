USE [BMS];
GO
SET XACT_ABORT ON;
IF DB_NAME() <> N'BMS' OR UPPER(CONVERT(NVARCHAR(128), SERVERPROPERTY('MachineName'))) <> N'DB04'
  THROW 51000, 'Customer creation migration is restricted to DB04 / BMS.', 1;
IF SCHEMA_ID(N'BMSApp') IS NULL
  THROW 51000, 'Existing BMSApp schema is required.', 1;

BEGIN TRANSACTION;
IF OBJECT_ID(N'BMSApp.CustomerCreation', N'U') IS NULL
BEGIN
  CREATE TABLE [BMSApp].[CustomerCreation] (
    [OperationId] UNIQUEIDENTIFIER NOT NULL,
    [UserId] NVARCHAR(100) NOT NULL,
    [UserShortCode] NVARCHAR(10) NOT NULL,
    [TargetCompanyId] INT NOT NULL,
    [TargetMandant] NVARCHAR(10) NOT NULL,
    [StammMandant] NVARCHAR(10) NOT NULL,
    [RequestHash] CHAR(64) NOT NULL,
    [PrivatePerson] BIT NOT NULL,
    [CustomerNumber] NVARCHAR(100) NULL,
    [CustomerName] NVARCHAR(100) NULL,
    [CountryIso] NVARCHAR(2) NOT NULL,
    [ErpOperationId] NVARCHAR(100) NULL,
    [Status] NVARCHAR(20) NOT NULL,
    [HttpStatus] INT NULL,
    [ErrorCode] NVARCHAR(100) NULL,
    [AttemptCount] INT NOT NULL CONSTRAINT [DF_CustomerCreation_Attempts] DEFAULT (0),
    [LockedAt] DATETIME2(7) NULL,
    [CreatedAt] DATETIME2(7) NOT NULL CONSTRAINT [DF_CustomerCreation_Created] DEFAULT (SYSUTCDATETIME()),
    [UpdatedAt] DATETIME2(7) NOT NULL CONSTRAINT [DF_CustomerCreation_Updated] DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT [PK_CustomerCreation] PRIMARY KEY ([OperationId]),
    CONSTRAINT [CK_CustomerCreation_Status] CHECK ([Status] IN (N'pending',N'sending',N'unknown',N'failed',N'created',N'partial'))
  );
  CREATE INDEX [IX_CustomerCreation_Target] ON [BMSApp].[CustomerCreation] ([TargetCompanyId],[CreatedAt] DESC);
END;

IF OBJECT_ID(N'BMSApp.CustomerCreationMandant', N'U') IS NULL
BEGIN
  CREATE TABLE [BMSApp].[CustomerCreationMandant] (
    [OperationId] UNIQUEIDENTIFIER NOT NULL,
    [Mandant] NVARCHAR(10) NOT NULL,
    [Status] NVARCHAR(30) NOT NULL,
    [CustomerNumber] NVARCHAR(100) NULL,
    [ResultJson] NVARCHAR(MAX) NOT NULL,
    CONSTRAINT [PK_CustomerCreationMandant] PRIMARY KEY ([OperationId],[Mandant]),
    CONSTRAINT [FK_CustomerCreationMandant_Operation] FOREIGN KEY ([OperationId]) REFERENCES [BMSApp].[CustomerCreation] ([OperationId]),
    CONSTRAINT [CK_CustomerCreationMandant_Json] CHECK (ISJSON([ResultJson]) = 1)
  );
  CREATE INDEX [IX_CustomerCreationMandant_Customer] ON [BMSApp].[CustomerCreationMandant] ([Mandant],[CustomerNumber]);
END;

IF OBJECT_ID(N'BMSApp.CustomerCreationSnapshot', N'U') IS NULL
BEGIN
  CREATE TABLE [BMSApp].[CustomerCreationSnapshot] (
    [Id] BIGINT IDENTITY(1,1) NOT NULL,
    [OperationId] UNIQUEIDENTIFIER NOT NULL,
    [Kind] NVARCHAR(20) NOT NULL,
    [DataJson] NVARCHAR(MAX) NOT NULL,
    [CreatedAt] DATETIME2(7) NOT NULL CONSTRAINT [DF_CustomerCreationSnapshot_Created] DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT [PK_CustomerCreationSnapshot] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_CustomerCreationSnapshot_Operation] FOREIGN KEY ([OperationId]) REFERENCES [BMSApp].[CustomerCreation] ([OperationId]),
    CONSTRAINT [CK_CustomerCreationSnapshot_Kind] CHECK ([Kind] IN (N'request',N'response')),
    CONSTRAINT [CK_CustomerCreationSnapshot_Json] CHECK (ISJSON([DataJson]) = 1)
  );
  CREATE INDEX [IX_CustomerCreationSnapshot_Operation] ON [BMSApp].[CustomerCreationSnapshot] ([OperationId],[Id] DESC);
END;
COMMIT TRANSACTION;
GO

SELECT s.name AS [SchemaName],t.name AS [TableName]
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
WHERE s.name=N'BMSApp' AND t.name IN (N'CustomerCreation',N'CustomerCreationMandant',N'CustomerCreationSnapshot');
