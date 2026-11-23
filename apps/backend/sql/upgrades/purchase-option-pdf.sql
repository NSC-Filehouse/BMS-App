-- Run in the central BMS database to enable automatic Option.pdf attachments.
IF OBJECT_ID(N'BMSApp.tbl_Temp_Bestellung_Anhang', N'U') IS NULL
    THROW 51000, N'Select the central BMS database with the BMSApp purchase attachment table.', 1;

IF COL_LENGTH(N'BMSApp.tbl_Temp_Bestellung_Anhang', N'tba_OptionSnapshot') IS NULL
    ALTER TABLE [BMSApp].[tbl_Temp_Bestellung_Anhang]
        ADD [tba_OptionSnapshot] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL;
