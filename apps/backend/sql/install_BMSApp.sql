/* BMS-App: complete schema installation, baseline 2026-11-17.
   Execute this ONE file in the selected central BMS database (SSMS or sqlcmd -d).
   Source: current BMSApp schema inspected with Windows integrated authentication.
   Includes OptionReader tables, contact-creation and option-offer tables.
   Does not create ERP databases, accounts, test offers, supplier mappings or business data.
   Existing tables/data are retained. Incompatible columns abort the whole transaction.
   This is an installation baseline, not an upgrade of arbitrary historical versions.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;

IF DB_NAME() IN (N'master',N'model',N'msdb',N'tempdb')
    THROW 51000,N'Select the central BMS application database before installing.',1;
IF (SELECT compatibility_level FROM sys.databases WHERE database_id=DB_ID())<130
    THROW 51000,N'BMS-App requires SQL Server 2016+ and database compatibility level 130+.',1;

BEGIN TRY
 BEGIN TRANSACTION;
 IF SCHEMA_ID(N'BMSApp') IS NULL EXEC(N'CREATE SCHEMA [BMSApp] AUTHORIZATION [dbo]');

 -- Tables and their primary/unique keys. Foreign keys follow after all tables.

 IF OBJECT_ID(N'BMSApp.CreditLimitMailOutbox',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[CreditLimitMailOutbox] (
    [clm_ID] [bigint] IDENTITY(1,1) NOT NULL,
    [clm_CompanyID] [int] NOT NULL,
    [clm_CustomerID] [nvarchar](100) COLLATE Latin1_General_CI_AS NOT NULL,
    [clm_OrderID] [int] NULL,
    [clm_Type] [nvarchar](40) COLLATE Latin1_General_CI_AS NOT NULL,
    [clm_ToRecipients] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NOT NULL,
    [clm_CcRecipients] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [clm_BccRecipients] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [clm_Subject] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [clm_Body] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NOT NULL,
    [clm_ClientMessageID] [nvarchar](200) COLLATE Latin1_General_CI_AS NOT NULL,
    [clm_Status] [nvarchar](20) COLLATE Latin1_General_CI_AS NOT NULL CONSTRAINT [DF_CreditLimitMailOutbox_Status] DEFAULT (N''pending''),
    [clm_AttemptCount] [int] NOT NULL CONSTRAINT [DF_CreditLimitMailOutbox_AttemptCount] DEFAULT ((0)),
    [clm_NextAttemptAt] [datetime2](7) NULL,
    [clm_LockedAt] [datetime2](7) NULL,
    [clm_LastError] [nvarchar](2000) COLLATE Latin1_General_CI_AS NULL,
    [clm_SentAt] [datetime2](7) NULL,
    [clm_CreateDate] [datetime2](7) NOT NULL CONSTRAINT [DF_CreditLimitMailOutbox_CreateDate] DEFAULT (sysutcdatetime()),
    [clm_LastModifiedDate] [datetime2](7) NOT NULL CONSTRAINT [DF_CreditLimitMailOutbox_LastModifiedDate] DEFAULT (sysutcdatetime()),
    [clm_FromAddress] [nvarchar](320) COLLATE Latin1_General_CI_AS NULL,
    [clm_FromDisplayName] [nvarchar](255) COLLATE Latin1_General_CI_AS NULL,
    CONSTRAINT [PK_CreditLimitMailOutbox] PRIMARY KEY CLUSTERED ([clm_ID] ASC),
    CONSTRAINT [UQ_CreditLimitMailOutbox_ClientMessageID] UNIQUE NONCLUSTERED ([clm_ClientMessageID] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.CreditLimitRequestState',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[CreditLimitRequestState] (
    [clrs_ID] [bigint] IDENTITY(1,1) NOT NULL,
    [clrs_CompanyID] [int] NOT NULL,
    [clrs_CustomerID] [nvarchar](100) COLLATE Latin1_General_CI_AS NOT NULL,
    [clrs_LastRequestedAt] [datetime2](7) NULL,
    [clrs_LastRequestedLimit] [decimal](18,2) NULL,
    [clrs_LastExposureAmount] [decimal](18,2) NULL,
    [clrs_LastCreditMailStatus] [nvarchar](20) COLLATE Latin1_General_CI_AS NULL,
    [clrs_LastCreditMailOutboxID] [bigint] NULL,
    [clrs_LastCreditClientMessageID] [nvarchar](200) COLLATE Latin1_General_CI_AS NULL,
    [clrs_LastBankReminderAt] [datetime2](7) NULL,
    [clrs_LastBankReminderStatus] [nvarchar](20) COLLATE Latin1_General_CI_AS NULL,
    [clrs_LastBankReminderOutboxID] [bigint] NULL,
    [clrs_CreateDate] [datetime2](7) NOT NULL CONSTRAINT [DF_CreditLimitRequestState_CreateDate] DEFAULT (sysutcdatetime()),
    [clrs_LastModifiedDate] [datetime2](7) NOT NULL CONSTRAINT [DF_CreditLimitRequestState_LastModifiedDate] DEFAULT (sysutcdatetime()),
    CONSTRAINT [PK_CreditLimitRequestState] PRIMARY KEY CLUSTERED ([clrs_ID] ASC),
    CONSTRAINT [UQ_CreditLimitRequestState_CompanyCustomer] UNIQUE NONCLUSTERED ([clrs_CompanyID] ASC, [clrs_CustomerID] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.CustomerCreation',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[CustomerCreation] (
    [OperationId] [uniqueidentifier] NOT NULL,
    [UserId] [nvarchar](100) COLLATE Latin1_General_CI_AS NOT NULL,
    [UserShortCode] [nvarchar](10) COLLATE Latin1_General_CI_AS NOT NULL,
    [TargetCompanyId] [int] NOT NULL,
    [TargetMandant] [nvarchar](10) COLLATE Latin1_General_CI_AS NOT NULL,
    [StammMandant] [nvarchar](10) COLLATE Latin1_General_CI_AS NOT NULL,
    [RequestHash] [char](64) COLLATE Latin1_General_CI_AS NOT NULL,
    [PrivatePerson] [bit] NOT NULL,
    [CustomerNumber] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [CustomerName] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [CountryIso] [nvarchar](2) COLLATE Latin1_General_CI_AS NOT NULL,
    [ErpOperationId] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [Status] [nvarchar](20) COLLATE Latin1_General_CI_AS NOT NULL,
    [HttpStatus] [int] NULL,
    [ErrorCode] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [AttemptCount] [int] NOT NULL CONSTRAINT [DF_CustomerCreation_Attempts] DEFAULT ((0)),
    [LockedAt] [datetime2](7) NULL,
    [CreatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_CustomerCreation_Created] DEFAULT (sysutcdatetime()),
    [UpdatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_CustomerCreation_Updated] DEFAULT (sysutcdatetime()),
    CONSTRAINT [PK_CustomerCreation] PRIMARY KEY CLUSTERED ([OperationId] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.CustomerCreationMandant',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[CustomerCreationMandant] (
    [OperationId] [uniqueidentifier] NOT NULL,
    [Mandant] [nvarchar](10) COLLATE Latin1_General_CI_AS NOT NULL,
    [Status] [nvarchar](30) COLLATE Latin1_General_CI_AS NOT NULL,
    [CustomerNumber] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [ResultJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NOT NULL,
    CONSTRAINT [PK_CustomerCreationMandant] PRIMARY KEY CLUSTERED ([OperationId] ASC, [Mandant] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.CustomerCreationRollback',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[CustomerCreationRollback] (
    [RollbackId] [uniqueidentifier] NOT NULL,
    [OperationId] [uniqueidentifier] NOT NULL,
    [Mandant] [nvarchar](10) COLLATE Latin1_General_CI_AS NOT NULL,
    [StartedByUserId] [nvarchar](100) COLLATE Latin1_General_CI_AS NOT NULL,
    [StartedByShortCode] [nvarchar](10) COLLATE Latin1_General_CI_AS NOT NULL,
    [LastActorUserId] [nvarchar](100) COLLATE Latin1_General_CI_AS NOT NULL,
    [LastActorShortCode] [nvarchar](10) COLLATE Latin1_General_CI_AS NOT NULL,
    [Reason] [nvarchar](500) COLLATE Latin1_General_CI_AS NULL,
    [PreviewJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NOT NULL,
    [ResponseJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [Status] [nvarchar](20) COLLATE Latin1_General_CI_AS NOT NULL,
    [HttpStatus] [int] NULL,
    [ErrorCode] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [AttemptCount] [int] NOT NULL CONSTRAINT [DF_CustomerCreationRollback_Attempts] DEFAULT ((0)),
    [LockedAt] [datetime2](7) NULL,
    [CreatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_CustomerCreationRollback_Created] DEFAULT (sysutcdatetime()),
    [UpdatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_CustomerCreationRollback_Updated] DEFAULT (sysutcdatetime()),
    CONSTRAINT [PK_CustomerCreationRollback] PRIMARY KEY CLUSTERED ([RollbackId] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.CustomerCreationSnapshot',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[CustomerCreationSnapshot] (
    [Id] [bigint] IDENTITY(1,1) NOT NULL,
    [OperationId] [uniqueidentifier] NOT NULL,
    [Kind] [nvarchar](20) COLLATE Latin1_General_CI_AS NOT NULL,
    [DataJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NOT NULL,
    [CreatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_CustomerCreationSnapshot_Created] DEFAULT (sysutcdatetime()),
    CONSTRAINT [PK_CustomerCreationSnapshot] PRIMARY KEY CLUSTERED ([Id] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.DailyVlMailOutbox',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[DailyVlMailOutbox] (
    [vld_ID] [bigint] IDENTITY(1,1) NOT NULL,
    [vld_RunDate] [date] NOT NULL,
    [vld_CompanyID] [int] NOT NULL,
    [vld_CompanyName] [nvarchar](200) COLLATE Latin1_General_CI_AS NOT NULL,
    [vld_CompanyShortName] [nvarchar](100) COLLATE Latin1_General_CI_AS NOT NULL,
    [vld_RecipientsJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NOT NULL,
    [vld_Subject] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [vld_Body] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NOT NULL,
    [vld_Status] [nvarchar](20) COLLATE Latin1_General_CI_AS NOT NULL CONSTRAINT [DF_DailyVlMailOutbox_Status] DEFAULT (N''pending''),
    [vld_AttemptCount] [int] NOT NULL CONSTRAINT [DF_DailyVlMailOutbox_AttemptCount] DEFAULT ((0)),
    [vld_NextAttemptAt] [datetime2](7) NULL,
    [vld_LockedAt] [datetime2](7) NULL,
    [vld_LastError] [nvarchar](2000) COLLATE Latin1_General_CI_AS NULL,
    [vld_SentAt] [datetime2](7) NULL,
    [vld_CreateDate] [datetime2](7) NOT NULL CONSTRAINT [DF_DailyVlMailOutbox_CreateDate] DEFAULT (sysutcdatetime()),
    [vld_LastModifiedDate] [datetime2](7) NOT NULL CONSTRAINT [DF_DailyVlMailOutbox_LastModifiedDate] DEFAULT (sysutcdatetime()),
    CONSTRAINT [PK_DailyVlMailOutbox] PRIMARY KEY CLUSTERED ([vld_ID] ASC),
    CONSTRAINT [UQ_DailyVlMailOutbox_RunDate_Company] UNIQUE NONCLUSTERED ([vld_RunDate] ASC, [vld_CompanyID] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.DeliveryAddressOperation',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[DeliveryAddressOperation] (
    [OperationId] [uniqueidentifier] NOT NULL,
    [UserId] [nvarchar](100) COLLATE Latin1_General_CI_AS NOT NULL,
    [Mandant] [nvarchar](10) COLLATE Latin1_General_CI_AS NOT NULL,
    [CustomerNumber] [nvarchar](10) COLLATE Latin1_General_CI_AS NOT NULL,
    [RequestHash] [char](64) COLLATE Latin1_General_CI_AS NOT NULL,
    [InputJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NOT NULL,
    [RequestJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NOT NULL,
    [ResponseJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [Status] [nvarchar](20) COLLATE Latin1_General_CI_AS NOT NULL,
    [HttpStatus] [int] NULL,
    [AddressId] [int] NULL,
    [ErpOperationId] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [AttemptCount] [int] NOT NULL CONSTRAINT [DF__DeliveryA__Attem__31783731] DEFAULT ((0)),
    [LockedAt] [datetime2](7) NULL,
    [CreatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF__DeliveryA__Creat__326C5B6A] DEFAULT (sysutcdatetime()),
    [UpdatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF__DeliveryA__Updat__33607FA3] DEFAULT (sysutcdatetime()),
    CONSTRAINT [PK__Delivery__A4F5FC44960474E1] PRIMARY KEY CLUSTERED ([OperationId] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.OrderMailOutbox',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[OrderMailOutbox] (
    [om_ID] [bigint] IDENTITY(1,1) NOT NULL,
    [om_OrderID] [int] NOT NULL,
    [om_CompanyID] [int] NOT NULL,
    [om_Recipient] [nvarchar](320) COLLATE Latin1_General_CI_AS NOT NULL,
    [om_RecipientSource] [nvarchar](30) COLLATE Latin1_General_CI_AS NOT NULL,
    [om_Subject] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [om_Body] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NOT NULL,
    [om_Status] [nvarchar](20) COLLATE Latin1_General_CI_AS NOT NULL CONSTRAINT [DF_OrderMailOutbox_Status] DEFAULT (N''pending''),
    [om_AttemptCount] [int] NOT NULL CONSTRAINT [DF_OrderMailOutbox_AttemptCount] DEFAULT ((0)),
    [om_NextAttemptAt] [datetime2](7) NULL,
    [om_LockedAt] [datetime2](7) NULL,
    [om_LastError] [nvarchar](2000) COLLATE Latin1_General_CI_AS NULL,
    [om_SentAt] [datetime2](7) NULL,
    [om_CreateDate] [datetime2](7) NOT NULL CONSTRAINT [DF_OrderMailOutbox_CreateDate] DEFAULT (sysutcdatetime()),
    [om_LastModifiedDate] [datetime2](7) NOT NULL CONSTRAINT [DF_OrderMailOutbox_LastModifiedDate] DEFAULT (sysutcdatetime()),
    [om_FromAddress] [nvarchar](320) COLLATE Latin1_General_CI_AS NULL,
    [om_FromDisplayName] [nvarchar](255) COLLATE Latin1_General_CI_AS NULL,
    [om_OnBehalfOfAddress] [nvarchar](320) COLLATE Latin1_General_CI_AS NULL,
    [om_OnBehalfOfDisplayName] [nvarchar](255) COLLATE Latin1_General_CI_AS NULL,
    CONSTRAINT [PK_OrderMailOutbox] PRIMARY KEY CLUSTERED ([om_ID] ASC),
    CONSTRAINT [UQ_OrderMailOutbox_OrderID] UNIQUE NONCLUSTERED ([om_OrderID] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.OrderReminderState',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[OrderReminderState] (
    [ors_ID] [bigint] IDENTITY(1,1) NOT NULL,
    [ors_UserEmail] [nvarchar](320) COLLATE Latin1_General_CI_AS NOT NULL,
    [ors_UserShortCode] [nvarchar](100) COLLATE Latin1_General_CI_AS NOT NULL,
    [ors_LastCheckedAt] [datetime2](7) NULL,
    [ors_NextCheckAt] [datetime2](7) NULL,
    [ors_LastNotifiedAt] [datetime2](7) NULL,
    [ors_LastOpenOrderCount] [int] NOT NULL CONSTRAINT [DF_OrderReminderState_LastOpenOrderCount] DEFAULT ((0)),
    [ors_LastChannel] [nvarchar](20) COLLATE Latin1_General_CI_AS NULL,
    [ors_LockedAt] [datetime2](7) NULL,
    [ors_LastError] [nvarchar](2000) COLLATE Latin1_General_CI_AS NULL,
    [ors_CreatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_OrderReminderState_CreatedAt] DEFAULT (sysutcdatetime()),
    [ors_UpdatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_OrderReminderState_UpdatedAt] DEFAULT (sysutcdatetime()),
    CONSTRAINT [PK_OrderReminderState] PRIMARY KEY CLUSTERED ([ors_ID] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.PurchaseOrderCsMailOutbox',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[PurchaseOrderCsMailOutbox] (
    [pcom_ID] [int] IDENTITY(1,1) NOT NULL,
    [pcom_PurchaseOrderID] [int] NOT NULL,
    [pcom_CompanyID] [int] NOT NULL,
    [pcom_Recipient] [nvarchar](1000) COLLATE Latin1_General_CI_AS NOT NULL,
    [pcom_RecipientSource] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [pcom_Subject] [nvarchar](500) COLLATE Latin1_General_CI_AS NOT NULL,
    [pcom_Body] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NOT NULL,
    [pcom_Status] [nvarchar](20) COLLATE Latin1_General_CI_AS NOT NULL CONSTRAINT [DF_PurchaseOrderCsMailOutbox_Status] DEFAULT (N''pending''),
    [pcom_AttemptCount] [int] NOT NULL CONSTRAINT [DF_PurchaseOrderCsMailOutbox_AttemptCount] DEFAULT ((0)),
    [pcom_NextAttemptAt] [datetime2](7) NULL,
    [pcom_LockedAt] [datetime2](7) NULL,
    [pcom_LastError] [nvarchar](2000) COLLATE Latin1_General_CI_AS NULL,
    [pcom_SentAt] [datetime2](7) NULL,
    [pcom_CreateDate] [datetime2](7) NOT NULL CONSTRAINT [DF_PurchaseOrderCsMailOutbox_CreateDate] DEFAULT (sysutcdatetime()),
    [pcom_LastModifiedDate] [datetime2](7) NOT NULL CONSTRAINT [DF_PurchaseOrderCsMailOutbox_LastModifiedDate] DEFAULT (sysutcdatetime()),
    CONSTRAINT [PK_PurchaseOrderCsMailOutbox] PRIMARY KEY CLUSTERED ([pcom_ID] ASC),
    CONSTRAINT [UQ_PurchaseOrderCsMailOutbox_OrderID] UNIQUE NONCLUSTERED ([pcom_PurchaseOrderID] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.PurchaseOrderMailOutbox',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[PurchaseOrderMailOutbox] (
    [pom_ID] [int] IDENTITY(1,1) NOT NULL,
    [pom_PurchaseOrderID] [int] NOT NULL,
    [pom_CompanyID] [int] NOT NULL,
    [pom_Recipient] [nvarchar](1000) COLLATE Latin1_General_CI_AS NOT NULL,
    [pom_RecipientSource] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [pom_Subject] [nvarchar](500) COLLATE Latin1_General_CI_AS NOT NULL,
    [pom_Body] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NOT NULL,
    [pom_Status] [nvarchar](20) COLLATE Latin1_General_CI_AS NOT NULL CONSTRAINT [DF_PurchaseOrderMailOutbox_Status] DEFAULT (N''pending''),
    [pom_AttemptCount] [int] NOT NULL CONSTRAINT [DF_PurchaseOrderMailOutbox_AttemptCount] DEFAULT ((0)),
    [pom_NextAttemptAt] [datetime2](7) NULL,
    [pom_LockedAt] [datetime2](7) NULL,
    [pom_LastError] [nvarchar](2000) COLLATE Latin1_General_CI_AS NULL,
    [pom_SentAt] [datetime2](7) NULL,
    [pom_CreateDate] [datetime2](7) NOT NULL CONSTRAINT [DF_PurchaseOrderMailOutbox_CreateDate] DEFAULT (sysutcdatetime()),
    [pom_LastModifiedDate] [datetime2](7) NOT NULL CONSTRAINT [DF_PurchaseOrderMailOutbox_LastModifiedDate] DEFAULT (sysutcdatetime()),
    CONSTRAINT [PK_PurchaseOrderMailOutbox] PRIMARY KEY CLUSTERED ([pom_ID] ASC),
    CONSTRAINT [UQ_PurchaseOrderMailOutbox_OrderID] UNIQUE NONCLUSTERED ([pom_PurchaseOrderID] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.PushMandantSetting',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[PushMandantSetting] (
    [pms_ID] [int] IDENTITY(1,1) NOT NULL,
    [pms_UserEmail] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [pms_CompanyId] [int] NOT NULL,
    [pms_Mandant] [nvarchar](100) COLLATE Latin1_General_CI_AS NOT NULL,
    [pms_Enabled] [bit] NOT NULL CONSTRAINT [DF_tblBMSApp_PushMandantSetting_Enabled] DEFAULT ((0)),
    [pms_CreatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_tblBMSApp_PushMandantSetting_CreatedAt] DEFAULT (sysutcdatetime()),
    [pms_UpdatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_tblBMSApp_PushMandantSetting_UpdatedAt] DEFAULT (sysutcdatetime()),
    CONSTRAINT [PK__tblBMSAp__C8101DE7B708B0A9] PRIMARY KEY CLUSTERED ([pms_ID] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.PushSubscription',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[PushSubscription] (
    [ps_ID] [int] IDENTITY(1,1) NOT NULL,
    [ps_UserEmail] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [ps_Endpoint] [nvarchar](500) COLLATE Latin1_General_CI_AS NOT NULL,
    [ps_P256DH] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [ps_Auth] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [ps_UserAgent] [nvarchar](500) COLLATE Latin1_General_CI_AS NULL,
    [ps_Language] [nvarchar](10) COLLATE Latin1_General_CI_AS NULL,
    [ps_IsActive] [bit] NOT NULL CONSTRAINT [DF_tblBMSApp_PushSubscription_IsActive] DEFAULT ((1)),
    [ps_CreatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_tblBMSApp_PushSubscription_CreatedAt] DEFAULT (sysutcdatetime()),
    [ps_UpdatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_tblBMSApp_PushSubscription_UpdatedAt] DEFAULT (sysutcdatetime()),
    [ps_LastSeenAt] [datetime2](7) NOT NULL CONSTRAINT [DF_tblBMSApp_PushSubscription_LastSeenAt] DEFAULT (sysutcdatetime()),
    CONSTRAINT [PK__tblBMSAp__5CF808C76DBB9726] PRIMARY KEY CLUSTERED ([ps_ID] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.tbl_Temp_Ang_Position',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[tbl_Temp_Ang_Position] (
    [tagp_id] [int] IDENTITY(1,1) NOT NULL,
    [tagp_offer_id] [int] NOT NULL,
    [tagp_line_no] [int] NOT NULL,
    [tagp_line_key] [uniqueidentifier] NOT NULL,
    [tagp_article_index] [nvarchar](50) COLLATE Latin1_General_CI_AS NOT NULL,
    [tagp_article] [nvarchar](75) COLLATE Latin1_General_CI_AS NOT NULL,
    [tagp_master_article] [nvarchar](75) COLLATE Latin1_General_CI_AS NOT NULL,
    [tagp_quantity] [decimal](18,3) NOT NULL,
    [tagp_unit] [nvarchar](50) COLLATE Latin1_General_CI_AS NOT NULL,
    [tagp_price] [decimal](18,4) NOT NULL,
    [tagp_price_basis] [int] NOT NULL,
    [tagp_total] [decimal](18,2) NULL,
    [tagp_description] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [tagp_alternative_text] [nvarchar](50) COLLATE Latin1_General_CI_AS NULL,
    [tagp_delivery_date] [date] NULL,
    [tagp_delivery_text] [nvarchar](1000) COLLATE Latin1_General_CI_AS NULL,
    [tagp_sample] [bit] NULL,
    [tagp_rejected] [bit] NULL,
    [tagp_reserve] [bit] NOT NULL,
    [tagp_be_number] [nvarchar](17) COLLATE Latin1_General_CI_AS NULL,
    [tagp_warehouse_id] [nvarchar](6) COLLATE Latin1_General_CI_AS NULL,
    [tagp_source_supplier_id] [nvarchar](50) COLLATE Latin1_General_CI_AS NULL,
    [tagp_source_be_number] [nvarchar](17) COLLATE Latin1_General_CI_AS NULL,
    [tagp_reserve_quantity] [decimal](18,3) NULL,
    [tagp_reserve_until] [date] NULL,
    [tagp_reservation_version] [binary](8) NULL,
    [tagp_valuta_date] [date] NULL,
    [tagp_cost_price] [decimal](18,4) NOT NULL CONSTRAINT [DF_Temp_Ang_Position_cost] DEFAULT ((0)),
    [tagp_wpz_original] [bit] NOT NULL CONSTRAINT [DF_Temp_Ang_Position_wpz] DEFAULT ((1)),
    [tagp_wpz_comment] [nvarchar](1000) COLLATE Latin1_General_CI_AS NULL,
    [tagp_option_position_id] [int] NULL,
    [tagp_order_position_id] [int] NULL,
    CONSTRAINT [PK_Temp_Ang_Position] PRIMARY KEY CLUSTERED ([tagp_id] ASC),
    CONSTRAINT [UQ_Temp_Ang_Position_key] UNIQUE NONCLUSTERED ([tagp_offer_id] ASC, [tagp_line_key] ASC),
    CONSTRAINT [UQ_Temp_Ang_Position_line] UNIQUE NONCLUSTERED ([tagp_offer_id] ASC, [tagp_line_no] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.tbl_Temp_Angebot',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[tbl_Temp_Angebot] (
    [tag_id] [int] IDENTITY(1,1) NOT NULL,
    [tag_company_id] [int] NOT NULL,
    [tag_created_by] [nvarchar](50) COLLATE Latin1_General_CI_AS NOT NULL,
    [tag_created_at] [datetime2](3) NOT NULL CONSTRAINT [DF_Temp_Angebot_created] DEFAULT (sysutcdatetime()),
    [tag_modified_by] [nvarchar](50) COLLATE Latin1_General_CI_AS NOT NULL,
    [tag_modified_at] [datetime2](3) NOT NULL CONSTRAINT [DF_Temp_Angebot_modified] DEFAULT (sysutcdatetime()),
    [tag_client_request_id] [uniqueidentifier] NOT NULL,
    [tag_copy_source_id] [int] NULL,
    [tag_customer_id] [nvarchar](10) COLLATE Latin1_General_CI_AS NOT NULL,
    [tag_customer_name] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [tag_customer_address] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NOT NULL,
    [tag_contact_id] [int] NULL,
    [tag_contact] [nvarchar](50) COLLATE Latin1_General_CI_AS NULL,
    [tag_department] [nvarchar](50) COLLATE Latin1_General_CI_AS NULL,
    [tag_offer_date] [date] NULL,
    [tag_language] [nvarchar](2) COLLATE Latin1_General_CI_AS NULL,
    [tag_inquiry_date] [date] NULL,
    [tag_inquiry_via] [nvarchar](15) COLLATE Latin1_General_CI_AS NULL,
    [tag_customer_reference] [nvarchar](50) COLLATE Latin1_General_CI_AS NULL,
    [tag_title] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [tag_valid_until] [date] NULL,
    [tag_currency] [nvarchar](3) COLLATE Latin1_General_CI_AS NULL,
    [tag_payment_id] [int] NULL,
    [tag_payment_text] [nvarchar](1000) COLLATE Latin1_General_CI_AS NULL,
    [tag_delivery_terms] [nvarchar](250) COLLATE Latin1_General_CI_AS NULL,
    [tag_packaging] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [tag_intro] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [tag_closing_text] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [tag_internal_note] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [tag_discount_percent] [decimal](7,3) NULL,
    [tag_discount_amount] [decimal](18,2) NULL,
    [tag_vat_percent] [decimal](7,3) NULL,
    [tag_net_amount] [decimal](18,2) NULL,
    [tag_subtotal] [decimal](18,2) NULL,
    [tag_vat_amount] [decimal](18,2) NULL,
    [tag_total_amount] [decimal](18,2) NULL,
    [tag_print_totals] [bit] NULL,
    [tag_status] [int] NOT NULL CONSTRAINT [DF_Temp_Angebot_status] DEFAULT ((0)),
    [tag_bms_offer_number] [nvarchar](17) COLLATE Latin1_General_CI_AS NULL,
    [tag_released_at] [datetime2](3) NULL,
    [tag_return_comment] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [tag_version] [timestamp] NOT NULL,
    [tag_special_payment_condition] [bit] NOT NULL CONSTRAINT [DF_Temp_Angebot_special_payment] DEFAULT ((0)),
    [tag_delivery_terms_id] [int] NULL,
    [tag_packaging_id] [smallint] NULL,
    [tag_delivery_address_id] [int] NULL,
    [tag_delivery_address] [nvarchar](1000) COLLATE Latin1_General_CI_AS NULL,
    [tag_delivery_address_manual] [bit] NOT NULL CONSTRAINT [DF_Temp_Angebot_manual_address] DEFAULT ((0)),
    [tag_offer_pdf] [varbinary](MAX) NULL,
    CONSTRAINT [PK_Temp_Angebot] PRIMARY KEY CLUSTERED ([tag_id] ASC),
    CONSTRAINT [UQ_Temp_Angebot_request] UNIQUE NONCLUSTERED ([tag_company_id] ASC, [tag_created_by] ASC, [tag_client_request_id] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.tbl_Temp_Auf_Position',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[tbl_Temp_Auf_Position] (
    [tap_id] [int] IDENTITY(1,1) NOT NULL,
    [tap_ta_id] [int] NOT NULL,
    [tap_line_no] [int] NOT NULL,
    [tap_be_number] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [tap_article] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [tap_amount_in_kg] [int] NOT NULL,
    [tap_warehouse] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [tap_price] [int] NOT NULL,
    [tap_reservation_in_kg] [int] NULL,
    [tap_reservation_date] [datetime2](7) NULL,
    [tap_about] [nvarchar](4000) COLLATE Latin1_General_CI_AS NULL,
    [tap_mfi] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [tap_CreatedBy] [nvarchar](50) COLLATE Latin1_General_CI_AS NULL,
    [tap_CreateDate] [datetime2](7) NOT NULL CONSTRAINT [DF_tbl_Temp_Auf_Position_CreateDate] DEFAULT (sysutcdatetime()),
    [tap_LastModifiedBy] [nvarchar](50) COLLATE Latin1_General_CI_AS NOT NULL,
    [tap_LastModifiedDate] [datetime2](7) NOT NULL CONSTRAINT [DF_tbl_Temp_Auf_Position_LastModifiedDate] DEFAULT (sysutcdatetime()),
    [tap_ep] [int] NULL,
    [tap_wpz_original] [bit] NULL,
    [tap_wpz_comment] [nvarchar](500) COLLATE Latin1_General_CI_AS NULL,
    [tap_wpz_id] [int] NULL,
    [tap_delivery_date] [datetime2](7) NULL,
    [tap_Verpackungsart_Gewechselt] [bit] NOT NULL CONSTRAINT [DF_tbl_Temp_Auf_Position_tap_Verpackungsart_Gewechselt] DEFAULT ((0)),
    [tap_Verpackungsart] [nvarchar](55) COLLATE Latin1_General_CI_AS NULL,
    [tap_Artikelname_Original] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [tap_Artikelname_Gewechselt] [bit] NOT NULL CONSTRAINT [DF_tbl_Temp_Auf_Position_tap_Artikelname_Gewechselt] DEFAULT ((0)),
    [tap_Verpackungsart_id] [smallint] NULL,
    [tap_Artikelindex] [nvarchar](50) COLLATE Latin1_General_CI_AS NULL,
    [tap_ValutaDatum] [datetime2](7) NULL,
    [tap_is_working_price] [bit] NOT NULL CONSTRAINT [DF_tbl_Temp_Auf_Position_tap_is_working_price] DEFAULT ((0)),
    [tap_purchase_position_id] [int] NULL,
    [tap_offer_position_id] [int] NULL,
    [tap_option_position_id] [int] NULL,
    CONSTRAINT [PK_tbl_Temp_Auf_Position] PRIMARY KEY CLUSTERED ([tap_id] ASC),
    CONSTRAINT [UQ_tbl_Temp_Auf_Position_ta_line] UNIQUE NONCLUSTERED ([tap_ta_id] ASC, [tap_line_no] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.tbl_Temp_Auftrag',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[tbl_Temp_Auftrag] (
    [ta_id] [int] IDENTITY(1,1) NOT NULL,
    [ta_company_id] [int] NOT NULL,
    [ta_procurement_request_id] [nvarchar](36) COLLATE Latin1_General_CI_AS NULL,
    [ta_procurement_notified_at] [datetime2](7) NULL,
    [ta_ClientReferenceId] [nvarchar](16) COLLATE Latin1_General_CI_AS NOT NULL,
    [ta_client_name] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [ta_client_address] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [ta_client_representative] [nvarchar](255) COLLATE Latin1_General_CI_AS NULL,
    [ta_comment] [nvarchar](2555) COLLATE Latin1_General_CI_AS NULL,
    [ta_completed] [bit] NOT NULL,
    [ta_CreatedBy] [nvarchar](50) COLLATE Latin1_General_CI_AS NULL,
    [ta_CreateDate] [datetime2](7) NOT NULL,
    [ta_LastModifiedBy] [nvarchar](50) COLLATE Latin1_General_CI_AS NOT NULL,
    [ta_LastModifiedDate] [datetime2](7) NOT NULL,
    [ta_PassedTo] [nvarchar](4000) COLLATE Latin1_General_CI_AS NULL,
    [ta_ReceivedFrom] [nvarchar](4000) COLLATE Latin1_General_CI_AS NULL,
    [ta_PassedToUserId] [int] NULL,
    [ta_ReceivedFromUserId] [int] NULL,
    [ta_IsConfirmed] [bit] NOT NULL,
    [ta_packaging_type] [nvarchar](55) COLLATE Latin1_General_CI_AS NULL,
    [ta_delivery_address] [nvarchar](500) COLLATE Latin1_General_CI_AS NULL,
    [ta_delivery_address_changed] [bit] NULL,
    [ta_special_payment_condition] [bit] NOT NULL CONSTRAINT [DF_tbl_Temp_Auftraege_ta_special_payment_condition] DEFAULT ((0)),
    [ta_special_payment_text] [nvarchar](500) COLLATE Latin1_General_CI_AS NULL,
    [ta_special_payment_id] [int] NULL,
    [ta_delivery_type_id] [int] NULL,
    [ta_delivery_type] [nvarchar](300) COLLATE Latin1_General_CI_AS NULL,
    [ta_Attachment] [varbinary](MAX) NULL,
    [ta_AttachmentFileName] [nvarchar](255) COLLATE Latin1_General_CI_AS NULL,
    [ta_AttachmentMimeType] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [ta_Auftragsindex] [nvarchar](20) COLLATE Latin1_General_CI_AS NULL,
    [ta_KundenAuftragsnummer] [nvarchar](20) COLLATE Latin1_General_CI_AS NULL,
    [ta_closing_date] [datetime2](7) NULL,
    [ta_CompletedBy] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [ta_Status] [int] NOT NULL CONSTRAINT [DF_tbl_Temp_Auftrag_ta_Status] DEFAULT ((0)),
    [ta_return_comment] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [ta_delivery_address_id] [int] NULL,
    [ta_client_representative_id] [int] NULL,
    [ta_packaging_type_id] [smallint] NULL,
    CONSTRAINT [PK_tbl_Temp_Auftrag] PRIMARY KEY CLUSTERED ([ta_id] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.tbl_Temp_Auftrag_Anhang',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[tbl_Temp_Auftrag_Anhang] (
    [tfa_ID] [bigint] IDENTITY(1,1) NOT NULL,
    [tfa_ta_id] [int] NOT NULL,
    [tfa_FileName] [nvarchar](1024) COLLATE Latin1_General_CI_AS NOT NULL,
    [tfa_MimeType] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL CONSTRAINT [DF_tbl_Temp_Auftrag_Anhang_MimeType] DEFAULT (N''application/octet-stream''),
    [tfa_Content] [varbinary](MAX) NOT NULL,
    [tfa_SizeBytes] [bigint] NOT NULL,
    [tfa_IsLegacy] [bit] NOT NULL CONSTRAINT [DF_tbl_Temp_Auftrag_Anhang_IsLegacy] DEFAULT ((0)),
    [tfa_CreatedBy] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [tfa_CreatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_tbl_Temp_Auftrag_Anhang_CreatedAt] DEFAULT (sysutcdatetime()),
    [tfa_DeletedAt] [datetime2](7) NULL,
    [tfa_DeletedBy] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    CONSTRAINT [PK_tbl_Temp_Auftrag_Anhang] PRIMARY KEY CLUSTERED ([tfa_ID] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.tbl_Temp_Best_Position',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[tbl_Temp_Best_Position] (
    [tbp_id] [int] IDENTITY(1,1) NOT NULL,
    [tbp_tb_id] [int] NOT NULL,
    [tbp_line_no] [int] NOT NULL,
    [tbp_article_index] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [tbp_article] [nvarchar](500) COLLATE Latin1_General_CI_AS NOT NULL,
    [tbp_amount] [decimal](18,3) NOT NULL,
    [tbp_unit] [nvarchar](20) COLLATE Latin1_General_CI_AS NOT NULL,
    [tbp_purchase_price] [decimal](18,4) NOT NULL,
    [tbp_currency] [nvarchar](6) COLLATE Latin1_General_CI_AS NOT NULL CONSTRAINT [DF_tbl_Temp_Best_Position_currency] DEFAULT (N''EUR''),
    [tbp_requested_delivery_date] [date] NOT NULL,
    [tbp_reserved_for] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [tbp_comment] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [tbp_source_bestellindex] [nvarchar](34) COLLATE Latin1_General_CI_AS NULL,
    [tbp_source_position_id] [nvarchar](50) COLLATE Latin1_General_CI_AS NULL,
    [tbp_source_order_date] [date] NULL,
    [tbp_created_by] [nvarchar](100) COLLATE Latin1_General_CI_AS NOT NULL,
    [tbp_create_date] [datetime2](7) NOT NULL CONSTRAINT [DF_tbl_Temp_Best_Position_create_date] DEFAULT (sysutcdatetime()),
    [tbp_last_modified_by] [nvarchar](100) COLLATE Latin1_General_CI_AS NOT NULL,
    [tbp_last_modified_date] [datetime2](7) NOT NULL CONSTRAINT [DF_tbl_Temp_Best_Position_last_modified_date] DEFAULT (sysutcdatetime()),
    [tbp_original_packaging_type] [nvarchar](200) COLLATE Latin1_General_CI_AS NULL,
    [tbp_original_packaging_type_id] [int] NULL,
    [tbp_packaging_type_changed] [bit] NOT NULL CONSTRAINT [DF_Temp_Best_Position_packaging_changed] DEFAULT ((0)),
    [OptionID] [int] NULL,
    [OptionPositionID] [int] NULL,
    [tbp_option_mfi_acknowledged] [bit] NOT NULL CONSTRAINT [DF_Temp_Best_Position_option_mfi] DEFAULT ((0)),
    [tbp_bms_position_id] [nvarchar](17) COLLATE Latin1_General_CI_AS NULL,
    [tbp_order_position_id] [int] NULL,
    CONSTRAINT [PK_tbl_Temp_Best_Position] PRIMARY KEY CLUSTERED ([tbp_id] ASC),
    CONSTRAINT [UQ_tbl_Temp_Best_Position_line] UNIQUE NONCLUSTERED ([tbp_tb_id] ASC, [tbp_line_no] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.tbl_Temp_Bestellung',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[tbl_Temp_Bestellung] (
    [tb_id] [int] IDENTITY(1,1) NOT NULL,
    [tb_company_id] [int] NOT NULL,
    [tb_client_request_id] [uniqueidentifier] NOT NULL,
    [tb_supplier_id] [nvarchar](20) COLLATE Latin1_General_CI_AS NOT NULL,
    [tb_supplier_name] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [tb_supplier_address] [nvarchar](1000) COLLATE Latin1_General_CI_AS NULL,
    [tb_supplier_contact] [nvarchar](255) COLLATE Latin1_General_CI_AS NULL,
    [tb_payment_condition_changed] [bit] NOT NULL CONSTRAINT [DF_tbl_Temp_Bestellung_payment_changed] DEFAULT ((0)),
    [tb_payment_condition_id] [int] NULL,
    [tb_payment_condition_text] [nvarchar](1000) COLLATE Latin1_General_CI_AS NULL,
    [tb_delivery_term_id] [int] NULL,
    [tb_delivery_term_text] [nvarchar](500) COLLATE Latin1_General_CI_AS NULL,
    [tb_packaging_type] [nvarchar](200) COLLATE Latin1_General_CI_AS NULL,
    [tb_loading_location_source] [nvarchar](30) COLLATE Latin1_General_CI_AS NULL,
    [tb_loading_location_id] [int] NULL,
    [tb_loading_location_text] [nvarchar](1000) COLLATE Latin1_General_CI_AS NULL,
    [tb_loading_location_changed] [bit] NOT NULL CONSTRAINT [DF_tbl_Temp_Bestellung_loading_changed] DEFAULT ((0)),
    [tb_comment] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [tb_status] [int] NOT NULL CONSTRAINT [DF_tbl_Temp_Bestellung_status] DEFAULT ((0)),
    [tb_bestellindex] [nvarchar](34) COLLATE Latin1_General_CI_AS NULL,
    [tb_supplier_mail_status] [nvarchar](20) COLLATE Latin1_General_CI_AS NOT NULL CONSTRAINT [DF_tbl_Temp_Bestellung_supplier_mail_status] DEFAULT (N''not_queued''),
    [tb_supplier_mail_last_error] [nvarchar](2000) COLLATE Latin1_General_CI_AS NULL,
    [tb_supplier_mail_sent_at] [datetime2](7) NULL,
    [tb_return_comment] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [tb_created_by] [nvarchar](100) COLLATE Latin1_General_CI_AS NOT NULL,
    [tb_create_date] [datetime2](7) NOT NULL CONSTRAINT [DF_tbl_Temp_Bestellung_create_date] DEFAULT (sysutcdatetime()),
    [tb_last_modified_by] [nvarchar](100) COLLATE Latin1_General_CI_AS NOT NULL,
    [tb_last_modified_date] [datetime2](7) NOT NULL CONSTRAINT [DF_tbl_Temp_Bestellung_last_modified_date] DEFAULT (sysutcdatetime()),
    [tb_completed_by] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [tb_closing_date] [datetime2](7) NULL,
    [tb_packaging_type_id] [int] NULL,
    CONSTRAINT [PK_tbl_Temp_Bestellung] PRIMARY KEY CLUSTERED ([tb_id] ASC),
    CONSTRAINT [UQ_tbl_Temp_Bestellung_client_request] UNIQUE NONCLUSTERED ([tb_company_id] ASC, [tb_client_request_id] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.tbl_Temp_Bestellung_Anhang',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[tbl_Temp_Bestellung_Anhang] (
    [tba_ID] [bigint] IDENTITY(1,1) NOT NULL,
    [tba_tb_id] [int] NOT NULL,
    [tba_FileName] [nvarchar](1024) COLLATE Latin1_General_CI_AS NOT NULL,
    [tba_MimeType] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [tba_Content] [varbinary](MAX) NOT NULL,
    [tba_SizeBytes] [bigint] NOT NULL,
    [tba_CreatedBy] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [tba_CreatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_tbl_Temp_Bestellung_Anhang_CreatedAt] DEFAULT (sysutcdatetime()),
    [tba_DeletedAt] [datetime2](7) NULL,
    [tba_DeletedBy] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [tba_OptionSnapshot] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    CONSTRAINT [PK_tbl_Temp_Bestellung_Anhang] PRIMARY KEY CLUSTERED ([tba_ID] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.tblOptionen',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[tblOptionen] (
    [op_id] [int] IDENTITY(1,1) NOT NULL,
    [op_MandantID] [int] NOT NULL,
    [op_LieferantID] [nvarchar](50) COLLATE Latin1_General_CI_AS NULL,
    [op_Lieferantenkennung] [nvarchar](255) COLLATE Latin1_General_CI_AS NULL,
    [op_Lieferantenname] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [op_Angebotsnummer] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [op_KundennummerLieferant] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [op_Angebotsdatum] [date] NULL,
    [op_EingangAm] [datetime2](7) NOT NULL,
    [op_GueltigAb] [date] NOT NULL,
    [op_GueltigBis] [date] NOT NULL,
    [op_QuellGueltigBis] [date] NULL,
    [op_Incoterm] [nvarchar](50) COLLATE Latin1_General_CI_AS NULL,
    [op_Ladeort] [nvarchar](500) COLLATE Latin1_General_CI_AS NULL,
    [op_Verpackung] [nvarchar](500) COLLATE Latin1_General_CI_AS NULL,
    [op_Antwortadresse] [nvarchar](255) COLLATE Latin1_General_CI_AS NULL,
    [op_Konditionen] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [op_Kommentar] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [op_Nachverhandelbar] [nvarchar](12) COLLATE Latin1_General_CI_AS NOT NULL CONSTRAINT [DF_tblOptionen_Nachverhandelbar] DEFAULT (N''unknown''),
    [op_NachverhandelbarQuelle] [nvarchar](500) COLLATE Latin1_General_CI_AS NULL,
    [op_QuelleTyp] [nvarchar](30) COLLATE Latin1_General_CI_AS NOT NULL,
    [op_QuelleSchluessel] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [op_QuellangebotHash] [char](64) COLLATE Latin1_General_CI_AS NULL,
    [op_QuelleDateiname] [nvarchar](255) COLLATE Latin1_General_CI_AS NULL,
    [op_QuelleMailtext] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [op_QuelleMailformat] [nvarchar](20) COLLATE Latin1_General_CI_AS NULL,
    [op_QuelleDatei] [varbinary](MAX) NULL,
    [op_QuelleDateiMime] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [op_IstDemo] [bit] NOT NULL CONSTRAINT [DF_tblOptionen_IstDemo] DEFAULT ((0)),
    [op_Pruefstatus] [nvarchar](20) COLLATE Latin1_General_CI_AS NOT NULL CONSTRAINT [DF_tblOptionen_Pruefstatus] DEFAULT (N''pending''),
    [op_Geschaeftsstatus] [nvarchar](20) COLLATE Latin1_General_CI_AS NOT NULL CONSTRAINT [DF_tblOptionen_Geschaeftsstatus] DEFAULT (N''open''),
    [op_GeloeschtAm] [datetime2](7) NULL,
    [op_GeloeschtVon] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [op_ErstelltVon] [nvarchar](100) COLLATE Latin1_General_CI_AS NOT NULL,
    [op_ErstelltAm] [datetime2](7) NOT NULL CONSTRAINT [DF_tblOptionen_ErstelltAm] DEFAULT (sysutcdatetime()),
    [op_GeaendertVon] [nvarchar](100) COLLATE Latin1_General_CI_AS NOT NULL,
    [op_GeaendertAm] [datetime2](7) NOT NULL CONSTRAINT [DF_tblOptionen_GeaendertAm] DEFAULT (sysutcdatetime()),
    [op_DuplikatSchluessel] [char](64) COLLATE Latin1_General_CI_AS NULL,
    [op_QuelleMailbilderJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [op_AnbieterKontaktJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    CONSTRAINT [PK_tblOptionen] PRIMARY KEY CLUSTERED ([op_id] ASC),
    CONSTRAINT [UQ_tblOptionen_Quelle] UNIQUE NONCLUSTERED ([op_MandantID] ASC, [op_QuelleSchluessel] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.tblOptionenAbgleich',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[tblOptionenAbgleich] (
    [oab_id] [bigint] IDENTITY(1,1) NOT NULL,
    [oab_opp_id] [int] NOT NULL,
    [oab_MandantID] [int] NOT NULL,
    [oab_EingabeHash] [char](64) COLLATE Latin1_General_CI_AS NOT NULL,
    [oab_KontextHash] [char](64) COLLATE Latin1_General_CI_AS NOT NULL,
    [oab_QuelldatenGeaendertAm] [datetime2](7) NOT NULL,
    [oab_AlgorithmusVersion] [nvarchar](30) COLLATE Latin1_General_CI_AS NOT NULL,
    [oab_Kunststoff] [nvarchar](100) COLLATE Latin1_General_CI_AS NOT NULL,
    [oab_KunststoffUntergruppe] [nvarchar](100) COLLATE Latin1_General_CI_AS NOT NULL,
    [oab_KategorieQuelle] [nvarchar](30) COLLATE Latin1_General_CI_AS NOT NULL,
    [oab_ArtikelindexVorschlag] [nvarchar](50) COLLATE Latin1_General_CI_AS NULL,
    [oab_ArtikelnameVorschlag] [nvarchar](500) COLLATE Latin1_General_CI_AS NULL,
    [oab_VorschlagGrund] [nvarchar](2000) COLLATE Latin1_General_CI_AS NULL,
    [oab_KandidatenAnzahl] [int] NOT NULL,
    [oab_MerkmaleJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NOT NULL,
    [oab_BerechnetAm] [datetime2](7) NOT NULL CONSTRAINT [DF__tblOption__oab_B__2917FB5A] DEFAULT (sysutcdatetime()),
    [oab_AnforderungRevision] [int] NOT NULL CONSTRAINT [DF__tblOption__oab_A__3C2ACFCE] DEFAULT ((0)),
    [oab_MesswerteVorbereitet] [bit] NOT NULL CONSTRAINT [DF__tblOption__oab_M__3E131840] DEFAULT ((0)),
    [oab_MFI] [decimal](18,6) NULL,
    [oab_MFI_bis] [decimal](18,6) NULL,
    [oab_MFI_Pruefmethode] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [oab_Dichte] [decimal](18,6) NULL,
    [oab_DichteEinheit] [nvarchar](30) COLLATE Latin1_General_CI_AS NULL,
    [oab_Messwertquelle] [nvarchar](200) COLLATE Latin1_General_CI_AS NULL,
    CONSTRAINT [PK__tblOptio__E6ADB0EB406EB11B] PRIMARY KEY CLUSTERED ([oab_id] ASC),
    CONSTRAINT [UQ_OptionenAbgleich_Position] UNIQUE NONCLUSTERED ([oab_id] ASC, [oab_opp_id] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.tblOptionenAbgleichAuftrag',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[tblOptionenAbgleichAuftrag] (
    [oaa_MandantID] [int] NOT NULL,
    [oaa_Revision] [int] NOT NULL CONSTRAINT [DF__tblOption__oaa_R__30B91D22] DEFAULT ((1)),
    [oaa_Status] [nvarchar](20) COLLATE Latin1_General_CI_AS NOT NULL CONSTRAINT [DF__tblOption__oaa_S__31AD415B] DEFAULT (N''pending''),
    [oaa_Grund] [nvarchar](200) COLLATE Latin1_General_CI_AS NULL,
    [oaa_GesperrtBis] [datetime2](7) NULL,
    [oaa_NaechsterVersuchAm] [datetime2](7) NOT NULL CONSTRAINT [DF__tblOption__oaa_N__339589CD] DEFAULT (sysutcdatetime()),
    [oaa_Versuche] [int] NOT NULL CONSTRAINT [DF__tblOption__oaa_V__3489AE06] DEFAULT ((0)),
    [oaa_Fehler] [nvarchar](2000) COLLATE Latin1_General_CI_AS NULL,
    [oaa_GeaendertAm] [datetime2](7) NOT NULL CONSTRAINT [DF__tblOption__oaa_G__357DD23F] DEFAULT (sysutcdatetime()),
    [oaa_LetzterErfolgAm] [datetime2](7) NULL,
    [oaa_GesperrtVon] [uniqueidentifier] NULL,
    CONSTRAINT [PK__tblOptio__21B498940D9E7D31] PRIMARY KEY CLUSTERED ([oaa_MandantID] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.tblOptionenArtikelKandidaten',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[tblOptionenArtikelKandidaten] (
    [oak_oab_id] [bigint] NOT NULL,
    [oak_Artikelindex] [nvarchar](50) COLLATE Latin1_General_CI_AS NOT NULL,
    [oak_Artikelname] [nvarchar](500) COLLATE Latin1_General_CI_AS NOT NULL,
    [oak_Rang] [int] NOT NULL,
    [oak_Punkte] [int] NOT NULL,
    [oak_DatenJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NOT NULL,
    CONSTRAINT [PK__tblOptio__5A12CFF2A4571162] PRIMARY KEY CLUSTERED ([oak_oab_id] ASC, [oak_Artikelindex] ASC),
    CONSTRAINT [UQ_OptionenKandidaten_Rang] UNIQUE NONCLUSTERED ([oak_oab_id] ASC, [oak_Rang] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.tblOptionenArtikelMapping',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[tblOptionenArtikelMapping] (
    [oam_id] [int] IDENTITY(1,1) NOT NULL,
    [oam_MandantID] [int] NOT NULL,
    [oam_Lieferantenkennung] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [oam_Lieferantenname] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [oam_Artikelnummer_Lieferant] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [oam_Artikelname_Lieferant] [nvarchar](500) COLLATE Latin1_General_CI_AS NOT NULL,
    [oam_ArtikelnameNorm] [nvarchar](500) COLLATE Latin1_General_CI_AS NOT NULL,
    [oam_Kunststofftyp] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [oam_ZustandNorm] [nvarchar](50) COLLATE Latin1_General_CI_AS NULL,
    [oam_MFIvon] [decimal](18,3) NULL,
    [oam_MFIbis] [decimal](18,3) NULL,
    [oam_MFI_Pruefmethode] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [oam_Artikelindex] [nvarchar](50) COLLATE Latin1_General_CI_AS NOT NULL,
    [oam_Artikelname] [nvarchar](500) COLLATE Latin1_General_CI_AS NOT NULL,
    [oam_Aktiv] [bit] NOT NULL CONSTRAINT [DF_tblOptionenArtikelMapping_Aktiv] DEFAULT ((1)),
    [oam_ErstelltVon] [nvarchar](100) COLLATE Latin1_General_CI_AS NOT NULL,
    [oam_ErstelltAm] [datetime2](7) NOT NULL CONSTRAINT [DF_tblOptionenArtikelMapping_ErstelltAm] DEFAULT (sysutcdatetime()),
    [oam_GeaendertVon] [nvarchar](100) COLLATE Latin1_General_CI_AS NOT NULL,
    [oam_GeaendertAm] [datetime2](7) NOT NULL CONSTRAINT [DF_tblOptionenArtikelMapping_GeaendertAm] DEFAULT (sysutcdatetime()),
    [oam_MerkmaleJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [oam_AlgorithmusVersion] [nvarchar](30) COLLATE Latin1_General_CI_AS NULL,
    [oam_QuellePositionID] [int] NULL,
    CONSTRAINT [PK_tblOptionenArtikelMapping] PRIMARY KEY CLUSTERED ([oam_id] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.tblOptionenLieferantenKonto',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[tblOptionenLieferantenKonto] (
    [olk_MandantID] [int] NOT NULL,
    [olk_LieferantenNummer] [nvarchar](50) COLLATE Latin1_General_CI_AS NOT NULL,
    [olk_Lieferantenkennung] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [olk_Lieferantenname] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [olk_Aktiv] [bit] NOT NULL CONSTRAINT [DF__tblOption__olk_A__385A3EEA] DEFAULT ((1)),
    [olk_Hinweis] [nvarchar](500) COLLATE Latin1_General_CI_AS NULL,
    CONSTRAINT [PK__tblOptio__01996CFE8676FC2F] PRIMARY KEY CLUSTERED ([olk_MandantID] ASC, [olk_LieferantenNummer] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.tblOptionenLieferantenRegel',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[tblOptionenLieferantenRegel] (
    [olr_id] [int] IDENTITY(1,1) NOT NULL,
    [olr_MandantID] [int] NOT NULL,
    [olr_Lieferantenkennung] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [olr_Alias] [nvarchar](255) COLLATE Latin1_General_CI_AS NULL,
    [olr_AbsenderDomain] [nvarchar](255) COLLATE Latin1_General_CI_AS NULL,
    [olr_MengeneinheitStandard] [nvarchar](30) COLLATE Latin1_General_CI_AS NULL,
    [olr_PreiseinheitStandard] [nvarchar](30) COLLATE Latin1_General_CI_AS NULL,
    [olr_Begruendung] [nvarchar](1000) COLLATE Latin1_General_CI_AS NULL,
    [olr_Aktiv] [bit] NOT NULL CONSTRAINT [DF_tblOptionenLieferantenRegel_Aktiv] DEFAULT ((0)),
    [olr_GeaendertVon] [nvarchar](100) COLLATE Latin1_General_CI_AS NOT NULL,
    [olr_GeaendertAm] [datetime2](7) NOT NULL CONSTRAINT [DF_tblOptionenLieferantenRegel_GeaendertAm] DEFAULT (sysutcdatetime()),
    [olr_Dokumenttyp] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [olr_BedingungenJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [olr_Version] [nvarchar](30) COLLATE Latin1_General_CI_AS NULL,
    [olr_Prioritaet] [int] NOT NULL CONSTRAINT [DF_OptionRegel_Prioritaet] DEFAULT ((0)),
    CONSTRAINT [PK_tblOptionenLieferantenRegel] PRIMARY KEY CLUSTERED ([olr_id] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.tblOptionenMailEreignis',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[tblOptionenMailEreignis] (
    [ome_id] [bigint] IDENTITY(1,1) NOT NULL,
    [ome_omv_id] [bigint] NOT NULL,
    [ome_Zeitpunkt] [datetime2](7) NOT NULL CONSTRAINT [DF_ome_Zeitpunkt] DEFAULT (sysutcdatetime()),
    [ome_Phase] [nvarchar](100) COLLATE Latin1_General_CI_AS NOT NULL,
    [ome_Detail] [nvarchar](4000) COLLATE Latin1_General_CI_AS NULL,
    [ome_ReaderVersion] [nvarchar](40) COLLATE Latin1_General_CI_AS NOT NULL,
    CONSTRAINT [PK_OptionenMailEreignis] PRIMARY KEY CLUSTERED ([ome_id] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.tblOptionenMailVerarbeitung',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[tblOptionenMailVerarbeitung] (
    [omv_id] [bigint] IDENTITY(1,1) NOT NULL,
    [omv_MandantID] [int] NOT NULL,
    [omv_Postfach] [nvarchar](320) COLLATE Latin1_General_CI_AS NOT NULL,
    [omv_Schluessel] [char](64) COLLATE Latin1_General_CI_AS NOT NULL,
    [omv_EwsID] [nvarchar](1024) COLLATE Latin1_General_CI_AS NOT NULL,
    [omv_MessageID] [nvarchar](998) COLLATE Latin1_General_CI_AS NULL,
    [omv_Betreff] [nvarchar](255) COLLATE Latin1_General_CI_AS NULL,
    [omv_Status] [nvarchar](30) COLLATE Latin1_General_CI_AS NOT NULL CONSTRAINT [DF_omv_Status] DEFAULT (N''pending''),
    [omv_Phase] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [omv_Versuche] [int] NOT NULL CONSTRAINT [DF_omv_Versuche] DEFAULT ((0)),
    [omv_NaechsterVersuchAm] [datetime2](7) NULL,
    [omv_GesperrtBis] [datetime2](7) NULL,
    [omv_Lease] [uniqueidentifier] NULL,
    [omv_Fehler] [nvarchar](4000) COLLATE Latin1_General_CI_AS NULL,
    [omv_AngebotIDsJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [omv_ExtraktionJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [omv_ReaderVersion] [nvarchar](40) COLLATE Latin1_General_CI_AS NULL,
    [omv_ErstelltAm] [datetime2](7) NOT NULL CONSTRAINT [DF_omv_Erstellt] DEFAULT (sysutcdatetime()),
    [omv_GeaendertAm] [datetime2](7) NOT NULL CONSTRAINT [DF_omv_Geaendert] DEFAULT (sysutcdatetime()),
    CONSTRAINT [PK_OptionenMailVerarbeitung] PRIMARY KEY CLUSTERED ([omv_id] ASC),
    CONSTRAINT [UX_OptionenMailVerarbeitung] UNIQUE NONCLUSTERED ([omv_MandantID] ASC, [omv_Schluessel] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.tblOptionenPositionen',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[tblOptionenPositionen] (
    [opp_id] [int] IDENTITY(1,1) NOT NULL,
    [opp_op_id] [int] NOT NULL,
    [opp_Positionsnummer] [int] NOT NULL,
    [opp_Artikelnummer_Lieferant] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [opp_Artikelname_Lieferant] [nvarchar](500) COLLATE Latin1_General_CI_AS NOT NULL,
    [opp_Artikelindex] [nvarchar](50) COLLATE Latin1_General_CI_AS NULL,
    [opp_Artikelname] [nvarchar](500) COLLATE Latin1_General_CI_AS NULL,
    [opp_ArtikelindexVorschlag] [nvarchar](50) COLLATE Latin1_General_CI_AS NULL,
    [opp_ArtikelnameVorschlag] [nvarchar](500) COLLATE Latin1_General_CI_AS NULL,
    [opp_MatchStatus] [nvarchar](20) COLLATE Latin1_General_CI_AS NOT NULL CONSTRAINT [DF_tblOptionenPositionen_MatchStatus] DEFAULT (N''unmatched''),
    [opp_MatchGrund] [nvarchar](1000) COLLATE Latin1_General_CI_AS NULL,
    [opp_Kunststofftyp] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [opp_Zustand] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [opp_ZustandNorm] [nvarchar](50) COLLATE Latin1_General_CI_AS NULL,
    [opp_Charge] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [opp_MengeVon] [decimal](18,3) NULL,
    [opp_MengeBis] [decimal](18,3) NULL,
    [opp_Mengeneinheit] [nvarchar](30) COLLATE Latin1_General_CI_AS NULL,
    [opp_MengeRohtext] [nvarchar](500) COLLATE Latin1_General_CI_AS NULL,
    [opp_MengeVonKg] [decimal](18,3) NULL,
    [opp_MengeBisKg] [decimal](18,3) NULL,
    [opp_PreisRoh] [decimal](18,4) NULL,
    [opp_PreiseinheitRoh] [nvarchar](30) COLLATE Latin1_General_CI_AS NULL,
    [opp_PreisProTonne] [decimal](18,4) NULL,
    [opp_Waehrung] [nvarchar](6) COLLATE Latin1_General_CI_AS NULL,
    [opp_MFI] [decimal](18,3) NULL,
    [opp_MFI_Pruefmethode] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [opp_Dichte] [decimal](18,3) NULL,
    [opp_DichteEinheit] [nvarchar](30) COLLATE Latin1_General_CI_AS NULL,
    [opp_C2] [decimal](18,3) NULL,
    [opp_Eigenschaften] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [opp_Ladehinweis] [nvarchar](1000) COLLATE Latin1_General_CI_AS NULL,
    [opp_LieferdatenJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [opp_Kommentar] [nvarchar](1000) COLLATE Latin1_General_CI_AS NULL,
    [opp_GueltigBis] [date] NULL,
    [opp_ErstelltVon] [nvarchar](100) COLLATE Latin1_General_CI_AS NOT NULL,
    [opp_ErstelltAm] [datetime2](7) NOT NULL CONSTRAINT [DF_tblOptionenPositionen_ErstelltAm] DEFAULT (sysutcdatetime()),
    [opp_GeaendertVon] [nvarchar](100) COLLATE Latin1_General_CI_AS NOT NULL,
    [opp_GeaendertAm] [datetime2](7) NOT NULL CONSTRAINT [DF_tblOptionenPositionen_GeaendertAm] DEFAULT (sysutcdatetime()),
    [opp_AktuellerAbgleichID] [bigint] NULL,
    [opp_LernenAngefordert] [bit] NOT NULL CONSTRAINT [DF__tblOption__opp_L__394E6323] DEFAULT ((0)),
    [opp_ZuordnungRevision] [int] NOT NULL CONSTRAINT [DF__tblOption__opp_Z__3A42875C] DEFAULT ((0)),
    [opp_LernregelHinweis] [nvarchar](500) COLLATE Latin1_General_CI_AS NULL,
    [opp_BestaetigtKunststoff] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [opp_BestaetigtUntergruppe] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [opp_VerpackungRoh] [nvarchar](500) COLLATE Latin1_General_CI_AS NULL,
    [opp_MindestabnahmeRoh] [decimal](18,3) NULL,
    [opp_ChargenbestandRoh] [decimal](18,3) NULL,
    [opp_GebindegewichtRohKg] [decimal](18,3) NULL,
    [opp_PalettengewichtRohKg] [decimal](18,3) NULL,
    [opp_Verpackung] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [opp_Verpackungsart_id] [int] NULL,
    [opp_GebindegewichtKg] [decimal](18,3) NULL,
    [opp_PalettengewichtKg] [decimal](18,3) NULL,
    [opp_MaxLadegewichtKg] [decimal](18,3) NULL,
    [opp_MindestabnahmeKg] [decimal](18,3) NULL,
    [opp_ChargenbestandKg] [decimal](18,3) NULL,
    [opp_LKWAnzahlVon] [decimal](18,3) NULL,
    [opp_LKWAnzahlBis] [decimal](18,3) NULL,
    [opp_Mengenart] [nvarchar](30) COLLATE Latin1_General_CI_AS NULL,
    [opp_MengeneinheitNorm] [nvarchar](30) COLLATE Latin1_General_CI_AS NULL,
    [opp_PreiseinheitNorm] [nvarchar](30) COLLATE Latin1_General_CI_AS NULL,
    [opp_NormalisierungJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [opp_NormalisierungVersion] [nvarchar](30) COLLATE Latin1_General_CI_AS NULL,
    [opp_NormalisiertAm] [datetime2](7) NULL,
    [opp_QuellaufbereitungJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [opp_MFI_bis] [decimal](18,3) NULL,
    [opp_GesamtmengeBestaetigtKg] [decimal](18,3) NULL,
    [opp_MengeBestaetigtQuellHash] [varchar](64) COLLATE Latin1_General_CI_AS NULL,
    [opp_MengeBestaetigtVon] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [opp_MengeBestaetigtAm] [datetime2](7) NULL,
    [opp_MengeBestaetigtVerpackungsartID] [int] NULL,
    [opp_MengeBestaetigtTrucks] [decimal](18,3) NULL,
    [opp_GeloeschtAm] [datetime2](7) NULL,
    [opp_GeloeschtVon] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    CONSTRAINT [PK_tblOptionenPositionen] PRIMARY KEY CLUSTERED ([opp_id] ASC),
    CONSTRAINT [UQ_tblOptionenPositionen_Pos] UNIQUE NONCLUSTERED ([opp_op_id] ASC, [opp_Positionsnummer] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.tblOptionenReaderLaufzeit',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[tblOptionenReaderLaufzeit] (
    [orl_Instanz] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [orl_ReaderVersion] [nvarchar](40) COLLATE Latin1_General_CI_AS NOT NULL,
    [orl_MatchingVersion] [nvarchar](40) COLLATE Latin1_General_CI_AS NULL,
    [orl_PdfVersion] [nvarchar](40) COLLATE Latin1_General_CI_AS NULL,
    [orl_Heartbeat] [datetime2](7) NOT NULL,
    [orl_Status] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    CONSTRAINT [PK_OptionenReaderLaufzeit] PRIMARY KEY CLUSTERED ([orl_Instanz] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.tblOptionenReaderSteuerung',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[tblOptionenReaderSteuerung] (
    [ors_MandantID] [int] NOT NULL,
    [ors_PausiertBis] [datetime2](7) NULL,
    [ors_Grund] [nvarchar](500) COLLATE Latin1_General_CI_AS NULL,
    [ors_Token] [uniqueidentifier] NULL,
    CONSTRAINT [PK_OptionenReaderSteuerung] PRIMARY KEY CLUSTERED ([ors_MandantID] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.TempOrderReworkPushState',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[TempOrderReworkPushState] (
    [torps_ID] [bigint] IDENTITY(1,1) NOT NULL,
    [torps_OrderID] [bigint] NOT NULL,
    [torps_CompanyID] [bigint] NULL,
    [torps_LastStatus] [int] NULL,
    [torps_LastModifiedDate] [datetime2](7) NULL,
    [torps_LastReturnComment] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [torps_LastNotifiedComment] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [torps_LastNotifiedAt] [datetime2](7) NULL,
    [torps_LockedAt] [datetime2](7) NULL,
    [torps_LastCheckedAt] [datetime2](7) NULL,
    [torps_LastError] [nvarchar](2000) COLLATE Latin1_General_CI_AS NULL,
    [torps_CreatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_TempOrderReworkPushState_CreatedAt] DEFAULT (sysutcdatetime()),
    [torps_UpdatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_TempOrderReworkPushState_UpdatedAt] DEFAULT (sysutcdatetime()),
    CONSTRAINT [PK_TempOrderReworkPushState] PRIMARY KEY CLUSTERED ([torps_ID] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.Timeline',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[Timeline] (
    [tl_ID] [int] IDENTITY(1,1) NOT NULL,
    [tl_CreatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_tblBMSApp_Timeline_CreatedAt] DEFAULT (sysutcdatetime()),
    [tl_Mandant] [nvarchar](100) COLLATE Latin1_General_CI_AS NOT NULL,
    [tl_MandantKurz] [nvarchar](50) COLLATE Latin1_General_CI_AS NULL,
    [tl_UserEmail] [nvarchar](255) COLLATE Latin1_General_CI_AS NULL,
    [tl_UserShortCode] [nvarchar](50) COLLATE Latin1_General_CI_AS NOT NULL,
    [tl_Type] [nvarchar](30) COLLATE Latin1_General_CI_AS NOT NULL,
    [tl_Product] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [tl_ProductId] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [tl_BeNumber] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [tl_AmountKg] [decimal](18,3) NULL,
    [tl_Unit] [nvarchar](20) COLLATE Latin1_General_CI_AS NULL,
    [tl_ReferenceId] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [tl_PayloadJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [tl_CompanyId] [int] NULL,
    CONSTRAINT [PK__tblBMSAp__8506ACE6BAAE6BE7] PRIMARY KEY CLUSTERED ([tl_ID] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.VlMailOrderState',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[VlMailOrderState] (
    [vmos_ID] [bigint] IDENTITY(1,1) NOT NULL,
    [vmos_OrderID] [int] NOT NULL,
    [vmos_CompanyID] [int] NOT NULL,
    [vmos_LastStatus] [int] NULL,
    [vmos_LastModifiedDate] [datetime2](7) NULL,
    [vmos_CreatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_VlMailOrderState_CreatedAt] DEFAULT (sysutcdatetime()),
    [vmos_UpdatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_VlMailOrderState_UpdatedAt] DEFAULT (sysutcdatetime()),
    CONSTRAINT [PK_VlMailOrderState] PRIMARY KEY CLUSTERED ([vmos_ID] ASC),
    CONSTRAINT [UQ_VlMailOrderState_OrderID] UNIQUE NONCLUSTERED ([vmos_OrderID] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.VlMailOutbox',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[VlMailOutbox] (
    [vmo_ID] [bigint] IDENTITY(1,1) NOT NULL,
    [vmo_OrderID] [int] NOT NULL,
    [vmo_CompanyID] [int] NOT NULL,
    [vmo_EventKey] [nvarchar](200) COLLATE Latin1_General_CI_AS NOT NULL,
    [vmo_Recipient] [nvarchar](320) COLLATE Latin1_General_CI_AS NOT NULL,
    [vmo_RecipientSource] [nvarchar](50) COLLATE Latin1_General_CI_AS NOT NULL,
    [vmo_Subject] [nvarchar](255) COLLATE Latin1_General_CI_AS NOT NULL,
    [vmo_Body] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NOT NULL,
    [vmo_Status] [nvarchar](20) COLLATE Latin1_General_CI_AS NOT NULL CONSTRAINT [DF_VlMailOutbox_Status] DEFAULT (N''pending''),
    [vmo_AttemptCount] [int] NOT NULL CONSTRAINT [DF_VlMailOutbox_AttemptCount] DEFAULT ((0)),
    [vmo_NextAttemptAt] [datetime2](7) NULL,
    [vmo_LockedAt] [datetime2](7) NULL,
    [vmo_LastError] [nvarchar](2000) COLLATE Latin1_General_CI_AS NULL,
    [vmo_SentAt] [datetime2](7) NULL,
    [vmo_CreateDate] [datetime2](7) NOT NULL CONSTRAINT [DF_VlMailOutbox_CreateDate] DEFAULT (sysutcdatetime()),
    [vmo_LastModifiedDate] [datetime2](7) NOT NULL CONSTRAINT [DF_VlMailOutbox_LastModifiedDate] DEFAULT (sysutcdatetime()),
    [vmo_FromAddress] [nvarchar](320) COLLATE Latin1_General_CI_AS NULL,
    [vmo_OnBehalfOfAddress] [nvarchar](320) COLLATE Latin1_General_CI_AS NULL,
    CONSTRAINT [PK_VlMailOutbox] PRIMARY KEY CLUSTERED ([vmo_ID] ASC),
    CONSTRAINT [UQ_VlMailOutbox_OrderID_Event_Recipient] UNIQUE NONCLUSTERED ([vmo_OrderID] ASC, [vmo_EventKey] ASC, [vmo_Recipient] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.VlMailUserSetting',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[VlMailUserSetting] (
    [vms_ID] [bigint] IDENTITY(1,1) NOT NULL,
    [vms_UserEmail] [nvarchar](320) COLLATE Latin1_General_CI_AS NOT NULL,
    [vms_VlMailsEnabled] [bit] NOT NULL CONSTRAINT [DF_VlMailUserSetting_VlMailsEnabled] DEFAULT ((1)),
    [vms_CreatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_VlMailUserSetting_CreatedAt] DEFAULT (sysutcdatetime()),
    [vms_UpdatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_VlMailUserSetting_UpdatedAt] DEFAULT (sysutcdatetime()),
    CONSTRAINT [PK_VlMailUserSetting] PRIMARY KEY CLUSTERED ([vms_ID] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.VlMailWorkerState',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[VlMailWorkerState] (
    [vmws_Key] [nvarchar](50) COLLATE Latin1_General_CI_AS NOT NULL,
    [vmws_Value] [nvarchar](200) COLLATE Latin1_General_CI_AS NULL,
    [vmws_CreatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_VlMailWorkerState_CreatedAt] DEFAULT (sysutcdatetime()),
    [vmws_UpdatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_VlMailWorkerState_UpdatedAt] DEFAULT (sysutcdatetime()),
    CONSTRAINT [PK_VlMailWorkerState] PRIMARY KEY CLUSTERED ([vmws_Key] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.VlSalePushState',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[VlSalePushState] (
    [vps_ID] [bigint] IDENTITY(1,1) NOT NULL,
    [vps_OrderID] [int] NOT NULL,
    [vps_CompanyID] [int] NOT NULL,
    [vps_OrderIndex] [nvarchar](40) COLLATE Latin1_General_CI_AS NULL,
    [vps_SalesRepresentative] [nvarchar](50) COLLATE Latin1_General_CI_AS NULL,
    [vps_Status] [nvarchar](20) COLLATE Latin1_General_CI_AS NOT NULL CONSTRAINT [DF_VlSalePushState_Status] DEFAULT (N''pending''),
    [vps_AttemptCount] [int] NOT NULL CONSTRAINT [DF_VlSalePushState_AttemptCount] DEFAULT ((0)),
    [vps_NextAttemptAt] [datetime2](7) NULL,
    [vps_LockedAt] [datetime2](7) NULL,
    [vps_LastError] [nvarchar](2000) COLLATE Latin1_General_CI_AS NULL,
    [vps_SentAt] [datetime2](7) NULL,
    [vps_CreatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_VlSalePushState_CreatedAt] DEFAULT (sysutcdatetime()),
    [vps_UpdatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_VlSalePushState_UpdatedAt] DEFAULT (sysutcdatetime()),
    CONSTRAINT [PK_VlSalePushState] PRIMARY KEY CLUSTERED ([vps_ID] ASC),
    CONSTRAINT [UQ_VlSalePushState_OrderID] UNIQUE NONCLUSTERED ([vps_OrderID] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.OptionOfferMailOutbox',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[OptionOfferMailOutbox] (
    [Id] [bigint] IDENTITY(1,1) NOT NULL,
    [CompanyId] [int] NOT NULL,
    [OptionPositionId] [int] NULL,
    [CustomerNumber] [nvarchar](10) COLLATE Latin1_General_CI_AS NOT NULL,
    [ArticleIndex] [nvarchar](50) COLLATE Latin1_General_CI_AS NOT NULL,
    [ContactId] [int] NOT NULL,
    [ContactName] [nvarchar](200) COLLATE Latin1_General_CI_AS NOT NULL,
    [RecipientEmail] [nvarchar](320) COLLATE Latin1_General_CI_AS NOT NULL,
    [SenderCode] [nvarchar](3) COLLATE Latin1_General_CI_AS NOT NULL,
    [SenderName] [nvarchar](200) COLLATE Latin1_General_CI_AS NOT NULL,
    [SenderEmail] [nvarchar](320) COLLATE Latin1_General_CI_AS NOT NULL,
    [SalePricePerTonne] [decimal](19,4) NOT NULL,
    [Currency] [char](3) COLLATE Latin1_General_CI_AS NOT NULL,
    [IncotermId] [int] NOT NULL,
    [IncotermText] [nvarchar](250) COLLATE Latin1_General_CI_AS NOT NULL,
    [Status] [nvarchar](20) COLLATE Latin1_General_CI_AS NOT NULL CONSTRAINT [DF_OptionOfferMailOutbox_Status] DEFAULT (N''pending''),
    [MailServiceId] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [SentAt] [datetime2](7) NULL,
    [AttemptCount] [int] NOT NULL CONSTRAINT [DF_OptionOfferMailOutbox_AttemptCount] DEFAULT ((0)),
    [NextAttemptAt] [datetime2](7) NULL,
    [LockedAt] [datetime2](7) NULL,
    [LastError] [nvarchar](2000) COLLATE Latin1_General_CI_AS NULL,
    [CreatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_OptionOfferMailOutbox_CreatedAt] DEFAULT (sysutcdatetime()),
    [UpdatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_OptionOfferMailOutbox_UpdatedAt] DEFAULT (sysutcdatetime()),
    [StockPositionKey] [nvarchar](64) COLLATE Latin1_General_CI_AS NULL,
    [TempOfferId] [int] NULL,
    CONSTRAINT [PK_OptionOfferMailOutbox] PRIMARY KEY CLUSTERED ([Id] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.tbl_Temp_Aktivitaet',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[tbl_Temp_Aktivitaet] (
    [Id] [bigint] IDENTITY(1,1) NOT NULL,
    [OptionOfferMailId] [bigint] NOT NULL,
    [CompanyId] [int] NOT NULL,
    [CustomerNumber] [nvarchar](10) COLLATE Latin1_General_CI_AS NOT NULL,
    [ActivityDate] [datetime2](7) NOT NULL,
    [EmployeeCode] [nvarchar](3) COLLATE Latin1_General_CI_AS NOT NULL,
    [Description] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NOT NULL,
    [Status] [nvarchar](20) COLLATE Latin1_General_CI_AS NOT NULL CONSTRAINT [DF_tbl_Temp_Aktivitaet_Status] DEFAULT (N''pending''),
    [BmsActivityId] [int] NULL,
    [ImportedAt] [datetime2](7) NULL,
    [LastError] [nvarchar](2000) COLLATE Latin1_General_CI_AS NULL,
    [CreatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_tbl_Temp_Aktivitaet_CreatedAt] DEFAULT (sysutcdatetime()),
    [UpdatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_tbl_Temp_Aktivitaet_UpdatedAt] DEFAULT (sysutcdatetime()),
    CONSTRAINT [PK_tbl_Temp_Aktivitaet] PRIMARY KEY CLUSTERED ([Id] ASC),
    CONSTRAINT [UQ_tbl_Temp_Aktivitaet_OptionOfferMail] UNIQUE NONCLUSTERED ([OptionOfferMailId] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.OptionOfferDocument',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[OptionOfferDocument] (
    [OptionOfferMailId] [bigint] NOT NULL,
    [OfferJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NOT NULL,
    [BmsDocumentJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    CONSTRAINT [PK_OptionOfferDocument] PRIMARY KEY CLUSTERED ([OptionOfferMailId] ASC)
);');
 END;

 IF OBJECT_ID(N'BMSApp.ContactCreationOperation',N'U') IS NULL
 BEGIN
  EXEC(N'CREATE TABLE [BMSApp].[ContactCreationOperation] (
    [OperationId] [uniqueidentifier] NOT NULL,
    [UserId] [nvarchar](100) COLLATE Latin1_General_CI_AS NOT NULL,
    [Mandant] [nvarchar](10) COLLATE Latin1_General_CI_AS NOT NULL,
    [CustomerNumber] [nvarchar](10) COLLATE Latin1_General_CI_AS NOT NULL,
    [RequestHash] [char](64) COLLATE Latin1_General_CI_AS NOT NULL,
    [InputJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NOT NULL,
    [RequestJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NOT NULL,
    [ResponseJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL,
    [Status] [nvarchar](20) COLLATE Latin1_General_CI_AS NOT NULL,
    [HttpStatus] [int] NULL,
    [ContactId] [int] NULL,
    [ErpOperationId] [nvarchar](100) COLLATE Latin1_General_CI_AS NULL,
    [AttemptCount] [int] NOT NULL CONSTRAINT [DF_ContactCreationOperation_AttemptCount] DEFAULT ((0)),
    [LockedAt] [datetime2](7) NULL,
    [CreatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_ContactCreationOperation_CreatedAt] DEFAULT (sysutcdatetime()),
    [UpdatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_ContactCreationOperation_UpdatedAt] DEFAULT (sysutcdatetime()),
    CONSTRAINT [PK_ContactCreationOperation] PRIMARY KEY CLUSTERED ([OperationId])
);');
 END;

 -- Add optional position links to existing installations before checking their columns.
 IF COL_LENGTH(N'BMSApp.tbl_Temp_Ang_Position',N'tagp_source_supplier_id') IS NULL
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Ang_Position] ADD [tagp_source_supplier_id] [nvarchar](50) COLLATE Latin1_General_CI_AS NULL;');
 IF COL_LENGTH(N'BMSApp.tbl_Temp_Ang_Position',N'tagp_source_be_number') IS NULL
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Ang_Position] ADD [tagp_source_be_number] [nvarchar](17) COLLATE Latin1_General_CI_AS NULL;');
 IF COL_LENGTH(N'BMSApp.tbl_Temp_Best_Position',N'tbp_bms_position_id') IS NULL
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Best_Position] ADD [tbp_bms_position_id] [nvarchar](17) COLLATE Latin1_General_CI_AS NULL;');
 IF COL_LENGTH(N'BMSApp.tbl_Temp_Auftrag',N'ta_procurement_request_id') IS NULL
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Auftrag] ADD [ta_procurement_request_id] [nvarchar](36) COLLATE Latin1_General_CI_AS NULL;');
 IF COL_LENGTH(N'BMSApp.tbl_Temp_Auftrag',N'ta_procurement_notified_at') IS NULL
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Auftrag] ADD [ta_procurement_notified_at] [datetime2](7) NULL;');
 IF COL_LENGTH(N'BMSApp.tbl_Temp_Ang_Position',N'tagp_option_position_id') IS NULL
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Ang_Position] ADD [tagp_option_position_id] [int] NULL;');
 IF COL_LENGTH(N'BMSApp.tbl_Temp_Ang_Position',N'tagp_order_position_id') IS NULL
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Ang_Position] ADD [tagp_order_position_id] [int] NULL;');
 IF COL_LENGTH(N'BMSApp.tbl_Temp_Auf_Position',N'tap_purchase_position_id') IS NULL
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Auf_Position] ADD [tap_purchase_position_id] [int] NULL;');
 IF COL_LENGTH(N'BMSApp.tbl_Temp_Auf_Position',N'tap_offer_position_id') IS NULL
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Auf_Position] ADD [tap_offer_position_id] [int] NULL;');
 IF COL_LENGTH(N'BMSApp.tbl_Temp_Auf_Position',N'tap_option_position_id') IS NULL
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Auf_Position] ADD [tap_option_position_id] [int] NULL;');
 IF COL_LENGTH(N'BMSApp.tbl_Temp_Best_Position',N'tbp_order_position_id') IS NULL
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Best_Position] ADD [tbp_order_position_id] [int] NULL;');

 -- Preserve the original option data with each generated purchase attachment.
 IF COL_LENGTH(N'BMSApp.tbl_Temp_Bestellung_Anhang',N'tba_OptionSnapshot') IS NULL
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Bestellung_Anhang] ADD [tba_OptionSnapshot] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL;');
 IF COL_LENGTH(N'BMSApp.tblOptionen',N'op_QuellangebotHash') IS NULL
  EXEC(N'ALTER TABLE [BMSApp].[tblOptionen] ADD [op_QuellangebotHash] [char](64) COLLATE Latin1_General_CI_AS NULL;');
 IF COL_LENGTH(N'BMSApp.tblOptionenPositionen',N'opp_LieferdatenJson') IS NULL
  EXEC(N'ALTER TABLE [BMSApp].[tblOptionenPositionen] ADD [opp_LieferdatenJson] [nvarchar](MAX) COLLATE Latin1_General_CI_AS NULL;');

 -- Use one ERP offer and PDF for every new customer-mail job.
 IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_offer_pdf') IS NULL
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Angebot] ADD [tag_offer_pdf] VARBINARY(MAX) NULL;');
 IF COL_LENGTH(N'BMSApp.OptionOfferMailOutbox',N'StockPositionKey') IS NULL
  EXEC(N'ALTER TABLE [BMSApp].[OptionOfferMailOutbox] ADD [StockPositionKey] NVARCHAR(64) COLLATE Latin1_General_CI_AS NULL;');
 IF COL_LENGTH(N'BMSApp.OptionOfferMailOutbox',N'TempOfferId') IS NULL
  EXEC(N'ALTER TABLE [BMSApp].[OptionOfferMailOutbox] ADD [TempOfferId] INT NULL;');
 IF OBJECT_ID(N'BMSApp.CK_OptionOfferMailOutbox_Source',N'C') IS NOT NULL
  EXEC(N'ALTER TABLE [BMSApp].[OptionOfferMailOutbox] DROP CONSTRAINT [CK_OptionOfferMailOutbox_Source];');
 IF OBJECT_ID(N'BMSApp.UQ_OptionOfferMailOutbox_Customer',N'UQ') IS NOT NULL
  EXEC(N'ALTER TABLE [BMSApp].[OptionOfferMailOutbox] DROP CONSTRAINT [UQ_OptionOfferMailOutbox_Customer];');
 IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'BMSApp.OptionOfferMailOutbox') AND name=N'OptionPositionId' AND is_nullable=0)
 BEGIN
  IF OBJECT_ID(N'BMSApp.FK_OptionOfferMailOutbox_OptionPositionId',N'F') IS NOT NULL
   EXEC(N'ALTER TABLE [BMSApp].[OptionOfferMailOutbox] DROP CONSTRAINT [FK_OptionOfferMailOutbox_OptionPositionId];');
  EXEC(N'ALTER TABLE [BMSApp].[OptionOfferMailOutbox] ALTER COLUMN [OptionPositionId] INT NULL;');
 END;

 -- Fail before adding constraints/indexes to incompatible existing tables.
 DECLARE @expectedColumns NVARCHAR(MAX)=N'[
{"table":"CreditLimitMailOutbox","column":"clm_ID","type":"bigint","length":8,"precision":19,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"CreditLimitMailOutbox","column":"clm_CompanyID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"CreditLimitMailOutbox","column":"clm_CustomerID","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CreditLimitMailOutbox","column":"clm_OrderID","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"CreditLimitMailOutbox","column":"clm_Type","type":"nvarchar","length":80,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CreditLimitMailOutbox","column":"clm_ToRecipients","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CreditLimitMailOutbox","column":"clm_CcRecipients","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CreditLimitMailOutbox","column":"clm_BccRecipients","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CreditLimitMailOutbox","column":"clm_Subject","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CreditLimitMailOutbox","column":"clm_Body","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CreditLimitMailOutbox","column":"clm_ClientMessageID","type":"nvarchar","length":400,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CreditLimitMailOutbox","column":"clm_Status","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CreditLimitMailOutbox","column":"clm_AttemptCount","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"CreditLimitMailOutbox","column":"clm_NextAttemptAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"CreditLimitMailOutbox","column":"clm_LockedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"CreditLimitMailOutbox","column":"clm_LastError","type":"nvarchar","length":4000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CreditLimitMailOutbox","column":"clm_SentAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"CreditLimitMailOutbox","column":"clm_CreateDate","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"CreditLimitMailOutbox","column":"clm_LastModifiedDate","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"CreditLimitMailOutbox","column":"clm_FromAddress","type":"nvarchar","length":640,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CreditLimitMailOutbox","column":"clm_FromDisplayName","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CreditLimitRequestState","column":"clrs_ID","type":"bigint","length":8,"precision":19,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"CreditLimitRequestState","column":"clrs_CompanyID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"CreditLimitRequestState","column":"clrs_CustomerID","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CreditLimitRequestState","column":"clrs_LastRequestedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"CreditLimitRequestState","column":"clrs_LastRequestedLimit","type":"decimal","length":9,"precision":18,"scale":2,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"CreditLimitRequestState","column":"clrs_LastExposureAmount","type":"decimal","length":9,"precision":18,"scale":2,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"CreditLimitRequestState","column":"clrs_LastCreditMailStatus","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CreditLimitRequestState","column":"clrs_LastCreditMailOutboxID","type":"bigint","length":8,"precision":19,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"CreditLimitRequestState","column":"clrs_LastCreditClientMessageID","type":"nvarchar","length":400,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CreditLimitRequestState","column":"clrs_LastBankReminderAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"CreditLimitRequestState","column":"clrs_LastBankReminderStatus","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CreditLimitRequestState","column":"clrs_LastBankReminderOutboxID","type":"bigint","length":8,"precision":19,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"CreditLimitRequestState","column":"clrs_CreateDate","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"CreditLimitRequestState","column":"clrs_LastModifiedDate","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"CustomerCreation","column":"OperationId","type":"uniqueidentifier","length":16,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"CustomerCreation","column":"UserId","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreation","column":"UserShortCode","type":"nvarchar","length":20,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreation","column":"TargetCompanyId","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"CustomerCreation","column":"TargetMandant","type":"nvarchar","length":20,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreation","column":"StammMandant","type":"nvarchar","length":20,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreation","column":"RequestHash","type":"char","length":64,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreation","column":"PrivatePerson","type":"bit","length":1,"precision":1,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"CustomerCreation","column":"CustomerNumber","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreation","column":"CustomerName","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreation","column":"CountryIso","type":"nvarchar","length":4,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreation","column":"ErpOperationId","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreation","column":"Status","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreation","column":"HttpStatus","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"CustomerCreation","column":"ErrorCode","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreation","column":"AttemptCount","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"CustomerCreation","column":"LockedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"CustomerCreation","column":"CreatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"CustomerCreation","column":"UpdatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"CustomerCreationMandant","column":"OperationId","type":"uniqueidentifier","length":16,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"CustomerCreationMandant","column":"Mandant","type":"nvarchar","length":20,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreationMandant","column":"Status","type":"nvarchar","length":60,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreationMandant","column":"CustomerNumber","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreationMandant","column":"ResultJson","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreationRollback","column":"RollbackId","type":"uniqueidentifier","length":16,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"CustomerCreationRollback","column":"OperationId","type":"uniqueidentifier","length":16,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"CustomerCreationRollback","column":"Mandant","type":"nvarchar","length":20,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreationRollback","column":"StartedByUserId","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreationRollback","column":"StartedByShortCode","type":"nvarchar","length":20,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreationRollback","column":"LastActorUserId","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreationRollback","column":"LastActorShortCode","type":"nvarchar","length":20,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreationRollback","column":"Reason","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreationRollback","column":"PreviewJson","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreationRollback","column":"ResponseJson","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreationRollback","column":"Status","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreationRollback","column":"HttpStatus","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"CustomerCreationRollback","column":"ErrorCode","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreationRollback","column":"AttemptCount","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"CustomerCreationRollback","column":"LockedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"CustomerCreationRollback","column":"CreatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"CustomerCreationRollback","column":"UpdatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"CustomerCreationSnapshot","column":"Id","type":"bigint","length":8,"precision":19,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"CustomerCreationSnapshot","column":"OperationId","type":"uniqueidentifier","length":16,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"CustomerCreationSnapshot","column":"Kind","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreationSnapshot","column":"DataJson","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"CustomerCreationSnapshot","column":"CreatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"DailyVlMailOutbox","column":"vld_ID","type":"bigint","length":8,"precision":19,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"DailyVlMailOutbox","column":"vld_RunDate","type":"date","length":3,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"DailyVlMailOutbox","column":"vld_CompanyID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"DailyVlMailOutbox","column":"vld_CompanyName","type":"nvarchar","length":400,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"DailyVlMailOutbox","column":"vld_CompanyShortName","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"DailyVlMailOutbox","column":"vld_RecipientsJson","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"DailyVlMailOutbox","column":"vld_Subject","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"DailyVlMailOutbox","column":"vld_Body","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"DailyVlMailOutbox","column":"vld_Status","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"DailyVlMailOutbox","column":"vld_AttemptCount","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"DailyVlMailOutbox","column":"vld_NextAttemptAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"DailyVlMailOutbox","column":"vld_LockedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"DailyVlMailOutbox","column":"vld_LastError","type":"nvarchar","length":4000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"DailyVlMailOutbox","column":"vld_SentAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"DailyVlMailOutbox","column":"vld_CreateDate","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"DailyVlMailOutbox","column":"vld_LastModifiedDate","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"DeliveryAddressOperation","column":"OperationId","type":"uniqueidentifier","length":16,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"DeliveryAddressOperation","column":"UserId","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"DeliveryAddressOperation","column":"Mandant","type":"nvarchar","length":20,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"DeliveryAddressOperation","column":"CustomerNumber","type":"nvarchar","length":20,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"DeliveryAddressOperation","column":"RequestHash","type":"char","length":64,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"DeliveryAddressOperation","column":"InputJson","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"DeliveryAddressOperation","column":"RequestJson","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"DeliveryAddressOperation","column":"ResponseJson","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"DeliveryAddressOperation","column":"Status","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"DeliveryAddressOperation","column":"HttpStatus","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"DeliveryAddressOperation","column":"AddressId","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"DeliveryAddressOperation","column":"ErpOperationId","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"DeliveryAddressOperation","column":"AttemptCount","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"DeliveryAddressOperation","column":"LockedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"DeliveryAddressOperation","column":"CreatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"DeliveryAddressOperation","column":"UpdatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"OrderMailOutbox","column":"om_ID","type":"bigint","length":8,"precision":19,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"OrderMailOutbox","column":"om_OrderID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"OrderMailOutbox","column":"om_CompanyID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"OrderMailOutbox","column":"om_Recipient","type":"nvarchar","length":640,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OrderMailOutbox","column":"om_RecipientSource","type":"nvarchar","length":60,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OrderMailOutbox","column":"om_Subject","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OrderMailOutbox","column":"om_Body","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OrderMailOutbox","column":"om_Status","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OrderMailOutbox","column":"om_AttemptCount","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"OrderMailOutbox","column":"om_NextAttemptAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"OrderMailOutbox","column":"om_LockedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"OrderMailOutbox","column":"om_LastError","type":"nvarchar","length":4000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OrderMailOutbox","column":"om_SentAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"OrderMailOutbox","column":"om_CreateDate","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"OrderMailOutbox","column":"om_LastModifiedDate","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"OrderMailOutbox","column":"om_FromAddress","type":"nvarchar","length":640,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OrderMailOutbox","column":"om_FromDisplayName","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OrderMailOutbox","column":"om_OnBehalfOfAddress","type":"nvarchar","length":640,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OrderMailOutbox","column":"om_OnBehalfOfDisplayName","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OrderReminderState","column":"ors_ID","type":"bigint","length":8,"precision":19,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"OrderReminderState","column":"ors_UserEmail","type":"nvarchar","length":640,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OrderReminderState","column":"ors_UserShortCode","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OrderReminderState","column":"ors_LastCheckedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"OrderReminderState","column":"ors_NextCheckAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"OrderReminderState","column":"ors_LastNotifiedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"OrderReminderState","column":"ors_LastOpenOrderCount","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"OrderReminderState","column":"ors_LastChannel","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OrderReminderState","column":"ors_LockedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"OrderReminderState","column":"ors_LastError","type":"nvarchar","length":4000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OrderReminderState","column":"ors_CreatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"OrderReminderState","column":"ors_UpdatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"PurchaseOrderCsMailOutbox","column":"pcom_ID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"PurchaseOrderCsMailOutbox","column":"pcom_PurchaseOrderID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"PurchaseOrderCsMailOutbox","column":"pcom_CompanyID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"PurchaseOrderCsMailOutbox","column":"pcom_Recipient","type":"nvarchar","length":2000,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"PurchaseOrderCsMailOutbox","column":"pcom_RecipientSource","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"PurchaseOrderCsMailOutbox","column":"pcom_Subject","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"PurchaseOrderCsMailOutbox","column":"pcom_Body","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"PurchaseOrderCsMailOutbox","column":"pcom_Status","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"PurchaseOrderCsMailOutbox","column":"pcom_AttemptCount","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"PurchaseOrderCsMailOutbox","column":"pcom_NextAttemptAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"PurchaseOrderCsMailOutbox","column":"pcom_LockedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"PurchaseOrderCsMailOutbox","column":"pcom_LastError","type":"nvarchar","length":4000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"PurchaseOrderCsMailOutbox","column":"pcom_SentAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"PurchaseOrderCsMailOutbox","column":"pcom_CreateDate","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"PurchaseOrderCsMailOutbox","column":"pcom_LastModifiedDate","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"PurchaseOrderMailOutbox","column":"pom_ID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"PurchaseOrderMailOutbox","column":"pom_PurchaseOrderID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"PurchaseOrderMailOutbox","column":"pom_CompanyID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"PurchaseOrderMailOutbox","column":"pom_Recipient","type":"nvarchar","length":2000,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"PurchaseOrderMailOutbox","column":"pom_RecipientSource","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"PurchaseOrderMailOutbox","column":"pom_Subject","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"PurchaseOrderMailOutbox","column":"pom_Body","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"PurchaseOrderMailOutbox","column":"pom_Status","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"PurchaseOrderMailOutbox","column":"pom_AttemptCount","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"PurchaseOrderMailOutbox","column":"pom_NextAttemptAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"PurchaseOrderMailOutbox","column":"pom_LockedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"PurchaseOrderMailOutbox","column":"pom_LastError","type":"nvarchar","length":4000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"PurchaseOrderMailOutbox","column":"pom_SentAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"PurchaseOrderMailOutbox","column":"pom_CreateDate","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"PurchaseOrderMailOutbox","column":"pom_LastModifiedDate","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"PushMandantSetting","column":"pms_ID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"PushMandantSetting","column":"pms_UserEmail","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"PushMandantSetting","column":"pms_CompanyId","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"PushMandantSetting","column":"pms_Mandant","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"PushMandantSetting","column":"pms_Enabled","type":"bit","length":1,"precision":1,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"PushMandantSetting","column":"pms_CreatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"PushMandantSetting","column":"pms_UpdatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"PushSubscription","column":"ps_ID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"PushSubscription","column":"ps_UserEmail","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"PushSubscription","column":"ps_Endpoint","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"PushSubscription","column":"ps_P256DH","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"PushSubscription","column":"ps_Auth","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"PushSubscription","column":"ps_UserAgent","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"PushSubscription","column":"ps_Language","type":"nvarchar","length":20,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"PushSubscription","column":"ps_IsActive","type":"bit","length":1,"precision":1,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"PushSubscription","column":"ps_CreatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"PushSubscription","column":"ps_UpdatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"PushSubscription","column":"ps_LastSeenAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Ang_Position","column":"tagp_id","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"tbl_Temp_Ang_Position","column":"tagp_offer_id","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Ang_Position","column":"tagp_line_no","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Ang_Position","column":"tagp_line_key","type":"uniqueidentifier","length":16,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Ang_Position","column":"tagp_article_index","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Ang_Position","column":"tagp_article","type":"nvarchar","length":150,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Ang_Position","column":"tagp_master_article","type":"nvarchar","length":150,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Ang_Position","column":"tagp_quantity","type":"decimal","length":9,"precision":18,"scale":3,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Ang_Position","column":"tagp_unit","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Ang_Position","column":"tagp_price","type":"decimal","length":9,"precision":18,"scale":4,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Ang_Position","column":"tagp_price_basis","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Ang_Position","column":"tagp_total","type":"decimal","length":9,"precision":18,"scale":2,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Ang_Position","column":"tagp_description","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Ang_Position","column":"tagp_alternative_text","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Ang_Position","column":"tagp_delivery_date","type":"date","length":3,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Ang_Position","column":"tagp_delivery_text","type":"nvarchar","length":2000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Ang_Position","column":"tagp_sample","type":"bit","length":1,"precision":1,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Ang_Position","column":"tagp_rejected","type":"bit","length":1,"precision":1,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Ang_Position","column":"tagp_reserve","type":"bit","length":1,"precision":1,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Ang_Position","column":"tagp_be_number","type":"nvarchar","length":34,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Ang_Position","column":"tagp_warehouse_id","type":"nvarchar","length":12,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Ang_Position","column":"tagp_source_supplier_id","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Ang_Position","column":"tagp_source_be_number","type":"nvarchar","length":34,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Ang_Position","column":"tagp_reserve_quantity","type":"decimal","length":9,"precision":18,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Ang_Position","column":"tagp_reserve_until","type":"date","length":3,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Ang_Position","column":"tagp_reservation_version","type":"binary","length":8,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Ang_Position","column":"tagp_valuta_date","type":"date","length":3,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Ang_Position","column":"tagp_cost_price","type":"decimal","length":9,"precision":18,"scale":4,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Ang_Position","column":"tagp_wpz_original","type":"bit","length":1,"precision":1,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Ang_Position","column":"tagp_wpz_comment","type":"nvarchar","length":2000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Angebot","column":"tag_id","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_company_id","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_created_by","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Angebot","column":"tag_created_at","type":"datetime2","length":7,"precision":23,"scale":3,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_modified_by","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Angebot","column":"tag_modified_at","type":"datetime2","length":7,"precision":23,"scale":3,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_client_request_id","type":"uniqueidentifier","length":16,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_copy_source_id","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_customer_id","type":"nvarchar","length":20,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Angebot","column":"tag_customer_name","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Angebot","column":"tag_customer_address","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Angebot","column":"tag_contact_id","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_contact","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Angebot","column":"tag_department","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Angebot","column":"tag_offer_date","type":"date","length":3,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_language","type":"nvarchar","length":4,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Angebot","column":"tag_inquiry_date","type":"date","length":3,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_inquiry_via","type":"nvarchar","length":30,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Angebot","column":"tag_customer_reference","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Angebot","column":"tag_title","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Angebot","column":"tag_valid_until","type":"date","length":3,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_currency","type":"nvarchar","length":6,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Angebot","column":"tag_payment_id","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_payment_text","type":"nvarchar","length":2000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Angebot","column":"tag_delivery_terms","type":"nvarchar","length":500,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Angebot","column":"tag_packaging","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Angebot","column":"tag_intro","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Angebot","column":"tag_closing_text","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Angebot","column":"tag_internal_note","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Angebot","column":"tag_discount_percent","type":"decimal","length":5,"precision":7,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_discount_amount","type":"decimal","length":9,"precision":18,"scale":2,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_vat_percent","type":"decimal","length":5,"precision":7,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_net_amount","type":"decimal","length":9,"precision":18,"scale":2,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_subtotal","type":"decimal","length":9,"precision":18,"scale":2,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_vat_amount","type":"decimal","length":9,"precision":18,"scale":2,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_total_amount","type":"decimal","length":9,"precision":18,"scale":2,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_print_totals","type":"bit","length":1,"precision":1,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_status","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_bms_offer_number","type":"nvarchar","length":34,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Angebot","column":"tag_released_at","type":"datetime2","length":7,"precision":23,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_return_comment","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Angebot","column":"tag_version","type":"timestamp","length":8,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_special_payment_condition","type":"bit","length":1,"precision":1,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_delivery_terms_id","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_packaging_id","type":"smallint","length":2,"precision":5,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_delivery_address_id","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_delivery_address","type":"nvarchar","length":2000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Angebot","column":"tag_delivery_address_manual","type":"bit","length":1,"precision":1,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auf_Position","column":"tap_id","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"tbl_Temp_Auf_Position","column":"tap_ta_id","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auf_Position","column":"tap_line_no","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auf_Position","column":"tap_be_number","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auf_Position","column":"tap_article","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auf_Position","column":"tap_amount_in_kg","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auf_Position","column":"tap_warehouse","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auf_Position","column":"tap_price","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auf_Position","column":"tap_reservation_in_kg","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auf_Position","column":"tap_reservation_date","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auf_Position","column":"tap_about","type":"nvarchar","length":8000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auf_Position","column":"tap_mfi","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auf_Position","column":"tap_CreatedBy","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auf_Position","column":"tap_CreateDate","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auf_Position","column":"tap_LastModifiedBy","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auf_Position","column":"tap_LastModifiedDate","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auf_Position","column":"tap_ep","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auf_Position","column":"tap_wpz_original","type":"bit","length":1,"precision":1,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auf_Position","column":"tap_wpz_comment","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auf_Position","column":"tap_wpz_id","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auf_Position","column":"tap_delivery_date","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auf_Position","column":"tap_Verpackungsart_Gewechselt","type":"bit","length":1,"precision":1,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auf_Position","column":"tap_Verpackungsart","type":"nvarchar","length":110,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auf_Position","column":"tap_Artikelname_Original","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auf_Position","column":"tap_Artikelname_Gewechselt","type":"bit","length":1,"precision":1,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auf_Position","column":"tap_Verpackungsart_id","type":"smallint","length":2,"precision":5,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auf_Position","column":"tap_Artikelindex","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auf_Position","column":"tap_ValutaDatum","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auf_Position","column":"tap_is_working_price","type":"bit","length":1,"precision":1,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag","column":"ta_id","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag","column":"ta_company_id","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag","column":"ta_ClientReferenceId","type":"nvarchar","length":32,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auftrag","column":"ta_client_name","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auftrag","column":"ta_client_address","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auftrag","column":"ta_client_representative","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auftrag","column":"ta_comment","type":"nvarchar","length":5110,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auftrag","column":"ta_completed","type":"bit","length":1,"precision":1,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag","column":"ta_CreatedBy","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auftrag","column":"ta_CreateDate","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag","column":"ta_LastModifiedBy","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auftrag","column":"ta_LastModifiedDate","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag","column":"ta_PassedTo","type":"nvarchar","length":8000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auftrag","column":"ta_ReceivedFrom","type":"nvarchar","length":8000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auftrag","column":"ta_PassedToUserId","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag","column":"ta_ReceivedFromUserId","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag","column":"ta_IsConfirmed","type":"bit","length":1,"precision":1,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag","column":"ta_packaging_type","type":"nvarchar","length":110,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auftrag","column":"ta_delivery_address","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auftrag","column":"ta_delivery_address_changed","type":"bit","length":1,"precision":1,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag","column":"ta_special_payment_condition","type":"bit","length":1,"precision":1,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag","column":"ta_special_payment_text","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auftrag","column":"ta_special_payment_id","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag","column":"ta_delivery_type_id","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag","column":"ta_delivery_type","type":"nvarchar","length":600,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auftrag","column":"ta_Attachment","type":"varbinary","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag","column":"ta_AttachmentFileName","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auftrag","column":"ta_AttachmentMimeType","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auftrag","column":"ta_Auftragsindex","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auftrag","column":"ta_KundenAuftragsnummer","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auftrag","column":"ta_closing_date","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag","column":"ta_CompletedBy","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auftrag","column":"ta_Status","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag","column":"ta_return_comment","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auftrag","column":"ta_delivery_address_id","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag","column":"ta_client_representative_id","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag","column":"ta_packaging_type_id","type":"smallint","length":2,"precision":5,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag_Anhang","column":"tfa_ID","type":"bigint","length":8,"precision":19,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag_Anhang","column":"tfa_ta_id","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag_Anhang","column":"tfa_FileName","type":"nvarchar","length":2048,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auftrag_Anhang","column":"tfa_MimeType","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auftrag_Anhang","column":"tfa_Content","type":"varbinary","length":-1,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag_Anhang","column":"tfa_SizeBytes","type":"bigint","length":8,"precision":19,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag_Anhang","column":"tfa_IsLegacy","type":"bit","length":1,"precision":1,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag_Anhang","column":"tfa_CreatedBy","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auftrag_Anhang","column":"tfa_CreatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag_Anhang","column":"tfa_DeletedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auftrag_Anhang","column":"tfa_DeletedBy","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Best_Position","column":"tbp_id","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"tbl_Temp_Best_Position","column":"tbp_tb_id","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Best_Position","column":"tbp_line_no","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Best_Position","column":"tbp_article_index","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Best_Position","column":"tbp_article","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Best_Position","column":"tbp_amount","type":"decimal","length":9,"precision":18,"scale":3,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Best_Position","column":"tbp_unit","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Best_Position","column":"tbp_purchase_price","type":"decimal","length":9,"precision":18,"scale":4,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Best_Position","column":"tbp_currency","type":"nvarchar","length":12,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Best_Position","column":"tbp_requested_delivery_date","type":"date","length":3,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Best_Position","column":"tbp_reserved_for","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Best_Position","column":"tbp_comment","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Best_Position","column":"tbp_source_bestellindex","type":"nvarchar","length":68,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Best_Position","column":"tbp_source_position_id","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Best_Position","column":"tbp_source_order_date","type":"date","length":3,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Best_Position","column":"tbp_created_by","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Best_Position","column":"tbp_create_date","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Best_Position","column":"tbp_last_modified_by","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Best_Position","column":"tbp_last_modified_date","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Best_Position","column":"tbp_original_packaging_type","type":"nvarchar","length":400,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Best_Position","column":"tbp_original_packaging_type_id","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Best_Position","column":"tbp_packaging_type_changed","type":"bit","length":1,"precision":1,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Best_Position","column":"OptionID","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Best_Position","column":"OptionPositionID","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Best_Position","column":"tbp_option_mfi_acknowledged","type":"bit","length":1,"precision":1,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Bestellung","column":"tb_id","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"tbl_Temp_Bestellung","column":"tb_company_id","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Bestellung","column":"tb_client_request_id","type":"uniqueidentifier","length":16,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Bestellung","column":"tb_supplier_id","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Bestellung","column":"tb_supplier_name","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Bestellung","column":"tb_supplier_address","type":"nvarchar","length":2000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Bestellung","column":"tb_supplier_contact","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Bestellung","column":"tb_payment_condition_changed","type":"bit","length":1,"precision":1,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Bestellung","column":"tb_payment_condition_id","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Bestellung","column":"tb_payment_condition_text","type":"nvarchar","length":2000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Bestellung","column":"tb_delivery_term_id","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Bestellung","column":"tb_delivery_term_text","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Bestellung","column":"tb_packaging_type","type":"nvarchar","length":400,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Bestellung","column":"tb_loading_location_source","type":"nvarchar","length":60,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Bestellung","column":"tb_loading_location_id","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Bestellung","column":"tb_loading_location_text","type":"nvarchar","length":2000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Bestellung","column":"tb_loading_location_changed","type":"bit","length":1,"precision":1,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Bestellung","column":"tb_comment","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Bestellung","column":"tb_status","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Bestellung","column":"tb_bestellindex","type":"nvarchar","length":68,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Bestellung","column":"tb_supplier_mail_status","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Bestellung","column":"tb_supplier_mail_last_error","type":"nvarchar","length":4000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Bestellung","column":"tb_supplier_mail_sent_at","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Bestellung","column":"tb_return_comment","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Bestellung","column":"tb_created_by","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Bestellung","column":"tb_create_date","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Bestellung","column":"tb_last_modified_by","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Bestellung","column":"tb_last_modified_date","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Bestellung","column":"tb_completed_by","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Bestellung","column":"tb_closing_date","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Bestellung","column":"tb_packaging_type_id","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Bestellung_Anhang","column":"tba_ID","type":"bigint","length":8,"precision":19,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"tbl_Temp_Bestellung_Anhang","column":"tba_tb_id","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Bestellung_Anhang","column":"tba_FileName","type":"nvarchar","length":2048,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Bestellung_Anhang","column":"tba_MimeType","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Bestellung_Anhang","column":"tba_Content","type":"varbinary","length":-1,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Bestellung_Anhang","column":"tba_SizeBytes","type":"bigint","length":8,"precision":19,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Bestellung_Anhang","column":"tba_CreatedBy","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Bestellung_Anhang","column":"tba_CreatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Bestellung_Anhang","column":"tba_DeletedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Bestellung_Anhang","column":"tba_DeletedBy","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Bestellung_Anhang","column":"tba_OptionSnapshot","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_id","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"tblOptionen","column":"op_MandantID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionen","column":"op_LieferantID","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_Lieferantenkennung","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_Lieferantenname","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_Angebotsnummer","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_KundennummerLieferant","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_Angebotsdatum","type":"date","length":3,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionen","column":"op_EingangAm","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionen","column":"op_GueltigAb","type":"date","length":3,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionen","column":"op_GueltigBis","type":"date","length":3,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionen","column":"op_QuellGueltigBis","type":"date","length":3,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionen","column":"op_Incoterm","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_Ladeort","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_Verpackung","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_Antwortadresse","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_Konditionen","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_Kommentar","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_Nachverhandelbar","type":"nvarchar","length":24,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_NachverhandelbarQuelle","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_QuelleTyp","type":"nvarchar","length":60,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_QuelleSchluessel","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_QuellangebotHash","type":"char","length":64,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_QuelleDateiname","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_QuelleMailtext","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_QuelleMailformat","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_QuelleDatei","type":"varbinary","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionen","column":"op_QuelleDateiMime","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_IstDemo","type":"bit","length":1,"precision":1,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionen","column":"op_Pruefstatus","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_Geschaeftsstatus","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_GeloeschtAm","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionen","column":"op_GeloeschtVon","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_ErstelltVon","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_ErstelltAm","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionen","column":"op_GeaendertVon","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_GeaendertAm","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionen","column":"op_DuplikatSchluessel","type":"char","length":64,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_QuelleMailbilderJson","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionen","column":"op_AnbieterKontaktJson","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenAbgleich","column":"oab_id","type":"bigint","length":8,"precision":19,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"tblOptionenAbgleich","column":"oab_opp_id","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenAbgleich","column":"oab_MandantID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenAbgleich","column":"oab_EingabeHash","type":"char","length":64,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenAbgleich","column":"oab_KontextHash","type":"char","length":64,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenAbgleich","column":"oab_QuelldatenGeaendertAm","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenAbgleich","column":"oab_AlgorithmusVersion","type":"nvarchar","length":60,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenAbgleich","column":"oab_Kunststoff","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenAbgleich","column":"oab_KunststoffUntergruppe","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenAbgleich","column":"oab_KategorieQuelle","type":"nvarchar","length":60,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenAbgleich","column":"oab_ArtikelindexVorschlag","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenAbgleich","column":"oab_ArtikelnameVorschlag","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenAbgleich","column":"oab_VorschlagGrund","type":"nvarchar","length":4000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenAbgleich","column":"oab_KandidatenAnzahl","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenAbgleich","column":"oab_MerkmaleJson","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenAbgleich","column":"oab_BerechnetAm","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenAbgleich","column":"oab_AnforderungRevision","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenAbgleich","column":"oab_MesswerteVorbereitet","type":"bit","length":1,"precision":1,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenAbgleich","column":"oab_MFI","type":"decimal","length":9,"precision":18,"scale":6,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenAbgleich","column":"oab_MFI_bis","type":"decimal","length":9,"precision":18,"scale":6,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenAbgleich","column":"oab_MFI_Pruefmethode","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenAbgleich","column":"oab_Dichte","type":"decimal","length":9,"precision":18,"scale":6,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenAbgleich","column":"oab_DichteEinheit","type":"nvarchar","length":60,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenAbgleich","column":"oab_Messwertquelle","type":"nvarchar","length":400,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenAbgleichAuftrag","column":"oaa_MandantID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenAbgleichAuftrag","column":"oaa_Revision","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenAbgleichAuftrag","column":"oaa_Status","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenAbgleichAuftrag","column":"oaa_Grund","type":"nvarchar","length":400,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenAbgleichAuftrag","column":"oaa_GesperrtBis","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenAbgleichAuftrag","column":"oaa_NaechsterVersuchAm","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenAbgleichAuftrag","column":"oaa_Versuche","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenAbgleichAuftrag","column":"oaa_Fehler","type":"nvarchar","length":4000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenAbgleichAuftrag","column":"oaa_GeaendertAm","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenAbgleichAuftrag","column":"oaa_LetzterErfolgAm","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenAbgleichAuftrag","column":"oaa_GesperrtVon","type":"uniqueidentifier","length":16,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenArtikelKandidaten","column":"oak_oab_id","type":"bigint","length":8,"precision":19,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenArtikelKandidaten","column":"oak_Artikelindex","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenArtikelKandidaten","column":"oak_Artikelname","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenArtikelKandidaten","column":"oak_Rang","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenArtikelKandidaten","column":"oak_Punkte","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenArtikelKandidaten","column":"oak_DatenJson","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenArtikelMapping","column":"oam_id","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"tblOptionenArtikelMapping","column":"oam_MandantID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenArtikelMapping","column":"oam_Lieferantenkennung","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenArtikelMapping","column":"oam_Lieferantenname","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenArtikelMapping","column":"oam_Artikelnummer_Lieferant","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenArtikelMapping","column":"oam_Artikelname_Lieferant","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenArtikelMapping","column":"oam_ArtikelnameNorm","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenArtikelMapping","column":"oam_Kunststofftyp","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenArtikelMapping","column":"oam_ZustandNorm","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenArtikelMapping","column":"oam_MFIvon","type":"decimal","length":9,"precision":18,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenArtikelMapping","column":"oam_MFIbis","type":"decimal","length":9,"precision":18,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenArtikelMapping","column":"oam_MFI_Pruefmethode","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenArtikelMapping","column":"oam_Artikelindex","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenArtikelMapping","column":"oam_Artikelname","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenArtikelMapping","column":"oam_Aktiv","type":"bit","length":1,"precision":1,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenArtikelMapping","column":"oam_ErstelltVon","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenArtikelMapping","column":"oam_ErstelltAm","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenArtikelMapping","column":"oam_GeaendertVon","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenArtikelMapping","column":"oam_GeaendertAm","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenArtikelMapping","column":"oam_MerkmaleJson","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenArtikelMapping","column":"oam_AlgorithmusVersion","type":"nvarchar","length":60,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenArtikelMapping","column":"oam_QuellePositionID","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenLieferantenKonto","column":"olk_MandantID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenLieferantenKonto","column":"olk_LieferantenNummer","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenLieferantenKonto","column":"olk_Lieferantenkennung","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenLieferantenKonto","column":"olk_Lieferantenname","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenLieferantenKonto","column":"olk_Aktiv","type":"bit","length":1,"precision":1,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenLieferantenKonto","column":"olk_Hinweis","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenLieferantenRegel","column":"olr_id","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"tblOptionenLieferantenRegel","column":"olr_MandantID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenLieferantenRegel","column":"olr_Lieferantenkennung","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenLieferantenRegel","column":"olr_Alias","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenLieferantenRegel","column":"olr_AbsenderDomain","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenLieferantenRegel","column":"olr_MengeneinheitStandard","type":"nvarchar","length":60,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenLieferantenRegel","column":"olr_PreiseinheitStandard","type":"nvarchar","length":60,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenLieferantenRegel","column":"olr_Begruendung","type":"nvarchar","length":2000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenLieferantenRegel","column":"olr_Aktiv","type":"bit","length":1,"precision":1,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenLieferantenRegel","column":"olr_GeaendertVon","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenLieferantenRegel","column":"olr_GeaendertAm","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenLieferantenRegel","column":"olr_Dokumenttyp","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenLieferantenRegel","column":"olr_BedingungenJson","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenLieferantenRegel","column":"olr_Version","type":"nvarchar","length":60,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenLieferantenRegel","column":"olr_Prioritaet","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenMailEreignis","column":"ome_id","type":"bigint","length":8,"precision":19,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"tblOptionenMailEreignis","column":"ome_omv_id","type":"bigint","length":8,"precision":19,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenMailEreignis","column":"ome_Zeitpunkt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenMailEreignis","column":"ome_Phase","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenMailEreignis","column":"ome_Detail","type":"nvarchar","length":8000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenMailEreignis","column":"ome_ReaderVersion","type":"nvarchar","length":80,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenMailVerarbeitung","column":"omv_id","type":"bigint","length":8,"precision":19,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"tblOptionenMailVerarbeitung","column":"omv_MandantID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenMailVerarbeitung","column":"omv_Postfach","type":"nvarchar","length":640,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenMailVerarbeitung","column":"omv_Schluessel","type":"char","length":64,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenMailVerarbeitung","column":"omv_EwsID","type":"nvarchar","length":2048,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenMailVerarbeitung","column":"omv_MessageID","type":"nvarchar","length":1996,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenMailVerarbeitung","column":"omv_Betreff","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenMailVerarbeitung","column":"omv_Status","type":"nvarchar","length":60,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenMailVerarbeitung","column":"omv_Phase","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenMailVerarbeitung","column":"omv_Versuche","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenMailVerarbeitung","column":"omv_NaechsterVersuchAm","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenMailVerarbeitung","column":"omv_GesperrtBis","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenMailVerarbeitung","column":"omv_Lease","type":"uniqueidentifier","length":16,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenMailVerarbeitung","column":"omv_Fehler","type":"nvarchar","length":8000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenMailVerarbeitung","column":"omv_AngebotIDsJson","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenMailVerarbeitung","column":"omv_ExtraktionJson","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenMailVerarbeitung","column":"omv_ReaderVersion","type":"nvarchar","length":80,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenMailVerarbeitung","column":"omv_ErstelltAm","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenMailVerarbeitung","column":"omv_GeaendertAm","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_id","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_op_id","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_Positionsnummer","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_Artikelnummer_Lieferant","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_Artikelname_Lieferant","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_Artikelindex","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_Artikelname","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_ArtikelindexVorschlag","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_ArtikelnameVorschlag","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_MatchStatus","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_MatchGrund","type":"nvarchar","length":2000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_Kunststofftyp","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_Zustand","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_ZustandNorm","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_Charge","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_MengeVon","type":"decimal","length":9,"precision":18,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_MengeBis","type":"decimal","length":9,"precision":18,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_Mengeneinheit","type":"nvarchar","length":60,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_MengeRohtext","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_MengeVonKg","type":"decimal","length":9,"precision":18,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_MengeBisKg","type":"decimal","length":9,"precision":18,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_PreisRoh","type":"decimal","length":9,"precision":18,"scale":4,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_PreiseinheitRoh","type":"nvarchar","length":60,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_PreisProTonne","type":"decimal","length":9,"precision":18,"scale":4,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_Waehrung","type":"nvarchar","length":12,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_MFI","type":"decimal","length":9,"precision":18,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_MFI_Pruefmethode","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_Dichte","type":"decimal","length":9,"precision":18,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_DichteEinheit","type":"nvarchar","length":60,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_C2","type":"decimal","length":9,"precision":18,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_Eigenschaften","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_Ladehinweis","type":"nvarchar","length":2000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_LieferdatenJson","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_Kommentar","type":"nvarchar","length":2000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_GueltigBis","type":"date","length":3,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_ErstelltVon","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_ErstelltAm","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_GeaendertVon","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_GeaendertAm","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_AktuellerAbgleichID","type":"bigint","length":8,"precision":19,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_LernenAngefordert","type":"bit","length":1,"precision":1,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_ZuordnungRevision","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_LernregelHinweis","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_BestaetigtKunststoff","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_BestaetigtUntergruppe","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_VerpackungRoh","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_MindestabnahmeRoh","type":"decimal","length":9,"precision":18,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_ChargenbestandRoh","type":"decimal","length":9,"precision":18,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_GebindegewichtRohKg","type":"decimal","length":9,"precision":18,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_PalettengewichtRohKg","type":"decimal","length":9,"precision":18,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_Verpackung","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_Verpackungsart_id","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_GebindegewichtKg","type":"decimal","length":9,"precision":18,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_PalettengewichtKg","type":"decimal","length":9,"precision":18,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_MaxLadegewichtKg","type":"decimal","length":9,"precision":18,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_MindestabnahmeKg","type":"decimal","length":9,"precision":18,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_ChargenbestandKg","type":"decimal","length":9,"precision":18,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_LKWAnzahlVon","type":"decimal","length":9,"precision":18,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_LKWAnzahlBis","type":"decimal","length":9,"precision":18,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_Mengenart","type":"nvarchar","length":60,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_MengeneinheitNorm","type":"nvarchar","length":60,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_PreiseinheitNorm","type":"nvarchar","length":60,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_NormalisierungJson","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_NormalisierungVersion","type":"nvarchar","length":60,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_NormalisiertAm","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_QuellaufbereitungJson","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_MFI_bis","type":"decimal","length":9,"precision":18,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_GesamtmengeBestaetigtKg","type":"decimal","length":9,"precision":18,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_MengeBestaetigtQuellHash","type":"varchar","length":64,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_MengeBestaetigtVon","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenPositionen","column":"opp_MengeBestaetigtAm","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_MengeBestaetigtVerpackungsartID","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_MengeBestaetigtTrucks","type":"decimal","length":9,"precision":18,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_GeloeschtAm","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenPositionen","column":"opp_GeloeschtVon","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenReaderLaufzeit","column":"orl_Instanz","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenReaderLaufzeit","column":"orl_ReaderVersion","type":"nvarchar","length":80,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenReaderLaufzeit","column":"orl_MatchingVersion","type":"nvarchar","length":80,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenReaderLaufzeit","column":"orl_PdfVersion","type":"nvarchar","length":80,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenReaderLaufzeit","column":"orl_Heartbeat","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenReaderLaufzeit","column":"orl_Status","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenReaderSteuerung","column":"ors_MandantID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenReaderSteuerung","column":"ors_PausiertBis","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tblOptionenReaderSteuerung","column":"ors_Grund","type":"nvarchar","length":1000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tblOptionenReaderSteuerung","column":"ors_Token","type":"uniqueidentifier","length":16,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"TempOrderReworkPushState","column":"torps_ID","type":"bigint","length":8,"precision":19,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"TempOrderReworkPushState","column":"torps_OrderID","type":"bigint","length":8,"precision":19,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"TempOrderReworkPushState","column":"torps_CompanyID","type":"bigint","length":8,"precision":19,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"TempOrderReworkPushState","column":"torps_LastStatus","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"TempOrderReworkPushState","column":"torps_LastModifiedDate","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"TempOrderReworkPushState","column":"torps_LastReturnComment","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"TempOrderReworkPushState","column":"torps_LastNotifiedComment","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"TempOrderReworkPushState","column":"torps_LastNotifiedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"TempOrderReworkPushState","column":"torps_LockedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"TempOrderReworkPushState","column":"torps_LastCheckedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"TempOrderReworkPushState","column":"torps_LastError","type":"nvarchar","length":4000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"TempOrderReworkPushState","column":"torps_CreatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"TempOrderReworkPushState","column":"torps_UpdatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"Timeline","column":"tl_ID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"Timeline","column":"tl_CreatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"Timeline","column":"tl_Mandant","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"Timeline","column":"tl_MandantKurz","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"Timeline","column":"tl_UserEmail","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"Timeline","column":"tl_UserShortCode","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"Timeline","column":"tl_Type","type":"nvarchar","length":60,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"Timeline","column":"tl_Product","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"Timeline","column":"tl_ProductId","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"Timeline","column":"tl_BeNumber","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"Timeline","column":"tl_AmountKg","type":"decimal","length":9,"precision":18,"scale":3,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"Timeline","column":"tl_Unit","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"Timeline","column":"tl_ReferenceId","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"Timeline","column":"tl_PayloadJson","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"Timeline","column":"tl_CompanyId","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"VlMailOrderState","column":"vmos_ID","type":"bigint","length":8,"precision":19,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"VlMailOrderState","column":"vmos_OrderID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"VlMailOrderState","column":"vmos_CompanyID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"VlMailOrderState","column":"vmos_LastStatus","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"VlMailOrderState","column":"vmos_LastModifiedDate","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"VlMailOrderState","column":"vmos_CreatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"VlMailOrderState","column":"vmos_UpdatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"VlMailOutbox","column":"vmo_ID","type":"bigint","length":8,"precision":19,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"VlMailOutbox","column":"vmo_OrderID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"VlMailOutbox","column":"vmo_CompanyID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"VlMailOutbox","column":"vmo_EventKey","type":"nvarchar","length":400,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"VlMailOutbox","column":"vmo_Recipient","type":"nvarchar","length":640,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"VlMailOutbox","column":"vmo_RecipientSource","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"VlMailOutbox","column":"vmo_Subject","type":"nvarchar","length":510,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"VlMailOutbox","column":"vmo_Body","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"VlMailOutbox","column":"vmo_Status","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"VlMailOutbox","column":"vmo_AttemptCount","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"VlMailOutbox","column":"vmo_NextAttemptAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"VlMailOutbox","column":"vmo_LockedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"VlMailOutbox","column":"vmo_LastError","type":"nvarchar","length":4000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"VlMailOutbox","column":"vmo_SentAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"VlMailOutbox","column":"vmo_CreateDate","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"VlMailOutbox","column":"vmo_LastModifiedDate","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"VlMailOutbox","column":"vmo_FromAddress","type":"nvarchar","length":640,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"VlMailOutbox","column":"vmo_OnBehalfOfAddress","type":"nvarchar","length":640,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"VlMailUserSetting","column":"vms_ID","type":"bigint","length":8,"precision":19,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"VlMailUserSetting","column":"vms_UserEmail","type":"nvarchar","length":640,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"VlMailUserSetting","column":"vms_VlMailsEnabled","type":"bit","length":1,"precision":1,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"VlMailUserSetting","column":"vms_CreatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"VlMailUserSetting","column":"vms_UpdatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"VlMailWorkerState","column":"vmws_Key","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"VlMailWorkerState","column":"vmws_Value","type":"nvarchar","length":400,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"VlMailWorkerState","column":"vmws_CreatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"VlMailWorkerState","column":"vmws_UpdatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"VlSalePushState","column":"vps_ID","type":"bigint","length":8,"precision":19,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"VlSalePushState","column":"vps_OrderID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"VlSalePushState","column":"vps_CompanyID","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"VlSalePushState","column":"vps_OrderIndex","type":"nvarchar","length":80,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"VlSalePushState","column":"vps_SalesRepresentative","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"VlSalePushState","column":"vps_Status","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"VlSalePushState","column":"vps_AttemptCount","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"VlSalePushState","column":"vps_NextAttemptAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"VlSalePushState","column":"vps_LockedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"VlSalePushState","column":"vps_LastError","type":"nvarchar","length":4000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"VlSalePushState","column":"vps_SentAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"VlSalePushState","column":"vps_CreatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"VlSalePushState","column":"vps_UpdatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"OptionOfferMailOutbox","column":"Id","type":"bigint","length":8,"precision":19,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"OptionOfferMailOutbox","column":"CompanyId","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"OptionOfferMailOutbox","column":"OptionPositionId","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"OptionOfferMailOutbox","column":"CustomerNumber","type":"nvarchar","length":20,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OptionOfferMailOutbox","column":"ArticleIndex","type":"nvarchar","length":100,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OptionOfferMailOutbox","column":"ContactId","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"OptionOfferMailOutbox","column":"ContactName","type":"nvarchar","length":400,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OptionOfferMailOutbox","column":"RecipientEmail","type":"nvarchar","length":640,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OptionOfferMailOutbox","column":"SenderCode","type":"nvarchar","length":6,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OptionOfferMailOutbox","column":"SenderName","type":"nvarchar","length":400,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OptionOfferMailOutbox","column":"SenderEmail","type":"nvarchar","length":640,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OptionOfferMailOutbox","column":"SalePricePerTonne","type":"decimal","length":9,"precision":19,"scale":4,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"OptionOfferMailOutbox","column":"Currency","type":"char","length":3,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OptionOfferMailOutbox","column":"IncotermId","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"OptionOfferMailOutbox","column":"IncotermText","type":"nvarchar","length":500,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OptionOfferMailOutbox","column":"Status","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OptionOfferMailOutbox","column":"MailServiceId","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OptionOfferMailOutbox","column":"SentAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"OptionOfferMailOutbox","column":"AttemptCount","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"OptionOfferMailOutbox","column":"NextAttemptAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"OptionOfferMailOutbox","column":"LockedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"OptionOfferMailOutbox","column":"LastError","type":"nvarchar","length":4000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OptionOfferMailOutbox","column":"CreatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"OptionOfferMailOutbox","column":"UpdatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Aktivitaet","column":"Id","type":"bigint","length":8,"precision":19,"scale":0,"nullable":false,"identity":true,"computed":false,"collation":null},
{"table":"tbl_Temp_Aktivitaet","column":"OptionOfferMailId","type":"bigint","length":8,"precision":19,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Aktivitaet","column":"CompanyId","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Aktivitaet","column":"CustomerNumber","type":"nvarchar","length":20,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Aktivitaet","column":"ActivityDate","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Aktivitaet","column":"EmployeeCode","type":"nvarchar","length":6,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Aktivitaet","column":"Description","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Aktivitaet","column":"Status","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Aktivitaet","column":"BmsActivityId","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Aktivitaet","column":"ImportedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Aktivitaet","column":"LastError","type":"nvarchar","length":4000,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Aktivitaet","column":"CreatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Aktivitaet","column":"UpdatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"OptionOfferDocument","column":"OptionOfferMailId","type":"bigint","length":8,"precision":19,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"OptionOfferDocument","column":"OfferJson","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OptionOfferDocument","column":"BmsDocumentJson","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"ContactCreationOperation","column":"OperationId","type":"uniqueidentifier","length":16,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"ContactCreationOperation","column":"UserId","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"ContactCreationOperation","column":"Mandant","type":"nvarchar","length":20,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"ContactCreationOperation","column":"CustomerNumber","type":"nvarchar","length":20,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"ContactCreationOperation","column":"RequestHash","type":"char","length":64,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"ContactCreationOperation","column":"InputJson","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"ContactCreationOperation","column":"RequestJson","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"ContactCreationOperation","column":"ResponseJson","type":"nvarchar","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"ContactCreationOperation","column":"Status","type":"nvarchar","length":40,"precision":0,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"ContactCreationOperation","column":"HttpStatus","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"ContactCreationOperation","column":"ContactId","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"ContactCreationOperation","column":"ErpOperationId","type":"nvarchar","length":200,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"ContactCreationOperation","column":"AttemptCount","type":"int","length":4,"precision":10,"scale":0,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"ContactCreationOperation","column":"LockedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"ContactCreationOperation","column":"CreatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"ContactCreationOperation","column":"UpdatedAt","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":false,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Ang_Position","column":"tagp_order_position_id","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Best_Position","column":"tbp_bms_position_id","type":"nvarchar","length":34,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auftrag","column":"ta_procurement_request_id","type":"nvarchar","length":72,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"tbl_Temp_Auftrag","column":"ta_procurement_notified_at","type":"datetime2","length":8,"precision":27,"scale":7,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Ang_Position","column":"tagp_option_position_id","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auf_Position","column":"tap_purchase_position_id","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auf_Position","column":"tap_offer_position_id","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Auf_Position","column":"tap_option_position_id","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Best_Position","column":"tbp_order_position_id","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"tbl_Temp_Angebot","column":"tag_offer_pdf","type":"varbinary","length":-1,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null},
{"table":"OptionOfferMailOutbox","column":"StockPositionKey","type":"nvarchar","length":128,"precision":0,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":"Latin1_General_CI_AS"},
{"table":"OptionOfferMailOutbox","column":"TempOfferId","type":"int","length":4,"precision":10,"scale":0,"nullable":true,"identity":false,"computed":false,"collation":null}
]';
 IF EXISTS (
  SELECT e.tableName,e.columnName,e.typeName,e.maxLength,e.precisionValue,e.scaleValue,e.nullableValue,e.identityValue,e.computedValue,e.collationName
  FROM OPENJSON(@expectedColumns) WITH(tableName SYSNAME '$.table',columnName SYSNAME '$.column',typeName SYSNAME '$.type',maxLength SMALLINT '$.length',precisionValue TINYINT '$.precision',scaleValue TINYINT '$.scale',nullableValue BIT '$.nullable',identityValue BIT '$.identity',computedValue BIT '$.computed',collationName NVARCHAR(128) '$.collation')e
  EXCEPT
  SELECT t.name,c.name,ty.name,c.max_length,c.precision,c.scale,c.is_nullable,c.is_identity,c.is_computed,c.collation_name
  FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE s.name=N'BMSApp'
 ) THROW 51001,N'Existing BMSApp columns differ from the installation baseline. Restore or upgrade that installation explicitly; no data was changed.',1;

 -- Secondary indexes.
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.CreditLimitMailOutbox') AND name=N'IX_CreditLimitMailOutbox_Pending')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_CreditLimitMailOutbox_Pending] ON [BMSApp].[CreditLimitMailOutbox] ([clm_Status] ASC, [clm_NextAttemptAt] ASC, [clm_ID] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.CreditLimitMailOutbox') AND name=N'IX_CreditLimitMailOutbox_Customer')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_CreditLimitMailOutbox_Customer] ON [BMSApp].[CreditLimitMailOutbox] ([clm_CompanyID] ASC, [clm_CustomerID] ASC, [clm_CreateDate] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.CustomerCreation') AND name=N'IX_CustomerCreation_Target')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_CustomerCreation_Target] ON [BMSApp].[CustomerCreation] ([TargetCompanyId] ASC, [CreatedAt] DESC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.CustomerCreationMandant') AND name=N'IX_CustomerCreationMandant_Customer')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_CustomerCreationMandant_Customer] ON [BMSApp].[CustomerCreationMandant] ([Mandant] ASC, [CustomerNumber] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.CustomerCreationRollback') AND name=N'IX_CustomerCreationRollback_Operation')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_CustomerCreationRollback_Operation] ON [BMSApp].[CustomerCreationRollback] ([OperationId] ASC, [Mandant] ASC, [CreatedAt] DESC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.CustomerCreationSnapshot') AND name=N'IX_CustomerCreationSnapshot_Operation')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_CustomerCreationSnapshot_Operation] ON [BMSApp].[CustomerCreationSnapshot] ([OperationId] ASC, [Id] DESC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.DailyVlMailOutbox') AND name=N'IX_DailyVlMailOutbox_Pending')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_DailyVlMailOutbox_Pending] ON [BMSApp].[DailyVlMailOutbox] ([vld_RunDate] ASC, [vld_Status] ASC, [vld_NextAttemptAt] ASC, [vld_ID] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.DeliveryAddressOperation') AND name=N'IX_DeliveryAddressOperation_Scope')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_DeliveryAddressOperation_Scope] ON [BMSApp].[DeliveryAddressOperation] ([UserId] ASC, [Mandant] ASC, [CustomerNumber] ASC, [CreatedAt] DESC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.OrderMailOutbox') AND name=N'IX_OrderMailOutbox_Pending')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_OrderMailOutbox_Pending] ON [BMSApp].[OrderMailOutbox] ([om_Status] ASC, [om_NextAttemptAt] ASC, [om_ID] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.OrderReminderState') AND name=N'UX_OrderReminderState_UserEmail')
  EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [UX_OrderReminderState_UserEmail] ON [BMSApp].[OrderReminderState] ([ors_UserEmail] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.OrderReminderState') AND name=N'IX_OrderReminderState_Due')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_OrderReminderState_Due] ON [BMSApp].[OrderReminderState] ([ors_NextCheckAt] ASC, [ors_LockedAt] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.PurchaseOrderCsMailOutbox') AND name=N'IX_PurchaseOrderCsMailOutbox_Pending')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_PurchaseOrderCsMailOutbox_Pending] ON [BMSApp].[PurchaseOrderCsMailOutbox] ([pcom_Status] ASC, [pcom_NextAttemptAt] ASC, [pcom_ID] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.PurchaseOrderMailOutbox') AND name=N'IX_PurchaseOrderMailOutbox_Pending')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_PurchaseOrderMailOutbox_Pending] ON [BMSApp].[PurchaseOrderMailOutbox] ([pom_Status] ASC, [pom_NextAttemptAt] ASC, [pom_ID] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.PushMandantSetting') AND name=N'UX_tblBMSApp_PushMandantSetting_UserEmail_CompanyId')
  EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [UX_tblBMSApp_PushMandantSetting_UserEmail_CompanyId] ON [BMSApp].[PushMandantSetting] ([pms_UserEmail] ASC, [pms_CompanyId] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.PushMandantSetting') AND name=N'IX_tblBMSApp_PushMandantSetting_CompanyId_Enabled')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_tblBMSApp_PushMandantSetting_CompanyId_Enabled] ON [BMSApp].[PushMandantSetting] ([pms_CompanyId] ASC, [pms_Enabled] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.PushSubscription') AND name=N'UX_tblBMSApp_PushSubscription_Endpoint')
  EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [UX_tblBMSApp_PushSubscription_Endpoint] ON [BMSApp].[PushSubscription] ([ps_Endpoint] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.PushSubscription') AND name=N'IX_tblBMSApp_PushSubscription_UserEmail_IsActive')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_tblBMSApp_PushSubscription_UserEmail_IsActive] ON [BMSApp].[PushSubscription] ([ps_UserEmail] ASC, [ps_IsActive] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Angebot') AND name=N'IX_Temp_Angebot_owner')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_Temp_Angebot_owner] ON [BMSApp].[tbl_Temp_Angebot] ([tag_company_id] ASC, [tag_created_by] ASC, [tag_created_at] DESC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Auf_Position') AND name=N'IX_tbl_Temp_Auf_Position_ta_id')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_tbl_Temp_Auf_Position_ta_id] ON [BMSApp].[tbl_Temp_Auf_Position] ([tap_ta_id] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Auf_Position') AND name=N'IX_tbl_Temp_Auf_Position_be_warehouse')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_tbl_Temp_Auf_Position_be_warehouse] ON [BMSApp].[tbl_Temp_Auf_Position] ([tap_be_number] ASC, [tap_warehouse] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Auftrag_Anhang') AND name=N'IX_tbl_Temp_Auftrag_Anhang_Order')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_tbl_Temp_Auftrag_Anhang_Order] ON [BMSApp].[tbl_Temp_Auftrag_Anhang] ([tfa_ta_id] ASC, [tfa_ID] ASC) INCLUDE ([tfa_FileName], [tfa_MimeType], [tfa_SizeBytes], [tfa_CreatedAt]) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Auftrag_Anhang') AND name=N'UX_tbl_Temp_Auftrag_Anhang_LegacyOrder')
  EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [UX_tbl_Temp_Auftrag_Anhang_LegacyOrder] ON [BMSApp].[tbl_Temp_Auftrag_Anhang] ([tfa_ta_id] ASC) WHERE ([tfa_IsLegacy]=(1)) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Best_Position') AND name=N'IX_tbl_Temp_Best_Position_order')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_tbl_Temp_Best_Position_order] ON [BMSApp].[tbl_Temp_Best_Position] ([tbp_tb_id] ASC, [tbp_line_no] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Best_Position') AND name=N'IX_tbl_Temp_Best_Position_article')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_tbl_Temp_Best_Position_article] ON [BMSApp].[tbl_Temp_Best_Position] ([tbp_article_index] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Best_Position') AND name=N'IX_TempBestPosition_OptionPosition')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_TempBestPosition_OptionPosition] ON [BMSApp].[tbl_Temp_Best_Position] ([OptionPositionID] ASC, [tbp_tb_id] ASC) INCLUDE ([tbp_amount], [tbp_unit]) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Bestellung') AND name=N'IX_tbl_Temp_Bestellung_company_status')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_tbl_Temp_Bestellung_company_status] ON [BMSApp].[tbl_Temp_Bestellung] ([tb_company_id] ASC, [tb_status] ASC, [tb_last_modified_date] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Bestellung') AND name=N'IX_tbl_Temp_Bestellung_supplier')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_tbl_Temp_Bestellung_supplier] ON [BMSApp].[tbl_Temp_Bestellung] ([tb_company_id] ASC, [tb_supplier_id] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Bestellung_Anhang') AND name=N'IX_tbl_Temp_Bestellung_Anhang_Order')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_tbl_Temp_Bestellung_Anhang_Order] ON [BMSApp].[tbl_Temp_Bestellung_Anhang] ([tba_tb_id] ASC, [tba_ID] ASC) INCLUDE ([tba_FileName], [tba_MimeType], [tba_SizeBytes], [tba_CreatedAt], [tba_DeletedAt]) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tblOptionen') AND name=N'IX_tblOptionen_MandantGueltig')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_tblOptionen_MandantGueltig] ON [BMSApp].[tblOptionen] ([op_MandantID] ASC, [op_GeloeschtAm] ASC, [op_Pruefstatus] ASC, [op_Geschaeftsstatus] ASC, [op_GueltigBis] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tblOptionen') AND name=N'UX_tblOptionen_Mandant_Duplikat')
  EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [UX_tblOptionen_Mandant_Duplikat] ON [BMSApp].[tblOptionen] ([op_MandantID] ASC, [op_DuplikatSchluessel] ASC) WHERE ([op_DuplikatSchluessel] IS NOT NULL AND [op_IstDemo]=(0)) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tblOptionenAbgleich') AND name=N'IX_OptionenAbgleich_Position')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_OptionenAbgleich_Position] ON [BMSApp].[tblOptionenAbgleich] ([oab_opp_id] ASC, [oab_id] DESC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tblOptionenArtikelMapping') AND name=N'IX_tblOptionenArtikelMapping_Lookup')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_tblOptionenArtikelMapping_Lookup] ON [BMSApp].[tblOptionenArtikelMapping] ([oam_MandantID] ASC, [oam_Lieferantenkennung] ASC, [oam_Aktiv] ASC, [oam_ArtikelnameNorm] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tblOptionenArtikelMapping') AND name=N'UX_OptionenMapping_QuelleAktiv')
  EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [UX_OptionenMapping_QuelleAktiv] ON [BMSApp].[tblOptionenArtikelMapping] ([oam_QuellePositionID] ASC) WHERE ([oam_QuellePositionID] IS NOT NULL AND [oam_Aktiv]=(1)) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tblOptionenLieferantenRegel') AND name=N'IX_tblOptionenLieferantenRegel_Lookup')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_tblOptionenLieferantenRegel_Lookup] ON [BMSApp].[tblOptionenLieferantenRegel] ([olr_MandantID] ASC, [olr_Lieferantenkennung] ASC, [olr_Aktiv] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tblOptionenMailVerarbeitung') AND name=N'IX_OptionenMailVerarbeitung_Status')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_OptionenMailVerarbeitung_Status] ON [BMSApp].[tblOptionenMailVerarbeitung] ([omv_Status] ASC, [omv_NaechsterVersuchAm] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tblOptionenPositionen') AND name=N'IX_tblOptionenPositionen_Option')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_tblOptionenPositionen_Option] ON [BMSApp].[tblOptionenPositionen] ([opp_op_id] ASC, [opp_Positionsnummer] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tblOptionenPositionen') AND name=N'UX_OptionenPositionen_Identity')
  EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [UX_OptionenPositionen_Identity] ON [BMSApp].[tblOptionenPositionen] ([opp_id] ASC, [opp_op_id] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.TempOrderReworkPushState') AND name=N'UX_TempOrderReworkPushState_OrderID')
  EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [UX_TempOrderReworkPushState_OrderID] ON [BMSApp].[TempOrderReworkPushState] ([torps_OrderID] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.Timeline') AND name=N'IX_tblBMSApp_Timeline_CreatedAt')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_tblBMSApp_Timeline_CreatedAt] ON [BMSApp].[Timeline] ([tl_CreatedAt] DESC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.Timeline') AND name=N'IX_tblBMSApp_Timeline_Mandant_CreatedAt')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_tblBMSApp_Timeline_Mandant_CreatedAt] ON [BMSApp].[Timeline] ([tl_Mandant] ASC, [tl_CreatedAt] DESC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.Timeline') AND name=N'IX_tblBMSApp_Timeline_Type_CreatedAt')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_tblBMSApp_Timeline_Type_CreatedAt] ON [BMSApp].[Timeline] ([tl_Type] ASC, [tl_CreatedAt] DESC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.Timeline') AND name=N'IX_tblBMSApp_Timeline_CompanyId_CreatedAt')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_tblBMSApp_Timeline_CompanyId_CreatedAt] ON [BMSApp].[Timeline] ([tl_CompanyId] ASC, [tl_CreatedAt] DESC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.VlMailOrderState') AND name=N'IX_VlMailOrderState_Status')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_VlMailOrderState_Status] ON [BMSApp].[VlMailOrderState] ([vmos_LastStatus] ASC, [vmos_LastModifiedDate] ASC, [vmos_OrderID] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.VlMailOutbox') AND name=N'IX_VlMailOutbox_Pending')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_VlMailOutbox_Pending] ON [BMSApp].[VlMailOutbox] ([vmo_Status] ASC, [vmo_NextAttemptAt] ASC, [vmo_ID] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.VlMailOutbox') AND name=N'IX_VlMailOutbox_OrderID')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_VlMailOutbox_OrderID] ON [BMSApp].[VlMailOutbox] ([vmo_OrderID] ASC, [vmo_ID] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.VlMailUserSetting') AND name=N'UX_VlMailUserSetting_UserEmail')
  EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [UX_VlMailUserSetting_UserEmail] ON [BMSApp].[VlMailUserSetting] ([vms_UserEmail] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.VlSalePushState') AND name=N'IX_VlSalePushState_Pending')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_VlSalePushState_Pending] ON [BMSApp].[VlSalePushState] ([vps_Status] ASC, [vps_NextAttemptAt] ASC, [vps_ID] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.OptionOfferMailOutbox') AND name=N'IX_OptionOfferMailOutbox_Status')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_OptionOfferMailOutbox_Status] ON [BMSApp].[OptionOfferMailOutbox] ([Status] ASC, [NextAttemptAt] ASC, [Id] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Aktivitaet') AND name=N'IX_tbl_Temp_Aktivitaet_Status')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_tbl_Temp_Aktivitaet_Status] ON [BMSApp].[tbl_Temp_Aktivitaet] ([Status] ASC, [Id] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.ContactCreationOperation') AND name=N'IX_ContactCreationOperation_Scope')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_ContactCreationOperation_Scope] ON [BMSApp].[ContactCreationOperation] ([UserId] ASC, [Mandant] ASC, [CustomerNumber] ASC, [CreatedAt] DESC);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Ang_Position') AND name=N'IX_tbl_Temp_Ang_Position_tagp_option_position_id')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_tbl_Temp_Ang_Position_tagp_option_position_id] ON [BMSApp].[tbl_Temp_Ang_Position] ([tagp_option_position_id] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Ang_Position') AND name=N'IX_tbl_Temp_Ang_Position_tagp_order_position_id')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_tbl_Temp_Ang_Position_tagp_order_position_id] ON [BMSApp].[tbl_Temp_Ang_Position] ([tagp_order_position_id] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Auf_Position') AND name=N'IX_tbl_Temp_Auf_Position_tap_purchase_position_id')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_tbl_Temp_Auf_Position_tap_purchase_position_id] ON [BMSApp].[tbl_Temp_Auf_Position] ([tap_purchase_position_id] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Auf_Position') AND name=N'IX_tbl_Temp_Auf_Position_tap_offer_position_id')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_tbl_Temp_Auf_Position_tap_offer_position_id] ON [BMSApp].[tbl_Temp_Auf_Position] ([tap_offer_position_id] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Auf_Position') AND name=N'IX_tbl_Temp_Auf_Position_tap_option_position_id')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_tbl_Temp_Auf_Position_tap_option_position_id] ON [BMSApp].[tbl_Temp_Auf_Position] ([tap_option_position_id] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Best_Position') AND name=N'IX_tbl_Temp_Best_Position_tbp_order_position_id')
  EXEC(N'CREATE NONCLUSTERED INDEX [IX_tbl_Temp_Best_Position_tbp_order_position_id] ON [BMSApp].[tbl_Temp_Best_Position] ([tbp_order_position_id] ASC) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.OptionOfferMailOutbox') AND name=N'UX_OptionOfferMailOutbox_OptionCustomer')
  EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [UX_OptionOfferMailOutbox_OptionCustomer] ON [BMSApp].[OptionOfferMailOutbox] ([CompanyId] ASC, [OptionPositionId] ASC, [CustomerNumber] ASC) WHERE ([OptionPositionId] IS NOT NULL) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.OptionOfferMailOutbox') AND name=N'UX_OptionOfferMailOutbox_StockCustomer')
  EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [UX_OptionOfferMailOutbox_StockCustomer] ON [BMSApp].[OptionOfferMailOutbox] ([CompanyId] ASC, [StockPositionKey] ASC, [CustomerNumber] ASC) WHERE ([StockPositionKey] IS NOT NULL) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.OptionOfferMailOutbox') AND name=N'UX_OptionOfferMailOutbox_TempOffer')
  EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [UX_OptionOfferMailOutbox_TempOffer] ON [BMSApp].[OptionOfferMailOutbox] ([TempOfferId] ASC) WHERE ([TempOfferId] IS NOT NULL) WITH (PAD_INDEX=OFF, STATISTICS_NORECOMPUTE=OFF, IGNORE_DUP_KEY=OFF, ALLOW_ROW_LOCKS=ON, ALLOW_PAGE_LOCKS=ON);');

 -- Check constraints.
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.CreditLimitMailOutbox') AND name=N'CK_CreditLimitMailOutbox_Status')
  EXEC(N'ALTER TABLE [BMSApp].[CreditLimitMailOutbox] WITH CHECK ADD CONSTRAINT [CK_CreditLimitMailOutbox_Status] CHECK ([clm_Status]=N''failed'' OR [clm_Status]=N''sent'' OR [clm_Status]=N''sending'' OR [clm_Status]=N''pending'');');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.CreditLimitMailOutbox') AND name=N'CK_CreditLimitMailOutbox_Type')
  EXEC(N'ALTER TABLE [BMSApp].[CreditLimitMailOutbox] WITH CHECK ADD CONSTRAINT [CK_CreditLimitMailOutbox_Type] CHECK ([clm_Type]=N''bank_details_reminder'' OR [clm_Type]=N''credit_limit_request_user_confirmed'' OR [clm_Type]=N''credit_limit_request'');');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.CustomerCreation') AND name=N'CK_CustomerCreation_Status')
  EXEC(N'ALTER TABLE [BMSApp].[CustomerCreation] WITH CHECK ADD CONSTRAINT [CK_CustomerCreation_Status] CHECK ([Status]=N''partial'' OR [Status]=N''created'' OR [Status]=N''failed'' OR [Status]=N''unknown'' OR [Status]=N''sending'' OR [Status]=N''pending'');');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.CustomerCreationMandant') AND name=N'CK_CustomerCreationMandant_Json')
  EXEC(N'ALTER TABLE [BMSApp].[CustomerCreationMandant] WITH CHECK ADD CONSTRAINT [CK_CustomerCreationMandant_Json] CHECK (isjson([ResultJson])=(1));');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.CustomerCreationRollback') AND name=N'CK_CustomerCreationRollback_PreviewJson')
  EXEC(N'ALTER TABLE [BMSApp].[CustomerCreationRollback] WITH CHECK ADD CONSTRAINT [CK_CustomerCreationRollback_PreviewJson] CHECK (isjson([PreviewJson])=(1));');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.CustomerCreationRollback') AND name=N'CK_CustomerCreationRollback_ResponseJson')
  EXEC(N'ALTER TABLE [BMSApp].[CustomerCreationRollback] WITH CHECK ADD CONSTRAINT [CK_CustomerCreationRollback_ResponseJson] CHECK ([ResponseJson] IS NULL OR isjson([ResponseJson])=(1));');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.CustomerCreationRollback') AND name=N'CK_CustomerCreationRollback_Status')
  EXEC(N'ALTER TABLE [BMSApp].[CustomerCreationRollback] WITH CHECK ADD CONSTRAINT [CK_CustomerCreationRollback_Status] CHECK ([Status]=N''failed'' OR [Status]=N''blocked'' OR [Status]=N''completed'' OR [Status]=N''partial'' OR [Status]=N''unknown'' OR [Status]=N''sending'' OR [Status]=N''preview'');');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.CustomerCreationSnapshot') AND name=N'CK_CustomerCreationSnapshot_Json')
  EXEC(N'ALTER TABLE [BMSApp].[CustomerCreationSnapshot] WITH CHECK ADD CONSTRAINT [CK_CustomerCreationSnapshot_Json] CHECK (isjson([DataJson])=(1));');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.CustomerCreationSnapshot') AND name=N'CK_CustomerCreationSnapshot_Kind')
  EXEC(N'ALTER TABLE [BMSApp].[CustomerCreationSnapshot] WITH CHECK ADD CONSTRAINT [CK_CustomerCreationSnapshot_Kind] CHECK ([Kind]=N''response'' OR [Kind]=N''request'');');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.DailyVlMailOutbox') AND name=N'CK_DailyVlMailOutbox_Status')
  EXEC(N'ALTER TABLE [BMSApp].[DailyVlMailOutbox] WITH CHECK ADD CONSTRAINT [CK_DailyVlMailOutbox_Status] CHECK ([vld_Status]=N''skipped'' OR [vld_Status]=N''failed'' OR [vld_Status]=N''sent'' OR [vld_Status]=N''sending'' OR [vld_Status]=N''pending'');');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.DeliveryAddressOperation') AND name=N'CK__DeliveryA__Input__2DA7A64D')
  EXEC(N'ALTER TABLE [BMSApp].[DeliveryAddressOperation] WITH CHECK ADD CONSTRAINT [CK__DeliveryA__Input__2DA7A64D] CHECK (isjson([InputJson])=(1));');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.DeliveryAddressOperation') AND name=N'CK__DeliveryA__Reque__2E9BCA86')
  EXEC(N'ALTER TABLE [BMSApp].[DeliveryAddressOperation] WITH CHECK ADD CONSTRAINT [CK__DeliveryA__Reque__2E9BCA86] CHECK (isjson([RequestJson])=(1));');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.DeliveryAddressOperation') AND name=N'CK__DeliveryA__Respo__2F8FEEBF')
  EXEC(N'ALTER TABLE [BMSApp].[DeliveryAddressOperation] WITH CHECK ADD CONSTRAINT [CK__DeliveryA__Respo__2F8FEEBF] CHECK (isjson([ResponseJson])=(1));');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.DeliveryAddressOperation') AND name=N'CK__DeliveryA__Statu__308412F8')
  EXEC(N'ALTER TABLE [BMSApp].[DeliveryAddressOperation] WITH CHECK ADD CONSTRAINT [CK__DeliveryA__Statu__308412F8] CHECK ([Status]=N''created'' OR [Status]=N''failed'' OR [Status]=N''unknown'' OR [Status]=N''sending'');');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.OrderMailOutbox') AND name=N'CK_OrderMailOutbox_Status')
  EXEC(N'ALTER TABLE [BMSApp].[OrderMailOutbox] WITH CHECK ADD CONSTRAINT [CK_OrderMailOutbox_Status] CHECK ([om_Status]=N''failed'' OR [om_Status]=N''sent'' OR [om_Status]=N''sending'' OR [om_Status]=N''pending'');');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.OrderReminderState') AND name=N'CK_OrderReminderState_LastChannel')
  EXEC(N'ALTER TABLE [BMSApp].[OrderReminderState] WITH CHECK ADD CONSTRAINT [CK_OrderReminderState_LastChannel] CHECK ([ors_LastChannel] IS NULL OR ([ors_LastChannel]=N''email'' OR [ors_LastChannel]=N''push''));');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.PurchaseOrderCsMailOutbox') AND name=N'CK_PurchaseOrderCsMailOutbox_Status')
  EXEC(N'ALTER TABLE [BMSApp].[PurchaseOrderCsMailOutbox] WITH CHECK ADD CONSTRAINT [CK_PurchaseOrderCsMailOutbox_Status] CHECK ([pcom_Status]=N''failed'' OR [pcom_Status]=N''sent'' OR [pcom_Status]=N''sending'' OR [pcom_Status]=N''pending'');');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.PurchaseOrderMailOutbox') AND name=N'CK_PurchaseOrderMailOutbox_Status')
  EXEC(N'ALTER TABLE [BMSApp].[PurchaseOrderMailOutbox] WITH CHECK ADD CONSTRAINT [CK_PurchaseOrderMailOutbox_Status] CHECK ([pom_Status]=N''failed'' OR [pom_Status]=N''sent'' OR [pom_Status]=N''sending'' OR [pom_Status]=N''pending'');');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Ang_Position') AND name=N'CK_Temp_Ang_Position_values')
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Ang_Position] WITH CHECK ADD CONSTRAINT [CK_Temp_Ang_Position_values] CHECK ([tagp_quantity]>(0) AND [tagp_price]>=(0) AND [tagp_price_basis]>(0));');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Angebot') AND name=N'CK_Temp_Angebot_status')
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Angebot] WITH CHECK ADD CONSTRAINT [CK_Temp_Angebot_status] CHECK ([tag_status] IN (0,1,2,3,4,5));');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Best_Position') AND name=N'CK_tbl_Temp_Best_Position_amount')
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Best_Position] WITH CHECK ADD CONSTRAINT [CK_tbl_Temp_Best_Position_amount] CHECK ([tbp_amount]>(0));');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Best_Position') AND name=N'CK_tbl_Temp_Best_Position_price')
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Best_Position] WITH CHECK ADD CONSTRAINT [CK_tbl_Temp_Best_Position_price] CHECK ([tbp_purchase_price]>=(0));');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Best_Position') AND name=N'CK_TempBestPosition_OptionPair')
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Best_Position] WITH CHECK ADD CONSTRAINT [CK_TempBestPosition_OptionPair] CHECK ([OptionID] IS NULL AND [OptionPositionID] IS NULL OR [OptionID] IS NOT NULL AND [OptionPositionID] IS NOT NULL);');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Bestellung') AND name=N'CK_tbl_Temp_Bestellung_status')
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Bestellung] WITH CHECK ADD CONSTRAINT [CK_tbl_Temp_Bestellung_status] CHECK ([tb_status]=(3) OR [tb_status]=(2) OR [tb_status]=(1) OR [tb_status]=(0));');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.tblOptionen') AND name=N'CK_tblOptionen_Geschaeftsstatus')
  EXEC(N'ALTER TABLE [BMSApp].[tblOptionen] WITH CHECK ADD CONSTRAINT [CK_tblOptionen_Geschaeftsstatus] CHECK ([op_Geschaeftsstatus]=N''accepted'' OR [op_Geschaeftsstatus]=N''withdrawn'' OR [op_Geschaeftsstatus]=N''open'');');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.tblOptionen') AND name=N'CK_tblOptionen_Gueltig')
  EXEC(N'ALTER TABLE [BMSApp].[tblOptionen] WITH CHECK ADD CONSTRAINT [CK_tblOptionen_Gueltig] CHECK ([op_GueltigBis]>=[op_GueltigAb]);');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.tblOptionen') AND name=N'CK_tblOptionen_Nachverhandelbar')
  EXEC(N'ALTER TABLE [BMSApp].[tblOptionen] WITH CHECK ADD CONSTRAINT [CK_tblOptionen_Nachverhandelbar] CHECK ([op_Nachverhandelbar]=N''unknown'' OR [op_Nachverhandelbar]=N''no'' OR [op_Nachverhandelbar]=N''yes'');');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.tblOptionen') AND name=N'CK_tblOptionen_Pruefstatus')
  EXEC(N'ALTER TABLE [BMSApp].[tblOptionen] WITH CHECK ADD CONSTRAINT [CK_tblOptionen_Pruefstatus] CHECK ([op_Pruefstatus]=N''rejected'' OR [op_Pruefstatus]=N''approved'' OR [op_Pruefstatus]=N''pending'');');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.tblOptionenAbgleich') AND name=N'CK__tblOption__oab_M__2823D721')
  EXEC(N'ALTER TABLE [BMSApp].[tblOptionenAbgleich] WITH CHECK ADD CONSTRAINT [CK__tblOption__oab_M__2823D721] CHECK (isjson([oab_MerkmaleJson])=(1));');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.tblOptionenAbgleichAuftrag') AND name=N'CK__tblOption__oaa_S__32A16594')
  EXEC(N'ALTER TABLE [BMSApp].[tblOptionenAbgleichAuftrag] WITH CHECK ADD CONSTRAINT [CK__tblOption__oaa_S__32A16594] CHECK ([oaa_Status]=N''error'' OR [oaa_Status]=N''done'' OR [oaa_Status]=N''running'' OR [oaa_Status]=N''pending'');');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.tblOptionenArtikelKandidaten') AND name=N'CK__tblOption__oak_D__2DDCB077')
  EXEC(N'ALTER TABLE [BMSApp].[tblOptionenArtikelKandidaten] WITH CHECK ADD CONSTRAINT [CK__tblOption__oak_D__2DDCB077] CHECK (isjson([oak_DatenJson])=(1));');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.tblOptionenArtikelMapping') AND name=N'CK_tblOptionenArtikelMapping_MFI')
  EXEC(N'ALTER TABLE [BMSApp].[tblOptionenArtikelMapping] WITH CHECK ADD CONSTRAINT [CK_tblOptionenArtikelMapping_MFI] CHECK ([oam_MFIvon] IS NULL OR [oam_MFIbis] IS NULL OR [oam_MFIbis]>=[oam_MFIvon]);');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.tblOptionenPositionen') AND name=N'CK_OptionPosition_BestaetigteMenge')
  EXEC(N'ALTER TABLE [BMSApp].[tblOptionenPositionen] WITH CHECK ADD CONSTRAINT [CK_OptionPosition_BestaetigteMenge] CHECK ([opp_GesamtmengeBestaetigtKg] IS NULL OR [opp_GesamtmengeBestaetigtKg]>(0));');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.tblOptionenPositionen') AND name=N'CK_OptionPosition_BestaetigteTrucks')
  EXEC(N'ALTER TABLE [BMSApp].[tblOptionenPositionen] WITH CHECK ADD CONSTRAINT [CK_OptionPosition_BestaetigteTrucks] CHECK ([opp_MengeBestaetigtTrucks] IS NULL OR [opp_MengeBestaetigtTrucks]>(0) AND [opp_MengeBestaetigtVerpackungsartID] IS NOT NULL);');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.tblOptionenPositionen') AND name=N'CK_tblOptionenPositionen_Match')
  EXEC(N'ALTER TABLE [BMSApp].[tblOptionenPositionen] WITH CHECK ADD CONSTRAINT [CK_tblOptionenPositionen_Match] CHECK ([opp_MatchStatus]=N''confirmed'' OR [opp_MatchStatus]=N''suggested'' OR [opp_MatchStatus]=N''unmatched'');');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.tblOptionenPositionen') AND name=N'CK_tblOptionenPositionen_Menge')
  EXEC(N'ALTER TABLE [BMSApp].[tblOptionenPositionen] WITH CHECK ADD CONSTRAINT [CK_tblOptionenPositionen_Menge] CHECK ([opp_MengeVon] IS NULL OR [opp_MengeBis] IS NULL OR [opp_MengeBis]>=[opp_MengeVon]);');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.tblOptionenPositionen') AND name=N'CK_tblOptionenPositionen_MengeKg')
  EXEC(N'ALTER TABLE [BMSApp].[tblOptionenPositionen] WITH CHECK ADD CONSTRAINT [CK_tblOptionenPositionen_MengeKg] CHECK ([opp_MengeVonKg] IS NULL OR [opp_MengeBisKg] IS NULL OR [opp_MengeBisKg]>=[opp_MengeVonKg]);');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.tblOptionenPositionen') AND name=N'CK_tblOptionenPositionen_Preis')
  EXEC(N'ALTER TABLE [BMSApp].[tblOptionenPositionen] WITH CHECK ADD CONSTRAINT [CK_tblOptionenPositionen_Preis] CHECK ([opp_PreisRoh] IS NULL OR [opp_PreisRoh]>=(0));');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.VlMailOutbox') AND name=N'CK_VlMailOutbox_Status')
  EXEC(N'ALTER TABLE [BMSApp].[VlMailOutbox] WITH CHECK ADD CONSTRAINT [CK_VlMailOutbox_Status] CHECK ([vmo_Status]=N''skipped'' OR [vmo_Status]=N''failed'' OR [vmo_Status]=N''sent'' OR [vmo_Status]=N''sending'' OR [vmo_Status]=N''pending'');');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.VlSalePushState') AND name=N'CK_VlSalePushState_Status')
  EXEC(N'ALTER TABLE [BMSApp].[VlSalePushState] WITH CHECK ADD CONSTRAINT [CK_VlSalePushState_Status] CHECK ([vps_Status]=N''skipped'' OR [vps_Status]=N''failed'' OR [vps_Status]=N''sent'' OR [vps_Status]=N''sending'' OR [vps_Status]=N''pending'');');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.OptionOfferMailOutbox') AND name=N'CK_OptionOfferMailOutbox_Status')
  EXEC(N'ALTER TABLE [BMSApp].[OptionOfferMailOutbox] WITH CHECK ADD CONSTRAINT [CK_OptionOfferMailOutbox_Status] CHECK ([Status] IN (N''pending'', N''sending'', N''submitted'', N''sent'', N''failed'', N''unknown''));');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.OptionOfferMailOutbox') AND name=N'CK_OptionOfferMailOutbox_SentAt')
  EXEC(N'ALTER TABLE [BMSApp].[OptionOfferMailOutbox] WITH CHECK ADD CONSTRAINT [CK_OptionOfferMailOutbox_SentAt] CHECK ([Status] <> N''sent'' OR [SentAt] IS NOT NULL);');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.OptionOfferMailOutbox') AND name=N'CK_OptionOfferMailOutbox_SalePrice')
  EXEC(N'ALTER TABLE [BMSApp].[OptionOfferMailOutbox] WITH CHECK ADD CONSTRAINT [CK_OptionOfferMailOutbox_SalePrice] CHECK ([SalePricePerTonne] >= 0);');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Aktivitaet') AND name=N'CK_tbl_Temp_Aktivitaet_Status')
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Aktivitaet] WITH CHECK ADD CONSTRAINT [CK_tbl_Temp_Aktivitaet_Status] CHECK ([Status] IN (N''pending'', N''importing'', N''imported'', N''failed''));');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Aktivitaet') AND name=N'CK_tbl_Temp_Aktivitaet_Imported')
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Aktivitaet] WITH CHECK ADD CONSTRAINT [CK_tbl_Temp_Aktivitaet_Imported] CHECK ([Status] <> N''imported'' OR ([BmsActivityId] IS NOT NULL AND [ImportedAt] IS NOT NULL));');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.OptionOfferDocument') AND name=N'CK_OptionOfferDocument_Offer')
  EXEC(N'ALTER TABLE [BMSApp].[OptionOfferDocument] WITH CHECK ADD CONSTRAINT [CK_OptionOfferDocument_Offer] CHECK (ISJSON([OfferJson]) = 1);');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.OptionOfferDocument') AND name=N'CK_OptionOfferDocument_Document')
  EXEC(N'ALTER TABLE [BMSApp].[OptionOfferDocument] WITH CHECK ADD CONSTRAINT [CK_OptionOfferDocument_Document] CHECK ([BmsDocumentJson] IS NULL OR ISJSON([BmsDocumentJson]) = 1);');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.ContactCreationOperation') AND name=N'CK_ContactCreationOperation_InputJson')
  EXEC(N'ALTER TABLE [BMSApp].[ContactCreationOperation] WITH CHECK ADD CONSTRAINT [CK_ContactCreationOperation_InputJson] CHECK (ISJSON([InputJson])=1);');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.ContactCreationOperation') AND name=N'CK_ContactCreationOperation_RequestJson')
  EXEC(N'ALTER TABLE [BMSApp].[ContactCreationOperation] WITH CHECK ADD CONSTRAINT [CK_ContactCreationOperation_RequestJson] CHECK (ISJSON([RequestJson])=1);');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.ContactCreationOperation') AND name=N'CK_ContactCreationOperation_ResponseJson')
  EXEC(N'ALTER TABLE [BMSApp].[ContactCreationOperation] WITH CHECK ADD CONSTRAINT [CK_ContactCreationOperation_ResponseJson] CHECK (ISJSON([ResponseJson])=1);');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.ContactCreationOperation') AND name=N'CK_ContactCreationOperation_Status')
  EXEC(N'ALTER TABLE [BMSApp].[ContactCreationOperation] WITH CHECK ADD CONSTRAINT [CK_ContactCreationOperation_Status] CHECK ([Status] IN (N''sending'',N''unknown'',N''failed'',N''created''));');
 IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'BMSApp.OptionOfferMailOutbox') AND name=N'CK_OptionOfferMailOutbox_OfferSource')
  EXEC(N'ALTER TABLE [BMSApp].[OptionOfferMailOutbox] WITH CHECK ADD CONSTRAINT [CK_OptionOfferMailOutbox_OfferSource] CHECK (([OptionPositionId] IS NOT NULL AND [StockPositionKey] IS NULL) OR ([OptionPositionId] IS NULL AND [StockPositionKey] IS NOT NULL) OR ([OptionPositionId] IS NULL AND [StockPositionKey] IS NULL AND [TempOfferId] IS NOT NULL));');

 -- Foreign keys, including the reciprocal position links.
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.CustomerCreationMandant') AND name=N'FK_CustomerCreationMandant_Operation')
  EXEC(N'ALTER TABLE [BMSApp].[CustomerCreationMandant] WITH CHECK ADD CONSTRAINT [FK_CustomerCreationMandant_Operation] FOREIGN KEY ([OperationId]) REFERENCES [BMSApp].[CustomerCreation] ([OperationId]);');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.CustomerCreationRollback') AND name=N'FK_CustomerCreationRollback_Operation')
  EXEC(N'ALTER TABLE [BMSApp].[CustomerCreationRollback] WITH CHECK ADD CONSTRAINT [FK_CustomerCreationRollback_Operation] FOREIGN KEY ([OperationId]) REFERENCES [BMSApp].[CustomerCreation] ([OperationId]);');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.CustomerCreationSnapshot') AND name=N'FK_CustomerCreationSnapshot_Operation')
  EXEC(N'ALTER TABLE [BMSApp].[CustomerCreationSnapshot] WITH CHECK ADD CONSTRAINT [FK_CustomerCreationSnapshot_Operation] FOREIGN KEY ([OperationId]) REFERENCES [BMSApp].[CustomerCreation] ([OperationId]);');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.OrderMailOutbox') AND name=N'FK_OrderMailOutbox_TempOrder')
  EXEC(N'ALTER TABLE [BMSApp].[OrderMailOutbox] WITH CHECK ADD CONSTRAINT [FK_OrderMailOutbox_TempOrder] FOREIGN KEY ([om_OrderID]) REFERENCES [BMSApp].[tbl_Temp_Auftrag] ([ta_id]);');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.PurchaseOrderCsMailOutbox') AND name=N'FK_PurchaseOrderCsMailOutbox_Order')
  EXEC(N'ALTER TABLE [BMSApp].[PurchaseOrderCsMailOutbox] WITH CHECK ADD CONSTRAINT [FK_PurchaseOrderCsMailOutbox_Order] FOREIGN KEY ([pcom_PurchaseOrderID]) REFERENCES [BMSApp].[tbl_Temp_Bestellung] ([tb_id]) ON DELETE CASCADE;');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.PurchaseOrderMailOutbox') AND name=N'FK_PurchaseOrderMailOutbox_Order')
  EXEC(N'ALTER TABLE [BMSApp].[PurchaseOrderMailOutbox] WITH CHECK ADD CONSTRAINT [FK_PurchaseOrderMailOutbox_Order] FOREIGN KEY ([pom_PurchaseOrderID]) REFERENCES [BMSApp].[tbl_Temp_Bestellung] ([tb_id]) ON DELETE CASCADE;');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Ang_Position') AND name=N'FK_Temp_Ang_Position_offer')
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Ang_Position] WITH CHECK ADD CONSTRAINT [FK_Temp_Ang_Position_offer] FOREIGN KEY ([tagp_offer_id]) REFERENCES [BMSApp].[tbl_Temp_Angebot] ([tag_id]);');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Auf_Position') AND name=N'FK_tbl_Temp_Auf_Position_tbl_Temp_Auftrag')
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Auf_Position] WITH CHECK ADD CONSTRAINT [FK_tbl_Temp_Auf_Position_tbl_Temp_Auftrag] FOREIGN KEY ([tap_ta_id]) REFERENCES [BMSApp].[tbl_Temp_Auftrag] ([ta_id]) ON DELETE CASCADE;');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Auftrag_Anhang') AND name=N'FK_tbl_Temp_Auftrag_Anhang_tbl_Temp_Auftrag')
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Auftrag_Anhang] WITH CHECK ADD CONSTRAINT [FK_tbl_Temp_Auftrag_Anhang_tbl_Temp_Auftrag] FOREIGN KEY ([tfa_ta_id]) REFERENCES [BMSApp].[tbl_Temp_Auftrag] ([ta_id]);');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Best_Position') AND name=N'FK_tbl_Temp_Best_Position_order')
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Best_Position] WITH CHECK ADD CONSTRAINT [FK_tbl_Temp_Best_Position_order] FOREIGN KEY ([tbp_tb_id]) REFERENCES [BMSApp].[tbl_Temp_Bestellung] ([tb_id]) ON DELETE CASCADE;');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Best_Position') AND name=N'FK_TempBestPosition_Option')
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Best_Position] WITH CHECK ADD CONSTRAINT [FK_TempBestPosition_Option] FOREIGN KEY ([OptionID]) REFERENCES [BMSApp].[tblOptionen] ([op_id]);');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Best_Position') AND name=N'FK_TempBestPosition_OptionPosition')
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Best_Position] WITH CHECK ADD CONSTRAINT [FK_TempBestPosition_OptionPosition] FOREIGN KEY ([OptionPositionID], [OptionID]) REFERENCES [BMSApp].[tblOptionenPositionen] ([opp_id], [opp_op_id]);');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Bestellung_Anhang') AND name=N'FK_tbl_Temp_Bestellung_Anhang_Bestellung')
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Bestellung_Anhang] WITH CHECK ADD CONSTRAINT [FK_tbl_Temp_Bestellung_Anhang_Bestellung] FOREIGN KEY ([tba_tb_id]) REFERENCES [BMSApp].[tbl_Temp_Bestellung] ([tb_id]) ON DELETE CASCADE;');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.tblOptionenAbgleich') AND name=N'FK__tblOption__oab_o__272FB2E8')
  EXEC(N'ALTER TABLE [BMSApp].[tblOptionenAbgleich] WITH CHECK ADD CONSTRAINT [FK__tblOption__oab_o__272FB2E8] FOREIGN KEY ([oab_opp_id]) REFERENCES [BMSApp].[tblOptionenPositionen] ([opp_id]);');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.tblOptionenArtikelKandidaten') AND name=N'FK__tblOption__oak_o__2CE88C3E')
  EXEC(N'ALTER TABLE [BMSApp].[tblOptionenArtikelKandidaten] WITH CHECK ADD CONSTRAINT [FK__tblOption__oak_o__2CE88C3E] FOREIGN KEY ([oak_oab_id]) REFERENCES [BMSApp].[tblOptionenAbgleich] ([oab_id]);');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.tblOptionenMailEreignis') AND name=N'FK_OptionenMailEreignis_Verarbeitung')
  EXEC(N'ALTER TABLE [BMSApp].[tblOptionenMailEreignis] WITH CHECK ADD CONSTRAINT [FK_OptionenMailEreignis_Verarbeitung] FOREIGN KEY ([ome_omv_id]) REFERENCES [BMSApp].[tblOptionenMailVerarbeitung] ([omv_id]);');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.tblOptionenPositionen') AND name=N'FK_OptionPosition_AktuellerAbgleich')
  EXEC(N'ALTER TABLE [BMSApp].[tblOptionenPositionen] WITH CHECK ADD CONSTRAINT [FK_OptionPosition_AktuellerAbgleich] FOREIGN KEY ([opp_AktuellerAbgleichID], [opp_id]) REFERENCES [BMSApp].[tblOptionenAbgleich] ([oab_id], [oab_opp_id]);');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.tblOptionenPositionen') AND name=N'FK_tblOptionenPositionen_Option')
  EXEC(N'ALTER TABLE [BMSApp].[tblOptionenPositionen] WITH CHECK ADD CONSTRAINT [FK_tblOptionenPositionen_Option] FOREIGN KEY ([opp_op_id]) REFERENCES [BMSApp].[tblOptionen] ([op_id]);');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.VlMailOrderState') AND name=N'FK_VlMailOrderState_TempOrder')
  EXEC(N'ALTER TABLE [BMSApp].[VlMailOrderState] WITH CHECK ADD CONSTRAINT [FK_VlMailOrderState_TempOrder] FOREIGN KEY ([vmos_OrderID]) REFERENCES [BMSApp].[tbl_Temp_Auftrag] ([ta_id]);');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.VlMailOutbox') AND name=N'FK_VlMailOutbox_TempOrder')
  EXEC(N'ALTER TABLE [BMSApp].[VlMailOutbox] WITH CHECK ADD CONSTRAINT [FK_VlMailOutbox_TempOrder] FOREIGN KEY ([vmo_OrderID]) REFERENCES [BMSApp].[tbl_Temp_Auftrag] ([ta_id]);');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.VlSalePushState') AND name=N'FK_VlSalePushState_TempOrder')
  EXEC(N'ALTER TABLE [BMSApp].[VlSalePushState] WITH CHECK ADD CONSTRAINT [FK_VlSalePushState_TempOrder] FOREIGN KEY ([vps_OrderID]) REFERENCES [BMSApp].[tbl_Temp_Auftrag] ([ta_id]);');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.OptionOfferMailOutbox') AND name=N'FK_OptionOfferMailOutbox_OptionPositionId')
  EXEC(N'ALTER TABLE [BMSApp].[OptionOfferMailOutbox] WITH CHECK ADD CONSTRAINT [FK_OptionOfferMailOutbox_OptionPositionId] FOREIGN KEY ([OptionPositionId]) REFERENCES [BMSApp].[tblOptionenPositionen] ([opp_id]);');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Aktivitaet') AND name=N'FK_tbl_Temp_Aktivitaet_OptionOfferMailId')
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Aktivitaet] WITH CHECK ADD CONSTRAINT [FK_tbl_Temp_Aktivitaet_OptionOfferMailId] FOREIGN KEY ([OptionOfferMailId]) REFERENCES [BMSApp].[OptionOfferMailOutbox] ([Id]);');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.OptionOfferDocument') AND name=N'FK_OptionOfferDocument_OptionOfferMailId')
  EXEC(N'ALTER TABLE [BMSApp].[OptionOfferDocument] WITH CHECK ADD CONSTRAINT [FK_OptionOfferDocument_OptionOfferMailId] FOREIGN KEY ([OptionOfferMailId]) REFERENCES [BMSApp].[OptionOfferMailOutbox] ([Id]);');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Ang_Position') AND name=N'FK_tbl_Temp_Ang_Position_tagp_option_position_id')
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Ang_Position] WITH CHECK ADD CONSTRAINT [FK_tbl_Temp_Ang_Position_tagp_option_position_id] FOREIGN KEY ([tagp_option_position_id]) REFERENCES [BMSApp].[tblOptionenPositionen] ([opp_id]);');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Ang_Position') AND name=N'FK_tbl_Temp_Ang_Position_tagp_order_position_id')
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Ang_Position] WITH CHECK ADD CONSTRAINT [FK_tbl_Temp_Ang_Position_tagp_order_position_id] FOREIGN KEY ([tagp_order_position_id]) REFERENCES [BMSApp].[tbl_Temp_Auf_Position] ([tap_id]);');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Auf_Position') AND name=N'FK_tbl_Temp_Auf_Position_tap_purchase_position_id')
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Auf_Position] WITH CHECK ADD CONSTRAINT [FK_tbl_Temp_Auf_Position_tap_purchase_position_id] FOREIGN KEY ([tap_purchase_position_id]) REFERENCES [BMSApp].[tbl_Temp_Best_Position] ([tbp_id]);');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Auf_Position') AND name=N'FK_tbl_Temp_Auf_Position_tap_offer_position_id')
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Auf_Position] WITH CHECK ADD CONSTRAINT [FK_tbl_Temp_Auf_Position_tap_offer_position_id] FOREIGN KEY ([tap_offer_position_id]) REFERENCES [BMSApp].[tbl_Temp_Ang_Position] ([tagp_id]);');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Auf_Position') AND name=N'FK_tbl_Temp_Auf_Position_tap_option_position_id')
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Auf_Position] WITH CHECK ADD CONSTRAINT [FK_tbl_Temp_Auf_Position_tap_option_position_id] FOREIGN KEY ([tap_option_position_id]) REFERENCES [BMSApp].[tblOptionenPositionen] ([opp_id]);');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.tbl_Temp_Best_Position') AND name=N'FK_tbl_Temp_Best_Position_tbp_order_position_id')
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Best_Position] WITH CHECK ADD CONSTRAINT [FK_tbl_Temp_Best_Position_tbp_order_position_id] FOREIGN KEY ([tbp_order_position_id]) REFERENCES [BMSApp].[tbl_Temp_Auf_Position] ([tap_id]);');
 IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'BMSApp.OptionOfferMailOutbox') AND name=N'FK_OptionOfferMailOutbox_TempOffer')
  EXEC(N'ALTER TABLE [BMSApp].[OptionOfferMailOutbox] WITH CHECK ADD CONSTRAINT [FK_OptionOfferMailOutbox_TempOffer] FOREIGN KEY ([TempOfferId]) REFERENCES [BMSApp].[tbl_Temp_Angebot] ([tag_id]);');

 COMMIT TRANSACTION;
 SELECT DB_NAME() AS databaseName,N'BMSApp' AS schemaName,45 AS expectedTables,N'installed' AS result;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
