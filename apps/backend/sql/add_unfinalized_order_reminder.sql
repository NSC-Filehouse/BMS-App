USE [BMS];
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'BMSApp.OrderReminderState', N'U') IS NULL
BEGIN
  CREATE TABLE [BMSApp].[OrderReminderState] (
    [ors_ID] BIGINT IDENTITY(1,1) NOT NULL,
    [ors_UserEmail] NVARCHAR(320) NOT NULL,
    [ors_UserShortCode] NVARCHAR(100) NOT NULL,
    [ors_LastCheckedAt] DATETIME2(7) NULL,
    [ors_NextCheckAt] DATETIME2(7) NULL,
    [ors_LastNotifiedAt] DATETIME2(7) NULL,
    [ors_LastOpenOrderCount] INT NOT NULL CONSTRAINT [DF_OrderReminderState_LastOpenOrderCount] DEFAULT (0),
    [ors_LastChannel] NVARCHAR(20) NULL,
    [ors_LockedAt] DATETIME2(7) NULL,
    [ors_LastError] NVARCHAR(2000) NULL,
    [ors_CreatedAt] DATETIME2(7) NOT NULL CONSTRAINT [DF_OrderReminderState_CreatedAt] DEFAULT (SYSUTCDATETIME()),
    [ors_UpdatedAt] DATETIME2(7) NOT NULL CONSTRAINT [DF_OrderReminderState_UpdatedAt] DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT [PK_OrderReminderState] PRIMARY KEY CLUSTERED ([ors_ID]),
    CONSTRAINT [CK_OrderReminderState_LastChannel]
      CHECK ([ors_LastChannel] IS NULL OR [ors_LastChannel] IN (N'push', N'email'))
  );

  CREATE UNIQUE INDEX [UX_OrderReminderState_UserEmail]
    ON [BMSApp].[OrderReminderState] ([ors_UserEmail]);

  CREATE INDEX [IX_OrderReminderState_Due]
    ON [BMSApp].[OrderReminderState] ([ors_NextCheckAt], [ors_LockedAt]);
END;

COMMIT TRANSACTION;
GO

SELECT
  OBJECT_ID(N'BMSApp.OrderReminderState', N'U') AS [orderReminderStateObjectId];
