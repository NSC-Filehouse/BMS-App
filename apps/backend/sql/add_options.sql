/* Supplier offers for the central DB04/BMS database. Repeatable schema migration. */
USE [BMS];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

IF SCHEMA_ID(N'BMSApp') IS NULL EXEC(N'CREATE SCHEMA [BMSApp]');
GO

IF OBJECT_ID(N'BMSApp.tblOptionen', N'U') IS NULL
BEGIN
  CREATE TABLE [BMSApp].[tblOptionen] (
    [op_id] INT IDENTITY(1,1) NOT NULL,
    [op_company_id] INT NOT NULL,
    [op_supplier_id] NVARCHAR(50) NULL,
    [op_supplier_name] NVARCHAR(255) NOT NULL,
    [op_external_offer_no] NVARCHAR(100) NULL,
    [op_external_customer_no] NVARCHAR(100) NULL,
    [op_document_date] DATE NULL,
    [op_received_at] DATETIME2(7) NOT NULL,
    [op_valid_from] DATE NOT NULL,
    [op_valid_until] DATE NOT NULL,
    [op_source_valid_until] DATE NULL,
    [op_incoterm] NVARCHAR(50) NULL,
    [op_loading_location] NVARCHAR(500) NULL,
    [op_packaging_text] NVARCHAR(500) NULL,
    [op_reply_to] NVARCHAR(255) NULL,
    [op_terms_text] NVARCHAR(MAX) NULL,
    [op_source_type] NVARCHAR(30) NOT NULL,
    [op_source_key] NVARCHAR(255) NOT NULL,
    [op_source_file_name] NVARCHAR(255) NULL,
    [op_is_demo] BIT NOT NULL CONSTRAINT [DF_tblOptionen_is_demo] DEFAULT (0),
    [op_review_status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_tblOptionen_review_status] DEFAULT (N'pending'),
    [op_business_status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_tblOptionen_business_status] DEFAULT (N'open'),
    [op_created_by] NVARCHAR(100) NOT NULL,
    [op_create_date] DATETIME2(7) NOT NULL CONSTRAINT [DF_tblOptionen_create_date] DEFAULT (SYSUTCDATETIME()),
    [op_last_modified_by] NVARCHAR(100) NOT NULL,
    [op_last_modified_date] DATETIME2(7) NOT NULL CONSTRAINT [DF_tblOptionen_last_modified_date] DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT [PK_tblOptionen] PRIMARY KEY CLUSTERED ([op_id]),
    CONSTRAINT [UQ_tblOptionen_source] UNIQUE ([op_company_id], [op_source_key]),
    CONSTRAINT [CK_tblOptionen_validity] CHECK ([op_valid_until] >= [op_valid_from]),
    CONSTRAINT [CK_tblOptionen_review] CHECK ([op_review_status] IN (N'pending', N'approved', N'rejected')),
    CONSTRAINT [CK_tblOptionen_business] CHECK ([op_business_status] IN (N'open', N'withdrawn', N'accepted'))
  );
  CREATE INDEX [IX_tblOptionen_company_validity]
    ON [BMSApp].[tblOptionen] ([op_company_id], [op_review_status], [op_business_status], [op_valid_from], [op_valid_until]);
END;
GO

IF COL_LENGTH(N'BMSApp.tblOptionen', N'op_is_demo') IS NULL
  ALTER TABLE [BMSApp].[tblOptionen]
    ADD [op_is_demo] BIT NOT NULL CONSTRAINT [DF_tblOptionen_is_demo] DEFAULT (0);
GO

IF OBJECT_ID(N'BMSApp.tblOptionenPositionen', N'U') IS NULL
BEGIN
  CREATE TABLE [BMSApp].[tblOptionenPositionen] (
    [opp_id] INT IDENTITY(1,1) NOT NULL,
    [opp_op_id] INT NOT NULL,
    [opp_line_no] INT NOT NULL,
    [opp_supplier_article_no] NVARCHAR(100) NULL,
    [opp_supplier_article_name] NVARCHAR(500) NOT NULL,
    [opp_internal_article_name] NVARCHAR(500) NULL,
    [opp_material_category] NVARCHAR(100) NULL,
    [opp_quality] NVARCHAR(100) NULL,
    [opp_batch_no] NVARCHAR(100) NULL,
    [opp_quantity_min] DECIMAL(18,3) NULL,
    [opp_quantity_max] DECIMAL(18,3) NULL,
    [opp_quantity_unit] NVARCHAR(30) NULL,
    [opp_quantity_text] NVARCHAR(500) NULL,
    [opp_price] DECIMAL(18,4) NULL,
    [opp_price_unit] NVARCHAR(30) NULL,
    [opp_currency] NVARCHAR(6) NULL,
    [opp_mfi] DECIMAL(18,3) NULL,
    [opp_mfi_test_condition] NVARCHAR(100) NULL,
    [opp_density] DECIMAL(18,3) NULL,
    [opp_c2] DECIMAL(18,3) NULL,
    [opp_properties_text] NVARCHAR(MAX) NULL,
    [opp_loading_text] NVARCHAR(1000) NULL,
    [opp_valid_until] DATE NULL,
    [opp_created_by] NVARCHAR(100) NOT NULL,
    [opp_create_date] DATETIME2(7) NOT NULL CONSTRAINT [DF_tblOptionenPositionen_create_date] DEFAULT (SYSUTCDATETIME()),
    [opp_last_modified_by] NVARCHAR(100) NOT NULL,
    [opp_last_modified_date] DATETIME2(7) NOT NULL CONSTRAINT [DF_tblOptionenPositionen_last_modified_date] DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT [PK_tblOptionenPositionen] PRIMARY KEY CLUSTERED ([opp_id]),
    CONSTRAINT [FK_tblOptionenPositionen_option] FOREIGN KEY ([opp_op_id]) REFERENCES [BMSApp].[tblOptionen] ([op_id]),
    CONSTRAINT [UQ_tblOptionenPositionen_line] UNIQUE ([opp_op_id], [opp_line_no]),
    CONSTRAINT [CK_tblOptionenPositionen_quantity] CHECK ([opp_quantity_min] IS NULL OR [opp_quantity_max] IS NULL OR [opp_quantity_max] >= [opp_quantity_min]),
    CONSTRAINT [CK_tblOptionenPositionen_price] CHECK ([opp_price] IS NULL OR [opp_price] >= 0)
  );
  CREATE INDEX [IX_tblOptionenPositionen_option]
    ON [BMSApp].[tblOptionenPositionen] ([opp_op_id], [opp_line_no]);
END;
GO

SELECT OBJECT_ID(N'BMSApp.tblOptionen', N'U') AS optionObjectId,
       OBJECT_ID(N'BMSApp.tblOptionenPositionen', N'U') AS positionObjectId;
