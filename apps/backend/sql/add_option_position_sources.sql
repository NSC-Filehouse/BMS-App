SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH(N'BMSApp.tblOptionen',N'op_QuelleMailbilderJson') IS NULL
 ALTER TABLE BMSApp.tblOptionen ADD op_QuelleMailbilderJson NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'BMSApp.tblOptionenPositionen',N'opp_GeloeschtAm') IS NULL
 ALTER TABLE BMSApp.tblOptionenPositionen ADD opp_GeloeschtAm DATETIME2(7) NULL;
IF COL_LENGTH(N'BMSApp.tblOptionenPositionen',N'opp_GeloeschtVon') IS NULL
 ALTER TABLE BMSApp.tblOptionenPositionen ADD opp_GeloeschtVon NVARCHAR(100) NULL;
COMMIT;
