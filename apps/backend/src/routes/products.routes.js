const express = require('express');
const { asyncHandler, createHttpError, sendEnvelope, parseListParams } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { runSQLQueryAccess } = require('../db/access');
const { getDatabaseConnectionForIdentityById, getDatabaseConnectionForCompanyId } = require('../db/databases');
const {
  assertFrupackGroupAccess,
  FRUPACK_MANDANT_IDS,
  getVlScope,
  getVlPositionKey,
  sortGroupVlItems,
  combineVlGroups,
} = require('../vl-group');
const { appendTimelineEntries } = require('../db/timeline');
const { productAvailabilitySource } = require('../db/product-availability');
const { parseProductSearch, filterProductRows, searchMetadata } = require('../product-search');
const {
  getTempOrderPlanningEntry,
  loadTempOrderPlanning,
} = require('../db/temp-order-planning');
const { resolveProductGroup } = require('../product-grouping');
const { parseMandantIdFromBeNumber } = require('../mandant-prefix');
const {
  compareVlPositions,
  normalizeMfiValue,
  sortVlItems,
} = require('../mfi-sort');

const router = express.Router();
const VIEW_SQL = productAvailabilitySource('availability', { includeSearchFields: true });
const ID_SEPARATOR = '||';

function normalizeDir(dir) {
  return String(dir || '').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
}

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

const { resolveVlDatabase } = require('../vl-source');

function buildVlMeta(req, database) {
  return {
    mandant: req.mandant,
    viewMandant: database?.name || req.mandant,
    viewMandantId: database?.firmaId ?? null,
    databaseName: database?.databaseName || null,
  };
}

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getField(row, key) {
  if (!row || typeof row !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  const wanted = String(key || '').toLowerCase();
  const foundKey = Object.keys(row).find((k) => String(k).toLowerCase() === wanted);
  return foundKey ? row[foundKey] : undefined;
}

function buildProductId(row) {
  const article = asText(row.Artikel);
  const warehouse = asText(row.Lagerort);
  const beNumber = asText(row['Bestell-Pos']);
  const plastic = asText(row.Kunststoff);
  const sub = asText(row.Kunststoff_Untergruppe);
  return [article, warehouse, beNumber, plastic, sub].join(ID_SEPARATOR);
}

function parseProductId(id) {
  const parts = String(id || '').split(ID_SEPARATOR);
  return {
    article: parts[0] || '',
    warehouse: parts[1] || '',
    beNumber: parts[2] || '',
    plastic: parts[3] || '',
    sub: parts[4] || '',
  };
}

function mapProductRow(row, database = null) {
  const categorySub = asText(getField(row, 'Kunststoff_Untergruppe'));
  const categoryMain = asText(getField(row, 'Kunststoff'));
  const category = categorySub || categoryMain;
  const mfiMeasured = normalizeMfiValue(getField(row, 'beP_MFIgemessen'));
  const mfiBase = normalizeMfiValue(getField(row, 'beP_MFI'));
  const mfi = mfiMeasured !== null ? mfiMeasured : mfiBase;

  return {
    id: buildProductId(row),
    articleIndex: asText(getField(row, 'beP_Artikelindex')),
    article: asText(getField(row, 'Artikel')),
    articleName: asText(getField(row, 'Artikel')),
    category,
    amount: asNumber(getField(row, 'Menge')),
    unit: asText(getField(row, 'Einheit')),
    reserved: asNumber(getField(row, 'bePR_Anzahl')),
    about: asText(getField(row, 'beP_VLbemerkung')),
    acquisitionPrice: asNumber(getField(row, 'EP')),
    warehouse: asText(getField(row, 'Lagerort')),
    description: asText(getField(row, 'txtLagerInfo')),
    beNumber: asText(getField(row, 'Bestell-Pos')),
    packaging: asText(getField(row, 'beP_Additive')),
    mfi,
    mfiMeasured,
    reservedBy: asText(getField(row, 'bePR_reserviertVon')),
    reservedUntil: asText(getField(row, 'bePR_gueltigBis')),
    mfiTestMethod: asText(getField(row, 'beP_MFI_Pruefmethode')),
    warehouseSection: asText(getField(row, 'beP_LagerBeiStrecke')),
    storageId: asText(getField(row, 'bePL_LagerID')),
    plastic: categoryMain,
    plasticSubCategory: categorySub,
    storageInfo: asText(getField(row, 'txtLagerInfo')),
    masterArticleName: asText(getField(row, 'masterArticleName')),
    articleGroupId: asText(getField(row, 'articleGroupId')),
    articleGroupName: asText(getField(row, 'articleGroupName')),
    groupKey: asText(getField(row, 'groupKey')),
    groupName: asText(getField(row, 'groupName')),
    sourceMandantId: database?.firmaId ?? null,
    sourceMandantName: database?.name || null,
    ...(row.searchMatch ? { searchMatch: row.searchMatch } : {}),
  };
}

function getBaseAvailableAmount(item) {
  const amount = asNumber(item?.amount) ?? 0;
  const reserved = asNumber(item?.reserved) ?? 0;
  return Math.max(amount - reserved, 0);
}

function applyTempOrderPlanning(item, planning) {
  const entry = getTempOrderPlanningEntry(planning, item?.beNumber, item?.storageId);
  const tempPlannedAmount = Math.max(Number(entry.totalAmountKg) || 0, 0);
  const availableAmount = Math.max(getBaseAvailableAmount(item) - tempPlannedAmount, 0);
  return {
    ...item,
    tempPlannedAmount,
    tempPlannedOtherAmount: Math.max(Number(entry.otherAmountKg) || 0, 0),
    tempPlannedBy: entry.byOwner.map((owner) => ({
      shortCode: owner.shortCode,
      amountInKg: owner.amountInKg,
    })),
    availableAmount,
  };
}

async function resolveCurrentUserShortCode(req) {
  try {
    const identity = req.userIdentity;
    return asText(identity?.shortCode);
  } catch {
    return '';
  }
}

async function loadProductPlanning(req, database, items) {
  const productItems = Array.isArray(items) ? items : [];
  const companyId = asNumber(database?.firmaId);
  if (!productItems.length || companyId === null) {
    return new Map();
  }

  const currentOwnerShortCode = await resolveCurrentUserShortCode(req);
  return loadTempOrderPlanning({
    companyId,
    currentOwnerShortCode,
    keys: productItems.map((item) => ({
      beNumber: item.beNumber,
      warehouseId: item.storageId,
    })),
  });
}

function buildWhereClause(filters = {}) {
  const plastic = asText(filters.plastic);
  const sub = asText(filters.sub);
  const subEmpty = String(filters.subEmpty || '') === '1';

  const clauses = [];
  const params = [];

  if (plastic) {
    clauses.push(`COALESCE([Kunststoff], '') = ?`);
    params.push(plastic);
  }

  if (subEmpty) {
    clauses.push(`COALESCE([Kunststoff_Untergruppe], '') = ''`);
  } else if (sub) {
    clauses.push(`COALESCE([Kunststoff_Untergruppe], '') = ?`);
    params.push(sub);
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

function groupProductRows(rows, database = null, planning = new Map()) {
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const item = applyTempOrderPlanning(mapProductRow(row, database), planning);
    const group = resolveProductGroup({
      article: item.article,
      articleIndex: item.articleIndex,
      masterArticleName: item.masterArticleName,
      articleGroupId: item.articleGroupId,
      articleGroupName: item.articleGroupName,
      plastic: item.plastic,
      plasticSubCategory: item.plasticSubCategory,
    });
    const groupEntry = groups.get(group.key) || {
      key: group.key,
      name: group.name,
      positions: [],
      positionIds: new Set(),
    };
    item.groupKey = group.key;
    item.groupName = group.name;
    if (!groupEntry.positionIds.has(item.id)) {
      groupEntry.positionIds.add(item.id);
      groupEntry.positions.push(item);
    }
    groups.set(group.key, groupEntry);
  }

  return Array.from(groups.values())
    .map(({ positionIds, ...group }) => ({
      ...group,
      positions: group.positions.sort(compareVlPositions),
      availableCount: group.positions.length,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'de'));
}

function resolveSort(sort) {
  const map = {
    article: '[Artikel]',
    category: '[Kunststoff_Untergruppe]',
    vl: '[Kunststoff], [Kunststoff_Untergruppe], [Artikel]',
    amount: '[Menge]',
    warehouse: '[Lagerort]',
    reserved: '[bePR_Anzahl]',
    beNumber: '[Bestell-Pos]',
    // compatibility with old callers
    agA_Artikelname: '[Artikel]',
    agA_Artikelindex: '[Artikel]',
    id: '[Artikel]',
  };
  return map[String(sort || '').trim()] || '[Artikel]';
}

function normalizeTotal(rows) {
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || typeof row !== 'object') return null;
  return row.total ?? row.TOTAL ?? row.Total ?? Object.values(row)[0] ?? null;
}

async function sendFrupackGroupVl(req, res, grouped) {
  assertFrupackGroupAccess(req.userIdentity);
  const { page, pageSize, q } = parseListParams(req.query, {
    page: 1, pageSize: grouped ? 40 : 100, sort: 'vl', dir: 'ASC',
  });
  const search = parseProductSearch(q);
  const { whereSql, params } = buildWhereClause({
    q, plastic: req.query?.plastic, sub: req.query?.sub, subEmpty: req.query?.subEmpty,
  });
  const query = `SELECT * FROM ${VIEW_SQL} ${whereSql}`;
  const batches = await Promise.all(FRUPACK_MANDANT_IDS.map(async (mandantId) => {
    let database;
    try {
      // The read grant covers the entire fixed Frupack group, even when the
      // user's ordinary tenant assignments contain only their own company.
      database = await getDatabaseConnectionForCompanyId(mandantId);
      const rows = await runSQLQueryAccess(database, query, params);
      return { database, rows: filterProductRows(rows || [], search) };
    } catch {
      // Avoid DB_NOT_AVAILABLE: the generic frontend handler would switch the
      // active tenant. A failed group member instead invalidates this list.
      throw createHttpError(503, `Frupack Gruppe konnte nicht vollstaendig geladen werden (${database?.name || `Mandant ${mandantId}`}).`, {
        code: 'FRUPACK_GROUP_UNAVAILABLE', sourceMandantId: mandantId,
      });
    }
  }));
  const offset = (page - 1) * pageSize;
  let allEntries;
  if (grouped) {
    const tenantGroups = await Promise.all(batches.map(async ({ database, rows }) => {
      const items = rows.map((row) => mapProductRow(row, database));
      const planning = await loadProductPlanning(req, database, items);
      return { database, groups: groupProductRows(rows, database, planning) };
    }));
    allEntries = combineVlGroups(tenantGroups);
  } else {
    allEntries = sortGroupVlItems(batches.flatMap(({ database, rows }) => rows.map((row) => {
      const item = mapProductRow(row, database);
      return { ...item, positionKey: getVlPositionKey(item) };
    })));
  }
  let data = allEntries.slice(offset, offset + pageSize);
  if (!grouped) {
    const planningEntries = await Promise.all(batches.map(async ({ database }) => ({
      database,
      planning: await loadProductPlanning(req, database,
        data.filter((item) => Number(item.sourceMandantId) === Number(database.firmaId))),
    })));
    const planningByMandant = new Map(planningEntries.map(({ database, planning }) => [Number(database.firmaId), planning]));
    data = data.map((item) => applyTempOrderPlanning(item, planningByMandant.get(Number(item.sourceMandantId))));
  }
  sendEnvelope(res, {
    data,
    meta: {
      mandant: req.mandant,
      activeMandantId: req.database.firmaId,
      viewMandant: 'Frupack Gruppe',
      viewMandantId: null,
      vlScope: getVlScope(req.query),
      viewMandants: batches.map(({ database }) => ({ id: database.firmaId, name: database.name })),
      page, pageSize, count: data.length, total: allEntries.length,
      ...(grouped ? {
        totalGroups: allEntries.length,
        totalPositions: allEntries.reduce((sum, group) => sum + group.positions.length, 0),
      } : {}),
      q, sort: 'vl', dir: 'ASC',
      search: searchMetadata(search),
      plastic: asText(req.query?.plastic), sub: asText(req.query?.sub),
      subEmpty: String(req.query?.subEmpty || '') === '1',
    },
  });
}

// Pilot-only union: stocks retain their product actions; options are informational entries.
router.get('/vl/entries', requireMandant, require('../middlewares/pilot-feature.middleware').requirePilotFeature('optionsVlPreview'), asyncHandler(async (req, res) => {
  const { loadOffers } = require('../options/read');
  const { buildOptionEntries } = require('../options/vl-preview');
  const scope = getVlScope(req.query);
  let databases;
  if (scope) {
    assertFrupackGroupAccess(req.userIdentity);
    databases = await Promise.all(FRUPACK_MANDANT_IDS.map(async id => {
      try { return await getDatabaseConnectionForCompanyId(id); }
      catch { throw createHttpError(503, 'Frupack Gruppe konnte nicht vollständig geladen werden.', { code: 'FRUPACK_GROUP_UNAVAILABLE', sourceMandantId: id }); }
    }));
  } else databases = [await resolveVlDatabase(req, req.query?.vlMandantId)];
  const { page, pageSize, q } = parseListParams(req.query, { page: 1, pageSize: 100, sort: 'vl', dir: 'ASC' });
  const search = parseProductSearch(q);
  const { whereSql, params } = buildWhereClause(req.query);
  const offers = await loadOffers(databases.map(database => Number(database.firmaId)), { includeExpired: false });
  const batches = await Promise.all(databases.map(async database => {
    const stocks = await runSQLQueryAccess(database, `SELECT * FROM ${VIEW_SQL} ${whereSql}`, params).catch(error => {
      if (scope) throw createHttpError(503, 'Frupack Gruppe konnte nicht vollständig geladen werden.', { code: 'FRUPACK_GROUP_UNAVAILABLE', sourceMandantId: database.firmaId });
      throw error;
    });
    const ownOffers = offers.filter(offer => Number(offer.sourceMandantId) === Number(database.firmaId));
    const options = ownOffers.length ? buildOptionEntries(ownOffers, database) : [];
    const filteredOptions = options.flatMap(entry => {
      if (req.query?.plastic && entry.plastic !== req.query.plastic || req.query?.sub && entry.plasticSubCategory !== req.query.sub
        || req.query?.subEmpty === '1' && entry.plasticSubCategory) return [];
      const matched = filterProductRows([entry.searchRow], search)[0];
      if (!matched) return [];
      const { searchRow, ...result } = entry;
      return [{ ...result, ...(matched.searchMatch ? { searchMatch: matched.searchMatch } : {}) }];
    });
    return { database, entries: [...filterProductRows(stocks || [], search).map(row => {
      const item = mapProductRow(row, database);
      return { ...item, kind: 'stock', positionKey: getVlPositionKey(item) };
    }), ...filteredOptions] };
  }));
  const all = sortGroupVlItems(batches.flatMap(batch => batch.entries));
  const data = all.slice((page - 1) * pageSize, page * pageSize);
  const planning = new Map(await Promise.all(databases.map(async database => [Number(database.firmaId),
    await loadProductPlanning(req, database, data.filter(item => item.kind === 'stock' && Number(item.sourceMandantId) === Number(database.firmaId)))])));
  sendEnvelope(res, { status: 200, data: data.map(item => item.kind === 'option' ? item : applyTempOrderPlanning(item, planning.get(Number(item.sourceMandantId)))),
    meta: { mandant: req.mandant, page, pageSize, total: all.length, count: data.length, q, sort: 'vl', dir: 'ASC',
      optionsPreview: true, includeExpired: false, search: searchMetadata(search),
      optionPositions: all.filter(item => item.kind === 'option').length,
      viewMandants: databases.map(database => ({ id: database.firmaId, name: database.name })) }, error: null });
}));

router.get('/products', requireMandant, asyncHandler(async (req, res) => {
  if (getVlScope(req.query)) return sendFrupackGroupVl(req, res, false);
  const viewDatabase = await resolveVlDatabase(req, req.query?.vlMandantId);
  const { page, pageSize, q, sort, dir } = parseListParams(req.query, {
    page: 1,
    pageSize: 25,
    sort: 'article',
    dir: 'ASC',
  });

  const safeSort = resolveSort(sort);
  const safeDir = normalizeDir(dir);
  const isVlSort = String(sort || '').trim() === 'vl';
  const search = parseProductSearch(q);
  const { whereSql, params } = buildWhereClause({
    q,
    plastic: req.query?.plastic,
    sub: req.query?.sub,
    subEmpty: req.query?.subEmpty,
  });
  const offset = (page - 1) * pageSize;

  let total;
  if (!q) {
    const countSql = `SELECT COUNT(*) AS total FROM ${VIEW_SQL} ${whereSql}`;
    const totalRows = await runSQLQueryAccess(viewDatabase, countSql, params);
    total = normalizeTotal(totalRows);
  }

  const dataSql = isVlSort
    ? `
      SELECT *
      FROM ${VIEW_SQL}
      ${whereSql}
    `
    : `
      SELECT *
      FROM ${VIEW_SQL}
      ${whereSql}
      ORDER BY ${safeSort} ${safeDir}
      ${q ? '' : 'OFFSET ? ROWS FETCH NEXT ? ROWS ONLY'}
    `;
  const rows = await runSQLQueryAccess(viewDatabase, dataSql, isVlSort || q ? params : [...params, offset, pageSize]);
  const filteredRows = filterProductRows(rows || [], search);
  if (q) total = filteredRows.length;
  const mappedRows = filteredRows.map((row) => mapProductRow(row, viewDatabase));
  const orderedRows = isVlSort ? sortVlItems(mappedRows) : mappedRows;
  const pageRows = isVlSort || q ? orderedRows.slice(offset, offset + pageSize) : orderedRows;
  const planning = await loadProductPlanning(req, viewDatabase, pageRows);
  const data = pageRows.map((item) => applyTempOrderPlanning(item, planning));

  sendEnvelope(res, {
    status: 200,
    data,
    meta: {
      ...buildVlMeta(req, viewDatabase),
      page,
      pageSize,
      count: data.length,
      total,
      q,
      search: searchMetadata(search),
      plastic: asText(req.query?.plastic),
      sub: asText(req.query?.sub),
      subEmpty: String(req.query?.subEmpty || '') === '1',
      sort: String(sort || 'article'),
      dir: isVlSort ? 'ASC' : safeDir,
    },
    error: null,
  });
}));

router.get('/products/grouped', requireMandant, asyncHandler(async (req, res) => {
  if (getVlScope(req.query)) return sendFrupackGroupVl(req, res, true);
  const viewDatabase = await resolveVlDatabase(req, req.query?.vlMandantId);
  const { page, pageSize, q } = parseListParams(req.query, {
    page: 1,
    pageSize: 40,
    sort: 'vl',
    dir: 'ASC',
  });
  const search = parseProductSearch(q);
  const { whereSql, params } = buildWhereClause({
    q,
    plastic: req.query?.plastic,
    sub: req.query?.sub,
    subEmpty: req.query?.subEmpty,
  });

  const rows = await runSQLQueryAccess(viewDatabase, `
    SELECT
      [availability].*
    FROM ${VIEW_SQL}
    ${whereSql}
    ORDER BY [availability].[Kunststoff], [availability].[Kunststoff_Untergruppe], [availability].[Artikel], [availability].[Bestell-Pos]
  `, params);

  const filteredRows = filterProductRows(rows || [], search);
  const mappedRows = filteredRows.map((row) => mapProductRow(row, viewDatabase));
  const planning = await loadProductPlanning(req, viewDatabase, mappedRows);
  const allGroups = groupProductRows(filteredRows, viewDatabase, planning);
  const offset = (page - 1) * pageSize;
  const data = allGroups.slice(offset, offset + pageSize);
  sendEnvelope(res, {
    status: 200,
    data,
    meta: {
      ...buildVlMeta(req, viewDatabase),
      page,
      pageSize,
      count: data.length,
      total: allGroups.length,
      totalGroups: allGroups.length,
      totalPositions: allGroups.reduce((sum, group) => sum + group.positions.length, 0),
      q,
      search: searchMetadata(search),
      plastic: asText(req.query?.plastic),
      sub: asText(req.query?.sub),
      subEmpty: String(req.query?.subEmpty || '') === '1',
    },
    error: null,
  });
}));

router.get('/products/:id', requireMandant, asyncHandler(async (req, res) => {
  const viewDatabase = await resolveVlDatabase(req, req.query?.vlMandantId);
  const id = req.params.id;
  const key = parseProductId(id);

  const sql = `
    SELECT TOP 1 *
    FROM ${VIEW_SQL}
    WHERE COALESCE([Artikel], '') = ?
      AND COALESCE([Lagerort], '') = ?
      AND COALESCE([Bestell-Pos], '') = ?
      AND COALESCE([Kunststoff], '') = ?
      AND COALESCE([Kunststoff_Untergruppe], '') = ?
  `;
  const rows = await runSQLQueryAccess(viewDatabase, sql, [
    key.article,
    key.warehouse,
    key.beNumber,
    key.plastic,
    key.sub,
  ]);

  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row) {
    throw createHttpError(404, `products not found: ${id}`, { code: 'PRODUCT_NOT_FOUND', id });
  }

  const item = mapProductRow(row, viewDatabase);
  const planning = await loadProductPlanning(req, viewDatabase, [item]);

  sendEnvelope(res, {
    status: 200,
    data: applyTempOrderPlanning(item, planning),
    meta: { ...buildVlMeta(req, viewDatabase), idField: 'id', id },
    error: null,
  });
}));

router.get('/products/:id/wpz', requireMandant, asyncHandler(async (req, res) => {
  const viewDatabase = await resolveVlDatabase(req, req.query?.vlMandantId);
  const id = req.params.id;
  const key = parseProductId(id);
  const beNumber = asText(key.beNumber);
  if (!beNumber) {
    throw createHttpError(400, `Invalid product id for WPZ: ${id}`, { code: 'PRODUCT_NOT_FOUND', id });
  }

  const sql = `
    SELECT TOP 1 *
    FROM [dbo].[tblBest_Pos_WPZ]
    WHERE COALESCE([bePZ_BEposID], '') = ?
    ORDER BY [bePZ_ID] DESC
  `;
  const rows = await runSQLQueryAccess(viewDatabase, sql, [beNumber]);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;

  if (!row) {
    sendEnvelope(res, {
      status: 200,
      data: { exists: false, wpzId: null, beNumber, fields: [] },
      meta: { ...buildVlMeta(req, viewDatabase), idField: 'id', id },
      error: null,
    });
    return;
  }

  const excluded = new Set(['bepz_id', 'ssma_timestamp']);
  const fields = Object.keys(row)
    .filter((k) => !excluded.has(String(k || '').toLowerCase()))
    .map((k) => ({
      key: k,
      value: row[k] === undefined ? null : row[k],
    }));

  sendEnvelope(res, {
    status: 200,
    data: { exists: true, wpzId: Number(row?.bePZ_ID || null), beNumber, fields },
    meta: { ...buildVlMeta(req, viewDatabase), idField: 'id', id },
    error: null,
  });
}));

router.post('/products/reserve', requireMandant, asyncHandler(async (req, res) => {
  const userIdentity = req.userIdentity;
  const userShortCode = String(userIdentity.shortCode || '').trim();
  const amount = Number(req.body?.amount);
  const reservationEndDateRaw = req.body?.reservationEndDate;
  const comment = req.body?.comment ? String(req.body.comment).trim() : '';

  if (!Number.isFinite(amount) || amount <= 0) {
    throw createHttpError(400, 'Invalid reservation amount.', { code: 'INVALID_RESERVATION_AMOUNT' });
  }
  const reservationEndDate = new Date(reservationEndDateRaw);
  if (!reservationEndDateRaw || Number.isNaN(reservationEndDate.getTime())) {
    throw createHttpError(400, 'Invalid reservation end date.', { code: 'INVALID_RESERVATION_END_DATE' });
  }

  let beNumber = req.body?.beNumber ? String(req.body.beNumber).trim() : '';
  let warehouseId = req.body?.warehouseId ? String(req.body.warehouseId).trim() : '';

  if ((!beNumber || !warehouseId) && req.body?.productId) {
    const key = parseProductId(String(req.body.productId));
    if (!beNumber) beNumber = key.beNumber;
  }

  if (!beNumber || !warehouseId) {
    throw createHttpError(400, 'Missing required reservation keys: beNumber and warehouseId.', { code: 'MISSING_RESERVATION_KEYS' });
  }
  if (!userShortCode) {
    throw createHttpError(403, 'Missing Mitarbeiterkuerzel (ma_Kuerzel) for current user.', { code: 'MISSING_USER_SHORT_CODE' });
  }

  const requestedSourceMandantId = asText(req.body?.sourceMandantId);
  const sourceMandantId = requestedSourceMandantId || parseMandantIdFromBeNumber(beNumber);
  if (sourceMandantId !== null && sourceMandantId !== undefined
    && Number(req.database?.firmaId) !== Number(sourceMandantId)) {
    throw createHttpError(403, 'Fremde VL-Mandanten sind nur lesbar.', {
      code: 'FOREIGN_VL_READ_ONLY',
      sourceMandantId: Number(sourceMandantId),
    });
  }
  const sourceDatabase = req.database;

  const productSql = `
    SELECT TOP 1 [Menge] AS amount, [bePR_Anzahl] AS reserved, [Artikel] AS article
    FROM ${VIEW_SQL}
    WHERE COALESCE([Bestell-Pos], '') = ?
      AND COALESCE([bePL_LagerID], '') = ?
  `;
  const productRows = await runSQLQueryAccess(sourceDatabase, productSql, [beNumber, warehouseId]);
  const productRow = Array.isArray(productRows) && productRows.length ? productRows[0] : null;
  if (!productRow) {
    throw createHttpError(404, 'Product availability row not found for reservation.', { code: 'PRODUCT_AVAILABILITY_NOT_FOUND' });
  }
  const totalAmount = asNumber(getField(productRow, 'amount')) ?? asNumber(getField(productRow, 'Menge')) ?? 0;
  const alreadyReserved = asNumber(getField(productRow, 'reserved')) ?? asNumber(getField(productRow, 'bePR_Anzahl')) ?? 0;
  const planning = await loadTempOrderPlanning({
    companyId: sourceDatabase?.firmaId,
    keys: [{ beNumber, warehouseId }],
  });
  const tempPlannedAmount = getTempOrderPlanningEntry(planning, beNumber, warehouseId).totalAmountKg;
  const availableAmount = Math.max(totalAmount - alreadyReserved - tempPlannedAmount, 0);
  if (amount > availableAmount) {
    throw createHttpError(400, `Reservation amount exceeds available quantity (${availableAmount}).`, {
      code: 'RESERVATION_AMOUNT_EXCEEDS_AVAILABLE',
      availableAmount,
    });
  }

  const nowIso = new Date().toISOString();
  const selectedBy = 'APP';
  const lastUpdate = `${userShortCode} ${nowIso}`.slice(0, 50);

  const insertSql = `
    INSERT INTO [dbo].[tblBest_Pos_Reserviert]
      ([bePR_BEposID], [bePR_LagerID], [bePR_gewaehlt], [bePR_gewaehltWER], [bePR_reserviertVon], [bePR_gueltigBis], [bePR_Anzahl], [bePR_Notiz], [bePR_LastUpdate])
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  try {
    await runSQLQueryAccess(sourceDatabase, insertSql, [
      beNumber,
      warehouseId,
      1,
      selectedBy,
      userShortCode,
      reservationEndDate.toISOString(),
      amount,
      comment,
      lastUpdate,
    ]);
  } catch (error) {
    const msg = String(error?.message || '').toLowerCase();
    const detailsMsg = String(error?.details?.message || '').toLowerCase();
    const duplicate = msg.includes('duplicate') || msg.includes('2601') || msg.includes('2627')
      || detailsMsg.includes('duplicate') || detailsMsg.includes('2601') || detailsMsg.includes('2627');
    if (duplicate) {
      let existingBy = '';
      try {
        const existingSql = `
          SELECT TOP 1 [bePR_reserviertVon] AS reservedBy
          FROM [dbo].[tblBest_Pos_Reserviert]
          WHERE [bePR_BEposID] = ? AND [bePR_LagerID] = ?
        `;
        const existingRows = await runSQLQueryAccess(sourceDatabase, existingSql, [beNumber, warehouseId]);
        const existing = Array.isArray(existingRows) && existingRows.length ? existingRows[0] : null;
        existingBy = String(existing?.reservedBy || '').trim();
      } catch (ignored) {
        existingBy = '';
      }
      const suffix = existingBy ? ` durch ${existingBy}.` : '.';
      throw createHttpError(409, `Fuer dieses Produkt liegt bereits eine Reservierung${suffix}`, {
        code: 'RESERVATION_ALREADY_EXISTS',
        reservedBy: existingBy || null,
      });
    }
    throw error;
  }

  const createdSql = `
    SELECT TOP 1
      [bePR_BEposID] AS beNumber,
      [bePR_LagerID] AS warehouseId,
      [bePR_Anzahl] AS amount,
      [bePR_gueltigBis] AS reservationEndDate
    FROM [dbo].[tblBest_Pos_Reserviert]
    WHERE [bePR_BEposID] = ? AND [bePR_LagerID] = ?
  `;
  const rows = await runSQLQueryAccess(sourceDatabase, createdSql, [beNumber, warehouseId]);
  const created = Array.isArray(rows) && rows.length ? rows[0] : null;
  const createdData = created
    ? { ...created, id: `${created.beNumber}${ID_SEPARATOR}${created.warehouseId}` }
    : { id: `${beNumber}${ID_SEPARATOR}${warehouseId}`, beNumber, warehouseId, amount, reservationEndDate };

  await appendTimelineEntries([{
    createdAt: nowIso,
    mandant: sourceDatabase?.name || req.mandant,
    mandantShortName: sourceDatabase?.shortName || null,
    companyId: sourceDatabase?.firmaId || null,
    userEmail: req.userEmail || null,
    userShortCode,
    type: 'reservation',
    product: asText(getField(productRow, 'article')) || beNumber,
    productId: createdData.id,
    beNumber,
    amountKg: amount,
    unit: 'kg',
    referenceId: createdData.id,
    payloadJson: {
      warehouseId,
      reservationEndDate: reservationEndDate.toISOString(),
    },
  }]);

  sendEnvelope(res, {
    status: 201,
    data: createdData,
    meta: {
      ...buildVlMeta(req, sourceDatabase),
      reservationUserShortCode: userShortCode,
    },
    error: null,
  });
}));

// No category tree for availability view; keep endpoint for frontend compatibility.
router.get('/product-categories', requireMandant, asyncHandler(async (req, res) => {
  const viewDatabase = await resolveVlDatabase(req, req.query?.vlMandantId);
  const { whereSql, params } = buildWhereClause({ q: req.query?.q });
  const sql = `
    SELECT
      COALESCE([Kunststoff], '') AS plastic,
      COALESCE([Kunststoff_Untergruppe], '') AS sub,
      COUNT(*) AS total
    FROM ${VIEW_SQL}
    ${whereSql}
    GROUP BY COALESCE([Kunststoff], ''), COALESCE([Kunststoff_Untergruppe], '')
    ORDER BY COALESCE([Kunststoff], '') ASC, COALESCE([Kunststoff_Untergruppe], '') ASC
  `;
  const rows = await runSQLQueryAccess(viewDatabase, sql, params);

  const grouped = new Map();
  for (const row of (rows || [])) {
    const plastic = asText(row.plastic);
    const sub = asText(row.sub);
    const total = asNumber(row.total) || 0;
    if (!grouped.has(plastic)) {
      grouped.set(plastic, { plastic, total: 0, subCategories: [] });
    }
    const entry = grouped.get(plastic);
    entry.total += total;
    entry.subCategories.push({ sub, total });
  }
  const data = Array.from(grouped.values());

  sendEnvelope(res, {
    status: 200,
    data,
    meta: { ...buildVlMeta(req, viewDatabase), count: data.length, q: asText(req.query?.q) },
    error: null,
  });
}));

module.exports = router;
