-- Run in the central BMSApp database before deploying the offer status change.
SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
 IF OBJECT_ID(N'BMSApp.tbl_Temp_Angebot', N'U') IS NULL
  THROW 51000, N'Install the BMSApp offer schema before upgrading it.', 1;
 IF OBJECT_ID(N'BMSApp.CK_Temp_Angebot_status', N'C') IS NOT NULL
  ALTER TABLE BMSApp.tbl_Temp_Angebot DROP CONSTRAINT CK_Temp_Angebot_status;
 ALTER TABLE BMSApp.tbl_Temp_Angebot WITH CHECK
  ADD CONSTRAINT CK_Temp_Angebot_status CHECK (tag_status IN (0,1,2,3,4,5));
 COMMIT TRANSACTION;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
