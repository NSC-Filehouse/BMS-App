/* DB04 / BMS: original EWS mail body and the source PDF for each option. */
USE [BMS];
GO
SET XACT_ABORT ON;
GO
IF OBJECT_ID(N'BMSApp.tblOptionen', N'U') IS NULL
  THROW 50001, 'BMSApp.tblOptionen fehlt. Zuerst add_options.sql ausfuehren.', 1;
GO

IF COL_LENGTH(N'BMSApp.tblOptionen', N'op_MandantID') IS NOT NULL
BEGIN
  PRINT N'Optionstabellen v2: Quellspalten sind bereits enthalten.';
END
ELSE
BEGIN
IF COL_LENGTH(N'BMSApp.tblOptionen', N'op_source_mail_body') IS NULL
  ALTER TABLE [BMSApp].[tblOptionen] ADD [op_source_mail_body] NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'BMSApp.tblOptionen', N'op_source_mail_body_type') IS NULL
  ALTER TABLE [BMSApp].[tblOptionen] ADD [op_source_mail_body_type] NVARCHAR(20) NULL;
IF COL_LENGTH(N'BMSApp.tblOptionen', N'op_source_pdf') IS NULL
  ALTER TABLE [BMSApp].[tblOptionen] ADD [op_source_pdf] VARBINARY(MAX) NULL;
END;
GO
