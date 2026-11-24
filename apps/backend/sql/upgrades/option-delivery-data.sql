SET XACT_ABORT ON;

BEGIN TRANSACTION;

IF COL_LENGTH(N'BMSApp.tblOptionen', N'op_QuellangebotHash') IS NULL
    ALTER TABLE BMSApp.tblOptionen ADD op_QuellangebotHash CHAR(64) COLLATE Latin1_General_CI_AS NULL;

IF COL_LENGTH(N'BMSApp.tblOptionenPositionen', N'opp_LieferdatenJson') IS NULL
    ALTER TABLE BMSApp.tblOptionenPositionen ADD opp_LieferdatenJson NVARCHAR(MAX) COLLATE Latin1_General_CI_AS NULL;

COMMIT TRANSACTION;
