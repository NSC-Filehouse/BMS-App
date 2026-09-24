const express = require('express');
const config = require('../config');
const { asyncHandler, createHttpError, sendEnvelope } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { requirePilotFeature } = require('../middlewares/pilot-feature.middleware');
const { runSQLQuerySqlServer } = require('../db/access');
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
    incoterm: row.incoterm || null,
    loadingLocation: row.loadingLocation || null,
    packagingText: row.packagingText || null,
    termsText: row.termsText || null,
    positions,
  };
}

router.get('/options', requireMandant, requirePilotFeature('options'), asyncHandler(async (req, res) => {
  const companyId = Number(req.database?.firmaId);
  const today = berlinDate();
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT o.[op_id] AS id, o.[op_supplier_name] AS supplierName,
      o.[op_external_offer_no] AS externalOfferNo, o.[op_valid_until] AS validUntil,
      o.[op_is_demo] AS isDemo,
      o.[op_incoterm] AS incoterm, o.[op_loading_location] AS loadingLocation,
      o.[op_packaging_text] AS packagingText, o.[op_terms_text] AS termsText
    FROM ${OPTIONS} o
    WHERE o.[op_company_id] = ? AND o.[op_review_status] = N'approved'
      AND o.[op_business_status] = N'open' AND o.[op_valid_from] <= ?
      AND EXISTS (SELECT 1 FROM ${POSITIONS} p WHERE p.[opp_op_id] = o.[op_id]
        AND COALESCE(p.[opp_valid_until], o.[op_valid_until]) >= ?)
    ORDER BY o.[op_valid_until], o.[op_id] DESC
  `, [companyId, today, today]);
  const ids = rows.map((row) => Number(row.id));
  let positions = [];
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(', ');
    positions = await runSQLQuerySqlServer(config.sql.database, `
      SELECT p.[opp_id] AS id, p.[opp_op_id] AS optionId,
        p.[opp_supplier_article_name] AS articleName, p.[opp_internal_article_name] AS internalArticleName,
        p.[opp_material_category] AS materialCategory, p.[opp_quality] AS quality, p.[opp_batch_no] AS batchNo,
        p.[opp_quantity_min] AS quantityMin, p.[opp_quantity_max] AS quantityMax,
        p.[opp_quantity_unit] AS quantityUnit, p.[opp_quantity_text] AS quantityText,
        p.[opp_price] AS price, p.[opp_price_unit] AS priceUnit, p.[opp_currency] AS currency,
        p.[opp_mfi] AS mfi, p.[opp_mfi_test_condition] AS mfiTestCondition,
        p.[opp_density] AS density, p.[opp_c2] AS c2, p.[opp_properties_text] AS propertiesText,
        p.[opp_loading_text] AS loadingText,
        COALESCE(p.[opp_valid_until], o.[op_valid_until]) AS validUntil
      FROM ${POSITIONS} p JOIN ${OPTIONS} o ON o.[op_id] = p.[opp_op_id]
      WHERE p.[opp_op_id] IN (${placeholders}) AND COALESCE(p.[opp_valid_until], o.[op_valid_until]) >= ?
      ORDER BY p.[opp_op_id], p.[opp_line_no]
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
    SELECT o.[op_id] AS id, o.[op_supplier_name] AS supplierName,
      o.[op_external_offer_no] AS externalOfferNo, o.[op_valid_until] AS validUntil,
      o.[op_is_demo] AS isDemo,
      o.[op_incoterm] AS incoterm, o.[op_loading_location] AS loadingLocation,
      o.[op_packaging_text] AS packagingText, o.[op_terms_text] AS termsText
    FROM ${OPTIONS} o
    WHERE o.[op_id] = ? AND o.[op_company_id] = ?
      AND o.[op_review_status] = N'approved' AND o.[op_business_status] = N'open'
      AND o.[op_valid_from] <= ?
  `, [id, Number(req.database?.firmaId), today]);
  if (!rows.length) throw createHttpError(404, 'Option nicht gefunden.', { code: 'OPTION_NOT_FOUND' });
  const positions = await runSQLQuerySqlServer(config.sql.database, `
    SELECT p.[opp_id] AS id, p.[opp_supplier_article_name] AS articleName,
      p.[opp_internal_article_name] AS internalArticleName,
      p.[opp_material_category] AS materialCategory, p.[opp_quality] AS quality,
      p.[opp_batch_no] AS batchNo, p.[opp_quantity_min] AS quantityMin,
      p.[opp_quantity_max] AS quantityMax, p.[opp_quantity_unit] AS quantityUnit,
      p.[opp_quantity_text] AS quantityText, p.[opp_price] AS price,
      p.[opp_price_unit] AS priceUnit, p.[opp_currency] AS currency,
      p.[opp_mfi] AS mfi, p.[opp_mfi_test_condition] AS mfiTestCondition,
      p.[opp_density] AS density, p.[opp_c2] AS c2,
      p.[opp_properties_text] AS propertiesText, p.[opp_loading_text] AS loadingText,
      COALESCE(p.[opp_valid_until], o.[op_valid_until]) AS validUntil
    FROM ${POSITIONS} p JOIN ${OPTIONS} o ON o.[op_id] = p.[opp_op_id]
    WHERE p.[opp_op_id] = ? AND COALESCE(p.[opp_valid_until], o.[op_valid_until]) >= ?
    ORDER BY p.[opp_line_no]
  `, [id, today]);
  if (!positions.length) throw createHttpError(404, 'Option nicht gefunden.', { code: 'OPTION_NOT_FOUND' });
  sendEnvelope(res, { status: 200, data: mapOption(rows[0], positions.map(mapPosition)), meta: { mandant: req.mandant }, error: null });
}));

module.exports = router;
