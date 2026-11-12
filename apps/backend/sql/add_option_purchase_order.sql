/* Central BMS DB. Repeatable; existing normal purchases keep OptionID NULL. */
USE [BMS];
GO
SET XACT_ABORT ON;
GO
IF COL_LENGTH(N'BMSApp.tbl_Temp_Best_Position',N'OptionID') IS NULL
  ALTER TABLE BMSApp.tbl_Temp_Best_Position ADD OptionID INT NULL;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Best_Position',N'OptionPositionID') IS NULL
  ALTER TABLE BMSApp.tbl_Temp_Best_Position ADD OptionPositionID INT NULL;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Best_Position',N'tbp_option_mfi_acknowledged') IS NULL
  ALTER TABLE BMSApp.tbl_Temp_Best_Position ADD tbp_option_mfi_acknowledged BIT NOT NULL
    CONSTRAINT DF_Temp_Best_Position_option_mfi DEFAULT(0);
GO
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tblOptionenPositionen') AND name=N'UX_OptionenPositionen_Identity')
  CREATE UNIQUE INDEX UX_OptionenPositionen_Identity ON BMSApp.tblOptionenPositionen(opp_id,opp_op_id);
IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_TempBestPosition_Option')
  ALTER TABLE BMSApp.tbl_Temp_Best_Position ADD CONSTRAINT FK_TempBestPosition_Option
    FOREIGN KEY(OptionID) REFERENCES BMSApp.tblOptionen(op_id);
IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_TempBestPosition_OptionPosition')
  ALTER TABLE BMSApp.tbl_Temp_Best_Position ADD CONSTRAINT FK_TempBestPosition_OptionPosition
    FOREIGN KEY(OptionPositionID,OptionID) REFERENCES BMSApp.tblOptionenPositionen(opp_id,opp_op_id);
IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE name=N'CK_TempBestPosition_OptionPair')
  ALTER TABLE BMSApp.tbl_Temp_Best_Position ADD CONSTRAINT CK_TempBestPosition_OptionPair CHECK(
    (OptionID IS NULL AND OptionPositionID IS NULL) OR (OptionID IS NOT NULL AND OptionPositionID IS NOT NULL));
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Best_Position') AND name=N'IX_TempBestPosition_OptionPosition')
  CREATE INDEX IX_TempBestPosition_OptionPosition ON BMSApp.tbl_Temp_Best_Position(OptionPositionID,tbp_tb_id) INCLUDE(tbp_amount,tbp_unit);
GO
