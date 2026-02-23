const express = require('express');
const config = require('../config');
const { asyncHandler, createHttpError, sendEnvelope, parseListParams } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { runSQLQueryAccess, runSQLQuerySqlServer } = require('../db/access');

const router = express.Router();

function normalizeTotal(countResult) {
  if (!countResult) return null;
  const row = Array.isArray(countResult) ? countResult[0] : countResult;
  if (!row || typeof row !== 'object') return null;
  return row.total ?? row.TOTAL ?? row.Total ?? Object.values(row)[0] ?? null;
}

function normalizeDir(dir) {
  return String(dir || '').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
}

function resolveSortField(sort) {
  const map = {
    kd_KdNR: '[kd_KdNR]',
    kd_Name1: '[kd_Name1]',
    kd_Name2: '[kd_Name2]',
    kd_PLZ: '[kd_PLZ]',
    kd_Aussendienst: '[kd_Aussendienst]',
    kd_Region: '[kd_Region]',
    kd_Ort: '[kd_Ort]',
    kd_LK: '[kd_LK]',
    kd_eMail: '[kd_eMail]',
    kd_Telefon: '[kd_Telefon]',
  };
  return map[String(sort || '').trim()] || '[kd_Name1]';
}

function buildWhereClause(q) {
  const text = String(q || '').trim();
  if (!text) return { whereSql: '', params: [] };

  const like = `%${text}%`;
  const fields = [
    '[kd_KdNR]',
    '[kd_Name1]',
    '[kd_Name2]',
    '[kd_PLZ]',
    '[kd_Aussendienst]',
    '[kd_Region]',
    '[kd_Ort]',
    '[kd_eMail]',
    '[kd_Telefon]',
  ];
  const clauses = fields.map((f) => `${f} LIKE ?`);
  return {
    whereSql: `WHERE (${clauses.join(' OR ')})`,
    params: fields.map(() => like),
  };
}

function toText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function mapRepresentatives(rows) {
  return (rows || [])
    .map((row) => {
      const firstName = toText(row.kdA_Vorname);
      const lastName = toText(row.kdA_Name);
      const name = toText(row.kdA_Name) || [firstName, lastName].filter(Boolean).join(' ').trim();
      const phone = toText(row.kdA_Telefon) || toText(row.kdA_PrivatTel) || toText(row.kdA_Handy);
      const email = toText(row.kdA_eMail);
      const position = toText(row.kdA_Position);
      const salutation = toText(row.kdA_Anrede);
      const id = null;

      return { id, name, phone, email, position, salutation };
    })
    .filter((rep) => rep.name || rep.phone || rep.email);
}

function buildAddressText(row) {
  const name1 = toText(row?.kdL_Name1);
  const name2 = toText(row?.kdL_Name2);
  const street = toText(row?.kdL_Strasse);
  const plz = toText(row?.kdL_PLZ);
  const city = toText(row?.kdL_Ort);
  const country = toText(row?.kdL_LK);
  const plzCity = [plz, city].filter(Boolean).join(' ');
  return [name1, name2, street, plzCity, country].filter(Boolean).join(', ');
}

function resolveLang(req) {
  const raw = String(req?.header?.('x-lang') || '').trim().toLowerCase();
  return raw === 'en' ? 'en' : 'de';
}

async function loadPaymentTextMap(ids, lang) {
  const list = Array.isArray(ids)
    ? ids.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
    : [];
  if (!list.length) return new Map();
  const placeholders = list.map(() => '?').join(', ');
  const safeLang = String(lang || 'de').toLowerCase() === 'en' ? 'en' : 'de';
  const sql = `
    SELECT [zaS_ID] AS id, [zaS_Zahl_Text] AS text
    FROM [dbo].[tblZahltext_Sprachen]
    WHERE LOWER(COALESCE([zaS_SprachID], '')) = ?
      AND [zaS_ID] IN (${placeholders})
  `;
  const rows = await runSQLQuerySqlServer(config.sql.database, sql, [safeLang, ...list]);
  const map = new Map();
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const id = Number(row.id);
    if (Number.isFinite(id) && id > 0) map.set(id, toText(row.text));
  }
  return map;
}

// LIST (all columns from dbo.tblKunden)
router.get('/customers', requireMandant, asyncHandler(async (req, res) => {
  const { page, pageSize, q, sort, dir } = parseListParams(req.query, {
    page: 1,
    pageSize: 25,
    sort: 'kd_Name1',
    dir: 'ASC',
  });

  const safeSort = resolveSortField(sort);
  const safeDir = normalizeDir(dir);
  const { whereSql, params } = buildWhereClause(q);
  const offset = (page - 1) * pageSize;

  const countSql = `SELECT COUNT(*) AS total FROM [dbo].[tblKunden] ${whereSql}`;
  const totalResult = await runSQLQueryAccess(req.database, countSql, params);
  const total = normalizeTotal(totalResult);

  const dataSql = `
    SELECT *
    FROM [dbo].[tblKunden]
    ${whereSql}
    ORDER BY ${safeSort} ${safeDir}
    OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
  `;
  const rows = await runSQLQueryAccess(req.database, dataSql, [...params, offset, pageSize]);

  sendEnvelope(res, {
    status: 200,
    data: rows,
    meta: {
      mandant: req.mandant,
      databaseName: req.database?.databaseName || null,
      page,
      pageSize,
      count: Array.isArray(rows) ? rows.length : 0,
      total,
      q,
      sort: String(sort || 'kd_Name1'),
      dir: safeDir,
    },
    error: null,
  });
}));

// DETAIL (all columns from dbo.tblKunden)
router.get('/customers/:id', requireMandant, asyncHandler(async (req, res) => {
  const id = req.params.id;
  const sql = 'SELECT TOP 1 * FROM [dbo].[tblKunden] WHERE [kd_KdNR] = ?';
  const rows = await runSQLQueryAccess(req.database, sql, [id]);

  const item = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!item) {
    throw createHttpError(404, `customers not found: ${id}`, { code: 'CUSTOMER_NOT_FOUND', id });
  }

  const repsSql = `
    SELECT [kdA_Vorname], [kdA_Name], [kdA_Anrede], [kdA_Position], [kdA_Telefon], [kdA_PrivatTel], [kdA_Handy], [kdA_eMail]
    FROM [dbo].[tblKun_Ansprech]
    WHERE [kdA_KdNR] = ?
    ORDER BY [kdA_Name] ASC, [kdA_Vorname] ASC
  `;
  const repsRows = await runSQLQueryAccess(req.database, repsSql, [id]);
  const representatives = mapRepresentatives(repsRows);

  const detail = {
    ...item,
    representatives,
  };

  sendEnvelope(res, {
    status: 200,
    data: detail,
    meta: {
      mandant: req.mandant,
      databaseName: req.database?.databaseName || null,
      idField: 'kd_KdNR',
      id,
    },
    error: null,
  });
}));

router.get('/customers/:id/delivery-addresses', requireMandant, asyncHandler(async (req, res) => {
  const id = toText(req.params.id);
  if (!id) {
    throw createHttpError(400, 'Missing customer id.', { code: 'INVALID_CUSTOMER_ID' });
  }

  const sql = `
    SELECT
      [kdL_KdNR],
      [kdL_Lieferanschrift_Nr],
      [kdL_Kurz],
      [kdL_Name1],
      [kdL_Name2],
      [kdL_Strasse],
      [kdL_LK],
      [kdL_PLZ],
      [kdL_Ort],
      [kdL_Region],
      [kdL_Kontrakt],
      [kdL_Abhol]
    FROM [dbo].[tblKun_LiefAdress]
    WHERE COALESCE([kdL_KdNR], '') = ?
    ORDER BY [kdL_Lieferanschrift_Nr] ASC
  `;
  const rows = await runSQLQueryAccess(req.database, sql, [id]);
  const data = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      id: toText(row.kdL_Lieferanschrift_Nr),
      customerId: toText(row.kdL_KdNR),
      text: buildAddressText(row),
      short: toText(row.kdL_Kurz),
      name1: toText(row.kdL_Name1),
      name2: toText(row.kdL_Name2),
    }))
    .filter((x) => x.text);

  sendEnvelope(res, {
    status: 200,
    data,
    meta: {
      mandant: req.mandant,
      databaseName: req.database?.databaseName || null,
      idField: 'kdL_KdNR',
      id,
      count: data.length,
    },
    error: null,
  });
}));

router.get('/customers/:id/orders', requireMandant, asyncHandler(async (req, res) => {
  const customerId = toText(req.params.id);
  const lang = resolveLang(req);
  if (!customerId) {
    throw createHttpError(400, 'Missing customer id.', { code: 'INVALID_CUSTOMER_ID' });
  }

  const sql = `
    SELECT
      [au_Auftragsindex] AS orderIndex,
      [au_KontaktpersonAU] AS contact,
      [au_Zahltext] AS paymentTextId,
      [au_RGfaellig] AS dueDate,
      [au_Auftragsdatum] AS orderDate
    FROM [dbo].[tblAuftrag]
    WHERE COALESCE([au_KdNr], '') = ?
      AND COALESCE([au_Abgeschlossen], 0) <> 1
    ORDER BY [au_Auftragsdatum] DESC
  `;
  const rows = await runSQLQueryAccess(req.database, sql, [customerId]);
  const orders = Array.isArray(rows) ? rows : [];
  const indices = orders.map((x) => Number(x.orderIndex)).filter((x) => Number.isFinite(x));
  const paymentMap = await loadPaymentTextMap(orders.map((x) => x.paymentTextId), lang);

  let posMap = new Map();
  if (indices.length) {
    const placeholders = indices.map(() => '?').join(', ');
    const posSql = `
      SELECT
        [auP_Auftragsindex] AS orderIndex,
        [auP_Artikel] AS article,
        [auP_Anzahl] AS amount,
        [auP_Einheit] AS unit
      FROM [dbo].[tblAuf_Position]
      WHERE [auP_Auftragsindex] IN (${placeholders})
      ORDER BY [auP_Auftragsindex] ASC
    `;
    const posRows = await runSQLQueryAccess(req.database, posSql, indices);
    posMap = new Map();
    for (const row of (Array.isArray(posRows) ? posRows : [])) {
      const key = Number(row.orderIndex);
      if (!Number.isFinite(key)) continue;
      if (!posMap.has(key)) posMap.set(key, []);
      posMap.get(key).push({
        article: toText(row.article),
        amount: row.amount,
        unit: toText(row.unit),
      });
    }
  }

  const data = orders.map((row) => {
    const idx = Number(row.orderIndex);
    const paymentId = Number(row.paymentTextId);
    return {
      id: idx,
      contact: toText(row.contact),
      orderDate: row.orderDate || null,
      dueDate: row.dueDate || null,
      paymentTextId: Number.isFinite(paymentId) ? paymentId : null,
      paymentText: Number.isFinite(paymentId) ? (paymentMap.get(paymentId) || '') : '',
      positions: posMap.get(idx) || [],
    };
  });

  sendEnvelope(res, {
    status: 200,
    data,
    meta: { mandant: req.mandant, count: data.length, id: customerId },
    error: null,
  });
}));

router.get('/customers/:id/offers', requireMandant, asyncHandler(async (req, res) => {
  const customerId = toText(req.params.id);
  const lang = resolveLang(req);
  if (!customerId) {
    throw createHttpError(400, 'Missing customer id.', { code: 'INVALID_CUSTOMER_ID' });
  }
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const sql = `
    SELECT
      [an_Angebotsnummer] AS offerNo,
      [an_Kontaktperson] AS contact,
      [an_Zahltext] AS paymentTextId,
      [an_Angebotsdatum] AS offerDate
    FROM [dbo].[tblAngebot]
    WHERE COALESCE([an_KdNr], '') = ?
      AND [an_Angebotsdatum] >= ?
    ORDER BY [an_Angebotsdatum] DESC
  `;
  const rows = await runSQLQueryAccess(req.database, sql, [customerId, cutoff.toISOString()]);
  const offers = Array.isArray(rows) ? rows : [];
  const offerNos = offers.map((x) => toText(x.offerNo)).filter(Boolean);
  const paymentMap = await loadPaymentTextMap(offers.map((x) => x.paymentTextId), lang);

  let posMap = new Map();
  if (offerNos.length) {
    const placeholders = offerNos.map(() => '?').join(', ');
    const posSql = `
      SELECT
        [anP_AngebotsNr] AS offerNo,
        [anP_Artikel] AS article,
        [anP_Anzahl] AS amount,
        [anP_Einheit] AS unit,
        [anP_VK_EU] AS priceEu,
        [anP_VK_DM] AS priceDm
      FROM [dbo].[tblAng_Position]
      WHERE COALESCE([anP_AngebotsNr], '') IN (${placeholders})
      ORDER BY [anP_AngebotsNr] ASC
    `;
    const posRows = await runSQLQueryAccess(req.database, posSql, offerNos);
    posMap = new Map();
    for (const row of (Array.isArray(posRows) ? posRows : [])) {
      const key = toText(row.offerNo);
      if (!key) continue;
      if (!posMap.has(key)) posMap.set(key, []);
      const eu = Number(row.priceEu);
      const dm = Number(row.priceDm);
      posMap.get(key).push({
        article: toText(row.article),
        amount: row.amount,
        unit: toText(row.unit),
        offeredPrice: Number.isFinite(eu) ? eu : (Number.isFinite(dm) ? dm : null),
      });
    }
  }

  const data = offers.map((row) => {
    const offerNo = toText(row.offerNo);
    const paymentId = Number(row.paymentTextId);
    return {
      id: offerNo,
      contact: toText(row.contact),
      offerDate: row.offerDate || null,
      paymentTextId: Number.isFinite(paymentId) ? paymentId : null,
      paymentText: Number.isFinite(paymentId) ? (paymentMap.get(paymentId) || '') : '',
      positions: posMap.get(offerNo) || [],
    };
  });

  sendEnvelope(res, {
    status: 200,
    data,
    meta: { mandant: req.mandant, count: data.length, id: customerId, days: 90 },
    error: null,
  });
}));

router.get('/customers/:id/invoices', requireMandant, asyncHandler(async (req, res) => {
  const customerId = toText(req.params.id);
  const lang = resolveLang(req);
  if (!customerId) {
    throw createHttpError(400, 'Missing customer id.', { code: 'INVALID_CUSTOMER_ID' });
  }

  const sql = `
    SELECT
      [re_rgDatum] AS invoiceDate,
      [re_RGfaellig] AS dueDate,
      [re_Zahltext] AS paymentTextId,
      [re_Bruttosumme_EU] AS grossEu,
      [re_Bruttosumme_DM] AS grossDm
    FROM [dbo].[tblRechnung]
    WHERE COALESCE([re_KdNr], '') = ?
      AND COALESCE([re_Bezahlt], 0) <> 1
    ORDER BY [re_rgDatum] DESC
  `;
  const rows = await runSQLQueryAccess(req.database, sql, [customerId]);
  const invoices = Array.isArray(rows) ? rows : [];
  const paymentMap = await loadPaymentTextMap(invoices.map((x) => x.paymentTextId), lang);

  const data = invoices.map((row, idx) => {
    const paymentId = Number(row.paymentTextId);
    const eu = Number(row.grossEu);
    const dm = Number(row.grossDm);
    const invoiceDate = row.invoiceDate || null;
    return {
      id: `${invoiceDate || 'inv'}-${idx + 1}`,
      invoiceDate,
      dueDate: row.dueDate || null,
      amount: Number.isFinite(eu) ? eu : (Number.isFinite(dm) ? dm : null),
      paymentTextId: Number.isFinite(paymentId) ? paymentId : null,
      paymentText: Number.isFinite(paymentId) ? (paymentMap.get(paymentId) || '') : '',
    };
  });

  sendEnvelope(res, {
    status: 200,
    data,
    meta: { mandant: req.mandant, count: data.length, id: customerId },
    error: null,
  });
}));

module.exports = router;
