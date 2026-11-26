SET XACT_ABORT ON;

IF COL_LENGTH(N'BMSApp.OptionArticleNameRule', N'SupplierKey') IS NULL
  ALTER TABLE BMSApp.OptionArticleNameRule ADD SupplierKey NVARCHAR(255) COLLATE Latin1_General_CI_AS NULL;
