SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'BMSApp.tblOptionenAbgleich',N'U') IS NULL
BEGIN
 CREATE TABLE BMSApp.tblOptionenAbgleich(
  oab_id BIGINT IDENTITY PRIMARY KEY,
  oab_opp_id INT NOT NULL REFERENCES BMSApp.tblOptionenPositionen(opp_id),
  oab_MandantID INT NOT NULL,
  oab_EingabeHash CHAR(64) NOT NULL,
  oab_KontextHash CHAR(64) NOT NULL,
  oab_QuelldatenGeaendertAm DATETIME2(7) NOT NULL,
  oab_AlgorithmusVersion NVARCHAR(30) NOT NULL,
  oab_AnforderungRevision INT NOT NULL DEFAULT 0,
  oab_Kunststoff NVARCHAR(100) NOT NULL,
  oab_KunststoffUntergruppe NVARCHAR(100) NOT NULL,
  oab_KategorieQuelle NVARCHAR(30) NOT NULL,
  oab_ArtikelindexVorschlag NVARCHAR(50) NULL,
  oab_ArtikelnameVorschlag NVARCHAR(500) NULL,
  oab_VorschlagGrund NVARCHAR(2000) NULL,
  oab_KandidatenAnzahl INT NOT NULL,
  oab_MerkmaleJson NVARCHAR(MAX) NOT NULL CHECK(ISJSON(oab_MerkmaleJson)=1),
  oab_BerechnetAm DATETIME2(7) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_OptionenAbgleich_Position UNIQUE(oab_id,oab_opp_id)
 );
 CREATE INDEX IX_OptionenAbgleich_Position ON BMSApp.tblOptionenAbgleich(oab_opp_id,oab_id DESC);
END;
IF COL_LENGTH(N'BMSApp.tblOptionenAbgleich',N'oab_AnforderungRevision') IS NULL
 ALTER TABLE BMSApp.tblOptionenAbgleich ADD oab_AnforderungRevision INT NOT NULL DEFAULT 0;
IF OBJECT_ID(N'BMSApp.tblOptionenArtikelKandidaten',N'U') IS NULL
BEGIN
 CREATE TABLE BMSApp.tblOptionenArtikelKandidaten(
  oak_oab_id BIGINT NOT NULL REFERENCES BMSApp.tblOptionenAbgleich(oab_id),
  oak_Artikelindex NVARCHAR(50) NOT NULL,
  oak_Artikelname NVARCHAR(500) NOT NULL,
  oak_Rang INT NOT NULL,
  oak_Punkte INT NOT NULL,
  oak_DatenJson NVARCHAR(MAX) NOT NULL CHECK(ISJSON(oak_DatenJson)=1),
  PRIMARY KEY(oak_oab_id,oak_Artikelindex),
  CONSTRAINT UQ_OptionenKandidaten_Rang UNIQUE(oak_oab_id,oak_Rang)
 );
END;
IF OBJECT_ID(N'BMSApp.tblOptionenAbgleichAuftrag',N'U') IS NULL
BEGIN
 CREATE TABLE BMSApp.tblOptionenAbgleichAuftrag(
  oaa_MandantID INT NOT NULL PRIMARY KEY,
  oaa_Revision INT NOT NULL DEFAULT 1,
  oaa_Status NVARCHAR(20) NOT NULL DEFAULT N'pending'
    CHECK(oaa_Status IN(N'pending',N'running',N'done',N'error')),
  oaa_Grund NVARCHAR(200) NULL,
  oaa_GesperrtBis DATETIME2(7) NULL,
  oaa_GesperrtVon UNIQUEIDENTIFIER NULL,
  oaa_NaechsterVersuchAm DATETIME2(7) NOT NULL DEFAULT SYSUTCDATETIME(),
  oaa_Versuche INT NOT NULL DEFAULT 0,
  oaa_Fehler NVARCHAR(2000) NULL,
  oaa_GeaendertAm DATETIME2(7) NOT NULL DEFAULT SYSUTCDATETIME(),
  oaa_LetzterErfolgAm DATETIME2(7) NULL
 );
END;
IF COL_LENGTH(N'BMSApp.tblOptionenAbgleichAuftrag',N'oaa_GesperrtVon') IS NULL
 ALTER TABLE BMSApp.tblOptionenAbgleichAuftrag ADD oaa_GesperrtVon UNIQUEIDENTIFIER NULL;
IF OBJECT_ID(N'BMSApp.tblOptionenLieferantenKonto',N'U') IS NULL
BEGIN
 CREATE TABLE BMSApp.tblOptionenLieferantenKonto(
  olk_MandantID INT NOT NULL,
  olk_LieferantenNummer NVARCHAR(50) NOT NULL,
  olk_Lieferantenkennung NVARCHAR(255) NOT NULL,
  olk_Lieferantenname NVARCHAR(255) NOT NULL,
  olk_Aktiv BIT NOT NULL DEFAULT 1,
  olk_Hinweis NVARCHAR(500) NULL,
  PRIMARY KEY(olk_MandantID,olk_LieferantenNummer)
 );
END;
IF COL_LENGTH(N'BMSApp.tblOptionenPositionen',N'opp_AktuellerAbgleichID') IS NULL
 ALTER TABLE BMSApp.tblOptionenPositionen ADD opp_AktuellerAbgleichID BIGINT NULL;
IF COL_LENGTH(N'BMSApp.tblOptionenPositionen',N'opp_LernenAngefordert') IS NULL
 ALTER TABLE BMSApp.tblOptionenPositionen ADD opp_LernenAngefordert BIT NOT NULL DEFAULT 0;
IF COL_LENGTH(N'BMSApp.tblOptionenPositionen',N'opp_ZuordnungRevision') IS NULL
 ALTER TABLE BMSApp.tblOptionenPositionen ADD opp_ZuordnungRevision INT NOT NULL DEFAULT 0;
IF COL_LENGTH(N'BMSApp.tblOptionenPositionen',N'opp_LernregelHinweis') IS NULL
 ALTER TABLE BMSApp.tblOptionenPositionen ADD opp_LernregelHinweis NVARCHAR(500) NULL;
IF COL_LENGTH(N'BMSApp.tblOptionenPositionen',N'opp_BestaetigtKunststoff') IS NULL
 ALTER TABLE BMSApp.tblOptionenPositionen ADD opp_BestaetigtKunststoff NVARCHAR(100) NULL,opp_BestaetigtUntergruppe NVARCHAR(100) NULL;
IF COL_LENGTH(N'BMSApp.tblOptionenArtikelMapping',N'oam_QuellePositionID') IS NULL
 ALTER TABLE BMSApp.tblOptionenArtikelMapping ADD oam_QuellePositionID INT NULL;
IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_OptionPosition_AktuellerAbgleich')
 EXEC(N'ALTER TABLE BMSApp.tblOptionenPositionen ADD CONSTRAINT FK_OptionPosition_AktuellerAbgleich
 FOREIGN KEY(opp_AktuellerAbgleichID,opp_id) REFERENCES BMSApp.tblOptionenAbgleich(oab_id,oab_opp_id)');
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'BMSApp.tblOptionenArtikelMapping') AND name=N'UX_OptionenMapping_QuelleAktiv')
 EXEC(N'CREATE UNIQUE INDEX UX_OptionenMapping_QuelleAktiv ON BMSApp.tblOptionenArtikelMapping(oam_QuellePositionID) WHERE oam_QuellePositionID IS NOT NULL AND oam_Aktiv=1');

-- Reviewed company accounts from the existing FRU purchasing history. These
-- links provide historical evidence, never a confirmed article assignment.
INSERT BMSApp.tblOptionenLieferantenKonto(olk_MandantID,olk_LieferantenNummer,olk_Lieferantenkennung,olk_Lieferantenname,olk_Hinweis)
SELECT 3,v.id,v.supplier,k.kd_Name1,N'Firmenkonto aus Einkaufshistorie; technische Eignung jeder neuen Charge prüfen.'
FROM (VALUES(N'99938',N'borealis'),(N'LF0124',N'borealis'),(N'UK1736',N'longfield'),
 (N'LF0117',N'totalenergies'),(N'50772',N'ineos.com'),(N'NL3741',N'hth-chemicals.nl'))v(id,supplier)
JOIN [BMS.FRU].dbo.tblKunden k ON k.kd_KdNR=v.id
WHERE NOT EXISTS(SELECT 1 FROM BMSApp.tblOptionenLieferantenKonto x WHERE x.olk_MandantID=3 AND x.olk_LieferantenNummer=v.id);
INSERT BMSApp.tblOptionenAbgleichAuftrag(oaa_MandantID,oaa_Grund)
SELECT DISTINCT o.op_MandantID,N'Erstberechnung nach Migration' FROM BMSApp.tblOptionen o
WHERE o.op_GeloeschtAm IS NULL AND NOT EXISTS(SELECT 1 FROM BMSApp.tblOptionenAbgleichAuftrag j WHERE j.oaa_MandantID=o.op_MandantID);
COMMIT;
