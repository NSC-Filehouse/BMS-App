-- Backward-compatible preparation. Apply before deploying the revised backend.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_special_payment_condition') IS NULL ALTER TABLE BMSApp.tbl_Temp_Angebot ADD tag_special_payment_condition bit NOT NULL CONSTRAINT DF_Temp_Angebot_special_payment DEFAULT 0;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_delivery_terms_id') IS NULL ALTER TABLE BMSApp.tbl_Temp_Angebot ADD tag_delivery_terms_id int NULL;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_packaging_id') IS NULL ALTER TABLE BMSApp.tbl_Temp_Angebot ADD tag_packaging_id smallint NULL;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_delivery_address_id') IS NULL ALTER TABLE BMSApp.tbl_Temp_Angebot ADD tag_delivery_address_id int NULL;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_delivery_address') IS NULL ALTER TABLE BMSApp.tbl_Temp_Angebot ADD tag_delivery_address nvarchar(1000) NULL;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_delivery_address_manual') IS NULL ALTER TABLE BMSApp.tbl_Temp_Angebot ADD tag_delivery_address_manual bit NOT NULL CONSTRAINT DF_Temp_Angebot_manual_address DEFAULT 0;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Ang_Position',N'tagp_valuta_date') IS NULL ALTER TABLE BMSApp.tbl_Temp_Ang_Position ADD tagp_valuta_date date NULL;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Ang_Position',N'tagp_cost_price') IS NULL ALTER TABLE BMSApp.tbl_Temp_Ang_Position ADD tagp_cost_price decimal(18,4) NOT NULL CONSTRAINT DF_Temp_Ang_Position_cost DEFAULT 0;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Ang_Position',N'tagp_wpz_original') IS NULL ALTER TABLE BMSApp.tbl_Temp_Ang_Position ADD tagp_wpz_original bit NOT NULL CONSTRAINT DF_Temp_Ang_Position_wpz DEFAULT 1;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Ang_Position',N'tagp_wpz_comment') IS NULL ALTER TABLE BMSApp.tbl_Temp_Ang_Position ADD tagp_wpz_comment nvarchar(1000) NULL;
-- Old backend still supplies the legacy fields; the new backend omits them.
-- Make obsolete required fields nullable for a rolling update.
DECLARE @alter nvarchar(max)=N'';
SELECT @alter=@alter+N'ALTER TABLE '+QUOTENAME(s.name)+N'.'+QUOTENAME(t.name)+N' ALTER COLUMN '+QUOTENAME(c.name)+N' '+ty.name+
 CASE WHEN ty.name IN ('nvarchar','varchar') THEN N'('+CASE WHEN c.max_length=-1 THEN N'max' ELSE CONVERT(nvarchar(10),c.max_length/CASE WHEN ty.name='nvarchar' THEN 2 ELSE 1 END) END+N')'
 WHEN ty.name IN ('decimal','numeric') THEN N'('+CONVERT(nvarchar(10),c.precision)+N','+CONVERT(nvarchar(10),c.scale)+N')' ELSE N'' END+N' NULL;'+CHAR(10)
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id
WHERE s.name='BMSApp' AND t.name IN ('tbl_Temp_Angebot','tbl_Temp_Ang_Position') AND c.is_nullable=0 AND c.name IN (N'tag_department',N'tag_offer_date',N'tag_language',N'tag_inquiry_date',N'tag_inquiry_via',N'tag_title',N'tag_valid_until',N'tag_currency',N'tag_intro',N'tag_closing_text',N'tag_discount_percent',N'tag_discount_amount',N'tag_vat_percent',N'tag_net_amount',N'tag_subtotal',N'tag_vat_amount',N'tag_total_amount',N'tag_print_totals',N'tagp_total',N'tagp_description',N'tagp_alternative_text',N'tagp_delivery_text',N'tagp_sample',N'tagp_rejected');
EXEC sys.sp_executesql @alter;
COMMIT;
