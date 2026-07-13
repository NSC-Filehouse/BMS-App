IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE [name] = N'BMSApp')
BEGIN
  EXEC(N'CREATE SCHEMA [BMSApp] AUTHORIZATION [dbo]');
END;

CREATE TABLE [BMSApp].[PushSubscription] (
  [ps_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  [ps_UserEmail] NVARCHAR(255) NOT NULL,
  [ps_Endpoint] NVARCHAR(500) NOT NULL,
  [ps_P256DH] NVARCHAR(255) NOT NULL,
  [ps_Auth] NVARCHAR(255) NOT NULL,
  [ps_UserAgent] NVARCHAR(500) NULL,
  [ps_Language] NVARCHAR(10) NULL,
  [ps_IsActive] BIT NOT NULL CONSTRAINT [DF_BMSApp_PushSubscription_IsActive] DEFAULT 1,
  [ps_CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_BMSApp_PushSubscription_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [ps_UpdatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_BMSApp_PushSubscription_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [ps_LastSeenAt] DATETIME2 NOT NULL CONSTRAINT [DF_BMSApp_PushSubscription_LastSeenAt] DEFAULT SYSUTCDATETIME()
);

CREATE UNIQUE INDEX [UX_BMSApp_PushSubscription_Endpoint]
  ON [BMSApp].[PushSubscription] ([ps_Endpoint]);

CREATE INDEX [IX_BMSApp_PushSubscription_UserEmail_IsActive]
  ON [BMSApp].[PushSubscription] ([ps_UserEmail], [ps_IsActive]);

CREATE TABLE [BMSApp].[PushMandantSetting] (
  [pms_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  [pms_UserEmail] NVARCHAR(255) NOT NULL,
  [pms_CompanyId] INT NOT NULL,
  [pms_Mandant] NVARCHAR(100) NOT NULL,
  [pms_Enabled] BIT NOT NULL CONSTRAINT [DF_BMSApp_PushMandantSetting_Enabled] DEFAULT 0,
  [pms_CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_BMSApp_PushMandantSetting_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [pms_UpdatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_BMSApp_PushMandantSetting_UpdatedAt] DEFAULT SYSUTCDATETIME()
);

CREATE UNIQUE INDEX [UX_BMSApp_PushMandantSetting_UserEmail_CompanyId]
  ON [BMSApp].[PushMandantSetting] ([pms_UserEmail], [pms_CompanyId]);

CREATE INDEX [IX_BMSApp_PushMandantSetting_CompanyId_Enabled]
  ON [BMSApp].[PushMandantSetting] ([pms_CompanyId], [pms_Enabled]);
