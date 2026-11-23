-- Run after installing the BMSApp baseline in the central BMS database.
SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
 IF OBJECT_ID(N'BMSApp.OptionOfferMailOutbox', N'U') IS NULL
    OR OBJECT_ID(N'BMSApp.OptionOfferDocument', N'U') IS NULL
  THROW 51000, N'Install the BMSApp offer schema before upgrading it.', 1;
 -- Extend the offer queue to VL stock positions.
 IF COL_LENGTH(N'BMSApp.OptionOfferMailOutbox', N'StockPositionKey') IS NULL
 BEGIN
  EXEC(N'ALTER TABLE BMSApp.OptionOfferMailOutbox DROP CONSTRAINT UQ_OptionOfferMailOutbox_Customer;');
  IF OBJECT_ID(N'BMSApp.FK_OptionOfferMailOutbox_OptionPositionId', N'F') IS NOT NULL
   EXEC(N'ALTER TABLE BMSApp.OptionOfferMailOutbox DROP CONSTRAINT FK_OptionOfferMailOutbox_OptionPositionId;');
  EXEC(N'ALTER TABLE BMSApp.OptionOfferMailOutbox ALTER COLUMN OptionPositionId INT NULL;');
  EXEC(N'ALTER TABLE BMSApp.OptionOfferMailOutbox ADD StockPositionKey NVARCHAR(64) NULL;');
  EXEC(N'ALTER TABLE BMSApp.OptionOfferMailOutbox WITH CHECK ADD CONSTRAINT CK_OptionOfferMailOutbox_Source CHECK ((OptionPositionId IS NOT NULL AND StockPositionKey IS NULL) OR (OptionPositionId IS NULL AND StockPositionKey IS NOT NULL));');
  EXEC(N'ALTER TABLE BMSApp.OptionOfferMailOutbox ADD CONSTRAINT UQ_OptionOfferMailOutbox_Customer UNIQUE NONCLUSTERED (CompanyId, OptionPositionId, StockPositionKey, CustomerNumber);');
  EXEC(N'ALTER TABLE BMSApp.OptionOfferMailOutbox WITH CHECK ADD CONSTRAINT FK_OptionOfferMailOutbox_OptionPositionId FOREIGN KEY (OptionPositionId) REFERENCES BMSApp.tblOptionenPositionen (opp_id);');
 END;
 COMMIT TRANSACTION;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
