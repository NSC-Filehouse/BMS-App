/*
  Idempotent Frupack examples from C:\Projekte\Optionen.
  These are demonstration offers: treat them as newly received on the day this
  script runs and make them visible for 28 days. Original Total deadlines are
  retained separately in op_source_valid_until.
  Run add_options.sql first. Existing business rows are never updated or removed.
*/
USE [BMS];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRANSACTION;
DECLARE @today DATE = CONVERT(DATE, SYSDATETIME());
DECLARE @now DATETIME2(7) = SYSUTCDATETIME();
DECLARE @validUntil DATE = DATEADD(DAY, 28, @today);
DECLARE @actor NVARCHAR(100) = N'SAMPLE_IMPORT';

INSERT INTO [BMSApp].[tblOptionen] (
  [op_company_id], [op_supplier_name], [op_external_offer_no], [op_external_customer_no],
  [op_received_at], [op_valid_from], [op_valid_until], [op_source_valid_until],
  [op_incoterm], [op_loading_location], [op_packaging_text], [op_reply_to],
  [op_terms_text], [op_source_type], [op_source_key], [op_source_file_name],
  [op_is_demo], [op_review_status], [op_business_status], [op_created_by], [op_last_modified_by]
)
SELECT 3, v.supplierName, v.offerNo, v.customerNo,
       @now, @today, @validUntil, v.sourceValidUntil,
       v.incoterm, v.loadingLocation, v.packaging, v.replyTo,
       v.terms, v.sourceType, v.sourceKey, v.fileName,
       1, N'approved', N'open', @actor, @actor
FROM (VALUES
  (N'example:longfield:offer-1', N'Longfield Chemicals Limited', NULL, NULL, NULL, N'FCA', N'Germany', N'25 kg bags', NULL, N'Loading prompt after order.', N'email_screenshot', N'Longfield Offer 1.png'),
  (N'example:longfield:offer-2', N'Longfield Chemicals Limited', NULL, NULL, NULL, N'FCA', N'Holland', N'25 kg bags on pallets', NULL, N'Loading prompt after order or 1st October if preferred; year not stated.', N'email_screenshot', N'Longfield Offer 2.png'),
  (N'example:total:2037660', N'TotalEnergies', N'2037660', N'80102169', CONVERT(DATE, '2026-09-06'), N'FCA', N'PP Feluy', N'BAGS', N'poloffgrade.rc-supply@mail03.totalenergies.com', NULL, N'xfa_pdf', N'Offer  2037660.PDF'),
  (N'example:total:2037688', N'TotalEnergies', N'2037688', N'80102169', CONVERT(DATE, '2026-09-09'), N'FCA', N'PP Feluy', N'BAGS', N'poloffgrade.rc-supply@mail03.totalenergies.com', NULL, N'xfa_pdf', N'Offer  2037688.PDF'),
  (N'example:total:2037746', N'TotalEnergies', N'2037746', N'80102169', CONVERT(DATE, '2026-09-14'), N'FCA', N'Usine de Gonfreville L''Orcher', N'BAGS', N'poloffgrade.rc-supply@mail03.totalenergies.com', NULL, N'xfa_pdf', N'Offer  2037746.PDF'),
  (N'example:total:2037748', N'TotalEnergies', N'2037748', N'80102169', CONVERT(DATE, '2026-09-14'), N'FCA', N'Usine de Gonfreville L''Orcher', N'BAGS', N'poloffgrade.rc-supply@mail03.totalenergies.com', NULL, N'xfa_pdf', N'Offer  2037748.PDF'),
  (N'example:total:2037758', N'TotalEnergies', N'2037758', N'80102169', CONVERT(DATE, '2026-09-15'), N'FCA', N'PP Feluy', N'BAGS', N'poloffgrade.rc-supply@mail03.totalenergies.com', NULL, N'xfa_pdf', N'Offer  2037758.PDF')
) AS v(sourceKey, supplierName, offerNo, customerNo, sourceValidUntil, incoterm, loadingLocation, packaging, replyTo, terms, sourceType, fileName)
WHERE NOT EXISTS (
  SELECT 1 FROM [BMSApp].[tblOptionen] existing
  WHERE existing.[op_company_id] = 3 AND existing.[op_source_key] = v.sourceKey
);

UPDATE [BMSApp].[tblOptionen] SET [op_is_demo] = 1
WHERE [op_company_id] = 3 AND [op_source_key] IN (
  N'example:longfield:offer-1', N'example:longfield:offer-2',
  N'example:total:2037660', N'example:total:2037688',
  N'example:total:2037746', N'example:total:2037748', N'example:total:2037758'
) AND [op_is_demo] = 0;

INSERT INTO [BMSApp].[tblOptionenPositionen] (
  [opp_op_id], [opp_line_no], [opp_supplier_article_no], [opp_supplier_article_name],
  [opp_internal_article_name], [opp_material_category], [opp_quality], [opp_batch_no],
  [opp_quantity_min], [opp_quantity_max], [opp_quantity_unit], [opp_quantity_text],
  [opp_price], [opp_price_unit], [opp_currency], [opp_mfi], [opp_mfi_test_condition],
  [opp_density], [opp_c2], [opp_properties_text], [opp_loading_text],
  [opp_created_by], [opp_last_modified_by]
)
SELECT o.[op_id], v.[lineNo], v.articleNo, v.articleName,
       NULL, v.category, v.quality, v.batchNo,
       v.quantityMin, v.quantityMax, v.quantityUnit, v.quantityText,
       v.price, v.priceUnit, N'EUR', v.mfi, v.mfiCondition,
       v.density, v.c2, v.properties, v.loadingText,
       @actor, @actor
FROM (VALUES
  (N'example:longfield:offer-1', 1, NULL, N'PPHP mfi 12.0 near to prime', N'PPHP', N'near to prime', NULL, CONVERT(DECIMAL(18,3), 1), CONVERT(DECIMAL(18,3), 2), N'truckload', N'1-2 truckloads', CONVERT(DECIMAL(18,4), 995), N'mT', CONVERT(DECIMAL(18,3), 12.0), NULL, NULL, NULL, NULL, N'Loading prompt after order.'),
  (N'example:longfield:offer-2', 1, NULL, N'LDPE mfi 2.0 no adds near to prime', N'LDPE', N'near to prime', NULL, CONVERT(DECIMAL(18,3), 3), CONVERT(DECIMAL(18,3), 3), N'truckload', N'3 truckloads', CONVERT(DECIMAL(18,4), 1150), N'mT', CONVERT(DECIMAL(18,3), 2.0), NULL, NULL, NULL, N'No additives.', N'Prompt after order or 1st October if preferred.'),
  (N'example:longfield:offer-2', 2, NULL, N'LDPE mfi 4.0 no adds near to prime', N'LDPE', N'near to prime', NULL, CONVERT(DECIMAL(18,3), 1), CONVERT(DECIMAL(18,3), 1), N'truckload', N'1 truckload', CONVERT(DECIMAL(18,4), 1150), N'mT', CONVERT(DECIMAL(18,3), 4.0), NULL, NULL, NULL, N'No additives.', N'Prompt after order or 1st October if preferred.'),
  (N'example:total:2037660', 1, N'415796', N'PPH 10000 OG', N'PPH', N'off grade', N'6G04DBA0', CONVERT(DECIMAL(18,3), 2.750), CONVERT(DECIMAL(18,3), 2.750), NULL, N'2.750 (unit not stated in XFA data)', CONVERT(DECIMAL(18,4), 1000), NULL, CONVERT(DECIMAL(18,3), 41.000), NULL, NULL, NULL, N'en attente MFI sacs-NH; C2: NA', NULL),
  (N'example:total:2037660', 2, N'415796', N'PPH 10000 OG', N'PPH', N'off grade', N'6H13DBD3', CONVERT(DECIMAL(18,3), 19.250), CONVERT(DECIMAL(18,3), 19.250), NULL, N'19.250 (unit not stated in XFA data)', CONVERT(DECIMAL(18,4), 1000), NULL, CONVERT(DECIMAL(18,3), 36.700), NULL, NULL, NULL, N'en attente composition et MFI sacs-NH; C2: NA', NULL),
  (N'example:total:2037688', 1, N'415796', N'PPH 10000 OG', N'PPH', N'off grade', N'6H05DBB2', CONVERT(DECIMAL(18,3), 99.000), CONVERT(DECIMAL(18,3), 99.000), NULL, N'99.000 (unit not stated in XFA data)', CONVERT(DECIMAL(18,4), 1000), NULL, CONVERT(DECIMAL(18,3), 35.700), NULL, NULL, NULL, N'en attente MFI sacs-TR PPR10232 to PPR12236(32T) to PPH7059FIB(77T) to MR2002(35T) to MH140CN0(74T)+ESU(14T)-Ne pas gerber-NH; C2: NA', NULL),
  (N'example:total:2037746', 1, N'426871', N'PEHD 2007TN61 near prime', N'PEHD', N'near prime', N'P608033', CONVERT(DECIMAL(18,3), 156.750), CONVERT(DECIMAL(18,3), 156.750), NULL, N'156.750 (unit not stated in XFA data)', CONVERT(DECIMAL(18,4), 970), NULL, CONVERT(DECIMAL(18,3), 43.300), N'21.6 kg', CONVERT(DECIMAL(18,3), 959.100), NULL, NULL, NULL),
  (N'example:total:2037748', 1, N'441084', N'PEHD 2008DN60 OG', N'PEHD', N'off grade', N'P608038', CONVERT(DECIMAL(18,3), 47.400), CONVERT(DECIMAL(18,3), 47.400), NULL, N'47.400 (unit not stated in XFA data)', CONVERT(DECIMAL(18,4), 950), NULL, CONVERT(DECIMAL(18,3), 48.500), N'21.6 kg', CONVERT(DECIMAL(18,3), 959.200), NULL, N'AOX=215 PPM', NULL),
  (N'example:total:2037758', 1, N'413051', N'PPC 7600 OG', N'PPC', N'off grade', N'6G03DZB8', CONVERT(DECIMAL(18,3), 24.750), CONVERT(DECIMAL(18,3), 24.750), NULL, N'24.750 (unit not stated in XFA data)', CONVERT(DECIMAL(18,4), 1030), NULL, CONVERT(DECIMAL(18,3), 9.400), NULL, NULL, NULL, N'ESU(193T)+TR PPC7810B to PPC6742(70T) - Ne pas gerber - NH; C2: NA', NULL)
) AS v(sourceKey, [lineNo], articleNo, articleName, category, quality, batchNo, quantityMin, quantityMax, quantityUnit, quantityText, price, priceUnit, mfi, mfiCondition, density, c2, properties, loadingText)
JOIN [BMSApp].[tblOptionen] o ON o.[op_company_id] = 3 AND o.[op_source_key] = v.sourceKey
WHERE NOT EXISTS (
  SELECT 1 FROM [BMSApp].[tblOptionenPositionen] existing
  WHERE existing.[opp_op_id] = o.[op_id] AND existing.[opp_line_no] = v.[lineNo]
);

COMMIT TRANSACTION;
SELECT COUNT(*) AS optionCount FROM [BMSApp].[tblOptionen] WHERE [op_company_id] = 3 AND [op_source_key] LIKE N'example:%';
SELECT COUNT(*) AS positionCount FROM [BMSApp].[tblOptionenPositionen] p
JOIN [BMSApp].[tblOptionen] o ON o.[op_id] = p.[opp_op_id]
WHERE o.[op_company_id] = 3 AND o.[op_source_key] LIKE N'example:%';
