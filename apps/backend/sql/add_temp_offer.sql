-- Execute on the central BMS database using Windows authentication.
-- Status: 0 draft, 1 released for external ERP import, 2 imported, 3 rework.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF SCHEMA_ID(N'BMSApp') IS NULL EXEC(N'CREATE SCHEMA BMSApp');
IF OBJECT_ID(N'BMSApp.tbl_Temp_Angebot', N'U') IS NULL
BEGIN
  CREATE TABLE BMSApp.tbl_Temp_Angebot (
    tag_id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Temp_Angebot PRIMARY KEY,
    tag_company_id int NOT NULL,
    tag_created_by nvarchar(50) NOT NULL,
    tag_created_at datetime2(3) NOT NULL CONSTRAINT DF_Temp_Angebot_created DEFAULT SYSUTCDATETIME(),
    tag_modified_by nvarchar(50) NOT NULL,
    tag_modified_at datetime2(3) NOT NULL CONSTRAINT DF_Temp_Angebot_modified DEFAULT SYSUTCDATETIME(),
    tag_client_request_id uniqueidentifier NOT NULL,
    tag_copy_source_id int NULL,
    tag_customer_id nvarchar(10) NOT NULL,
    tag_customer_name nvarchar(255) NOT NULL,
    tag_customer_address nvarchar(max) NOT NULL,
    tag_contact_id int NULL,
    tag_contact nvarchar(50) NULL,
    tag_customer_reference nvarchar(50) NULL,
    tag_payment_id int NULL,
    tag_payment_text nvarchar(1000) NULL,
    tag_delivery_terms nvarchar(250) NULL,
    tag_packaging nvarchar(100) NULL,
    tag_special_payment_condition bit NOT NULL CONSTRAINT DF_Temp_Angebot_special_payment DEFAULT 0,
    tag_delivery_terms_id int NULL,
    tag_packaging_id smallint NULL,
    tag_delivery_address_id int NULL,
    tag_delivery_address nvarchar(1000) NULL,
    tag_delivery_address_manual bit NOT NULL CONSTRAINT DF_Temp_Angebot_manual_address DEFAULT 0,
    tag_internal_note nvarchar(max) NULL,
    tag_status int NOT NULL CONSTRAINT DF_Temp_Angebot_status DEFAULT 0,
    tag_bms_offer_number nvarchar(17) NULL,
    tag_released_at datetime2(3) NULL,
    tag_return_comment nvarchar(max) NULL,
    tag_version rowversion NOT NULL,
    CONSTRAINT CK_Temp_Angebot_status CHECK(tag_status IN(0,1,2,3)),
    CONSTRAINT UQ_Temp_Angebot_request UNIQUE(tag_company_id,tag_created_by,tag_client_request_id)
  );
  CREATE INDEX IX_Temp_Angebot_owner ON BMSApp.tbl_Temp_Angebot(tag_company_id,tag_created_by,tag_created_at DESC);
END;
IF OBJECT_ID(N'BMSApp.tbl_Temp_Ang_Position', N'U') IS NULL
BEGIN
  CREATE TABLE BMSApp.tbl_Temp_Ang_Position (
    tagp_id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Temp_Ang_Position PRIMARY KEY,
    tagp_offer_id int NOT NULL,
    tagp_line_no int NOT NULL,
    tagp_line_key uniqueidentifier NOT NULL,
    tagp_article_index nvarchar(50) NOT NULL,
    tagp_article nvarchar(75) NOT NULL,
    tagp_master_article nvarchar(75) NOT NULL,
    tagp_quantity decimal(18,3) NOT NULL,
    tagp_unit nvarchar(50) NOT NULL,
    tagp_price decimal(18,4) NOT NULL,
    tagp_price_basis int NOT NULL,
    tagp_delivery_date date NULL,
    tagp_valuta_date date NULL,
    tagp_cost_price decimal(18,4) NOT NULL CONSTRAINT DF_Temp_Ang_Position_cost DEFAULT 0,
    tagp_wpz_original bit NOT NULL CONSTRAINT DF_Temp_Ang_Position_wpz DEFAULT 1,
    tagp_wpz_comment nvarchar(1000) NULL,
    tagp_reserve bit NOT NULL,
    tagp_be_number nvarchar(17) NULL,
    tagp_warehouse_id nvarchar(6) NULL,
    tagp_reserve_quantity decimal(18,3) NULL,
    tagp_reserve_until date NULL,
    tagp_reservation_version binary(8) NULL,
    CONSTRAINT FK_Temp_Ang_Position_offer FOREIGN KEY(tagp_offer_id) REFERENCES BMSApp.tbl_Temp_Angebot(tag_id),
    CONSTRAINT UQ_Temp_Ang_Position_line UNIQUE(tagp_offer_id,tagp_line_no),
    CONSTRAINT UQ_Temp_Ang_Position_key UNIQUE(tagp_offer_id,tagp_line_key),
    CONSTRAINT CK_Temp_Ang_Position_values CHECK(tagp_quantity>0 AND tagp_price>=0 AND tagp_price_basis>0)
  );
END;
COMMIT;
