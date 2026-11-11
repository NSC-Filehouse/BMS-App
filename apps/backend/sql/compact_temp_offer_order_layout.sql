-- Run AFTER deploying the revised backend. The old backend references these columns.
-- Does not discard non-empty legacy fields; preserve/export any such values first.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_department') IS NOT NULL
BEGIN
  EXEC(N'IF EXISTS(SELECT 1 FROM BMSApp.tbl_Temp_Angebot WHERE tag_department IS NOT NULL) THROW 50001,''Legacy offer fields contain data. Export/migrate these values before cleanup.'',1; ALTER TABLE BMSApp.tbl_Temp_Angebot DROP COLUMN tag_department;');
END;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_offer_date') IS NOT NULL
BEGIN
  EXEC(N'IF EXISTS(SELECT 1 FROM BMSApp.tbl_Temp_Angebot WHERE tag_offer_date IS NOT NULL) THROW 50001,''Legacy offer fields contain data. Export/migrate these values before cleanup.'',1; ALTER TABLE BMSApp.tbl_Temp_Angebot DROP COLUMN tag_offer_date;');
END;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_language') IS NOT NULL
BEGIN
  EXEC(N'IF EXISTS(SELECT 1 FROM BMSApp.tbl_Temp_Angebot WHERE tag_language IS NOT NULL) THROW 50001,''Legacy offer fields contain data. Export/migrate these values before cleanup.'',1; ALTER TABLE BMSApp.tbl_Temp_Angebot DROP COLUMN tag_language;');
END;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_inquiry_date') IS NOT NULL
BEGIN
  EXEC(N'IF EXISTS(SELECT 1 FROM BMSApp.tbl_Temp_Angebot WHERE tag_inquiry_date IS NOT NULL) THROW 50001,''Legacy offer fields contain data. Export/migrate these values before cleanup.'',1; ALTER TABLE BMSApp.tbl_Temp_Angebot DROP COLUMN tag_inquiry_date;');
END;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_inquiry_via') IS NOT NULL
BEGIN
  EXEC(N'IF EXISTS(SELECT 1 FROM BMSApp.tbl_Temp_Angebot WHERE tag_inquiry_via IS NOT NULL) THROW 50001,''Legacy offer fields contain data. Export/migrate these values before cleanup.'',1; ALTER TABLE BMSApp.tbl_Temp_Angebot DROP COLUMN tag_inquiry_via;');
END;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_title') IS NOT NULL
BEGIN
  EXEC(N'IF EXISTS(SELECT 1 FROM BMSApp.tbl_Temp_Angebot WHERE tag_title IS NOT NULL) THROW 50001,''Legacy offer fields contain data. Export/migrate these values before cleanup.'',1; ALTER TABLE BMSApp.tbl_Temp_Angebot DROP COLUMN tag_title;');
END;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_valid_until') IS NOT NULL
BEGIN
  EXEC(N'IF EXISTS(SELECT 1 FROM BMSApp.tbl_Temp_Angebot WHERE tag_valid_until IS NOT NULL) THROW 50001,''Legacy offer fields contain data. Export/migrate these values before cleanup.'',1; ALTER TABLE BMSApp.tbl_Temp_Angebot DROP COLUMN tag_valid_until;');
END;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_currency') IS NOT NULL
BEGIN
  EXEC(N'IF EXISTS(SELECT 1 FROM BMSApp.tbl_Temp_Angebot WHERE tag_currency IS NOT NULL) THROW 50001,''Legacy offer fields contain data. Export/migrate these values before cleanup.'',1; ALTER TABLE BMSApp.tbl_Temp_Angebot DROP COLUMN tag_currency;');
END;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_intro') IS NOT NULL
BEGIN
  EXEC(N'IF EXISTS(SELECT 1 FROM BMSApp.tbl_Temp_Angebot WHERE tag_intro IS NOT NULL) THROW 50001,''Legacy offer fields contain data. Export/migrate these values before cleanup.'',1; ALTER TABLE BMSApp.tbl_Temp_Angebot DROP COLUMN tag_intro;');
END;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_closing_text') IS NOT NULL
BEGIN
  EXEC(N'IF EXISTS(SELECT 1 FROM BMSApp.tbl_Temp_Angebot WHERE tag_closing_text IS NOT NULL) THROW 50001,''Legacy offer fields contain data. Export/migrate these values before cleanup.'',1; ALTER TABLE BMSApp.tbl_Temp_Angebot DROP COLUMN tag_closing_text;');
END;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_discount_percent') IS NOT NULL
BEGIN
  EXEC(N'IF EXISTS(SELECT 1 FROM BMSApp.tbl_Temp_Angebot WHERE tag_discount_percent IS NOT NULL) THROW 50001,''Legacy offer fields contain data. Export/migrate these values before cleanup.'',1; ALTER TABLE BMSApp.tbl_Temp_Angebot DROP COLUMN tag_discount_percent;');
END;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_discount_amount') IS NOT NULL
BEGIN
  EXEC(N'IF EXISTS(SELECT 1 FROM BMSApp.tbl_Temp_Angebot WHERE tag_discount_amount IS NOT NULL) THROW 50001,''Legacy offer fields contain data. Export/migrate these values before cleanup.'',1; ALTER TABLE BMSApp.tbl_Temp_Angebot DROP COLUMN tag_discount_amount;');
END;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_vat_percent') IS NOT NULL
BEGIN
  EXEC(N'IF EXISTS(SELECT 1 FROM BMSApp.tbl_Temp_Angebot WHERE tag_vat_percent IS NOT NULL) THROW 50001,''Legacy offer fields contain data. Export/migrate these values before cleanup.'',1; ALTER TABLE BMSApp.tbl_Temp_Angebot DROP COLUMN tag_vat_percent;');
END;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_net_amount') IS NOT NULL
BEGIN
  EXEC(N'IF EXISTS(SELECT 1 FROM BMSApp.tbl_Temp_Angebot WHERE tag_net_amount IS NOT NULL) THROW 50001,''Legacy offer fields contain data. Export/migrate these values before cleanup.'',1; ALTER TABLE BMSApp.tbl_Temp_Angebot DROP COLUMN tag_net_amount;');
END;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_subtotal') IS NOT NULL
BEGIN
  EXEC(N'IF EXISTS(SELECT 1 FROM BMSApp.tbl_Temp_Angebot WHERE tag_subtotal IS NOT NULL) THROW 50001,''Legacy offer fields contain data. Export/migrate these values before cleanup.'',1; ALTER TABLE BMSApp.tbl_Temp_Angebot DROP COLUMN tag_subtotal;');
END;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_vat_amount') IS NOT NULL
BEGIN
  EXEC(N'IF EXISTS(SELECT 1 FROM BMSApp.tbl_Temp_Angebot WHERE tag_vat_amount IS NOT NULL) THROW 50001,''Legacy offer fields contain data. Export/migrate these values before cleanup.'',1; ALTER TABLE BMSApp.tbl_Temp_Angebot DROP COLUMN tag_vat_amount;');
END;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_total_amount') IS NOT NULL
BEGIN
  EXEC(N'IF EXISTS(SELECT 1 FROM BMSApp.tbl_Temp_Angebot WHERE tag_total_amount IS NOT NULL) THROW 50001,''Legacy offer fields contain data. Export/migrate these values before cleanup.'',1; ALTER TABLE BMSApp.tbl_Temp_Angebot DROP COLUMN tag_total_amount;');
END;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_print_totals') IS NOT NULL
BEGIN
  EXEC(N'IF EXISTS(SELECT 1 FROM BMSApp.tbl_Temp_Angebot WHERE tag_print_totals IS NOT NULL) THROW 50001,''Legacy offer fields contain data. Export/migrate these values before cleanup.'',1; ALTER TABLE BMSApp.tbl_Temp_Angebot DROP COLUMN tag_print_totals;');
END;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Ang_Position',N'tagp_total') IS NOT NULL
BEGIN
  EXEC(N'IF EXISTS(SELECT 1 FROM BMSApp.tbl_Temp_Ang_Position WHERE tagp_total IS NOT NULL) THROW 50001,''Legacy offer fields contain data. Export/migrate these values before cleanup.'',1; ALTER TABLE BMSApp.tbl_Temp_Ang_Position DROP COLUMN tagp_total;');
END;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Ang_Position',N'tagp_description') IS NOT NULL
BEGIN
  EXEC(N'IF EXISTS(SELECT 1 FROM BMSApp.tbl_Temp_Ang_Position WHERE tagp_description IS NOT NULL) THROW 50001,''Legacy offer fields contain data. Export/migrate these values before cleanup.'',1; ALTER TABLE BMSApp.tbl_Temp_Ang_Position DROP COLUMN tagp_description;');
END;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Ang_Position',N'tagp_alternative_text') IS NOT NULL
BEGIN
  EXEC(N'IF EXISTS(SELECT 1 FROM BMSApp.tbl_Temp_Ang_Position WHERE tagp_alternative_text IS NOT NULL) THROW 50001,''Legacy offer fields contain data. Export/migrate these values before cleanup.'',1; ALTER TABLE BMSApp.tbl_Temp_Ang_Position DROP COLUMN tagp_alternative_text;');
END;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Ang_Position',N'tagp_delivery_text') IS NOT NULL
BEGIN
  EXEC(N'IF EXISTS(SELECT 1 FROM BMSApp.tbl_Temp_Ang_Position WHERE tagp_delivery_text IS NOT NULL) THROW 50001,''Legacy offer fields contain data. Export/migrate these values before cleanup.'',1; ALTER TABLE BMSApp.tbl_Temp_Ang_Position DROP COLUMN tagp_delivery_text;');
END;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Ang_Position',N'tagp_sample') IS NOT NULL
BEGIN
  EXEC(N'IF EXISTS(SELECT 1 FROM BMSApp.tbl_Temp_Ang_Position WHERE tagp_sample IS NOT NULL) THROW 50001,''Legacy offer fields contain data. Export/migrate these values before cleanup.'',1; ALTER TABLE BMSApp.tbl_Temp_Ang_Position DROP COLUMN tagp_sample;');
END;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Ang_Position',N'tagp_rejected') IS NOT NULL
BEGIN
  EXEC(N'IF EXISTS(SELECT 1 FROM BMSApp.tbl_Temp_Ang_Position WHERE tagp_rejected IS NOT NULL) THROW 50001,''Legacy offer fields contain data. Export/migrate these values before cleanup.'',1; ALTER TABLE BMSApp.tbl_Temp_Ang_Position DROP COLUMN tagp_rejected;');
END;
COMMIT;
