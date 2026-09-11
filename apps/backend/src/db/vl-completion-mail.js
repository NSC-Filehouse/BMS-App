const config = require('../config');
const logger = require('../logger');
const { runSQLQueryAccess, runSQLQueryFx, runSQLQuerySqlServer } = require('./access');
const { appTableSql } = require('./app-tables');
const { getDatabaseConnectionForCompanyId } = require('./databases');
const { getUserIdentitiesByPersonNumbers } = require('./users');
const { productAvailabilitySource } = require('./product-availability');
const {
  sendOrderMail,
  resolveMandantMailDistributor,
  validateOrderMailConfig,
} = require('../mail/order-mail');
const {
  VL_COMPLETION_MAIL_SUBJECT,
  formatVlCompletionMailBody,
} = require('../mail/vl-completion-mail');
const { normalizeMfiValue, sortVlItems } = require('../mfi-sort');

const TEMP_ORDER_TABLE = appTableSql('tempOrder');
const TEMP_ORDER_POSITION_TABLE = appTableSql('tempOrderPosition');
const VL_MAIL_OUTBOX_TABLE = appTableSql('vlMailOutbox');
const VL_MAIL_ORDER_STATE_TABLE = appTableSql('vlMailOrderState');
const VL_MAIL_WORKER_STATE_TABLE = appTableSql('vlMailWorkerState');
const VL_MAIL_USER_SETTING_TABLE = appTableSql('vlMailUserSetting');
const TEST_MANDANT_ID = 0;
const TEST_MANDANT_RECIPIENTS = Object.freeze([
  { address: 'm.frank@filehouse.net', source: 'test_mandant_override_mfr' },
  { address: 'n.schroeder@filehouse.net', source: 'test_mandant_override_nsc' },
]);
const MAX_SCAN_COUNT = 25;
const MAX_SEND_COUNT = 10;

let workerTimer = null;
let workerRunning = false;

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeEmail(email) {
  return asText(email).toLowerCase();
}

function isEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(asText(value));
}

function isMissingObjectError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('invalid object name')
    || message.includes('ungültiger objektname')
    || message.includes('ungueltiger objektname');
}

function getField(row, key) {
  if (!row || typeof row !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  const wanted = String(key || '').toLowerCase();
  const found = Object.keys(row).find((item) => String(item).toLowerCase() === wanted);
  return found ? row[found] : undefined;
}

function normalizeDateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapOrderRow(row) {
  return {
    id: row.orderId ?? row.ta_id,
    companyId: row.companyId ?? row.ta_company_id,
    clientReferenceId: row.clientReferenceId ?? row.ta_ClientReferenceId,
    clientName: row.clientName ?? row.ta_client_name,
    clientAddress: row.clientAddress ?? row.ta_client_address,
    clientRepresentative: row.clientRepresentative ?? row.ta_client_representative,
    comment: row.comment ?? row.ta_comment,
    deliveryType: row.deliveryType ?? row.ta_delivery_type,
    packagingType: row.packagingType ?? row.ta_packaging_type,
    deliveryAddress: row.deliveryAddress ?? row.ta_delivery_address,
    deliveryAddressId: row.deliveryAddressId ?? row.ta_delivery_address_id,
    createdBy: row.createdBy ?? row.ta_CreatedBy,
    createdAt: row.createdAt ?? row.ta_CreateDate,
    completedBy: row.completedBy ?? row.ta_CompletedBy,
    closingDate: row.closingDate ?? row.ta_closing_date,
    lastModifiedDate: row.lastModifiedDate ?? row.ta_LastModifiedDate,
  };
}

function mapTempPosition(row) {
  return {
    lineNo: row.lineNo ?? row.tap_line_no,
    beNumber: asText(row.beNumber ?? row.tap_be_number),
    article: asText(row.article ?? row.tap_article),
    amountInKg: asNumber(row.amountInKg ?? row.tap_amount_in_kg),
    unit: asText(row.unit ?? row.tap_unit) || 'KG',
    warehouse: asText(row.warehouse ?? row.tap_warehouse),
    price: asNumber(row.price ?? row.tap_price),
    costPrice: asNumber(row.costPrice ?? row.tap_ep),
  };
}

function mapAvailabilityRow(row) {
  const measured = normalizeMfiValue(getField(row, 'beP_MFIgemessen'));
  const base = normalizeMfiValue(getField(row, 'beP_MFI'));
  return {
    amount: asNumber(getField(row, 'Menge')),
    unit: asText(getField(row, 'Einheit')),
    article: asText(getField(row, 'Artikel')),
    acquisitionPrice: asNumber(getField(row, 'EP')),
    warehouse: asText(getField(row, 'Lagerort')),
    beNumber: asText(getField(row, 'Bestell-Pos')),
    mfiMeasured: measured,
    mfi: measured !== null ? measured : base,
    mfiTestMethod: asText(getField(row, 'beP_MFI_Pruefmethode')),
    about: asText(getField(row, 'beP_VLbemerkung')),
    plastic: asText(getField(row, 'Kunststoff')),
    plasticSubCategory: asText(getField(row, 'Kunststoff_Untergruppe')),
  };
}

function eventKeyForOrder(order) {
  const id = asText(order?.id);
  // Status 2 is the business event. Changes to ta_LastModifiedDate after the
  // order reached status 2 must never create another sale-mail event.
  return `${id}:status2`;
}

async function loadStatus2Candidates(limit = MAX_SCAN_COUNT) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || MAX_SCAN_COUNT, 100));
  return runSQLQuerySqlServer(config.sql.database, `
    SELECT TOP ${safeLimit}
      [o].[ta_id] AS orderId,
      [o].[ta_company_id] AS companyId
    FROM ${TEMP_ORDER_TABLE} AS o
    LEFT JOIN ${VL_MAIL_ORDER_STATE_TABLE} AS s
      ON [s].[vmos_OrderID] = [o].[ta_id]
    WHERE [o].[ta_Status] = 2
      AND (
        [s].[vmos_OrderID] IS NULL
        OR COALESCE([s].[vmos_LastStatus], -1) <> 2
      )
    ORDER BY [o].[ta_id] ASC
  `, []);
}

async function loadOrder(orderId) {
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT TOP 1
      [ta_id] AS orderId,
      [ta_company_id] AS companyId,
      [ta_ClientReferenceId] AS clientReferenceId,
      [ta_client_name] AS clientName,
      [ta_client_address] AS clientAddress,
      [ta_client_representative] AS clientRepresentative,
      [ta_comment] AS comment,
      [ta_delivery_type] AS deliveryType,
      [ta_packaging_type] AS packagingType,
      [ta_delivery_address] AS deliveryAddress,
      [ta_delivery_address_id] AS deliveryAddressId,
      [ta_CreatedBy] AS createdBy,
      [ta_CreateDate] AS createdAt,
      [ta_CompletedBy] AS completedBy,
      [ta_closing_date] AS closingDate,
      [ta_LastModifiedDate] AS lastModifiedDate,
      [ta_Status] AS orderStatus
    FROM ${TEMP_ORDER_TABLE}
    WHERE [ta_id] = ? AND [ta_Status] = 2
  `, [orderId]);
  return Array.isArray(rows) && rows.length ? mapOrderRow(rows[0]) : null;
}

async function loadOrderPositions(orderId) {
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT
      [tap_line_no] AS [lineNo],
      [tap_be_number] AS beNumber,
      [tap_article] AS article,
      [tap_amount_in_kg] AS amountInKg,
      [tap_warehouse] AS warehouse,
      [tap_price] AS price,
      [tap_ep] AS costPrice
    FROM ${TEMP_ORDER_POSITION_TABLE}
    WHERE [tap_ta_id] = ?
    ORDER BY [tap_line_no] ASC, [tap_id] ASC
  `, [orderId]);
  return (Array.isArray(rows) ? rows : []).map(mapTempPosition);
}

async function loadCurrentVl(database) {
  const rows = await runSQLQueryAccess(database, `
    SELECT *
    FROM ${productAvailabilitySource('availability')}
    ORDER BY [Kunststoff] ASC, [Kunststoff_Untergruppe] ASC, [Artikel] ASC, [Bestell-Pos] ASC
  `, []);
  return sortVlItems((Array.isArray(rows) ? rows : []).map(mapAvailabilityRow));
}

async function loadExcelAdRows(companyId) {
  const databases = [...new Set([
    config.fxSql.databases.mandantManager,
    config.fxSql.databases.mlPlastics,
  ].map(asText).filter(Boolean))];
  const personNumbers = new Set();
  let successfulQuery = false;

  for (const database of databases) {
    try {
      const rows = await runSQLQueryFx(database, `
        SELECT DISTINCT [ma_PersNR] AS personNumber
        FROM [dbo].[${config.fxSql.views.mitarbeiterExcelAd}]
        WHERE [ma_FirmaID] = ?
          AND COALESCE([ma_Aktiv], 1) = 1
      `, [companyId]);
      successfulQuery = true;
      for (const row of (Array.isArray(rows) ? rows : [])) {
        const personNumber = Number(row.personNumber);
        if (Number.isFinite(personNumber)) personNumbers.add(personNumber);
      }
    } catch (error) {
      if (!isMissingObjectError(error)) throw error;
    }
  }

  if (!successfulQuery) {
    throw new Error(`AD view ${config.fxSql.views.mitarbeiterExcelAd} is not available in the configured FX databases.`);
  }
  return [...personNumbers];
}

async function getVlMailRecipients(companyId) {
  const numericCompanyId = Number(companyId);
  if (numericCompanyId === TEST_MANDANT_ID) return [...TEST_MANDANT_RECIPIENTS];

  const distributor = resolveMandantMailDistributor(numericCompanyId, config.orderMail);
  if (distributor.ok) {
    return [{ address: distributor.address, source: distributor.source }];
  }

  const personNumbers = await loadExcelAdRows(numericCompanyId);
  const identities = await getUserIdentitiesByPersonNumbers(personNumbers);
  const recipients = new Map();
  for (const identity of identities.values()) {
    const address = normalizeEmail(identity.email);
    if (!isEmailAddress(address) || recipients.has(address)) continue;
    recipients.set(address, {
      address,
      source: 'excel_ad',
    });
  }
  return [...recipients.values()];
}

async function getVlMailSettingsForUser(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return { vlMailsEnabled: true };
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT TOP 1 [vms_VlMailsEnabled] AS vlMailsEnabled
    FROM ${VL_MAIL_USER_SETTING_TABLE}
    WHERE LOWER(LTRIM(RTRIM(COALESCE([vms_UserEmail], '')))) = ?
  `, [normalizedEmail]);
  return {
    vlMailsEnabled: rows.length ? Boolean(rows[0].vlMailsEnabled) : true,
  };
}

async function saveVlMailSettingsForUser(email, enabled) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) throw new Error('Missing user email.');
  const value = enabled ? 1 : 0;
  await runSQLQuerySqlServer(config.sql.database, `
    UPDATE ${VL_MAIL_USER_SETTING_TABLE}
    SET [vms_VlMailsEnabled] = ?,
        [vms_UpdatedAt] = SYSUTCDATETIME()
    WHERE LOWER(LTRIM(RTRIM(COALESCE([vms_UserEmail], '')))) = ?;

    IF @@ROWCOUNT = 0
    BEGIN
      INSERT INTO ${VL_MAIL_USER_SETTING_TABLE} ([vms_UserEmail], [vms_VlMailsEnabled])
      VALUES (?, ?);
    END;
  `, [value, normalizedEmail, normalizedEmail, value]);
  return getVlMailSettingsForUser(normalizedEmail);
}

async function isVlMailEnabledForUser(email) {
  const settings = await getVlMailSettingsForUser(email);
  return settings.vlMailsEnabled !== false;
}

async function upsertOrderState(order) {
  const companyId = Number(order.companyId);
  const lastModifiedDate = normalizeDateValue(order.lastModifiedDate);
  await runSQLQuerySqlServer(config.sql.database, `
    UPDATE ${VL_MAIL_ORDER_STATE_TABLE}
    SET [vmos_CompanyID] = ?,
        [vmos_LastStatus] = 2,
        [vmos_LastModifiedDate] = ?,
        [vmos_UpdatedAt] = SYSUTCDATETIME()
    WHERE [vmos_OrderID] = ?;

    IF @@ROWCOUNT = 0
    BEGIN
      INSERT INTO ${VL_MAIL_ORDER_STATE_TABLE} (
        [vmos_OrderID], [vmos_CompanyID], [vmos_LastStatus], [vmos_LastModifiedDate]
      )
      VALUES (?, ?, 2, ?);
    END;
  `, [companyId, lastModifiedDate, Number(order.id), Number(order.id), companyId, lastModifiedDate]);
}

async function queueVlMail({ order, eventKey, recipient, body }) {
  const nowIso = new Date().toISOString();
  await runSQLQuerySqlServer(config.sql.database, `
    INSERT INTO ${VL_MAIL_OUTBOX_TABLE} (
      [vmo_OrderID], [vmo_CompanyID], [vmo_EventKey], [vmo_Recipient], [vmo_RecipientSource],
      [vmo_Subject], [vmo_Body], [vmo_Status], [vmo_AttemptCount], [vmo_CreateDate], [vmo_LastModifiedDate]
    )
    SELECT ?, ?, ?, ?, ?, ?, ?, N'pending', 0, ?, ?
    WHERE NOT EXISTS (
      SELECT 1
      FROM ${VL_MAIL_OUTBOX_TABLE}
      WHERE [vmo_OrderID] = ? AND [vmo_Recipient] = ?
    )
  `, [
    Number(order.id),
    Number(order.companyId),
    eventKey,
    recipient.address,
    recipient.source,
    VL_COMPLETION_MAIL_SUBJECT,
    body,
    nowIso,
    nowIso,
    Number(order.id),
    recipient.address,
  ]);
}

async function processStatus2Order(candidate) {
  const order = await loadOrder(candidate.orderId);
  if (!order) return { status: 'gone' };

  const positions = await loadOrderPositions(order.id);
  const database = await getDatabaseConnectionForCompanyId(order.companyId);

  const recipients = await getVlMailRecipients(order.companyId);
  const eventKey = eventKeyForOrder(order);
  if (recipients.length) {
    const vlItems = await loadCurrentVl(database);
    const body = formatVlCompletionMailBody({
      order,
      positions,
      vlItems,
      mandantName: database.name,
      mandantShortName: database.shortName,
      completedAt: order.lastModifiedDate || order.closingDate,
    });
    for (const recipient of recipients) {
      await queueVlMail({ order, eventKey, recipient, body });
    }
  } else {
    logger.warn(`Keine aktiven AD-Empfaenger fuer VL-Mail von Mandant ${order.companyId}; Auftrag ${order.id} wird als verarbeitet markiert.`);
  }

  await upsertOrderState(order);
  return { status: 'queued', recipientCount: recipients.length, eventKey };
}

function mapOutboxRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    orderId: Number(row.orderId),
    companyId: Number(row.companyId),
    eventKey: asText(row.eventKey),
    recipient: normalizeEmail(row.recipient),
    subject: asText(row.subject),
    body: String(row.body || ''),
    status: asText(row.status),
    attemptCount: Number(row.attemptCount || 0),
  };
}

async function claimSpecificVlMail(outboxId) {
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    UPDATE ${VL_MAIL_OUTBOX_TABLE} WITH (ROWLOCK, UPDLOCK, READPAST)
    SET [vmo_Status] = N'sending',
        [vmo_AttemptCount] = [vmo_AttemptCount] + 1,
        [vmo_LockedAt] = SYSUTCDATETIME(),
        [vmo_LastModifiedDate] = SYSUTCDATETIME()
    OUTPUT
      INSERTED.[vmo_ID] AS id,
      INSERTED.[vmo_OrderID] AS orderId,
      INSERTED.[vmo_CompanyID] AS companyId,
      INSERTED.[vmo_EventKey] AS eventKey,
      INSERTED.[vmo_Recipient] AS recipient,
      INSERTED.[vmo_Subject] AS subject,
      INSERTED.[vmo_Body] AS body,
      INSERTED.[vmo_Status] AS status,
      INSERTED.[vmo_AttemptCount] AS attemptCount
    WHERE [vmo_ID] = ?
      AND [vmo_AttemptCount] < ?
      AND (
        [vmo_Status] IN (N'pending', N'failed')
        OR ([vmo_Status] = N'sending' AND [vmo_LockedAt] < DATEADD(MINUTE, -10, SYSUTCDATETIME()))
      )
      AND ([vmo_NextAttemptAt] IS NULL OR [vmo_NextAttemptAt] <= SYSUTCDATETIME())
  `, [outboxId, config.orderMail.maxAttempts]);
  return mapOutboxRow(Array.isArray(rows) && rows.length ? rows[0] : null);
}

async function findNextVlMailId() {
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT TOP 1 [vmo_ID] AS id
    FROM ${VL_MAIL_OUTBOX_TABLE} WITH (READPAST)
    WHERE [vmo_AttemptCount] < ?
      AND (
        [vmo_Status] IN (N'pending', N'failed')
        OR ([vmo_Status] = N'sending' AND [vmo_LockedAt] < DATEADD(MINUTE, -10, SYSUTCDATETIME()))
      )
      AND ([vmo_NextAttemptAt] IS NULL OR [vmo_NextAttemptAt] <= SYSUTCDATETIME())
    ORDER BY COALESCE([vmo_NextAttemptAt], [vmo_CreateDate]) ASC, [vmo_ID] ASC
  `, [config.orderMail.maxAttempts]);
  return Array.isArray(rows) && rows.length ? Number(rows[0].id) : null;
}

function nextRetryDate(attemptCount) {
  const minutes = Math.min(60, Math.max(1, 2 ** Math.max(0, attemptCount - 1)));
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function buildClientMessageId(item) {
  const suffix = Buffer.from(`${item.eventKey}:${item.recipient}`).toString('base64url');
  return `bms-app:vl-sale:${item.orderId}:${suffix}`;
}

async function processVlMailOutboxById(outboxId) {
  const item = await claimSpecificVlMail(outboxId);
  if (!item) return { processed: false, status: 'not_claimed' };

  try {
    if (!(await isVlMailEnabledForUser(item.recipient))) {
      await runSQLQuerySqlServer(config.sql.database, `
        UPDATE ${VL_MAIL_OUTBOX_TABLE}
        SET [vmo_Status] = N'skipped',
            [vmo_NextAttemptAt] = NULL,
            [vmo_LockedAt] = NULL,
            [vmo_LastError] = NULL,
            [vmo_LastModifiedDate] = SYSUTCDATETIME()
        WHERE [vmo_ID] = ?
      `, [item.id]);
      logger.info(`VL-Mail ${item.id} fuer ${item.recipient} wegen Benutzereinstellung uebersprungen.`);
      return { processed: true, status: 'skipped', recipient: item.recipient };
    }

    const delivery = await sendOrderMail({
      orderMailConfig: config.orderMail,
      mailServiceConfig: config.mailService,
      recipient: item.recipient,
      subject: item.subject,
      body: item.body,
      clientMessageId: buildClientMessageId(item),
      isBodyHtml: true,
    });
    await runSQLQuerySqlServer(config.sql.database, `
      UPDATE ${VL_MAIL_OUTBOX_TABLE}
      SET [vmo_Status] = N'sent',
          [vmo_SentAt] = SYSUTCDATETIME(),
          [vmo_NextAttemptAt] = NULL,
          [vmo_LockedAt] = NULL,
          [vmo_LastError] = NULL,
          [vmo_LastModifiedDate] = SYSUTCDATETIME()
      WHERE [vmo_ID] = ?
    `, [item.id]);
    logger.info(`VL-Mail ${item.id} fuer Auftrag ${item.orderId} ueber ${delivery.transport} angenommen an ${item.recipient}.`);
    return { processed: true, status: 'sent', recipient: item.recipient, transport: delivery.transport };
  } catch (error) {
    const message = asText(error?.message || error).slice(0, 2000) || 'Unbekannter Mail-Fehler';
    const exhausted = item.attemptCount >= config.orderMail.maxAttempts;
    await runSQLQuerySqlServer(config.sql.database, `
      UPDATE ${VL_MAIL_OUTBOX_TABLE}
      SET [vmo_Status] = N'failed',
          [vmo_NextAttemptAt] = ?,
          [vmo_LockedAt] = NULL,
          [vmo_LastError] = ?,
          [vmo_LastModifiedDate] = SYSUTCDATETIME()
      WHERE [vmo_ID] = ?
    `, [exhausted ? null : nextRetryDate(item.attemptCount), message, item.id]);
    logger.error(`VL-Mail ${item.id} fuer Auftrag ${item.orderId} fehlgeschlagen`, error);
    return { processed: true, status: 'failed', recipient: item.recipient, exhausted };
  }
}

async function processPendingVlMails(limit = MAX_SEND_COUNT) {
  if (workerRunning) return;
  if (!validateOrderMailConfig(config.orderMail, config.mailService).ok) return;
  workerRunning = true;
  try {
    const candidates = await loadStatus2Candidates();
    for (const candidate of (Array.isArray(candidates) ? candidates : [])) {
      try {
        await processStatus2Order(candidate);
      } catch (error) {
        if (isMissingObjectError(error)) {
          logger.warn('VL-Mail Tabellen oder AD-View fehlen. Keine VL-Mail verarbeitet.');
          break;
        }
        logger.error(`VL-Mail Vorbereitung fuer Auftrag ${candidate.orderId} fehlgeschlagen`, error);
      }
    }

    for (let i = 0; i < limit; i += 1) {
      const id = await findNextVlMailId();
      if (!id) break;
      await processVlMailOutboxById(id);
    }
  } catch (error) {
    logger.error('VL-Mail-Outbox konnte nicht verarbeitet werden', error);
  } finally {
    workerRunning = false;
  }
}

function startVlCompletionMailWorker() {
  if (workerTimer || !config.vlCompletionMail.enabled || !config.orderMail.enabled) return;
  const validation = validateOrderMailConfig(config.orderMail, config.mailService);
  if (!validation.ok) {
    logger.warn(`VL-Mail-Worker nicht gestartet: ${validation.reason}.`);
    return;
  }
  const intervalMs = Math.max(10, config.vlCompletionMail.intervalSeconds) * 1000;
  void processPendingVlMails();
  workerTimer = setInterval(() => void processPendingVlMails(), intervalMs);
  if (typeof workerTimer.unref === 'function') workerTimer.unref();
  logger.info(`VL-Mail-Worker gestartet (Intervall ${Math.round(intervalMs / 1000)}s).`);
}

module.exports = {
  getVlMailRecipients,
  getVlMailSettingsForUser,
  isVlMailEnabledForUser,
  loadCurrentVl,
  processPendingVlMails,
  processStatus2Order,
  processVlMailOutboxById,
  saveVlMailSettingsForUser,
  startVlCompletionMailWorker,
  eventKeyForOrder,
};
