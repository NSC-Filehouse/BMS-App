SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'BMSApp.OptionArticleNameRule', N'U') IS NULL
  CREATE TABLE [BMSApp].[OptionArticleNameRule] (
    IsTest BIT NOT NULL,
    OptionNameKey CHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    OptionName NVARCHAR(500) COLLATE Latin1_General_CI_AS NOT NULL,
    ArticleName NVARCHAR(500) COLLATE Latin1_General_CI_AS NOT NULL,
    CreatedBy NVARCHAR(100) COLLATE Latin1_General_CI_AS NOT NULL,
    CreatedAt DATETIME2(7) NOT NULL CONSTRAINT DF_OptionArticleNameRule_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_OptionArticleNameRule PRIMARY KEY (IsTest, OptionNameKey)
  );

IF OBJECT_ID(N'BMSApp.OptionArticleNameRuleMandant', N'U') IS NULL
  CREATE TABLE [BMSApp].[OptionArticleNameRuleMandant] (
    IsTest BIT NOT NULL,
    OptionNameKey CHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    MandantId INT NOT NULL,
    ArticleIndex NVARCHAR(50) COLLATE Latin1_General_CI_AS NOT NULL,
    SourcePositionId INT NOT NULL,
    ConfirmedBy NVARCHAR(100) COLLATE Latin1_General_CI_AS NOT NULL,
    ConfirmedAt DATETIME2(7) NOT NULL CONSTRAINT DF_OptionArticleNameRuleMandant_ConfirmedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_OptionArticleNameRuleMandant PRIMARY KEY (IsTest, OptionNameKey, MandantId),
    CONSTRAINT FK_OptionArticleNameRuleMandant_Rule FOREIGN KEY (IsTest, OptionNameKey)
      REFERENCES BMSApp.OptionArticleNameRule (IsTest, OptionNameKey)
  );

COMMIT TRANSACTION;
