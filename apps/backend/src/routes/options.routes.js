const express = require('express');
const config = require('../config');
const { asyncHandler, createHttpError, sendEnvelope } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { requirePilotFeature } = require('../middlewares/pilot-feature.middleware');
const { runSQLQueryAccess, runSQLQuerySqlServer, withSqlTransaction } = require('../db/access');
const { rankCandidates, normalizeProductName } = require('../options/article-matching');
const { appTableSql } = require('../db/app-tables');

const router = express.Router();
const OPTIONS = appTableSql('options');
const POSITIONS = appTableSql('optionPositions');

function berlinDate() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function mapPosition(row) {
  return {
    id: Number(row.id),
    articleName: row.articleName,
    internalArticleName: row.internalArticleName || null,
    materialCategory: row.materialCategory || null,
    quality: row.quality || null,
    batchNo: row.batchNo || null,
    quantityMin: row.quantityMin === null ? null : Number(row.quantityMin),
    quantityMax: row.quantityMax === null ? null : Number(row.quantityMax),
    quantityUnit: row.quantityUnit || null,
    quantityText: row.quantityText || null,
    price: row.price === null ? null : Number(row.price),
    priceUnit: row.priceUnit || null,
    currency: row.currency || null,
    mfi: row.mfi === null ? null : Number(row.mfi),
    mfiTestCondition: row.mfiTestCondition || null,
    density: row.density === null ? null : Number(row.density),
    densityUnit: row.densityUnit || null,
    quantityMinKg: row.quantityMinKg === null ? null : Number(row.quantityMinKg),
    quantityMaxKg: row.quantityMaxKg === null ? null : Number(row.quantityMaxKg),
    pricePerTonne: row.pricePerTonne === null ? null : Number(row.pricePerTonne),
    comment: row.comment || null,
    qualityNorm: row.qualityNorm || null,
    articleIndex: row.articleIndex || null,
    suggestedArticleIndex: row.suggestedArticleIndex || null,
    suggestedArticleName: row.suggestedArticleName || null,
    matchStatus: row.matchStatus || 'unmatched',
    matchReason: row.matchReason || null,
    c2: row.c2 === null ? null : Number(row.c2),
    propertiesText: row.propertiesText || null,
    loadingText: row.loadingText || null,
    validUntil: dateOnly(row.validUntil),
  };
}

function mapOption(row, positions) {
  return {
    id: Number(row.id),
    supplierName: row.supplierName,
    isDemo: Boolean(row.isDemo),
    externalOfferNo: row.externalOfferNo || null,
    validUntil: dateOnly(row.validUntil),
    sourceValidUntil: dateOnly(row.sourceValidUntil),
    incoterm: row.incoterm || null,
    loadingLocation: row.loadingLocation || null,
    packagingText: row.packagingText || null,
    termsText: row.termsText || null,
    comment: row.comment || null,
    negotiable: row.negotiable || 'unknown',
    negotiableEvidence: row.negotiableEvidence || null,
    supplierKey: row.supplierKey || null,
    positions,
  };
}

router.get('/options', requireMandant, requirePilotFeature('options'), asyncHandler(async (req, res) => {
  const companyId = Number(req.database?.firmaId);
  const today = berlinDate();
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT o.[op_id] AS id, o.[op_Lieferantenname] AS supplierName,
      o.[op_Angebotsnummer] AS externalOfferNo, o.[op_GueltigBis] AS validUntil,
      o.[op_QuellGueltigBis] AS sourceValidUntil,
      o.[op_IstDemo] AS isDemo,
      o.[op_Incoterm] AS incoterm, o.[op_Ladeort] AS loadingLocation,
      o.[op_Verpackung] AS packagingText, o.[op_Konditionen] AS termsText,
      o.[op_Kommentar] AS comment, o.[op_Nachverhandelbar] AS negotiable,
      o.[op_NachverhandelbarQuelle] AS negotiableEvidence,
      o.[op_Lieferantenkennung] AS supplierKey
    FROM ${OPTIONS} o
    WHERE o.[op_MandantID] = ? AND o.[op_Pruefstatus] IN (N'approved', N'pending')
      AND o.[op_Geschaeftsstatus] = N'open' AND o.[op_GeloeschtAm] IS NULL AND o.[op_GueltigAb] <= ?
      AND EXISTS (SELECT 1 FROM ${POSITIONS} p WHERE p.[opp_op_id] = o.[op_id]
        AND COALESCE(p.[opp_GueltigBis], o.[op_GueltigBis]) >= ?)
    ORDER BY o.[op_GueltigBis], o.[op_id] DESC
  `, [companyId, today, today]);
  const ids = rows.map((row) => Number(row.id));
  let positions = [];
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(', ');
    positions = await runSQLQuerySqlServer(config.sql.database, `
      SELECT p.[opp_id] AS id, p.[opp_op_id] AS optionId,
        p.[opp_Artikelname_Lieferant] AS articleName, p.[opp_Artikelname] AS internalArticleName,
        p.[opp_Kunststofftyp] AS materialCategory, p.[opp_Zustand] AS quality, p.[opp_Charge] AS batchNo,
        p.[opp_MengeVon] AS quantityMin, p.[opp_MengeBis] AS quantityMax,
        p.[opp_Mengeneinheit] AS quantityUnit, p.[opp_MengeRohtext] AS quantityText,
        p.[opp_PreisRoh] AS price, p.[opp_PreiseinheitRoh] AS priceUnit, p.[opp_Waehrung] AS currency,
        p.[opp_MFI] AS mfi, p.[opp_MFI_Pruefmethode] AS mfiTestCondition,
        p.[opp_Dichte] AS density, p.[opp_C2] AS c2, p.[opp_Eigenschaften] AS propertiesText,
        p.[opp_Ladehinweis] AS loadingText, p.[opp_Kommentar] AS comment,
        p.[opp_MengeVonKg] AS quantityMinKg, p.[opp_MengeBisKg] AS quantityMaxKg,
        p.[opp_PreisProTonne] AS pricePerTonne, p.[opp_DichteEinheit] AS densityUnit,
        p.[opp_ZustandNorm] AS qualityNorm, p.[opp_Artikelindex] AS articleIndex,
        p.[opp_ArtikelindexVorschlag] AS suggestedArticleIndex,
        p.[opp_ArtikelnameVorschlag] AS suggestedArticleName,
        p.[opp_MatchStatus] AS matchStatus, p.[opp_MatchGrund] AS matchReason,
        COALESCE(p.[opp_GueltigBis], o.[op_GueltigBis]) AS validUntil
      FROM ${POSITIONS} p JOIN ${OPTIONS} o ON o.[op_id] = p.[opp_op_id]
      WHERE p.[opp_op_id] IN (${placeholders}) AND COALESCE(p.[opp_GueltigBis], o.[op_GueltigBis]) >= ?
      ORDER BY p.[opp_op_id], p.[opp_Positionsnummer]
    `, [...ids, today]);
  }
  const byOption = new Map(ids.map((id) => [id, []]));
  positions.forEach((row) => byOption.get(Number(row.optionId))?.push(mapPosition(row)));
  sendEnvelope(res, { status: 200, data: rows.map((row) => mapOption(row, byOption.get(Number(row.id)))), meta: { mandant: req.mandant }, error: null });
}));

router.get('/options/:id', requireMandant, requirePilotFeature('options'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw createHttpError(400, 'Ungültige Option.', { code: 'INVALID_OPTION_ID' });
  const today = berlinDate();
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT o.[op_id] AS id, o.[op_Lieferantenname] AS supplierName,
      o.[op_Angebotsnummer] AS externalOfferNo, o.[op_GueltigBis] AS validUntil,
      o.[op_QuellGueltigBis] AS sourceValidUntil,
      o.[op_IstDemo] AS isDemo,
      o.[op_Incoterm] AS incoterm, o.[op_Ladeort] AS loadingLocation,
      o.[op_Verpackung] AS packagingText, o.[op_Konditionen] AS termsText,
      o.[op_Kommentar] AS comment, o.[op_Nachverhandelbar] AS negotiable,
      o.[op_NachverhandelbarQuelle] AS negotiableEvidence,
      o.[op_Lieferantenkennung] AS supplierKey
    FROM ${OPTIONS} o
    WHERE o.[op_id] = ? AND o.[op_MandantID] = ?
      AND o.[op_Pruefstatus] IN (N'approved', N'pending') AND o.[op_Geschaeftsstatus] = N'open'
      AND o.[op_GeloeschtAm] IS NULL
      AND o.[op_GueltigAb] <= ?
  `, [id, Number(req.database?.firmaId), today]);
  if (!rows.length) throw createHttpError(404, 'Option nicht gefunden.', { code: 'OPTION_NOT_FOUND' });
  const positions = await runSQLQuerySqlServer(config.sql.database, `
    SELECT p.[opp_id] AS id, p.[opp_Artikelname_Lieferant] AS articleName,
      p.[opp_Artikelname] AS internalArticleName,
      p.[opp_Kunststofftyp] AS materialCategory, p.[opp_Zustand] AS quality,
      p.[opp_Charge] AS batchNo, p.[opp_MengeVon] AS quantityMin,
      p.[opp_MengeBis] AS quantityMax, p.[opp_Mengeneinheit] AS quantityUnit,
      p.[opp_MengeRohtext] AS quantityText, p.[opp_PreisRoh] AS price,
      p.[opp_PreiseinheitRoh] AS priceUnit, p.[opp_Waehrung] AS currency,
      p.[opp_MFI] AS mfi, p.[opp_MFI_Pruefmethode] AS mfiTestCondition,
      p.[opp_Dichte] AS density, p.[opp_C2] AS c2,
      p.[opp_Eigenschaften] AS propertiesText, p.[opp_Ladehinweis] AS loadingText,
      p.[opp_Kommentar] AS comment, p.[opp_MengeVonKg] AS quantityMinKg,
      p.[opp_MengeBisKg] AS quantityMaxKg, p.[opp_PreisProTonne] AS pricePerTonne,
      p.[opp_DichteEinheit] AS densityUnit, p.[opp_ZustandNorm] AS qualityNorm,
      p.[opp_Artikelindex] AS articleIndex, p.[opp_ArtikelindexVorschlag] AS suggestedArticleIndex,
      p.[opp_ArtikelnameVorschlag] AS suggestedArticleName, p.[opp_MatchStatus] AS matchStatus,
      p.[opp_MatchGrund] AS matchReason,
      COALESCE(p.[opp_GueltigBis], o.[op_GueltigBis]) AS validUntil
    FROM ${POSITIONS} p JOIN ${OPTIONS} o ON o.[op_id] = p.[opp_op_id]
    WHERE p.[opp_op_id] = ? AND COALESCE(p.[opp_GueltigBis], o.[op_GueltigBis]) >= ?
    ORDER BY p.[opp_Positionsnummer]
  `, [id, today]);
  if (!positions.length) throw createHttpError(404, 'Option nicht gefunden.', { code: 'OPTION_NOT_FOUND' });
  sendEnvelope(res, { status: 200, data: mapOption(rows[0], positions.map(mapPosition)), meta: { mandant: req.mandant }, error: null });
}));

function positiveId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw createHttpError(400, 'Ungültige ID.', { code: 'INVALID_ID' });
  return id;
}

async function scopedPosition(req) {
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT p.[opp_id] AS id, p.[opp_Artikelname_Lieferant] AS articleName,
      p.[opp_Artikelnummer_Lieferant] AS supplierArticleNo,
      p.[opp_Kunststofftyp] AS materialCategory, p.[opp_Zustand] AS quality,
      p.[opp_ZustandNorm] AS qualityNorm, p.[opp_MFI] AS mfi,
      p.[opp_MFI_Pruefmethode] AS mfiTestCondition, p.[opp_Dichte] AS density,
      p.[opp_DichteEinheit] AS densityUnit, o.[op_Lieferantenkennung] AS supplierKey,
      o.[op_Lieferantenname] AS supplierName
    FROM ${POSITIONS} p JOIN ${OPTIONS} o ON o.[op_id]=p.[opp_op_id]
    WHERE o.[op_id]=? AND p.[opp_id]=? AND o.[op_MandantID]=?
      AND o.[op_GeloeschtAm] IS NULL AND o.[op_Geschaeftsstatus]=N'open'
  `, [positiveId(req.params.id), positiveId(req.params.positionId), Number(req.database.firmaId)]);
  if (!rows.length) throw createHttpError(404, 'Position nicht gefunden.', { code: 'OPTION_POSITION_NOT_FOUND' });
  return rows[0];
}

async function candidatesFor(req, position) {
  const articles = await runSQLQueryAccess(req.database, `
    SELECT [a].[agA_Artikelindex] AS articleIndex, [a].[agA_Artikelname] AS articleName,
      [a].[agA_MFI] AS mfi, [a].[agA_MFI_Pruefmethode] AS mfiMethod,
      [a].[agA_Dichte] AS density, [g].[ag_Gruppenname] AS groupName
    FROM [dbo].[tblArt_Artikel] [a]
    LEFT JOIN [dbo].[tblArtikelgruppe] [g] ON [g].[ag_Gruppenindex]=[a].[agA_Artikelgruppe]
    WHERE COALESCE([a].[agA_Deaktiv], 0)=0 AND [a].[agA_Artikelname] IS NOT NULL
  `);
  return rankCandidates(position, articles);
}

router.get('/options/:id/positions/:positionId/candidates', requireMandant, requirePilotFeature('options'), asyncHandler(async (req, res) => {
  const position = await scopedPosition(req);
  const candidates = await candidatesFor(req, position);
  sendEnvelope(res, { status: 200, data: candidates, meta: { mandant: req.mandant }, error: null });
}));

router.post('/options/:id/positions/:positionId/article', requireMandant, requirePilotFeature('options'), asyncHandler(async (req, res) => {
  const position = await scopedPosition(req);
  const articleIndex = String(req.body?.articleIndex || '').trim();
  if (!articleIndex || articleIndex.length > 50) throw createHttpError(400, 'Artikelindex fehlt.', { code: 'ARTICLE_INDEX_REQUIRED' });
  const articles = await runSQLQueryAccess(req.database, `
    SELECT [agA_Artikelindex] AS articleIndex, [agA_Artikelname] AS articleName,
      [agA_MFI] AS mfi
    FROM [dbo].[tblArt_Artikel]
    WHERE [agA_Artikelindex]=? AND COALESCE([agA_Deaktiv], 0)=0
  `, [articleIndex]);
  if (!articles.length) throw createHttpError(404, 'Artikel nicht gefunden.', { code: 'ARTICLE_NOT_FOUND' });
  const article = articles[0];
  const ranked = await candidatesFor(req, position);
  const selected = ranked.find((item) => item.articleIndex === articleIndex);
  const actor = String(req.userIdentity?.shortCode || req.userEmail || 'APP').slice(0, 100);
  await withSqlTransaction(config.sql.database, async ({ query }) => {
    const updated = await query(`UPDATE ${POSITIONS} SET [opp_Artikelindex]=?, [opp_Artikelname]=?,
      [opp_MatchStatus]=N'confirmed', [opp_MatchGrund]=N'Manuell in der App zugeordnet',
      [opp_GeaendertVon]=?, [opp_GeaendertAm]=SYSUTCDATETIME()
      WHERE [opp_id]=? AND [opp_op_id]=?`,
    [articleIndex, article.articleName, actor, Number(position.id), positiveId(req.params.id)]);
    if (!updated.rowsAffected[0]) throw createHttpError(409, 'Position wurde zwischenzeitlich geändert.', { code: 'OPTION_CHANGED' });
    await query(`UPDATE [BMSApp].[tblOptionenArtikelMapping] SET [oam_Aktiv]=0,
      [oam_GeaendertVon]=?, [oam_GeaendertAm]=SYSUTCDATETIME()
      WHERE [oam_MandantID]=? AND [oam_Lieferantenkennung]=? AND [oam_ArtikelnameNorm]=?
        AND ([oam_MFIvon] IS NULL OR ? BETWEEN [oam_MFIvon] AND [oam_MFIbis])`,
    [actor, Number(req.database.firmaId), position.supplierKey, normalizeProductName(position.articleName), position.mfi]);
    await query(`INSERT INTO [BMSApp].[tblOptionenArtikelMapping]
      ([oam_MandantID], [oam_Lieferantenkennung], [oam_Lieferantenname],
       [oam_Artikelnummer_Lieferant], [oam_Artikelname_Lieferant], [oam_ArtikelnameNorm],
       [oam_Kunststofftyp], [oam_ZustandNorm], [oam_MFIvon], [oam_MFIbis],
       [oam_MFI_Pruefmethode], [oam_Artikelindex], [oam_Artikelname],
       [oam_ErstelltVon], [oam_GeaendertVon])
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [Number(req.database.firmaId), position.supplierKey || position.supplierName.toLowerCase(),
      position.supplierName, position.supplierArticleNo, position.articleName,
      normalizeProductName(position.articleName), position.materialCategory, position.qualityNorm,
      selected?.mfiFrom ?? position.mfi, selected?.mfiTo ?? position.mfi,
      position.mfiTestCondition, articleIndex, article.articleName, actor, actor]);
  });
  sendEnvelope(res, { status: 200, data: { articleIndex, articleName: article.articleName }, meta: { mandant: req.mandant }, error: null });
}));

router.delete('/options/:id', requireMandant, requirePilotFeature('options'), asyncHandler(async (req, res) => {
  const actor = String(req.userIdentity?.shortCode || req.userEmail || 'APP').slice(0, 100);
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    UPDATE ${OPTIONS} SET [op_GeloeschtAm]=SYSUTCDATETIME(), [op_GeloeschtVon]=?,
      [op_GeaendertVon]=?, [op_GeaendertAm]=SYSUTCDATETIME()
    OUTPUT inserted.[op_id] AS id
    WHERE [op_id]=? AND [op_MandantID]=? AND [op_GeloeschtAm] IS NULL
      AND [op_Geschaeftsstatus]=N'open'`,
  [actor, actor, positiveId(req.params.id), Number(req.database.firmaId)]);
  if (!rows.length) throw createHttpError(404, 'Option nicht gefunden.', { code: 'OPTION_NOT_FOUND' });
  res.status(204).end();
}));

module.exports = router;
