const express = require('express');
const config = require('../config');
const { asyncHandler, createHttpError, sendEnvelope } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { requirePilotFeature } = require('../middlewares/pilot-feature.middleware');
const { runSQLQueryAccess, runSQLQuerySqlServer, withSqlTransaction } = require('../db/access');
const { normalizeProductName, supplierKey, features, MATCHING_VERSION, bestSuggestion, rankCandidates } = require('../options/article-matching');
const { loadOffers } = require('../options/read');
const { resolveVlDatabase } = require('../vl-source');
const { candidatesFor: findCandidates, candidateContext, articleCatalog } = require('../options/matching-service');
const { appTableSql } = require('../db/app-tables');

const router = express.Router();
const OPTIONS = appTableSql('options');
const POSITIONS = appTableSql('optionPositions');

router.get('/options', requireMandant, requirePilotFeature('options'), asyncHandler(async (req, res) => {
  const offers = await loadOffers([Number(req.database.firmaId)]);
  sendEnvelope(res, { status: 200, data: offers, meta: { mandant: req.mandant }, error: null });
}));

router.get('/options/:id', requireMandant, requirePilotFeature('options'), asyncHandler(async (req, res) => {
  const database = await resolveVlDatabase(req, req.query?.vlMandantId);
  const offers = await loadOffers([Number(database.firmaId)], { optionId: positiveId(req.params.id), includeExpired: req.query?.preview === '1' });
  if (!offers.length) throw createHttpError(404, 'Option nicht gefunden.', { code: 'OPTION_NOT_FOUND' });
  // Recompute suggestions on read; a confirmed assignment is never overwritten.
  const context = await candidateContext(database);
  for (const position of offers[0].positions) {
    if (position.articleIndex) continue;
    const candidates = rankCandidates({ ...position, supplierName: offers[0].supplierName, supplierKey: offers[0].supplierKey }, context.articles, { mappings: context.mappings, limit: null });
    const best = bestSuggestion(candidates);
    position.suggestedArticleIndex = best?.articleIndex || null;
    position.suggestedArticleName = best?.articleName || null;
    position.matchReason = best?.reason || null;
    position.matchStatus = best ? 'suggested' : 'unmatched';
    position.candidateCount = candidates.length;
  }
  sendEnvelope(res, { status: 200, data: { ...offers[0], readOnly: Number(database.firmaId) !== Number(req.database.firmaId) },
    meta: { mandant: req.mandant, viewMandantId: database.firmaId, preview: req.query?.preview === '1' }, error: null });
}));

function positiveId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw createHttpError(400, 'Ungültige ID.', { code: 'INVALID_ID' });
  return id;
}

async function scopedPosition(req, database = req.database) {
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT p.[opp_id] AS id, p.[opp_Artikelname_Lieferant] AS articleName,
      p.[opp_Artikelnummer_Lieferant] AS supplierArticleNo,
      p.[opp_Kunststofftyp] AS materialCategory, p.[opp_Zustand] AS quality,
      p.[opp_ZustandNorm] AS qualityNorm, p.[opp_MFI] AS mfi,
      p.[opp_MFI_Pruefmethode] AS mfiTestCondition, p.[opp_Dichte] AS density,
      p.[opp_DichteEinheit] AS densityUnit, p.[opp_Eigenschaften] AS propertiesText, o.[op_Lieferantenkennung] AS supplierKey,
      o.[op_Lieferantenname] AS supplierName
    FROM ${POSITIONS} p JOIN ${OPTIONS} o ON o.[op_id]=p.[opp_op_id]
    WHERE o.[op_id]=? AND p.[opp_id]=? AND o.[op_MandantID]=?
      AND o.[op_GeloeschtAm] IS NULL AND o.[op_Geschaeftsstatus]=N'open'
      AND o.[op_Pruefstatus] IN (N'approved',N'pending')
  `, [positiveId(req.params.id), positiveId(req.params.positionId), Number(database.firmaId)]);
  if (!rows.length) throw createHttpError(404, 'Position nicht gefunden.', { code: 'OPTION_POSITION_NOT_FOUND' });
  return rows[0];
}

router.get('/options/:id/positions/:positionId/candidates', requireMandant, requirePilotFeature('options'), asyncHandler(async (req, res) => {
  const database = await resolveVlDatabase(req, req.query?.vlMandantId);
  const position = await scopedPosition(req, database);
  const q = String(req.query?.q || '').trim().slice(0, 150);
  const candidates = await findCandidates(database, position, { q, limit: null });
  const pageSize = 30, page = Math.max(1, Math.min(10000, Number.parseInt(req.query?.page, 10) || 1));
  sendEnvelope(res, { status: 200, data: candidates.slice((page-1)*pageSize,page*pageSize),
    meta: { mandant: req.mandant, page, pageSize, total: candidates.length, version: MATCHING_VERSION }, error: null });
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
  const ranked = await findCandidates(req.database, position, { limit: null });
  const selected = ranked.find((item) => item.articleIndex === articleIndex)
    || rankCandidates(position, (await articleCatalog(req.database)).filter(item => String(item.articleIndex) === articleIndex), { includeAll: true })[0];
  if (selected?.conflicts?.length && req.body?.acknowledgeConflict !== true) {
    throw createHttpError(409, selected.conflicts.join('; '), { code: 'ARTICLE_MATCH_CONFLICT' });
  }
  const metadata = await runSQLQuerySqlServer(config.sql.database,
    "SELECT COL_LENGTH(N'BMSApp.tblOptionenArtikelMapping',N'oam_MerkmaleJson') AS available");
  if (metadata[0]?.available == null) throw createHttpError(503, 'Bitte zuerst upgrade_options_matching.sql ausführen.', { code: 'OPTION_MATCHING_MIGRATION_REQUIRED' });
  const f = features(position);
  const canonicalSupplier = supplierKey(position.supplierName, position.supplierKey);
  const conditions = JSON.stringify({ ...f, requireDensity: Boolean(selected?.warnings?.some(value => value.includes('Dichtegrenze'))) });
  const actor = String(req.userIdentity?.shortCode || req.userEmail || 'APP').slice(0, 100);
  await withSqlTransaction(config.sql.database, async ({ query }) => {
    const updated = await query(`UPDATE ${POSITIONS} SET [opp_Artikelindex]=?, [opp_Artikelname]=?,
      [opp_MatchStatus]=N'confirmed', [opp_MatchGrund]=N'Manuell in der App zugeordnet',
      [opp_GeaendertVon]=?, [opp_GeaendertAm]=SYSUTCDATETIME()
      WHERE [opp_id]=? AND [opp_op_id]=?
        AND EXISTS (SELECT 1 FROM ${OPTIONS} o WITH (UPDLOCK,HOLDLOCK)
          WHERE o.op_id=? AND o.op_MandantID=? AND o.op_GeloeschtAm IS NULL AND o.op_Geschaeftsstatus=N'open')`,
    [articleIndex, article.articleName, actor, Number(position.id), positiveId(req.params.id), positiveId(req.params.id), Number(req.database.firmaId)]);
    if (!updated.rowsAffected[0]) throw createHttpError(409, 'Position wurde zwischenzeitlich geändert.', { code: 'OPTION_CHANGED' });
    await query(`UPDATE [BMSApp].[tblOptionenArtikelMapping] SET [oam_Aktiv]=0,
      [oam_GeaendertVon]=?, [oam_GeaendertAm]=SYSUTCDATETIME()
      WHERE [oam_MandantID]=? AND [oam_Lieferantenkennung]=? AND [oam_ArtikelnameNorm]=?
        AND ([oam_MFIvon] IS NULL OR ? BETWEEN [oam_MFIvon] AND [oam_MFIbis])
        AND COALESCE([oam_MerkmaleJson],N'')=?`,
    [actor, Number(req.database.firmaId), canonicalSupplier, normalizeProductName(position.articleName), position.mfi, conditions]);
    await query(`INSERT INTO [BMSApp].[tblOptionenArtikelMapping]
      ([oam_MandantID], [oam_Lieferantenkennung], [oam_Lieferantenname],
       [oam_Artikelnummer_Lieferant], [oam_Artikelname_Lieferant], [oam_ArtikelnameNorm],
       [oam_Kunststofftyp], [oam_ZustandNorm], [oam_MFIvon], [oam_MFIbis],
       [oam_MFI_Pruefmethode], [oam_Artikelindex], [oam_Artikelname],
       [oam_ErstelltVon], [oam_GeaendertVon], [oam_MerkmaleJson], [oam_AlgorithmusVersion])
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [Number(req.database.firmaId), canonicalSupplier,
      position.supplierName, position.supplierArticleNo, position.articleName,
      normalizeProductName(position.articleName), f.polymer, f.quality,
      selected?.mfiFrom ?? position.mfi, selected?.mfiTo ?? position.mfi,
      position.mfiTestCondition, articleIndex, article.articleName, actor, actor, conditions, MATCHING_VERSION]);
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
