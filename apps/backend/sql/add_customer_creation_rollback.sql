USE [BMS];
GO
SET XACT_ABORT ON;
IF DB_NAME() <> N'BMS' OR UPPER(CONVERT(NVARCHAR(128), SERVERPROPERTY('MachineName'))) <> N'DB04'
  THROW 51000, 'Customer creation rollback migration is restricted to DB04 / BMS.', 1;
IF SCHEMA_ID(N'BMSApp') IS NULL
  THROW 51000, 'Existing BMSApp schema is required.', 1;
IF OBJECT_ID(N'BMSApp.CustomerCreation', N'U') IS NULL
  THROW 51000, 'Install the customer creation history tables before the rollback history.', 1;

BEGIN TRANSACTION;
IF OBJECT_ID(N'BMSApp.CustomerCreationRollback', N'U') IS NULL
BEGIN
  CREATE TABLE [BMSApp].[CustomerCreationRollback] (
    [RollbackId] UNIQUEIDENTIFIER NOT NULL,
    [OperationId] UNIQUEIDENTIFIER NOT NULL,
    [Mandant] NVARCHAR(10) NOT NULL,
    [StartedByUserId] NVARCHAR(100) NOT NULL,
    [StartedByShortCode] NVARCHAR(10) NOT NULL,
    [LastActorUserId] NVARCHAR(100) NOT NULL,
    [LastActorShortCode] NVARCHAR(10) NOT NULL,
    [Reason] NVARCHAR(500) NULL,
    [PreviewJson] NVARCHAR(MAX) NOT NULL,
    [ResponseJson] NVARCHAR(MAX) NULL,
    [Status] NVARCHAR(20) NOT NULL,
    [HttpStatus] INT NULL,
    [ErrorCode] NVARCHAR(100) NULL,
    [AttemptCount] INT NOT NULL CONSTRAINT [DF_CustomerCreationRollback_Attempts] DEFAULT (0),
    [LockedAt] DATETIME2(7) NULL,
    [CreatedAt] DATETIME2(7) NOT NULL CONSTRAINT [DF_CustomerCreationRollback_Created] DEFAULT (SYSUTCDATETIME()),
    [UpdatedAt] DATETIME2(7) NOT NULL CONSTRAINT [DF_CustomerCreationRollback_Updated] DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT [PK_CustomerCreationRollback] PRIMARY KEY ([RollbackId]),
    CONSTRAINT [FK_CustomerCreationRollback_Operation] FOREIGN KEY ([OperationId]) REFERENCES [BMSApp].[CustomerCreation] ([OperationId]),
    CONSTRAINT [CK_CustomerCreationRollback_Status] CHECK ([Status] IN (N'preview',N'sending',N'unknown',N'partial',N'completed',N'blocked',N'failed')),
    CONSTRAINT [CK_CustomerCreationRollback_PreviewJson] CHECK (ISJSON([PreviewJson]) = 1),
    CONSTRAINT [CK_CustomerCreationRollback_ResponseJson] CHECK ([ResponseJson] IS NULL OR ISJSON([ResponseJson]) = 1)
  );
  CREATE INDEX [IX_CustomerCreationRollback_Operation]
    ON [BMSApp].[CustomerCreationRollback] ([OperationId],[Mandant],[CreatedAt] DESC);
END;
COMMIT TRANSACTION;
GO

SELECT s.name AS [SchemaName],t.name AS [TableName]
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
WHERE s.name=N'BMSApp' AND t.name=N'CustomerCreationRollback';
