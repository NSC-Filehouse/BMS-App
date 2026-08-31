const EWS = require('ews-javascript-api');
const EWSAuth = require('ews-javascript-api-auth');

const ORDER_MAIL_SUBJECT = 'BMS-App es liegt ein neuer Auftrag vor';
const UNFINALIZED_ORDER_REMINDER_SUBJECT = 'BMS-App: offene Aufträge noch nicht an BMS übertragen';

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function stripOuterQuotes(value) {
  const text = asText(value);
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) {
    return text.slice(1, -1).trim();
  }
  return text;
}

function parseMandantAddressMap(value) {
  const map = new Map();
  stripOuterQuotes(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const [addressRaw, mandantIdRaw] = entry.split('|');
      const address = asText(addressRaw).toLowerCase();
      const mandantId = Number(mandantIdRaw);
      if (address && Number.isInteger(mandantId) && !map.has(mandantId)) {
        map.set(mandantId, address);
      }
    });
  return map;
}

function isEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(asText(value));
}

function resolveOrderMailRecipient(companyId, orderMailConfig) {
  const mandantId = Number(companyId);
  const testRecipient = asText(orderMailConfig?.testRecipient).toLowerCase();
  if (testRecipient) {
    if (!isEmailAddress(testRecipient)) {
      return { ok: false, reason: 'invalid_test_recipient' };
    }
    return { ok: true, address: testRecipient, source: 'test_override' };
  }

  const customerService = parseMandantAddressMap(orderMailConfig?.customerServiceAddressMap).get(mandantId);
  if (customerService && isEmailAddress(customerService)) {
    return { ok: true, address: customerService, source: 'customer_service' };
  }

  const accounting = parseMandantAddressMap(orderMailConfig?.accountingMailboxMap).get(mandantId);
  if (accounting && isEmailAddress(accounting)) {
    return { ok: true, address: accounting, source: 'accounting' };
  }

  return { ok: false, reason: 'missing_recipient' };
}

function formatDate(value, withTime = false) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return asText(value) || '-';
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

function formatNumber(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return number.toLocaleString('de-DE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function yesNo(value) {
  if (value === null || value === undefined || value === '') return '-';
  return value ? 'Ja' : 'Nein';
}

function line(label, value) {
  return `${label}: ${asText(value) || '-'}`;
}

function formatUnfinalizedOrderReminderBody({ count } = {}) {
  const numericCount = Number(count);
  const countText = Number.isFinite(numericCount) ? numericCount.toLocaleString('de-DE') : '-';
  const orderText = numericCount === 1 ? `${countText} eigenen Auftrag` : `${countText} eigene Aufträge`;
  const relativePronoun = numericCount === 1 ? 'der' : 'die';
  return [
    `Du hast aktuell ${orderText}, ${relativePronoun} noch nicht final an BMS übertragen wurde${numericCount === 1 ? '' : 'n'}.`,
    '',
    'Bitte öffne in der BMS-App den Bereich „Aufträge“ und prüfe die Entwürfe.',
  ].join('\r\n');
}

function formatOrderMailBody({ order, positions, mandantName, mandantShortName, finalizedBy, finalizedAt }) {
  const list = Array.isArray(positions) ? positions : [];
  const lines = [
    'In der BMS-App wurde ein neuer Auftrag finalisiert.',
    '',
    'ALLGEMEIN',
    line('Mandant', [mandantName, mandantShortName ? `(${mandantShortName})` : ''].filter(Boolean).join(' ')),
    line('BMS-App Auftrags-ID', order?.id),
    line('Erstellt von', [order?.createdBy, order?.createdByEmail].filter(Boolean).join(' / ')),
    line('Erstellt am', formatDate(order?.createdAt, true)),
    line('An BMS gesendet von', finalizedBy),
    line('An BMS gesendet am', formatDate(finalizedAt, true)),
    '',
    'KUNDE',
    line('Kundennummer', order?.clientReferenceId),
    line('Kundenname', order?.clientName),
    line('Kundenanschrift', order?.clientAddress),
    line('Ansprechpartner', order?.clientRepresentative),
    '',
    'AUFTRAG',
    line('Bemerkung', order?.comment),
    line('Incoterm', order?.deliveryType),
    line('Verpackungsart', order?.packagingType),
    line('Lieferadresse', order?.deliveryAddress),
    line('Abweichende Lieferadresse', yesNo(order?.deliveryAddressChanged)),
    line('Abweichende Zahlungsbedingung', yesNo(order?.specialPaymentCondition)),
    line('Zahlungsbedingung', order?.specialPaymentText),
    line('Anhang', order?.hasAttachment ? (order?.attachmentFileName || 'vorhanden') : 'Kein Anhang'),
    '',
    `POSITIONEN (${list.length})`,
  ];

  list.forEach((position, index) => {
    lines.push(
      '',
      `Position ${position?.lineNo || index + 1}`,
      line('Artikel', position?.article),
      line('BE-Nummer', position?.beNumber),
      line('Lager', position?.warehouse),
      line('Menge', `${formatNumber(position?.amountInKg)} kg`),
      line('VK', `${formatNumber(position?.price, 2)} EUR/kg`),
      line('EP', `${formatNumber(position?.costPrice, 2)} EUR/kg`),
      line('Lieferdatum', formatDate(position?.deliveryDate)),
      line('Reservierungsmenge', position?.reservationInKg === null || position?.reservationInKg === undefined
        ? '-'
        : `${formatNumber(position.reservationInKg)} kg`),
      line('Reserviert bis', formatDate(position?.reservationDate)),
      line('MFI', position?.mfi),
      line('Positionsbemerkung', position?.about),
      line('WPZ-ID', position?.wpzId),
      line('WPZ-Original verwenden', yesNo(position?.wpzOriginal)),
      line('WPZ-Bemerkung', position?.wpzComment),
    );
  });

  return lines.join('\r\n');
}

function validateEwsConfig(orderMailConfig) {
  if (!orderMailConfig?.enabled) {
    return { ok: false, reason: 'disabled' };
  }
  const missing = [];
  if (!asText(orderMailConfig?.ews?.username)) missing.push('EWS_USERNAME');
  if (!asText(orderMailConfig?.ews?.password)) missing.push('EWS_PASSWORD');
  if (!asText(orderMailConfig?.ews?.url)) missing.push('EWS_URL_EXTERN');
  return missing.length ? { ok: false, reason: 'missing_ews_config', missing } : { ok: true };
}

function cleanEwsText(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    // ews-javascript-api writes text values directly and does not XML-escape them.
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendOrderMail({ orderMailConfig, recipient, subject, body, attachment }) {
  const validation = validateEwsConfig(orderMailConfig);
  if (!validation.ok) {
    throw new Error(validation.missing?.length
      ? `EWS-Konfiguration fehlt: ${validation.missing.join(', ')}`
      : 'Auftragsmail-Versand ist deaktiviert.');
  }

  EWS.EwsLogging.DebugLogEnabled = false;
  EWS.ConfigurationApi.ConfigureXHR(new EWSAuth.ntlmAuthXhrApi(
    orderMailConfig.ews.username,
    orderMailConfig.ews.password,
  ));

  const service = new EWS.ExchangeService(orderMailConfig.ews.exchangeVersion || 7);
  service.Credentials = new EWS.WebCredentials(orderMailConfig.ews.username, orderMailConfig.ews.password);
  service.Url = new EWS.Uri(orderMailConfig.ews.url);

  const message = new EWS.EmailMessage(service);
  message.Subject = cleanEwsText(subject);
  message.Body = new EWS.MessageBody(EWS.BodyType.Text, cleanEwsText(body));
  message.ToRecipients.Add(new EWS.EmailAddress(cleanEwsText(recipient)));

  if (attachment?.buffer && attachment?.fileName) {
    const fileAttachment = message.Attachments.AddFileAttachment(
      cleanEwsText(attachment.fileName),
      Buffer.from(attachment.buffer).toString('base64'),
    );
    if (attachment.mimeType) fileAttachment.ContentType = cleanEwsText(attachment.mimeType);
    fileAttachment.IsInline = false;
  }

  await message.SendAndSaveCopy();
}

module.exports = {
  ORDER_MAIL_SUBJECT,
  UNFINALIZED_ORDER_REMINDER_SUBJECT,
  formatOrderMailBody,
  formatUnfinalizedOrderReminderBody,
  parseMandantAddressMap,
  resolveOrderMailRecipient,
  sendOrderMail,
  validateEwsConfig,
  cleanEwsText,
};
