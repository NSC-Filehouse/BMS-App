const { runSQLQueryAccess } = require('./db/access');

function toAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function calculateAvailableCredit({ amount, unpaidInvoicesAmount = 0, openOrdersAmount = 0 }) {
  const hasLimit = amount !== null && amount !== undefined && String(amount).trim() !== '';
  const limit = hasLimit ? Number(amount) : null;
  const unpaidInvoices = toAmount(unpaidInvoicesAmount);
  const openOrders = toAmount(openOrdersAmount);

  return {
    amount: Number.isFinite(limit) ? limit : null,
    unpaidInvoicesAmount: unpaidInvoices,
    openOrdersAmount: openOrders,
    availableAmount: Number.isFinite(limit)
      ? limit - unpaidInvoices
      : null,
  };
}

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function isInsolventFlag(value) {
  if (value === true || value === 1) return true;
  return ['1', 'true'].includes(normalizeText(value).toLowerCase());
}

function isEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(normalizeText(value));
}

function uniqueCaseInsensitive(values) {
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const text = normalizeText(value);
    const key = normalizeEmail(text);
    if (!text || !isEmailAddress(text) || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function calculateTempOrderValue(positions) {
  return (Array.isArray(positions) ? positions : []).reduce((total, position) => {
    const amountInKg = Number(position?.amountInKg);
    const pricePerTonne = Number(position?.price);
    if (!Number.isFinite(amountInKg) || !Number.isFinite(pricePerTonne)) return total;
    return total + (amountInKg * pricePerTonne) / 1000;
  }, 0);
}

function roundCreditLimit(value) {
  const amount = Math.max(0, Number(value) || 0);
  const step = amount < 1000
    ? 50
    : amount < 10000
      ? 500
      : amount < 100000
        ? 5000
        : 50000;
  return Math.ceil(amount / step) * step;
}

function calculateCreditLimitRequest({ currentOrderAmount, openTempOrders = [], openOrders = [] }) {
  const openTempOrdersAmount = (Array.isArray(openTempOrders) ? openTempOrders : [])
    .reduce((sum, item) => sum + toAmount(item?.amount), 0);
  const openOrdersAmount = (Array.isArray(openOrders) ? openOrders : [])
    .reduce((sum, item) => sum + toAmount(item?.amount), 0);
  const exposureAmount = toAmount(currentOrderAmount) + openTempOrdersAmount + openOrdersAmount;
  return {
    currentOrderAmount: toAmount(currentOrderAmount),
    openTempOrdersAmount,
    openOrdersAmount,
    exposureAmount,
    requestedLimit: roundCreditLimit(exposureAmount),
  };
}

function isCreditLimitExceeded(credit, exposureAmount) {
  if (!credit) return false;
  const limit = credit.amount === null || credit.amount === undefined || normalizeText(credit.amount) === ''
    ? null
    : Number(credit.amount);
  const totalExposure = toAmount(exposureAmount) + toAmount(credit.unpaidInvoicesAmount);
  return Number.isFinite(limit) ? totalExposure > limit : totalExposure > 0;
}

function formatEuro(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return `${amount.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} EUR`;
}

function formatCountryName(value) {
  const country = normalizeText(value);
  if (!country) return '';
  const normalized = country.toUpperCase();
  const knownCodes = {
    A: 'Österreich',
    AT: 'Österreich',
    CH: 'Schweiz',
    D: 'Deutschland',
    DE: 'Deutschland',
    DEU: 'Deutschland',
    FR: 'Frankreich',
    GB: 'Vereinigtes Königreich',
    NL: 'Niederlande',
    US: 'Vereinigte Staaten',
  };
  if (knownCodes[normalized]) return knownCodes[normalized];
  if (/^[A-Z]{2}$/.test(normalized) && typeof Intl.DisplayNames === 'function') {
    try {
      return new Intl.DisplayNames(['de'], { type: 'region' }).of(normalized) || country;
    } catch {
      return country;
    }
  }
  return country;
}

function line(label, value) {
  return `${label}: ${normalizeText(value) || '-'}`;
}

function formatIdentityWithShortCode(identity) {
  const fullName = normalizeText(identity?.fullName)
    || [identity?.givenName, identity?.surname].map(normalizeText).filter(Boolean).join(' ');
  const shortCode = normalizeText(identity?.shortCode);
  if (fullName && shortCode) return `${fullName} (${shortCode})`;
  return fullName || shortCode;
}

function hasBankDetails(customer) {
  const iban = normalizeText(customer?.iban);
  const bankName = normalizeText(customer?.bankName);
  const accountNumber = normalizeText(customer?.accountNumber);
  const bankInfo = normalizeText(customer?.bankInfo);
  return Boolean(iban || (bankName && accountNumber) || bankInfo);
}

function mapCustomerIdentity(row) {
  if (!row) return null;
  const name1 = normalizeText(row.name1);
  const name2 = normalizeText(row.name2);
  return {
    customerId: normalizeText(row.customerId),
    name1,
    name2,
    legalName: [name1, name2].filter(Boolean).join(' ') || normalizeText(row.customerName),
    country: normalizeText(row.country),
    postalCode: normalizeText(row.postalCode),
    city: normalizeText(row.city),
    street: normalizeText(row.street),
    vatId: normalizeText(row.vatId),
    insolvent: isInsolventFlag(row.insolvent),
    mainSalesRepresentative: normalizeText(row.mainSalesRepresentative),
    iban: normalizeText(row.iban),
    swift: normalizeText(row.swift),
    bankName: normalizeText(row.bankName),
    bankCode: normalizeText(row.bankCode),
    accountNumber: normalizeText(row.accountNumber),
    accountHolder: normalizeText(row.accountHolder),
    bankInfo: normalizeText(row.bankInfo),
  };
}

async function loadCustomerCreditContext(database, customerId) {
  const id = normalizeText(customerId);
  if (!id) return null;

  const customerRows = await runSQLQueryAccess(database, `
    SELECT TOP 1
      [kd_KdNR] AS customerId,
      [kd_Name1] AS name1,
      [kd_Name2] AS name2,
      [kd_Kunde] AS customerName,
      [kd_LK] AS country,
      [kd_PLZ] AS postalCode,
      [kd_Ort] AS city,
      [kd_Strasse] AS street,
      [kd_UST_Ident_Nr] AS vatId,
      [kd_Insolvenz] AS insolvent,
      [kd_Aussendienst] AS mainSalesRepresentative,
      [kd_IBAN] AS iban,
      [kd_SWIFT] AS swift,
      [kd_Bank] AS bankName,
      [kd_BLZ] AS bankCode,
      [kd_KontoNr] AS accountNumber,
      [kd_Kontoinhaber] AS accountHolder,
      [kd_BankInfo] AS bankInfo
    FROM [dbo].[tblKunden]
    WHERE [kd_KdNR] = ?
  `, [id]);
  const customer = mapCustomerIdentity(Array.isArray(customerRows) ? customerRows[0] : null);
  if (!customer) return null;

  const creditRows = await runSQLQueryAccess(database, `
    SELECT
      (
        SELECT TOP 1 [kdKL_Kredit_Limit]
        FROM [dbo].[tblKun_KreditLimit]
        WHERE [kdKL_KdNR] = ?
        ORDER BY [kdKL_Kredit_Datum] DESC, [kdKL_LfdNr] DESC
      ) AS amount,
      (
        SELECT TOP 1 [kdKL_Kredit_Datum_bis]
        FROM [dbo].[tblKun_KreditLimit]
        WHERE [kdKL_KdNR] = ?
        ORDER BY [kdKL_Kredit_Datum] DESC, [kdKL_LfdNr] DESC
      ) AS validUntil,
      COALESCE((
        SELECT SUM(COALESCE([re_Bruttosumme_EU], [re_Bruttosumme_DM], 0))
        FROM [dbo].[tblRechnung]
        WHERE COALESCE([re_KdNr], '') = ?
          AND [re_Bezahlt] = 0
      ), 0) AS unpaidInvoicesAmount,
      COALESCE((
        SELECT SUM(COALESCE([au_Bruttosumme_EU], [au_Bruttosumme_DM], 0))
        FROM [dbo].[tblAuftrag]
        WHERE COALESCE([au_KdNr], '') = ?
          AND COALESCE([au_Abgeschlossen], 0) <> 1
      ), 0) AS openOrdersAmount
  `, [id, id, id, id]);
  const creditRow = Array.isArray(creditRows) ? creditRows[0] : null;
  const amount = creditRow?.amount === null || creditRow?.amount === undefined || normalizeText(creditRow?.amount) === ''
    ? null
    : Number(creditRow.amount);
  const credit = calculateAvailableCredit({
    amount,
    unpaidInvoicesAmount: creditRow?.unpaidInvoicesAmount,
    openOrdersAmount: creditRow?.openOrdersAmount,
  });

  const openOrderRows = await runSQLQueryAccess(database, `
    SELECT
      [au_Auftragsindex] AS orderId,
      [au_Auftragsnummer] AS orderNumber,
      COALESCE([au_Bruttosumme_EU], [au_Bruttosumme_DM], 0) AS amount,
      [au_Auftragsdatum] AS orderDate
    FROM [dbo].[tblAuftrag]
    WHERE COALESCE([au_KdNr], '') = ?
      AND COALESCE([au_Abgeschlossen], 0) <> 1
    ORDER BY [au_Auftragsdatum] ASC, [au_Auftragsindex] ASC
  `, [id]);

  return {
    customer,
    credit,
    openOrders: (Array.isArray(openOrderRows) ? openOrderRows : []).map((row) => ({
      orderId: normalizeText(row.orderId),
      orderNumber: normalizeText(row.orderNumber),
      amount: toAmount(row.amount),
      orderDate: row.orderDate || null,
    })),
  };
}

function isWithinCooldown(lastRequestedAt, now = new Date(), cooldownMonths = 6) {
  if (!lastRequestedAt) return false;
  const last = new Date(lastRequestedAt);
  if (Number.isNaN(last.getTime())) return false;
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - Math.max(1, Number(cooldownMonths) || 6));
  return last >= cutoff;
}

function formatCreditLimitRequestBody({
  mandantName,
  mandantShortName,
  customer,
  requestedLimit,
  currentCreditLimit,
  annotation = '',
  salesRepresentative = null,
}) {
  const vatId = normalizeText(customer?.vatId) || 'Nicht vorhanden!';
  const note = normalizeText(annotation).slice(0, 5000);
  const addressLines = [
    normalizeText(customer?.street),
    [customer?.postalCode, customer?.city].map(normalizeText).filter(Boolean).join(' '),
    formatCountryName(customer?.country),
  ].filter(Boolean);
  const lines = [
    `Bitte um Prüfung und Einrichtung eines Kreditlimits. ${formatEuro(requestedLimit)}`,
    '',
    line('Kundennummer', customer?.customerId),
    normalizeText(customer?.legalName) || '-',
    ...addressLines,
    `USt-IdNr.: ${vatId}`,
    '',
    line('Mandant', [mandantName, mandantShortName ? `(${mandantShortName})` : ''].filter(Boolean).join(' ')),
    line('Außendienst', formatIdentityWithShortCode(salesRepresentative)),
    '',
    line('Kreditwunsch', formatEuro(requestedLimit)),
    line('Bisheriges Kreditlimit', currentCreditLimit === null || currentCreditLimit === undefined
      ? 'Nicht hinterlegt'
      : formatEuro(currentCreditLimit)),
    `Anmerkungen: ${note || '-'}`,
  ];
  return lines.join('\r\n');
}

function formatBankDetailsReminderBody({ mandantName, customer, orderId, missingFields = [] }) {
  return [
    'Bitte die Bankdaten des Kunden im Kundenstamm der BMS-App nachpflegen.',
    '',
    'KUNDE / FIRMENIDENTITÄT',
    line('Firmierung', customer?.legalName),
    line('Kundennummer', customer?.customerId),
    line('Straße', customer?.street),
    line('PLZ / Ort', [customer?.postalCode, customer?.city].filter(Boolean).join(' ')),
    line('USt-IdNr.', customer?.vatId),
    line('Mandant', mandantName),
    line('Auslösender BMS-App-Auftrag', orderId),
    '',
    `Fehlende bzw. unvollständige Angaben: ${missingFields.length ? missingFields.join(', ') : 'Bankverbindung prüfen'}`,
    '',
    'Bitte mindestens IBAN sowie – sofern vorhanden – BIC/SWIFT und Kontoinhaber ergänzen. Bei einer Altbankverbindung bitte Bank und Kontonummer vollständig pflegen.',
  ].join('\r\n');
}

module.exports = {
  calculateAvailableCredit,
  calculateCreditLimitRequest,
  calculateTempOrderValue,
  formatBankDetailsReminderBody,
  formatCreditLimitRequestBody,
  hasBankDetails,
  isInsolventFlag,
  isEmailAddress,
  isCreditLimitExceeded,
  isWithinCooldown,
  loadCustomerCreditContext,
  mapCustomerIdentity,
  normalizeEmail,
  normalizeText,
  roundCreditLimit,
  uniqueCaseInsensitive,
};
