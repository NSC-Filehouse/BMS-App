SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH(N'BMSApp.tbl_Temp_Bestellung', N'tb_supplier_contact_id') IS NULL
        ALTER TABLE BMSApp.tbl_Temp_Bestellung ADD tb_supplier_contact_id int NULL;
    IF COL_LENGTH(N'BMSApp.tbl_Temp_Bestellung', N'tb_warehouse_id') IS NULL
        ALTER TABLE BMSApp.tbl_Temp_Bestellung ADD tb_warehouse_id nvarchar(6) COLLATE Latin1_General_CI_AS NULL;
    IF COL_LENGTH(N'BMSApp.tbl_Temp_Bestellung', N'tb_address_customer_id') IS NULL
        ALTER TABLE BMSApp.tbl_Temp_Bestellung ADD tb_address_customer_id nvarchar(10) COLLATE Latin1_General_CI_AS NULL;
    IF COL_LENGTH(N'BMSApp.tbl_Temp_Bestellung', N'tb_address_id') IS NULL
        ALTER TABLE BMSApp.tbl_Temp_Bestellung ADD tb_address_id int NULL;
    IF COL_LENGTH(N'BMSApp.tbl_Temp_Bestellung', N'tb_reference') IS NULL
        ALTER TABLE BMSApp.tbl_Temp_Bestellung ADD tb_reference nvarchar(100) COLLATE Latin1_General_CI_AS NULL;
    IF COL_LENGTH(N'BMSApp.tbl_Temp_Bestellung', N'tb_currency') IS NULL
        ALTER TABLE BMSApp.tbl_Temp_Bestellung ADD tb_currency nvarchar(3) COLLATE Latin1_General_CI_AS NULL;

    IF COL_LENGTH(N'BMSApp.tbl_Temp_Best_Position', N'tbp_place_at_supplier') IS NULL
        ALTER TABLE BMSApp.tbl_Temp_Best_Position ADD tbp_place_at_supplier nvarchar(25) COLLATE Latin1_General_CI_AS NULL;
    IF COL_LENGTH(N'BMSApp.tbl_Temp_Best_Position', N'tbp_pickup_reference') IS NULL
        ALTER TABLE BMSApp.tbl_Temp_Best_Position ADD tbp_pickup_reference nvarchar(25) COLLATE Latin1_General_CI_AS NULL;
    IF COL_LENGTH(N'BMSApp.tbl_Temp_Best_Position', N'tbp_availability_note') IS NULL
        ALTER TABLE BMSApp.tbl_Temp_Best_Position ADD tbp_availability_note nvarchar(255) COLLATE Latin1_General_CI_AS NULL;

    IF OBJECT_ID(N'BMSApp.CK_TempBestPosition_ArticleIndex',N'C') IS NULL
        ALTER TABLE BMSApp.tbl_Temp_Best_Position WITH CHECK ADD CONSTRAINT CK_TempBestPosition_ArticleIndex
        CHECK (tbp_article_index IS NOT NULL AND LEN(LTRIM(RTRIM(tbp_article_index)))>0);
    IF COL_LENGTH(N'BMSApp.tbl_Temp_Best_Position', N'tbp_article') > 150
        ALTER TABLE BMSApp.tbl_Temp_Best_Position ALTER COLUMN tbp_article nvarchar(75) COLLATE Latin1_General_CI_AS NOT NULL;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
