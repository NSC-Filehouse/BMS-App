/*
  BMS-App supplier purchase-order workflow.
  Run against the central BMS database (not a tenant database).
  The script is repeatable and deliberately creates no triggers: BMS/CS must
  be able to update status 2 and the final BMS order number.
  Workflow: 0 = Entwurf, 1 = an CS/BMS übergeben, 2 = von BMS übernommen
  (ab hier wird die Einkaufsmail an den Lieferanten ausgelöst), 3 = Nacharbeit.
*/
USE [BMS];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

IF SCHEMA_ID(N'BMSApp') IS NULL
  EXEC(N'CREATE SCHEMA [BMSApp]');
GO

IF OBJECT_ID(N'BMSApp.tbl_Temp_Bestellung', N'U') IS NULL
BEGIN
  CREATE TABLE [BMSApp].[tbl_Temp_Bestellung] (
    [tb_id] INT IDENTITY(1,1) NOT NULL,
    [tb_company_id] INT NOT NULL,
    [tb_client_request_id] UNIQUEIDENTIFIER NOT NULL,
    [tb_supplier_id] NVARCHAR(20) NOT NULL,
    [tb_supplier_name] NVARCHAR(255) NOT NULL,
    [tb_supplier_address] NVARCHAR(1000) NULL,
    [tb_supplier_contact] NVARCHAR(255) NULL,
    [tb_payment_condition_changed] BIT NOT NULL CONSTRAINT [DF_tbl_Temp_Bestellung_payment_changed] DEFAULT (0),
    [tb_payment_condition_id] INT NULL,
    [tb_payment_condition_text] NVARCHAR(1000) NULL,
    [tb_delivery_term_id] INT NULL,
    [tb_delivery_term_text] NVARCHAR(500) NULL,
    [tb_packaging_type] NVARCHAR(200) NULL,
    [tb_loading_location_source] NVARCHAR(30) NULL,
    [tb_loading_location_id] INT NULL,
    [tb_loading_location_text] NVARCHAR(1000) NULL,
    [tb_loading_location_changed] BIT NOT NULL CONSTRAINT [DF_tbl_Temp_Bestellung_loading_changed] DEFAULT (0),
    [tb_comment] NVARCHAR(MAX) NULL,
    [tb_status] INT NOT NULL CONSTRAINT [DF_tbl_Temp_Bestellung_status] DEFAULT (0),
    [tb_bestellindex] NVARCHAR(34) NULL,
    [tb_supplier_mail_status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_tbl_Temp_Bestellung_supplier_mail_status] DEFAULT (N'not_queued'),
    [tb_supplier_mail_last_error] NVARCHAR(2000) NULL,
    [tb_supplier_mail_sent_at] DATETIME2(7) NULL,
    [tb_return_comment] NVARCHAR(MAX) NULL,
    [tb_created_by] NVARCHAR(100) NOT NULL,
    [tb_create_date] DATETIME2(7) NOT NULL CONSTRAINT [DF_tbl_Temp_Bestellung_create_date] DEFAULT (SYSUTCDATETIME()),
    [tb_last_modified_by] NVARCHAR(100) NOT NULL,
    [tb_last_modified_date] DATETIME2(7) NOT NULL CONSTRAINT [DF_tbl_Temp_Bestellung_last_modified_date] DEFAULT (SYSUTCDATETIME()),
    [tb_completed_by] NVARCHAR(100) NULL,
    [tb_closing_date] DATETIME2(7) NULL,
    CONSTRAINT [PK_tbl_Temp_Bestellung] PRIMARY KEY CLUSTERED ([tb_id]),
    CONSTRAINT [UQ_tbl_Temp_Bestellung_client_request] UNIQUE ([tb_company_id], [tb_client_request_id]),
    CONSTRAINT [CK_tbl_Temp_Bestellung_status] CHECK ([tb_status] IN (0, 1, 2, 3))
  );
  CREATE INDEX [IX_tbl_Temp_Bestellung_company_status]
    ON [BMSApp].[tbl_Temp_Bestellung] ([tb_company_id], [tb_status], [tb_last_modified_date]);
  CREATE INDEX [IX_tbl_Temp_Bestellung_supplier]
    ON [BMSApp].[tbl_Temp_Bestellung] ([tb_company_id], [tb_supplier_id]);
END;
GO

IF COL_LENGTH(N'BMSApp.tbl_Temp_Bestellung', N'tb_supplier_mail_status') IS NULL
  ALTER TABLE [BMSApp].[tbl_Temp_Bestellung]
    ADD [tb_supplier_mail_status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_tbl_Temp_Bestellung_supplier_mail_status] DEFAULT (N'not_queued');
IF COL_LENGTH(N'BMSApp.tbl_Temp_Bestellung', N'tb_supplier_mail_last_error') IS NULL
  ALTER TABLE [BMSApp].[tbl_Temp_Bestellung] ADD [tb_supplier_mail_last_error] NVARCHAR(2000) NULL;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Bestellung', N'tb_supplier_mail_sent_at') IS NULL
  ALTER TABLE [BMSApp].[tbl_Temp_Bestellung] ADD [tb_supplier_mail_sent_at] DATETIME2(7) NULL;
GO

IF OBJECT_ID(N'BMSApp.tbl_Temp_Best_Position', N'U') IS NULL
BEGIN
  CREATE TABLE [BMSApp].[tbl_Temp_Best_Position] (
    [tbp_id] INT IDENTITY(1,1) NOT NULL,
    [tbp_tb_id] INT NOT NULL,
    [tbp_line_no] INT NOT NULL,
    [tbp_article_index] NVARCHAR(100) NULL,
    [tbp_article] NVARCHAR(500) NOT NULL,
    [tbp_amount] DECIMAL(18,3) NOT NULL,
    [tbp_unit] NVARCHAR(20) NOT NULL,
    [tbp_purchase_price] DECIMAL(18,4) NOT NULL,
    [tbp_currency] NVARCHAR(6) NOT NULL CONSTRAINT [DF_tbl_Temp_Best_Position_currency] DEFAULT (N'EUR'),
    [tbp_requested_delivery_date] DATE NOT NULL,
    [tbp_reserved_for] NVARCHAR(100) NULL,
    [tbp_comment] NVARCHAR(MAX) NULL,
    [tbp_source_bestellindex] NVARCHAR(34) NULL,
    [tbp_source_position_id] NVARCHAR(50) NULL,
    [tbp_source_order_date] DATE NULL,
    [tbp_created_by] NVARCHAR(100) NOT NULL,
    [tbp_create_date] DATETIME2(7) NOT NULL CONSTRAINT [DF_tbl_Temp_Best_Position_create_date] DEFAULT (SYSUTCDATETIME()),
    [tbp_last_modified_by] NVARCHAR(100) NOT NULL,
    [tbp_last_modified_date] DATETIME2(7) NOT NULL CONSTRAINT [DF_tbl_Temp_Best_Position_last_modified_date] DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT [PK_tbl_Temp_Best_Position] PRIMARY KEY CLUSTERED ([tbp_id]),
    CONSTRAINT [FK_tbl_Temp_Best_Position_order] FOREIGN KEY ([tbp_tb_id])
      REFERENCES [BMSApp].[tbl_Temp_Bestellung] ([tb_id]) ON DELETE CASCADE,
    CONSTRAINT [UQ_tbl_Temp_Best_Position_line] UNIQUE ([tbp_tb_id], [tbp_line_no]),
    CONSTRAINT [CK_tbl_Temp_Best_Position_amount] CHECK ([tbp_amount] > 0),
    CONSTRAINT [CK_tbl_Temp_Best_Position_price] CHECK ([tbp_purchase_price] >= 0)
  );
  CREATE INDEX [IX_tbl_Temp_Best_Position_order]
    ON [BMSApp].[tbl_Temp_Best_Position] ([tbp_tb_id], [tbp_line_no]);
  CREATE INDEX [IX_tbl_Temp_Best_Position_article]
    ON [BMSApp].[tbl_Temp_Best_Position] ([tbp_article_index]);
END;
GO

IF OBJECT_ID(N'BMSApp.PurchaseOrderMailOutbox', N'U') IS NULL
BEGIN
  CREATE TABLE [BMSApp].[PurchaseOrderMailOutbox] (
    [pom_ID] INT IDENTITY(1,1) NOT NULL,
    [pom_PurchaseOrderID] INT NOT NULL,
    [pom_CompanyID] INT NOT NULL,
    [pom_Recipient] NVARCHAR(1000) NOT NULL,
    [pom_RecipientSource] NVARCHAR(100) NULL,
    [pom_Subject] NVARCHAR(500) NOT NULL,
    [pom_Body] NVARCHAR(MAX) NOT NULL,
    [pom_Status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_PurchaseOrderMailOutbox_Status] DEFAULT (N'pending'),
    [pom_AttemptCount] INT NOT NULL CONSTRAINT [DF_PurchaseOrderMailOutbox_AttemptCount] DEFAULT (0),
    [pom_NextAttemptAt] DATETIME2(7) NULL,
    [pom_LockedAt] DATETIME2(7) NULL,
    [pom_LastError] NVARCHAR(2000) NULL,
    [pom_SentAt] DATETIME2(7) NULL,
    [pom_CreateDate] DATETIME2(7) NOT NULL CONSTRAINT [DF_PurchaseOrderMailOutbox_CreateDate] DEFAULT (SYSUTCDATETIME()),
    [pom_LastModifiedDate] DATETIME2(7) NOT NULL CONSTRAINT [DF_PurchaseOrderMailOutbox_LastModifiedDate] DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT [PK_PurchaseOrderMailOutbox] PRIMARY KEY CLUSTERED ([pom_ID]),
    CONSTRAINT [UQ_PurchaseOrderMailOutbox_OrderID] UNIQUE ([pom_PurchaseOrderID]),
    CONSTRAINT [FK_PurchaseOrderMailOutbox_Order] FOREIGN KEY ([pom_PurchaseOrderID])
      REFERENCES [BMSApp].[tbl_Temp_Bestellung] ([tb_id]) ON DELETE CASCADE,
    CONSTRAINT [CK_PurchaseOrderMailOutbox_Status]
      CHECK ([pom_Status] IN (N'pending', N'sending', N'sent', N'failed'))
  );
  CREATE INDEX [IX_PurchaseOrderMailOutbox_Pending]
    ON [BMSApp].[PurchaseOrderMailOutbox] ([pom_Status], [pom_NextAttemptAt], [pom_ID]);
END;
GO

IF OBJECT_ID(N'BMSApp.PurchaseOrderCsMailOutbox', N'U') IS NULL
BEGIN
  CREATE TABLE [BMSApp].[PurchaseOrderCsMailOutbox] (
    [pcom_ID] INT IDENTITY(1,1) NOT NULL,
    [pcom_PurchaseOrderID] INT NOT NULL,
    [pcom_CompanyID] INT NOT NULL,
    [pcom_Recipient] NVARCHAR(1000) NOT NULL,
    [pcom_RecipientSource] NVARCHAR(100) NULL,
    [pcom_Subject] NVARCHAR(500) NOT NULL,
    [pcom_Body] NVARCHAR(MAX) NOT NULL,
    [pcom_Status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_PurchaseOrderCsMailOutbox_Status] DEFAULT (N'pending'),
    [pcom_AttemptCount] INT NOT NULL CONSTRAINT [DF_PurchaseOrderCsMailOutbox_AttemptCount] DEFAULT (0),
    [pcom_NextAttemptAt] DATETIME2(7) NULL,
    [pcom_LockedAt] DATETIME2(7) NULL,
    [pcom_LastError] NVARCHAR(2000) NULL,
    [pcom_SentAt] DATETIME2(7) NULL,
    [pcom_CreateDate] DATETIME2(7) NOT NULL CONSTRAINT [DF_PurchaseOrderCsMailOutbox_CreateDate] DEFAULT (SYSUTCDATETIME()),
    [pcom_LastModifiedDate] DATETIME2(7) NOT NULL CONSTRAINT [DF_PurchaseOrderCsMailOutbox_LastModifiedDate] DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT [PK_PurchaseOrderCsMailOutbox] PRIMARY KEY CLUSTERED ([pcom_ID]),
    CONSTRAINT [UQ_PurchaseOrderCsMailOutbox_OrderID] UNIQUE ([pcom_PurchaseOrderID]),
    CONSTRAINT [FK_PurchaseOrderCsMailOutbox_Order] FOREIGN KEY ([pcom_PurchaseOrderID])
      REFERENCES [BMSApp].[tbl_Temp_Bestellung] ([tb_id]) ON DELETE CASCADE,
    CONSTRAINT [CK_PurchaseOrderCsMailOutbox_Status]
      CHECK ([pcom_Status] IN (N'pending', N'sending', N'sent', N'failed'))
  );
  CREATE INDEX [IX_PurchaseOrderCsMailOutbox_Pending]
    ON [BMSApp].[PurchaseOrderCsMailOutbox] ([pcom_Status], [pcom_NextAttemptAt], [pcom_ID]);
END;
GO

SELECT
  OBJECT_ID(N'BMSApp.tbl_Temp_Bestellung', N'U') AS tempPurchaseOrderObjectId,
  OBJECT_ID(N'BMSApp.tbl_Temp_Best_Position', N'U') AS tempPurchasePositionObjectId,
  OBJECT_ID(N'BMSApp.PurchaseOrderMailOutbox', N'U') AS purchaseMailOutboxObjectId,
  OBJECT_ID(N'BMSApp.PurchaseOrderCsMailOutbox', N'U') AS purchaseCsMailOutboxObjectId;
GO
