CREATE TABLE [dbo].[tblBMSApp_Timeline] (
  [tl_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  [tl_CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_tblBMSApp_Timeline_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [tl_Mandant] NVARCHAR(100) NOT NULL,
  [tl_MandantKurz] NVARCHAR(50) NULL,
  [tl_CompanyId] INT NULL,
  [tl_UserEmail] NVARCHAR(255) NULL,
  [tl_UserShortCode] NVARCHAR(50) NOT NULL,
  [tl_Type] NVARCHAR(30) NOT NULL,
  [tl_Product] NVARCHAR(255) NOT NULL,
  [tl_ProductId] NVARCHAR(100) NULL,
  [tl_BeNumber] NVARCHAR(100) NULL,
  [tl_AmountKg] DECIMAL(18,3) NULL,
  [tl_Unit] NVARCHAR(20) NULL,
  [tl_ReferenceId] NVARCHAR(100) NULL,
  [tl_PayloadJson] NVARCHAR(MAX) NULL
);

CREATE INDEX [IX_tblBMSApp_Timeline_CreatedAt]
  ON [dbo].[tblBMSApp_Timeline] ([tl_CreatedAt] DESC);

CREATE INDEX [IX_tblBMSApp_Timeline_CompanyId_CreatedAt]
  ON [dbo].[tblBMSApp_Timeline] ([tl_CompanyId], [tl_CreatedAt] DESC);

CREATE INDEX [IX_tblBMSApp_Timeline_Mandant_CreatedAt]
  ON [dbo].[tblBMSApp_Timeline] ([tl_Mandant], [tl_CreatedAt] DESC);
