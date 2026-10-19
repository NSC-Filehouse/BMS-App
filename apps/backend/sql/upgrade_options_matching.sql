-- Optional matching metadata; execute in the central BMS database before saving new learned rules.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH(N'BMSApp.tblOptionenArtikelMapping',N'oam_MerkmaleJson') IS NULL
  ALTER TABLE BMSApp.tblOptionenArtikelMapping ADD oam_MerkmaleJson NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'BMSApp.tblOptionenArtikelMapping',N'oam_AlgorithmusVersion') IS NULL
  ALTER TABLE BMSApp.tblOptionenArtikelMapping ADD oam_AlgorithmusVersion NVARCHAR(30) NULL;
COMMIT TRANSACTION;
