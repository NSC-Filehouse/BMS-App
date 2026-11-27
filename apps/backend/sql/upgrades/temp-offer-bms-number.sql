SET XACT_ABORT ON;

BEGIN TRANSACTION;

IF OBJECT_ID(N'BMSApp.tbl_Temp_Angebot', N'U') IS NULL
    THROW 51001, N'BMSApp.tbl_Temp_Angebot is missing in the selected database.', 1;

IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot', N'BMS_Angebotsnummer') IS NULL
    ALTER TABLE [BMSApp].[tbl_Temp_Angebot] ADD [BMS_Angebotsnummer] [nvarchar](22) COLLATE Latin1_General_CI_AS NULL;

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'BMSApp.tbl_Temp_Angebot', N'U')
      AND name = N'BMS_Angebotsnummer' AND user_type_id = TYPE_ID(N'nvarchar')
      AND max_length = 44 AND is_nullable = 1 AND is_computed = 0
      AND collation_name = N'Latin1_General_CI_AS'
)
    THROW 51001, N'BMS_Angebotsnummer must be nullable NVARCHAR(22) with collation Latin1_General_CI_AS.', 1;

COMMIT TRANSACTION;
