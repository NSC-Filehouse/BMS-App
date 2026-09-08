USE [BMS];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'BMSApp.tbl_Temp_Auftrag', N'U') IS NULL
BEGIN
  THROW 50031, 'Die Tabelle BMSApp.tbl_Temp_Auftrag wurde nicht gefunden.', 1;
END;

BEGIN TRANSACTION;

IF COL_LENGTH(N'BMSApp.tbl_Temp_Auftrag', N'ta_delivery_address_id') IS NULL
BEGIN
  ALTER TABLE [BMSApp].[tbl_Temp_Auftrag]
  ADD [ta_delivery_address_id] INT NULL;
END
ELSE
BEGIN
  ALTER TABLE [BMSApp].[tbl_Temp_Auftrag]
  ALTER COLUMN [ta_delivery_address_id] INT NULL;
END;

COMMIT TRANSACTION;
GO

SELECT
  COL_LENGTH(N'BMSApp.tbl_Temp_Auftrag', N'ta_delivery_address_id') AS [deliveryAddressIdColumn];
GO
