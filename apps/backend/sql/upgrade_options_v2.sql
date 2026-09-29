/* DB04/BMS option schema v2. One-time rebuild of demo-only v1 data.
   Run as a principal with DDL rights. All statements are atomic. */
USE [BMS];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO
BEGIN TRY
  BEGIN TRANSACTION;
  IF OBJECT_ID(N'BMSApp.tblOptionen', N'U') IS NULL
    THROW 51000, 'BMSApp.tblOptionen fehlt.', 1;
  IF COL_LENGTH(N'BMSApp.tblOptionen', N'op_MandantID') IS NOT NULL
    THROW 51001, 'Optionstabellen sind bereits auf v2.', 1;
  IF EXISTS (SELECT 1 FROM [BMSApp].[tblOptionen] WHERE [op_is_demo]=0)
    THROW 51002, 'Echte Optionen vorhanden; automatischer Neuaufbau abgebrochen.', 1;
  IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE referenced_object_id IN
    (OBJECT_ID(N'BMSApp.tblOptionen'), OBJECT_ID(N'BMSApp.tblOptionenPositionen'))
    AND parent_object_id NOT IN (OBJECT_ID(N'BMSApp.tblOptionenPositionen')))
    THROW 51003, 'Fremdschluessel anderer Tabellen vorhanden; Neuaufbau abgebrochen.', 1;

  DROP TABLE [BMSApp].[tblOptionenPositionen];
  DROP TABLE [BMSApp].[tblOptionen];

  CREATE TABLE [BMSApp].[tblOptionen] (
    [op_id] INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_tblOptionen] PRIMARY KEY,
    [op_MandantID] INT NOT NULL,
    [op_LieferantID] NVARCHAR(50) NULL,
    [op_Lieferantenkennung] NVARCHAR(255) NULL,
    [op_Lieferantenname] NVARCHAR(255) NOT NULL,
    [op_Angebotsnummer] NVARCHAR(100) NULL,
    [op_KundennummerLieferant] NVARCHAR(100) NULL,
    [op_Angebotsdatum] DATE NULL,
    [op_EingangAm] DATETIME2(7) NOT NULL,
    [op_GueltigAb] DATE NOT NULL,
    [op_GueltigBis] DATE NOT NULL,
    [op_QuellGueltigBis] DATE NULL,
    [op_Incoterm] NVARCHAR(50) NULL,
    [op_Ladeort] NVARCHAR(500) NULL,
    [op_Verpackung] NVARCHAR(500) NULL,
    [op_Antwortadresse] NVARCHAR(255) NULL,
    [op_Konditionen] NVARCHAR(MAX) NULL,
    [op_Kommentar] NVARCHAR(MAX) NULL,
    [op_Nachverhandelbar] NVARCHAR(12) NOT NULL CONSTRAINT [DF_tblOptionen_Nachverhandelbar] DEFAULT (N'unknown'),
    [op_NachverhandelbarQuelle] NVARCHAR(500) NULL,
    [op_QuelleTyp] NVARCHAR(30) NOT NULL,
    [op_QuelleSchluessel] NVARCHAR(255) NOT NULL,
    [op_QuelleDateiname] NVARCHAR(255) NULL,
    [op_QuelleMailtext] NVARCHAR(MAX) NULL,
    [op_QuelleMailformat] NVARCHAR(20) NULL,
    [op_QuelleDatei] VARBINARY(MAX) NULL,
    [op_QuelleDateiMime] NVARCHAR(100) NULL,
    [op_IstDemo] BIT NOT NULL CONSTRAINT [DF_tblOptionen_IstDemo] DEFAULT (0),
    [op_Pruefstatus] NVARCHAR(20) NOT NULL CONSTRAINT [DF_tblOptionen_Pruefstatus] DEFAULT (N'pending'),
    [op_Geschaeftsstatus] NVARCHAR(20) NOT NULL CONSTRAINT [DF_tblOptionen_Geschaeftsstatus] DEFAULT (N'open'),
    [op_GeloeschtAm] DATETIME2(7) NULL,
    [op_GeloeschtVon] NVARCHAR(100) NULL,
    [op_ErstelltVon] NVARCHAR(100) NOT NULL,
    [op_ErstelltAm] DATETIME2(7) NOT NULL CONSTRAINT [DF_tblOptionen_ErstelltAm] DEFAULT (SYSUTCDATETIME()),
    [op_GeaendertVon] NVARCHAR(100) NOT NULL,
    [op_GeaendertAm] DATETIME2(7) NOT NULL CONSTRAINT [DF_tblOptionen_GeaendertAm] DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT [UQ_tblOptionen_Quelle] UNIQUE ([op_MandantID], [op_QuelleSchluessel]),
    CONSTRAINT [CK_tblOptionen_Gueltig] CHECK ([op_GueltigBis] >= [op_GueltigAb]),
    CONSTRAINT [CK_tblOptionen_Pruefstatus] CHECK ([op_Pruefstatus] IN (N'pending', N'approved', N'rejected')),
    CONSTRAINT [CK_tblOptionen_Geschaeftsstatus] CHECK ([op_Geschaeftsstatus] IN (N'open', N'withdrawn', N'accepted')),
    CONSTRAINT [CK_tblOptionen_Nachverhandelbar] CHECK ([op_Nachverhandelbar] IN (N'yes', N'no', N'unknown'))
  );
  CREATE INDEX [IX_tblOptionen_MandantGueltig] ON [BMSApp].[tblOptionen]
    ([op_MandantID], [op_GeloeschtAm], [op_Pruefstatus], [op_Geschaeftsstatus], [op_GueltigBis]);

  CREATE TABLE [BMSApp].[tblOptionenPositionen] (
    [opp_id] INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_tblOptionenPositionen] PRIMARY KEY,
    [opp_op_id] INT NOT NULL CONSTRAINT [FK_tblOptionenPositionen_Option]
      REFERENCES [BMSApp].[tblOptionen] ([op_id]),
    [opp_Positionsnummer] INT NOT NULL,
    [opp_Artikelnummer_Lieferant] NVARCHAR(100) NULL,
    [opp_Artikelname_Lieferant] NVARCHAR(500) NOT NULL,
    [opp_Artikelindex] NVARCHAR(50) NULL,
    [opp_Artikelname] NVARCHAR(500) NULL,
    [opp_ArtikelindexVorschlag] NVARCHAR(50) NULL,
    [opp_ArtikelnameVorschlag] NVARCHAR(500) NULL,
    [opp_MatchStatus] NVARCHAR(20) NOT NULL CONSTRAINT [DF_tblOptionenPositionen_MatchStatus] DEFAULT (N'unmatched'),
    [opp_MatchGrund] NVARCHAR(1000) NULL,
    [opp_Kunststofftyp] NVARCHAR(100) NULL,
    [opp_Zustand] NVARCHAR(100) NULL,
    [opp_ZustandNorm] NVARCHAR(50) NULL,
    [opp_Charge] NVARCHAR(100) NULL,
    [opp_MengeVon] DECIMAL(18,3) NULL,
    [opp_MengeBis] DECIMAL(18,3) NULL,
    [opp_Mengeneinheit] NVARCHAR(30) NULL,
    [opp_MengeRohtext] NVARCHAR(500) NULL,
    [opp_MengeVonKg] DECIMAL(18,3) NULL,
    [opp_MengeBisKg] DECIMAL(18,3) NULL,
    [opp_PreisRoh] DECIMAL(18,4) NULL,
    [opp_PreiseinheitRoh] NVARCHAR(30) NULL,
    [opp_PreisProTonne] DECIMAL(18,4) NULL,
    [opp_Waehrung] NVARCHAR(6) NULL,
    [opp_MFI] DECIMAL(18,3) NULL,
    [opp_MFI_Pruefmethode] NVARCHAR(100) NULL,
    [opp_Dichte] DECIMAL(18,3) NULL,
    [opp_DichteEinheit] NVARCHAR(30) NULL,
    [opp_C2] DECIMAL(18,3) NULL,
    [opp_Eigenschaften] NVARCHAR(MAX) NULL,
    [opp_Ladehinweis] NVARCHAR(1000) NULL,
    [opp_Kommentar] NVARCHAR(1000) NULL,
    [opp_GueltigBis] DATE NULL,
    [opp_ErstelltVon] NVARCHAR(100) NOT NULL,
    [opp_ErstelltAm] DATETIME2(7) NOT NULL CONSTRAINT [DF_tblOptionenPositionen_ErstelltAm] DEFAULT (SYSUTCDATETIME()),
    [opp_GeaendertVon] NVARCHAR(100) NOT NULL,
    [opp_GeaendertAm] DATETIME2(7) NOT NULL CONSTRAINT [DF_tblOptionenPositionen_GeaendertAm] DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT [UQ_tblOptionenPositionen_Pos] UNIQUE ([opp_op_id], [opp_Positionsnummer]),
    CONSTRAINT [CK_tblOptionenPositionen_Menge] CHECK ([opp_MengeVon] IS NULL OR [opp_MengeBis] IS NULL OR [opp_MengeBis] >= [opp_MengeVon]),
    CONSTRAINT [CK_tblOptionenPositionen_MengeKg] CHECK ([opp_MengeVonKg] IS NULL OR [opp_MengeBisKg] IS NULL OR [opp_MengeBisKg] >= [opp_MengeVonKg]),
    CONSTRAINT [CK_tblOptionenPositionen_Preis] CHECK ([opp_PreisRoh] IS NULL OR [opp_PreisRoh] >= 0),
    CONSTRAINT [CK_tblOptionenPositionen_Match] CHECK ([opp_MatchStatus] IN (N'unmatched', N'suggested', N'confirmed'))
  );
  CREATE INDEX [IX_tblOptionenPositionen_Option] ON [BMSApp].[tblOptionenPositionen] ([opp_op_id], [opp_Positionsnummer]);

  CREATE TABLE [BMSApp].[tblOptionenArtikelMapping] (
    [oam_id] INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_tblOptionenArtikelMapping] PRIMARY KEY,
    [oam_MandantID] INT NOT NULL,
    [oam_Lieferantenkennung] NVARCHAR(255) NOT NULL,
    [oam_Lieferantenname] NVARCHAR(255) NOT NULL,
    [oam_Artikelnummer_Lieferant] NVARCHAR(100) NULL,
    [oam_Artikelname_Lieferant] NVARCHAR(500) NOT NULL,
    [oam_ArtikelnameNorm] NVARCHAR(500) NOT NULL,
    [oam_Kunststofftyp] NVARCHAR(100) NULL,
    [oam_ZustandNorm] NVARCHAR(50) NULL,
    [oam_MFIvon] DECIMAL(18,3) NULL,
    [oam_MFIbis] DECIMAL(18,3) NULL,
    [oam_MFI_Pruefmethode] NVARCHAR(100) NULL,
    [oam_Artikelindex] NVARCHAR(50) NOT NULL,
    [oam_Artikelname] NVARCHAR(500) NOT NULL,
    [oam_Aktiv] BIT NOT NULL CONSTRAINT [DF_tblOptionenArtikelMapping_Aktiv] DEFAULT (1),
    [oam_ErstelltVon] NVARCHAR(100) NOT NULL,
    [oam_ErstelltAm] DATETIME2(7) NOT NULL CONSTRAINT [DF_tblOptionenArtikelMapping_ErstelltAm] DEFAULT (SYSUTCDATETIME()),
    [oam_GeaendertVon] NVARCHAR(100) NOT NULL,
    [oam_GeaendertAm] DATETIME2(7) NOT NULL CONSTRAINT [DF_tblOptionenArtikelMapping_GeaendertAm] DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT [CK_tblOptionenArtikelMapping_MFI] CHECK ([oam_MFIvon] IS NULL OR [oam_MFIbis] IS NULL OR [oam_MFIbis] >= [oam_MFIvon])
  );
  CREATE INDEX [IX_tblOptionenArtikelMapping_Lookup] ON [BMSApp].[tblOptionenArtikelMapping]
    ([oam_MandantID], [oam_Lieferantenkennung], [oam_Aktiv], [oam_ArtikelnameNorm]);

  CREATE TABLE [BMSApp].[tblOptionenLieferantenRegel] (
    [olr_id] INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_tblOptionenLieferantenRegel] PRIMARY KEY,
    [olr_MandantID] INT NOT NULL,
    [olr_Lieferantenkennung] NVARCHAR(255) NOT NULL,
    [olr_Alias] NVARCHAR(255) NULL,
    [olr_AbsenderDomain] NVARCHAR(255) NULL,
    [olr_MengeneinheitStandard] NVARCHAR(30) NULL,
    [olr_PreiseinheitStandard] NVARCHAR(30) NULL,
    [olr_Begruendung] NVARCHAR(1000) NULL,
    [olr_Aktiv] BIT NOT NULL CONSTRAINT [DF_tblOptionenLieferantenRegel_Aktiv] DEFAULT (0),
    [olr_GeaendertVon] NVARCHAR(100) NOT NULL,
    [olr_GeaendertAm] DATETIME2(7) NOT NULL CONSTRAINT [DF_tblOptionenLieferantenRegel_GeaendertAm] DEFAULT (SYSUTCDATETIME())
  );
  CREATE INDEX [IX_tblOptionenLieferantenRegel_Lookup] ON [BMSApp].[tblOptionenLieferantenRegel]
    ([olr_MandantID], [olr_Lieferantenkennung], [olr_Aktiv]);
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO
