const express = require('express');
const config = require('../config');
const { asyncHandler, createHttpError, sendEnvelope } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const {
  requirePilotFeature,
} = require('../middlewares/pilot-feature.middleware');
const {
  runSQLQueryAccess,
  runSQLQuerySqlServer,
  withSqlTransaction,
} = require('../db/access');
const {
  getCustomerAccessScope,
  loadVisibleCustomer,
} = require('../db/customer-access');
const { productAvailabilitySource } = require('../db/product-availability');
const {
  loadTempOrderPlanning,
  getTempOrderPlanningEntry,
} = require('../db/temp-order-planning');
const { normalize, text, uuid, totals } = require('../offers/values');
const {
  catalogWhere,
  catalogSelect,
  groupArticles,
} = require('../offers/catalog');
const { loadOfferOptions } = require('../offers/terms');
const { loadCustomerDeliveryAddresses } = require('../db/delivery-addresses');
const {
  H,
  P,
  headerFields,
  positionFields,
  headerSelect,
  insert,
  read,
} = require('../offers/storage');
const { synchronizeReservations } = require('../offers/reservations');

const router = express.Router();
const gate = [requireMandant, requirePilotFeature('offers')];
const query = async (sql, params = []) => ({
  rows: await runSQLQuerySqlServer(config.sql.database, sql, params),
});
const owner = (req) => req.userIdentity.shortCode;
function notFound() {
  throw createHttpError(404, 'Angebot nicht gefunden.', {
    code: 'OFFER_NOT_FOUND',
  });
}
function offerId(req) {
  if (
    !/^[1-9]\d*$/.test(String(req.params.id || '')) ||
    Number(req.params.id) > 2147483647
  )
    notFound();
  return Number(req.params.id);
}
function requireVersion(row, version) {
  if (
    !/^0x[0-9a-f]{16}$/i.test(String(version || '')) ||
    row.version.toLowerCase() !== version.toLowerCase()
  ) {
    throw createHttpError(
      409,
      'Das Angebot wurde inzwischen geändert. Bitte neu laden.',
      { code: 'OFFER_VERSION_CONFLICT' },
    );
  }
}
function editable(row) {
  if (![0, 3].includes(row.status))
    throw createHttpError(
      409,
      'Das freigegebene Angebot kann nicht bearbeitet werden. Bitte eine Kopie erstellen.',
      { code: 'OFFER_NOT_EDITABLE' },
    );
}
function pageParams(req) {
  return {
    page: Math.max(
      1,
      Math.min(100000, Math.trunc(Number(req.query.page) || 1)),
    ),
    pageSize: Math.max(
      1,
      Math.min(50, Math.trunc(Number(req.query.pageSize) || 12)),
    ),
  };
}
async function customer(req, id) {
  const scope = await getCustomerAccessScope(req.userIdentity, req.database);
  const row = await loadVisibleCustomer(req.database, id, scope);
  if (!row)
    throw createHttpError(404, 'Kunde nicht gefunden oder nicht berechtigt.', {
      code: 'CUSTOMER_NOT_FOUND',
    });
  return row;
}
const language = (req) =>
  String(req.header('x-lang') || 'de').toLowerCase() === 'en' ? 'en' : 'de';
router.get(
  '/temp-offers/meta',
  ...gate,
  asyncHandler(async (req, res) =>
    sendEnvelope(res, {
      data: await loadOfferOptions(req.database, language(req)),
    }),
  ),
);
router.get(
  '/temp-offers/customer-defaults/:customerId',
  ...gate,
  asyncHandler(async (req, res) => {
    const c = await customer(req, text(req.params.customerId, 10));
    const contacts = await runSQLQueryAccess(
      req.database,
      `SELECT kdA_lfdNR AS id,LTRIM(RTRIM(CONCAT(kdA_Anrede,N' ',kdA_Vorname,N' ',kdA_Name))) AS name,kdA_Position AS position,kdA_eMail AS email,kdA_Ranking AS ranking FROM dbo.tblKun_Ansprech WHERE kdA_KdNR=? ORDER BY ISNULL(kdA_Ranking,9),kdA_Name,kdA_Vorname`,
      [c.kd_KdNR],
    );
    const options = await loadOfferOptions(req.database, language(req));
    const addresses = await loadCustomerDeliveryAddresses(
      req.database,
      c.kd_KdNR,
    );
    const defaultContact = [1, 2, 3]
      .map((rank) =>
        contacts.find(
          (c) =>
            Number(c.ranking) === rank && c.id && String(c.name || '').trim(),
        ),
      )
      .find(Boolean);
    sendEnvelope(res, {
      data: {
        customerId: c.kd_KdNR,
        customerName: c.kd_Name1 || c.kd_Name2 || '',
        customerAddress: [
          c.kd_Strasse,
          [c.kd_PLZ, c.kd_Ort].filter(Boolean).join(' '),
          c.kd_LK,
        ]
          .filter(Boolean)
          .join('\n'),
        contacts,
        defaultContactId: defaultContact?.id || null,
        defaultContact: defaultContact?.name || '',
        deliveryAddresses: addresses,
        paymentId: c.kd_Zahltext || null,
        paymentText:
          options.payments.find((p) => Number(p.id) === Number(c.kd_Zahltext))
            ?.text || '',
      },
    });
  }),
);
router.get(
  '/temp-offers/article-groups',
  ...gate,
  asyncHandler(async (req, res) => {
    const where = catalogWhere(req.query);
    const { page, pageSize } = pageParams(req);
    const rows = await runSQLQueryAccess(
      req.database,
      catalogSelect + ' WHERE ' + where.sql,
      where.params,
    );
    const groups = groupArticles(rows);
    sendEnvelope(res, {
      data: groups.slice((page - 1) * pageSize, page * pageSize),
      meta: {
        page,
        pageSize,
        total: groups.length,
        totalArticles: rows.length,
      },
    });
  }),
);
router.get(
  '/temp-offers/articles',
  ...gate,
  asyncHandler(async (req, res) => {
    const where = catalogWhere(req.query);
    const { page, pageSize } = pageParams(req);
    const count = await runSQLQueryAccess(
      req.database,
      'SELECT COUNT(*) AS total FROM dbo.tblArt_Artikel a WHERE ' + where.sql,
      where.params,
    );
    const rows = await runSQLQueryAccess(
      req.database,
      catalogSelect +
        ' WHERE ' +
        where.sql +
        ' ORDER BY a.agA_Artikelname,a.agA_Artikelindex OFFSET ? ROWS FETCH NEXT ? ROWS ONLY',
      [...where.params, (page - 1) * pageSize, pageSize],
    );
    sendEnvelope(res, {
      data: rows,
      meta: { page, pageSize, total: count[0].total },
    });
  }),
);
router.get(
  '/temp-offers/articles/:articleIndex/stock',
  ...gate,
  asyncHandler(async (req, res) => {
    const rows = await runSQLQueryAccess(
      req.database,
      `SELECT [Bestell-Pos] AS beNumber,[bePL_LagerID] AS warehouseId,[Lagerort] AS warehouse,
    [Menge] AS amount,[bePR_Anzahl] AS reserved,[bePR_reserviertVon] AS reservedBy,[Einheit] AS unit FROM ${productAvailabilitySource('v')} WHERE beP_Artikelindex=?`,
      [text(req.params.articleIndex, 50)],
    );
    const planning = await loadTempOrderPlanning({
      companyId: req.database.firmaId,
      keys: rows,
    });
    sendEnvelope(res, {
      data: rows.map((p) => ({
        ...p,
        available: Math.max(
          Number(p.amount) -
            Number(p.reserved || 0) -
            getTempOrderPlanningEntry(planning, p.beNumber, p.warehouseId)
              .totalAmountKg,
          0,
        ),
      })),
    });
  }),
);

router.get(
  '/temp-offers',
  ...gate,
  asyncHandler(async (req, res) => {
    const { page, pageSize } = pageParams(req);
    const params = [req.database.firmaId, owner(req)];
    const clauses = ['h.tag_company_id=?', 'h.tag_created_by=?'];
    if (req.query.customerId) {
      clauses.push('h.tag_customer_id=?');
      params.push(text(req.query.customerId, 10));
    }
    if (['3m', '6m'].includes(req.query.scope)) {
      clauses.push(
        'h.tag_created_at >= DATEADD(MONTH,?,CONVERT(date,GETDATE()))',
      );
      params.push(req.query.scope === '3m' ? -3 : -6);
    } else if (req.query.scope === 'year') {
      const year = Number(req.query.year);
      if (!Number.isInteger(year) || year < 1900 || year > 2100)
        throw createHttpError(400, 'Ungültiges Jahr.', {
          code: 'INVALID_OFFER',
        });
      clauses.push(
        'h.tag_created_at>=DATEFROMPARTS(?,1,1) AND h.tag_created_at<DATEFROMPARTS(?,1,1)',
      );
      params.push(year, year + 1);
    }
    const namedStatus = { draft: 0, rework: 3 };
    if (req.query.status === 'sent') clauses.push('h.tag_status IN (1,2)');
    else if (Object.hasOwn(namedStatus, req.query.status)) {
      clauses.push('h.tag_status=?');
      params.push(namedStatus[req.query.status]);
    } else if (/^[0-3]$/.test(req.query.status)) {
      clauses.push('h.tag_status=?');
      params.push(Number(req.query.status));
    }
    if (req.query.period === 'today')
      clauses.push(
        "h.tag_created_at >= CONVERT(datetime2,CONVERT(date,SYSDATETIMEOFFSET() AT TIME ZONE 'W. Europe Standard Time')) AT TIME ZONE 'W. Europe Standard Time' AT TIME ZONE 'UTC'",
      );
    if (req.query.period === 'week')
      clauses.push(
        "h.tag_created_at >= DATEADD(DAY,-(DATEDIFF(DAY,CONVERT(date,'19000101',112),CONVERT(date,GETDATE()))%7),CONVERT(date,GETDATE()))",
      );
    const search = text(req.query.q, 200);
    if (search) {
      const like = `%${search.replace(/[\[\]%_]/g, (c) => `[${c}]`)}%`;
      clauses.push(
        `(CONCAT(h.tag_customer_name,N' ',h.tag_customer_reference,N' ',h.tag_internal_note,N' ',h.tag_bms_offer_number,N' AN-',h.tag_id) LIKE ? OR EXISTS(SELECT 1 FROM ${P} p WHERE p.tagp_offer_id=h.tag_id AND CONCAT(p.tagp_article,N' ',p.tagp_article_index) LIKE ?))`,
      );
      params.push(like, like);
    }
    const where = clauses.join(' AND ');
    const count = (
      await query(`SELECT COUNT(*) AS total FROM ${H} h WHERE ${where}`, params)
    ).rows[0].total;
    const rows = (
      await query(
        `SELECT ${headerSelect} FROM ${H} h WHERE ${where} ORDER BY h.tag_created_at DESC,h.tag_id DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`,
        [...params, (page - 1) * pageSize, pageSize],
      )
    ).rows;
    if (rows.length) {
      const lines = (
        await query(
          `SELECT tagp_offer_id AS offerId,tagp_article AS article,tagp_quantity AS quantity,tagp_unit AS unit,tagp_price AS price,tagp_price_basis AS priceBasis FROM ${P} WHERE tagp_offer_id IN (${rows.map(() => '?').join(',')}) ORDER BY tagp_line_no`,
          rows.map((r) => r.id),
        )
      ).rows;
      rows.forEach((r) => {
        r.positions = lines.filter((p) => p.offerId === r.id);
        r.totalAmount = totals(r.positions, 0, 0).netAmount;
        r.currency = 'EUR';
      });
    }
    sendEnvelope(res, { data: rows, meta: { page, pageSize, total: count } });
  }),
);
router.get(
  '/temp-offers/:id',
  ...gate,
  asyncHandler(async (req, res) => {
    const row = await read(
      query,
      offerId(req),
      req.database.firmaId,
      owner(req),
    );
    if (!row) notFound();
    sendEnvelope(res, { data: row });
  }),
);

async function save(req) {
  const { header, positions } = normalize(req.body);
  const c = await customer(req, header.customerId);
  header.customerName = text(
    req.body.customerName || c.kd_Name1 || c.kd_Name2,
    255,
  );
  header.customerAddress = [
    c.kd_Strasse,
    [c.kd_PLZ, c.kd_Ort].filter(Boolean).join(' '),
    c.kd_LK,
  ]
    .filter(Boolean)
    .join('\n');
  if (header.contactId) {
    const contact = (
      await runSQLQueryAccess(
        req.database,
        `SELECT kdA_lfdNR,LTRIM(RTRIM(CONCAT(kdA_Anrede,N' ',kdA_Vorname,N' ',kdA_Name))) AS name FROM dbo.tblKun_Ansprech WHERE kdA_lfdNR=? AND kdA_KdNR=?`,
        [header.contactId, header.customerId],
      )
    )[0];
    if (!contact)
      throw createHttpError(
        400,
        'Ansprechpartner gehört nicht zum gewählten Kunden.',
        { code: 'INVALID_OFFER_CONTACT' },
      );
    header.contact = text(contact.name, 50);
  } else {
    header.contact = '';
  }
  const options = await loadOfferOptions(req.database, language(req));
  const paymentId = header.specialPaymentCondition
    ? header.paymentId
    : Number(c.kd_Zahltext) || header.paymentId;
  const payment = options.payments.find(
    (p) => Number(p.id) === Number(paymentId),
  );
  if (paymentId && !payment)
    throw createHttpError(
      400,
      'Bitte eine gültige Zahlungsbedingung auswählen.',
      { code: 'INVALID_OFFER' },
    );
  header.paymentId = payment?.id || null;
  header.paymentText = payment?.text || '';
  const packaging = options.packagingTypes.find(
    (p) => Number(p.id) === Number(header.packagingId),
  );
  if (!packaging)
    throw createHttpError(400, 'Bitte eine Verpackungsart auswählen.', {
      code: 'INVALID_OFFER',
    });
  header.packagingId = packaging.id;
  header.packaging = packaging.text;
  const incoterm = options.incoterms.find(
    (p) => Number(p.id) === Number(header.deliveryTermsId),
  );
  if (!incoterm)
    throw createHttpError(400, 'Bitte eine Lieferbedingung auswählen.', {
      code: 'INVALID_OFFER',
    });
  header.deliveryTermsId = incoterm.id;
  header.deliveryTerms = incoterm.text;
  if (header.deliveryAddressManual || /^FCA\b/i.test(header.deliveryTerms))
    header.deliveryAddressId = null;
  else if (header.deliveryAddressId) {
    const addresses = await loadCustomerDeliveryAddresses(
      req.database,
      header.customerId,
    );
    const address = addresses.find(
      (a) => Number(a.id) === Number(header.deliveryAddressId),
    );
    if (!address)
      throw createHttpError(
        400,
        'Lieferadresse gehört nicht zum gewählten Kunden.',
        { code: 'INVALID_OFFER' },
      );
    header.deliveryAddress = address.text;
  } else header.deliveryAddress = '';
  const indexes = [...new Set(positions.map((p) => p.articleIndex))];
  const masters = await runSQLQueryAccess(
    req.database,
    `SELECT agA_Artikelindex AS articleIndex,COALESCE(NULLIF(agA_Artikelname,N''),agA_Artikelindex) AS article FROM dbo.tblArt_Artikel WHERE COALESCE(agA_Deaktiv,0)=0 AND agA_Artikelindex IN (${indexes.map(() => '?').join(',')})`,
    indexes,
  );
  for (const p of positions) {
    const master = masters.find((m) => m.articleIndex === p.articleIndex);
    if (!master)
      throw createHttpError(400, `Artikel ${p.articleIndex} ist nicht aktiv.`, {
        code: 'OFFER_ARTICLE_INACTIVE',
      });
    p.masterArticle = master.article;
  }
  req.offerCustomerId = header.customerId;
  return withSqlTransaction(config.sql.database, async ({ query: tx }) => {
    let id = req.params.id ? offerId(req) : null;
    let old = null;
    if (id) {
      old = await read(tx, id, req.database.firmaId, owner(req), true);
      if (!old) notFound();
      editable(old);
      requireVersion(old, req.body.version);
    } else {
      if (!uuid(req.body.clientRequestId))
        throw createHttpError(400, 'Ungültige Vorgangskennung.', {
          code: 'INVALID_OFFER_REQUEST_ID',
        });
      const replay = (
        await tx(
          `SELECT tag_id AS id FROM ${H} WITH (UPDLOCK,HOLDLOCK) WHERE tag_company_id=? AND tag_created_by=? AND tag_client_request_id=?`,
          [req.database.firmaId, owner(req), req.body.clientRequestId],
        )
      ).rows[0];
      if (replay) return read(tx, replay.id, req.database.firmaId, owner(req));
      const copySourceId = Number(req.body.copySourceId) || null;
      if (
        copySourceId &&
        !(await read(tx, copySourceId, req.database.firmaId, owner(req)))
      )
        notFound();
      const result = await insert(tx, H, headerFields, header, {
        tag_company_id: req.database.firmaId,
        tag_created_by: owner(req),
        tag_modified_by: owner(req),
        tag_client_request_id: req.body.clientRequestId,
        tag_copy_source_id: copySourceId,
      });
      id = result.rows[0].tag_id;
    }
    await synchronizeReservations(tx, req, id, old?.positions || [], positions);
    if (old) {
      const entries = Object.entries(headerFields);
      await tx(
        `UPDATE ${H} SET ${entries.map(([, col]) => `[${col}]=?`).join(',')},tag_modified_by=?,tag_modified_at=SYSUTCDATETIME(),tag_status=0,tag_return_comment=NULL WHERE tag_id=?`,
        [...entries.map(([key]) => header[key] ?? null), owner(req), id],
      );
      await tx(`DELETE FROM ${P} WHERE tagp_offer_id=?`, [id]);
    }
    for (const p of positions)
      await insert(tx, P, positionFields, p, {
        tagp_offer_id: id,
        tagp_reservation_version: p.reservationVersion
          ? Buffer.from(p.reservationVersion.slice(2), 'hex')
          : null,
      });
    return read(tx, id, req.database.firmaId, owner(req));
  });
}
router.post(
  '/temp-offers',
  ...gate,
  asyncHandler(async (req, res) =>
    sendEnvelope(res, { status: 201, data: await save(req) }),
  ),
);
router.put(
  '/temp-offers/:id',
  ...gate,
  asyncHandler(async (req, res) =>
    sendEnvelope(res, { data: await save(req) }),
  ),
);
router.post(
  '/temp-offers/:id/release',
  ...gate,
  asyncHandler(async (req, res) => {
    const row = await withSqlTransaction(
      config.sql.database,
      async ({ query: tx }) => {
        const current = await read(
          tx,
          offerId(req),
          req.database.firmaId,
          owner(req),
          true,
        );
        if (!current) notFound();
        requireVersion(current, req.body?.version);
        editable(current);
        await customer(req, current.customerId);
        const indexes = [
          ...new Set(current.positions.map((p) => p.articleIndex)),
        ];
        const active = await runSQLQueryAccess(
          req.database,
          `SELECT agA_Artikelindex FROM dbo.tblArt_Artikel WHERE COALESCE(agA_Deaktiv,0)=0 AND agA_Artikelindex IN (${indexes.map(() => '?').join(',')})`,
          indexes,
        );
        if (active.length !== indexes.length)
          throw createHttpError(
            400,
            'Mindestens ein Artikel ist inzwischen inaktiv. Bitte das Angebot bearbeiten.',
            { code: 'OFFER_ARTICLE_INACTIVE' },
          );
        await tx(
          `UPDATE ${H} SET tag_status=1,tag_released_at=SYSUTCDATETIME(),tag_modified_at=SYSUTCDATETIME(),tag_modified_by=? WHERE tag_id=?`,
          [owner(req), current.id],
        );
        return read(tx, current.id, req.database.firmaId, owner(req));
      },
    );
    sendEnvelope(res, { data: row });
  }),
);
router.delete(
  '/temp-offers/:id',
  ...gate,
  asyncHandler(async (req, res) => {
    await withSqlTransaction(config.sql.database, async ({ query: tx }) => {
      const row = await read(
        tx,
        offerId(req),
        req.database.firmaId,
        owner(req),
        true,
      );
      if (!row) notFound();
      editable(row);
      requireVersion(row, req.body?.version);
      await synchronizeReservations(tx, req, row.id, row.positions, []);
      await tx(`DELETE FROM ${P} WHERE tagp_offer_id=?`, [row.id]);
      await tx(`DELETE FROM ${H} WHERE tag_id=?`, [row.id]);
    });
    sendEnvelope(res, { data: { deleted: true } });
  }),
);
module.exports = router;
