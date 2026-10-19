SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH(N'BMSApp.tblOptionenPositionen',N'opp_NormalisierungJson') IS NULL
 ALTER TABLE BMSApp.tblOptionenPositionen ADD
  opp_VerpackungRoh NVARCHAR(500) NULL,
  opp_MindestabnahmeRoh DECIMAL(18,3) NULL,opp_ChargenbestandRoh DECIMAL(18,3) NULL,
  opp_GebindegewichtRohKg DECIMAL(18,3) NULL,opp_PalettengewichtRohKg DECIMAL(18,3) NULL,
  opp_Verpackung NVARCHAR(100) NULL,opp_Verpackungsart_id INT NULL,
  opp_GebindegewichtKg DECIMAL(18,3) NULL,opp_PalettengewichtKg DECIMAL(18,3) NULL,opp_MaxLadegewichtKg DECIMAL(18,3) NULL,
  opp_MindestabnahmeKg DECIMAL(18,3) NULL,opp_ChargenbestandKg DECIMAL(18,3) NULL,
  opp_LKWAnzahlVon DECIMAL(18,3) NULL,opp_LKWAnzahlBis DECIMAL(18,3) NULL,
  opp_Mengenart NVARCHAR(30) NULL,opp_MengeneinheitNorm NVARCHAR(30) NULL,opp_PreiseinheitNorm NVARCHAR(30) NULL,
  opp_NormalisierungJson NVARCHAR(MAX) NULL,opp_NormalisierungVersion NVARCHAR(30) NULL,
  opp_NormalisiertAm DATETIME2(7) NULL;
IF COL_LENGTH(N'BMSApp.tblOptionenLieferantenRegel',N'olr_Dokumenttyp') IS NULL
 ALTER TABLE BMSApp.tblOptionenLieferantenRegel ADD olr_Dokumenttyp NVARCHAR(100) NULL,
  olr_BedingungenJson NVARCHAR(MAX) NULL,olr_Version NVARCHAR(30) NULL,
  olr_Prioritaet INT NOT NULL CONSTRAINT DF_OptionRegel_Prioritaet DEFAULT 0;
-- Business rules approved on 19.10.2026. Never modify source units or prices.
-- Borealis override applies only to the known table, EUR and price range below.
EXEC(N'INSERT BMSApp.tblOptionenLieferantenRegel(olr_MandantID,olr_Lieferantenkennung,olr_Dokumenttyp,
 olr_MengeneinheitStandard,olr_PreiseinheitStandard,olr_BedingungenJson,olr_Version,olr_Prioritaet,
 olr_Begruendung,olr_Aktiv,olr_GeaendertVon)
 SELECT 3,v.supplier,v.template,v.quantityUnit,N''EUR/t'',v.conditions,N''2026-10-19.1'',100,
 v.reason,0,N''OPTION_READER''
 FROM (VALUES
 (N''borealis'',N''borealis-table'',N''kg'',N''{"quantityWeights":[23375,23750,24750,25000],"priceRange":[100,5000],"overrideKgHeader":true}'',
  N''Freigegebene Borealis-Tabellenregel: bekannte Ladegewichte in kg; Preise in EUR/t trotz widersprüchlicher Euro/Kg-Überschrift. Rohwerte bleiben erhalten.''),
 (N''totalenergies'',N''total-offer'',N''t'',N''{"priceRange":[100,5000]}'',
  N''Freigegebene Total-Offer-Regel: XFA-Mengen in Tonnen, Preise in EUR/t; ausdrückliche Positionsangaben haben Vorrang.''),
 (N''totalenergies'',N''supplier-mail'',NULL,N''{"priceRange":[100,5000]}'',
  N''Freigegebene Total-Mailregel: fehlenden Preisbezug als EUR/t ergänzen; Mengen nur mit Quellenangabe oder passender Formatregel.''),
 (N''hth-chemicals.nl'',N''supplier-mail'',NULL,N''{"priceRange":[100,5000]}'',
  N''Freigegebene HTH-Angebotsregel: fehlenden Preisbezug als EUR/t ergänzen; vorhandene Quellenangaben haben Vorrang.''),
 (N''ineos.com'',N''supplier-mail'',NULL,N''{"priceRange":[100,5000]}'',
  N''Freigegebene INEOS-Angebotsregel: fehlenden Preisbezug als EUR/t ergänzen; vorhandene Quellenangaben haben Vorrang.'')
 )v(supplier,template,quantityUnit,conditions,reason)
 WHERE NOT EXISTS(SELECT 1 FROM BMSApp.tblOptionenLieferantenRegel r
  WHERE r.olr_MandantID=3 AND r.olr_Lieferantenkennung=v.supplier AND r.olr_Dokumenttyp=v.template AND r.olr_Version=N''2026-10-19.1'');');
COMMIT;
-- Activate the seeded rules only after deployment of the new Reader:
-- scripts/apply-commercial-normalization.ps1 -ActivateRules (Reader repository).
