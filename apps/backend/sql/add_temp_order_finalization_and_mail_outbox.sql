USE [BMS];
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH('BMSApp.tbl_Temp_Auftrag', 'ta_closing_date') IS NULL
BEGIN
  ALTER TABLE [BMSApp].[tbl_Temp_Auftrag]
  ADD [ta_closing_date] DATETIME2(7) NULL;
END;

IF COL_LENGTH('BMSApp.tbl_Temp_Auftrag', 'ta_CompletedBy') IS NULL
BEGIN
  ALTER TABLE [BMSApp].[tbl_Temp_Auftrag]
  ADD [ta_CompletedBy] NVARCHAR(100) NULL;
END;

IF COL_LENGTH('BMSApp.tbl_Temp_Auftrag', 'ta_Status') IS NULL
BEGIN
  IF COL_LENGTH('BMSApp.tbl_Temp_Auftrag', 'ta_Statsu') IS NOT NULL
  BEGIN
    EXEC sys.sp_rename
      N'BMSApp.tbl_Temp_Auftrag.ta_Statsu',
      N'ta_Status',
      N'COLUMN';
  END
  ELSE
  BEGIN
    ALTER TABLE [BMSApp].[tbl_Temp_Auftrag]
    ADD [ta_Status] INT NOT NULL
      CONSTRAINT [DF_tbl_Temp_Auftrag_ta_Status]
      DEFAULT ((0));
  END;
END;

IF OBJECT_ID(N'BMSApp.OrderMailOutbox', N'U') IS NULL
BEGIN
  CREATE TABLE [BMSApp].[OrderMailOutbox] (
    [om_ID] BIGINT IDENTITY(1,1) NOT NULL,
    [om_OrderID] INT NOT NULL,
    [om_CompanyID] INT NOT NULL,
    [om_Recipient] NVARCHAR(320) NOT NULL,
    [om_RecipientSource] NVARCHAR(30) NOT NULL,
    [om_Subject] NVARCHAR(255) NOT NULL,
    [om_Body] NVARCHAR(MAX) NOT NULL,
    [om_Status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_OrderMailOutbox_Status] DEFAULT (N'pending'),
    [om_AttemptCount] INT NOT NULL CONSTRAINT [DF_OrderMailOutbox_AttemptCount] DEFAULT (0),
    [om_NextAttemptAt] DATETIME2(7) NULL,
    [om_LockedAt] DATETIME2(7) NULL,
    [om_LastError] NVARCHAR(2000) NULL,
    [om_SentAt] DATETIME2(7) NULL,
    [om_CreateDate] DATETIME2(7) NOT NULL CONSTRAINT [DF_OrderMailOutbox_CreateDate] DEFAULT (SYSUTCDATETIME()),
    [om_LastModifiedDate] DATETIME2(7) NOT NULL CONSTRAINT [DF_OrderMailOutbox_LastModifiedDate] DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT [PK_OrderMailOutbox] PRIMARY KEY CLUSTERED ([om_ID]),
    CONSTRAINT [UQ_OrderMailOutbox_OrderID] UNIQUE ([om_OrderID]),
    CONSTRAINT [FK_OrderMailOutbox_TempOrder] FOREIGN KEY ([om_OrderID])
      REFERENCES [BMSApp].[tbl_Temp_Auftrag] ([ta_id]),
    CONSTRAINT [CK_OrderMailOutbox_Status]
      CHECK ([om_Status] IN (N'pending', N'sending', N'sent', N'failed'))
  );

  CREATE INDEX [IX_OrderMailOutbox_Pending]
    ON [BMSApp].[OrderMailOutbox] ([om_Status], [om_NextAttemptAt], [om_ID]);
END;

EXEC(N'
CREATE OR ALTER TRIGGER [BMSApp].[TR_tbl_Temp_Auftrag_FinalLock]
ON [BMSApp].[tbl_Temp_Auftrag]
AFTER UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (
    SELECT 1
    FROM deleted d
    LEFT JOIN inserted i
      ON i.[ta_id] = d.[ta_id]
    WHERE COALESCE(d.[ta_Status], CASE WHEN d.[ta_completed] = 1 THEN 1 ELSE 0 END) NOT IN (0, 3)
      AND (
        i.[ta_id] IS NULL
        OR COALESCE(i.[ta_Status], CASE WHEN i.[ta_completed] = 1 THEN 1 ELSE 0 END)
           = COALESCE(d.[ta_Status], CASE WHEN d.[ta_completed] = 1 THEN 1 ELSE 0 END)
      )
  )
  BEGIN
    THROW 50001, ''Ein gesperrter Auftrag darf nicht geaendert oder geloescht werden.'', 1;
  END;
END;
');

EXEC(N'
CREATE OR ALTER TRIGGER [BMSApp].[TR_tbl_Temp_Auf_Position_FinalLock]
ON [BMSApp].[tbl_Temp_Auf_Position]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT [tap_ta_id] FROM inserted
      UNION
      SELECT [tap_ta_id] FROM deleted
    ) changed
    INNER JOIN [BMSApp].[tbl_Temp_Auftrag] orders
      ON orders.[ta_id] = changed.[tap_ta_id]
    WHERE COALESCE(orders.[ta_Status], CASE WHEN orders.[ta_completed] = 1 THEN 1 ELSE 0 END) NOT IN (0, 3)
  )
  BEGIN
    THROW 50002, ''Positionen eines gesperrten Auftrags duerfen nicht geaendert werden.'', 1;
  END;
END;
');

COMMIT TRANSACTION;
GO

SELECT
  COL_LENGTH('BMSApp.tbl_Temp_Auftrag', 'ta_closing_date') AS [closingDateColumn],
  COL_LENGTH('BMSApp.tbl_Temp_Auftrag', 'ta_CompletedBy') AS [completedByColumn],
  OBJECT_ID(N'BMSApp.OrderMailOutbox', N'U') AS [outboxObjectId];
