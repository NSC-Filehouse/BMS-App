/* Run manually against the central BMS database before deploying the new API.
   No historical references are deleted. New purchases leave legacy source BE
   fields NULL. The chosen packaging stays on the header, as for sales orders.
   Original packaging on each line is an informational snapshot only.
   External BMS importers must consume tb_packaging_type (header) and retain
   tbp_original_packaging_type / tbp_packaging_type_changed on each position. */
USE [BMS];
GO
SET XACT_ABORT ON;
GO
IF COL_LENGTH(N'BMSApp.tbl_Temp_Bestellung', N'tb_packaging_type_id') IS NULL
  ALTER TABLE [BMSApp].[tbl_Temp_Bestellung] ADD [tb_packaging_type_id] INT NULL;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Best_Position', N'tbp_original_packaging_type') IS NULL
  ALTER TABLE [BMSApp].[tbl_Temp_Best_Position] ADD [tbp_original_packaging_type] NVARCHAR(200) NULL;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Best_Position', N'tbp_original_packaging_type_id') IS NULL
  ALTER TABLE [BMSApp].[tbl_Temp_Best_Position] ADD [tbp_original_packaging_type_id] INT NULL;
IF COL_LENGTH(N'BMSApp.tbl_Temp_Best_Position', N'tbp_packaging_type_changed') IS NULL
  ALTER TABLE [BMSApp].[tbl_Temp_Best_Position] ADD [tbp_packaging_type_changed] BIT NOT NULL
    CONSTRAINT [DF_Temp_Best_Position_packaging_changed] DEFAULT (0);
GO
