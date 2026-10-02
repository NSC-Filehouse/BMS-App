/* DB04 / BMS: exact-content duplicate key for OptionReader imports. */
USE [BMS];
GO
SET XACT_ABORT ON;
GO
IF OBJECT_ID(N'BMSApp.tblOptionen', N'U') IS NULL
  THROW 50001, 'BMSApp.tblOptionen fehlt. Zuerst das Optionenschema v2 anlegen.', 1;
IF COL_LENGTH(N'BMSApp.tblOptionen', N'op_MandantID') IS NULL
  THROW 50002, 'BMSApp.tblOptionen ist nicht auf Schema v2.', 1;
GO

IF COL_LENGTH(N'BMSApp.tblOptionen', N'op_DuplikatSchluessel') IS NULL
  ALTER TABLE [BMSApp].[tblOptionen] ADD [op_DuplikatSchluessel] CHAR(64) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
  WHERE [object_id]=OBJECT_ID(N'BMSApp.tblOptionen')
    AND [name]=N'UX_tblOptionen_Mandant_Duplikat')
  CREATE UNIQUE INDEX [UX_tblOptionen_Mandant_Duplikat] ON [BMSApp].[tblOptionen]
    ([op_MandantID], [op_DuplikatSchluessel])
    WHERE [op_DuplikatSchluessel] IS NOT NULL AND [op_IstDemo]=(0);
GO
