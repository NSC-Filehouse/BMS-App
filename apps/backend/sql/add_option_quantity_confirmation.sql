USE [BMS];
GO
SET XACT_ABORT ON;
GO
IF COL_LENGTH(N'BMSApp.tblOptionenPositionen',N'opp_GesamtmengeBestaetigtKg') IS NULL
  ALTER TABLE BMSApp.tblOptionenPositionen ADD opp_GesamtmengeBestaetigtKg DECIMAL(18,3) NULL;
IF COL_LENGTH(N'BMSApp.tblOptionenPositionen',N'opp_MengeBestaetigtQuellHash') IS NULL
  ALTER TABLE BMSApp.tblOptionenPositionen ADD opp_MengeBestaetigtQuellHash VARCHAR(64) NULL;
IF COL_LENGTH(N'BMSApp.tblOptionenPositionen',N'opp_MengeBestaetigtVon') IS NULL
  ALTER TABLE BMSApp.tblOptionenPositionen ADD opp_MengeBestaetigtVon NVARCHAR(100) NULL;
IF COL_LENGTH(N'BMSApp.tblOptionenPositionen',N'opp_MengeBestaetigtAm') IS NULL
  ALTER TABLE BMSApp.tblOptionenPositionen ADD opp_MengeBestaetigtAm DATETIME2(7) NULL;
IF COL_LENGTH(N'BMSApp.tblOptionenPositionen',N'opp_MengeBestaetigtVerpackungsartID') IS NULL
  ALTER TABLE BMSApp.tblOptionenPositionen ADD opp_MengeBestaetigtVerpackungsartID INT NULL;
IF COL_LENGTH(N'BMSApp.tblOptionenPositionen',N'opp_MengeBestaetigtTrucks') IS NULL
  ALTER TABLE BMSApp.tblOptionenPositionen ADD opp_MengeBestaetigtTrucks DECIMAL(18,3) NULL;
GO
IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE name=N'CK_OptionPosition_BestaetigteMenge')
  ALTER TABLE BMSApp.tblOptionenPositionen ADD CONSTRAINT CK_OptionPosition_BestaetigteMenge
    CHECK(opp_GesamtmengeBestaetigtKg IS NULL OR opp_GesamtmengeBestaetigtKg>0);
IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE name=N'CK_OptionPosition_BestaetigteTrucks')
  ALTER TABLE BMSApp.tblOptionenPositionen ADD CONSTRAINT CK_OptionPosition_BestaetigteTrucks
    CHECK(opp_MengeBestaetigtTrucks IS NULL OR (opp_MengeBestaetigtTrucks>0 AND opp_MengeBestaetigtVerpackungsartID IS NOT NULL));
GO
