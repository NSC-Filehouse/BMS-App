USE [BMS];
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE [name] = N'BMSApp')
BEGIN
  EXEC(N'CREATE SCHEMA [BMSApp] AUTHORIZATION [dbo]');
END;

IF OBJECT_ID(N'dbo.tblBMSApp_Timeline', N'U') IS NOT NULL
   AND OBJECT_ID(N'BMSApp.Timeline', N'U') IS NOT NULL
BEGIN
  THROW 50000, 'Both dbo.tblBMSApp_Timeline and BMSApp.Timeline exist. Please resolve before migration.', 1;
END;

IF OBJECT_ID(N'BMSApp.tblBMSApp_Timeline', N'U') IS NOT NULL
   AND OBJECT_ID(N'BMSApp.Timeline', N'U') IS NOT NULL
BEGIN
  THROW 50000, 'Both BMSApp.tblBMSApp_Timeline and BMSApp.Timeline exist. Please resolve before migration.', 1;
END;

IF OBJECT_ID(N'dbo.tblBMSApp_Timeline', N'U') IS NOT NULL
BEGIN
  ALTER SCHEMA [BMSApp] TRANSFER [dbo].[tblBMSApp_Timeline];
END;

IF OBJECT_ID(N'BMSApp.tblBMSApp_Timeline', N'U') IS NOT NULL
BEGIN
  EXEC sys.sp_rename N'BMSApp.tblBMSApp_Timeline', N'Timeline', N'OBJECT';
END;

IF OBJECT_ID(N'dbo.tblBMSApp_PushSubscription', N'U') IS NOT NULL
   AND OBJECT_ID(N'BMSApp.PushSubscription', N'U') IS NOT NULL
BEGIN
  THROW 50000, 'Both dbo.tblBMSApp_PushSubscription and BMSApp.PushSubscription exist. Please resolve before migration.', 1;
END;

IF OBJECT_ID(N'BMSApp.tblBMSApp_PushSubscription', N'U') IS NOT NULL
   AND OBJECT_ID(N'BMSApp.PushSubscription', N'U') IS NOT NULL
BEGIN
  THROW 50000, 'Both BMSApp.tblBMSApp_PushSubscription and BMSApp.PushSubscription exist. Please resolve before migration.', 1;
END;

IF OBJECT_ID(N'dbo.tblBMSApp_PushSubscription', N'U') IS NOT NULL
BEGIN
  ALTER SCHEMA [BMSApp] TRANSFER [dbo].[tblBMSApp_PushSubscription];
END;

IF OBJECT_ID(N'BMSApp.tblBMSApp_PushSubscription', N'U') IS NOT NULL
BEGIN
  EXEC sys.sp_rename N'BMSApp.tblBMSApp_PushSubscription', N'PushSubscription', N'OBJECT';
END;

IF OBJECT_ID(N'dbo.tblBMSApp_PushMandantSetting', N'U') IS NOT NULL
   AND OBJECT_ID(N'BMSApp.PushMandantSetting', N'U') IS NOT NULL
BEGIN
  THROW 50000, 'Both dbo.tblBMSApp_PushMandantSetting and BMSApp.PushMandantSetting exist. Please resolve before migration.', 1;
END;

IF OBJECT_ID(N'BMSApp.tblBMSApp_PushMandantSetting', N'U') IS NOT NULL
   AND OBJECT_ID(N'BMSApp.PushMandantSetting', N'U') IS NOT NULL
BEGIN
  THROW 50000, 'Both BMSApp.tblBMSApp_PushMandantSetting and BMSApp.PushMandantSetting exist. Please resolve before migration.', 1;
END;

IF OBJECT_ID(N'dbo.tblBMSApp_PushMandantSetting', N'U') IS NOT NULL
BEGIN
  ALTER SCHEMA [BMSApp] TRANSFER [dbo].[tblBMSApp_PushMandantSetting];
END;

IF OBJECT_ID(N'BMSApp.tblBMSApp_PushMandantSetting', N'U') IS NOT NULL
BEGIN
  EXEC sys.sp_rename N'BMSApp.tblBMSApp_PushMandantSetting', N'PushMandantSetting', N'OBJECT';
END;

IF OBJECT_ID(N'dbo.tbl_Temp_Auftrag', N'U') IS NOT NULL
   AND OBJECT_ID(N'BMSApp.tbl_Temp_Auftrag', N'U') IS NOT NULL
BEGIN
  THROW 50000, 'Both dbo.tbl_Temp_Auftrag and BMSApp.tbl_Temp_Auftrag exist. Please resolve before migration.', 1;
END;

IF OBJECT_ID(N'dbo.tbl_Temp_Auftrag', N'U') IS NOT NULL
BEGIN
  ALTER SCHEMA [BMSApp] TRANSFER [dbo].[tbl_Temp_Auftrag];
END;

IF OBJECT_ID(N'dbo.tbl_Temp_Auf_Position', N'U') IS NOT NULL
   AND OBJECT_ID(N'BMSApp.tbl_Temp_Auf_Position', N'U') IS NOT NULL
BEGIN
  THROW 50000, 'Both dbo.tbl_Temp_Auf_Position and BMSApp.tbl_Temp_Auf_Position exist. Please resolve before migration.', 1;
END;

IF OBJECT_ID(N'dbo.tbl_Temp_Auf_Position', N'U') IS NOT NULL
BEGIN
  ALTER SCHEMA [BMSApp] TRANSFER [dbo].[tbl_Temp_Auf_Position];
END;

IF OBJECT_ID(N'BMSApp.Timeline', N'U') IS NULL
   OR OBJECT_ID(N'BMSApp.PushSubscription', N'U') IS NULL
   OR OBJECT_ID(N'BMSApp.PushMandantSetting', N'U') IS NULL
   OR OBJECT_ID(N'BMSApp.tbl_Temp_Auftrag', N'U') IS NULL
   OR OBJECT_ID(N'BMSApp.tbl_Temp_Auf_Position', N'U') IS NULL
BEGIN
  THROW 50000, 'BMSApp migration validation failed: one or more target tables are missing.', 1;
END;

COMMIT TRANSACTION;

SELECT
  TABLE_SCHEMA AS [schema],
  TABLE_NAME AS [name]
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = N'BMSApp'
  AND TABLE_NAME IN (
    N'Timeline',
    N'PushSubscription',
    N'PushMandantSetting',
    N'tbl_Temp_Auftrag',
    N'tbl_Temp_Auf_Position'
  )
ORDER BY TABLE_NAME;
