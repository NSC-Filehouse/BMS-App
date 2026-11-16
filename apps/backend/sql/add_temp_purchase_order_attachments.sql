/* Run in the central BMS database before deploying purchase-order attachments.
   Repeatable; the parent key must match the technical tb_id (INT) from
   add_temp_purchase_order.sql. No existing purchase data is modified. */
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

IF OBJECT_ID(N'BMSApp.tbl_Temp_Bestellung', N'U') IS NULL
  THROW 50040, 'Die Tabelle BMSApp.tbl_Temp_Bestellung wurde nicht gefunden.', 1;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'BMSApp.tbl_Temp_Bestellung')
    AND name = N'tb_id' AND system_type_id = TYPE_ID(N'int')
)
  THROW 50041, 'Der erwartete INT-Schlüssel tbl_Temp_Bestellung.tb_id wurde nicht gefunden.', 1;

BEGIN TRANSACTION;
IF OBJECT_ID(N'BMSApp.tbl_Temp_Bestellung_Anhang', N'U') IS NULL
BEGIN
  CREATE TABLE [BMSApp].[tbl_Temp_Bestellung_Anhang] (
    [tba_ID] BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_tbl_Temp_Bestellung_Anhang] PRIMARY KEY CLUSTERED,
    [tba_tb_id] INT NOT NULL,
    [tba_FileName] NVARCHAR(1024) NOT NULL,
    [tba_MimeType] NVARCHAR(255) NOT NULL,
    [tba_Content] VARBINARY(MAX) NOT NULL,
    [tba_SizeBytes] BIGINT NOT NULL,
    [tba_CreatedBy] NVARCHAR(100) NULL,
    [tba_CreatedAt] DATETIME2(7) NOT NULL CONSTRAINT [DF_tbl_Temp_Bestellung_Anhang_CreatedAt] DEFAULT (SYSUTCDATETIME()),
    [tba_DeletedAt] DATETIME2(7) NULL,
    [tba_DeletedBy] NVARCHAR(100) NULL,
    CONSTRAINT [FK_tbl_Temp_Bestellung_Anhang_Bestellung] FOREIGN KEY ([tba_tb_id])
      REFERENCES [BMSApp].[tbl_Temp_Bestellung] ([tb_id]) ON DELETE CASCADE
  );
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'BMSApp.tbl_Temp_Bestellung_Anhang')
    AND name = N'IX_tbl_Temp_Bestellung_Anhang_Order'
)
  CREATE INDEX [IX_tbl_Temp_Bestellung_Anhang_Order]
    ON [BMSApp].[tbl_Temp_Bestellung_Anhang] ([tba_tb_id], [tba_ID])
    INCLUDE ([tba_FileName], [tba_MimeType], [tba_SizeBytes], [tba_CreatedAt], [tba_DeletedAt]);
COMMIT TRANSACTION;
