const { HttpError, sendEnvelope } = require('../utils');
const logger = require('../logger');

function resolveLang(req) {
  const raw = String(req?.header?.('x-lang') || '').trim().toLowerCase();
  return raw === 'en' ? 'en' : 'de';
}

const errorTexts = {
  AUTH_MISSING_IDENTITY: {
    de: 'Fehlende Benutzeridentitaet.',
    en: 'Missing user identity.',
  },
  AUTH_SAM_ACCOUNT_REQUIRED: {
    de: 'Der vom SSO gelieferte SAM-Accountname fehlt.',
    en: 'The SAM account name supplied by SSO is missing.',
  },
  AUTH_SAM_ACCOUNT_AMBIGUOUS: {
    de: 'Der vom SSO gelieferte SAM-Accountname ist in der FX-Mitarbeiterquelle nicht eindeutig.',
    en: 'The SAM account name supplied by SSO is not unique in the FX employee source.',
  },
  AUTH_IDENTITY_CONFLICT: {
    de: 'Die vom SSO gelieferten Benutzerkennungen widersprechen sich.',
    en: 'The user identifiers supplied by SSO conflict.',
  },
  MANDANT_HEADER_REQUIRED: {
    de: 'Fehlender erforderlicher Header: x-mandant.',
    en: 'Missing required header: x-mandant.',
  },
  MANDANT_FORBIDDEN: {
    de: (d) => `Keine Berechtigung fuer Mandant: ${d?.mandant || ''}`.trim(),
    en: (d) => `No permission for mandant: ${d?.mandant || ''}`.trim(),
  },
  DB_NOT_AVAILABLE: {
    de: 'Diese DB ist noch nicht verfuegbar.',
    en: 'This database is not available yet.',
  },
  USER_NOT_FOUND_IN_BMS: {
    de: 'Benutzer wurde in BMS Mitarbeiter nicht gefunden.',
    en: 'User not found in BMS Mitarbeiter.',
  },
  PRODUCT_NOT_FOUND: {
    de: 'Produkt nicht gefunden.',
    en: 'Product not found.',
  },
  CUSTOMER_NOT_FOUND: {
    de: 'Kunde nicht gefunden.',
    en: 'Customer not found.',
  },
  DELIVERY_ADDRESS_REQUIRED: {
    de: 'Bitte Straße, PLZ, Ort und Land der Lieferadresse ausfüllen.',
    en: 'Please provide the delivery address street, postal code, city, and country.',
  },
  DELIVERY_ADDRESS_COUNTRY_CODE_INVALID: {
    de: 'Das Lieferland muss als zweistelliger ISO-Alpha-2-Code angegeben werden.',
    en: 'The delivery country must be a two-letter ISO Alpha-2 code.',
  },
  DELIVERY_ADDRESS_FIELD_TOO_LONG: {
    de: (d) => `Das Feld ${d?.field || ''} darf höchstens ${d?.maxLength || 0} Zeichen enthalten.`.trim(),
    en: (d) => `The ${d?.field || 'field'} field may contain at most ${d?.maxLength || 0} characters.`.trim(),
  },
  DELIVERY_ADDRESS_NUMBER_EXHAUSTED: {
    de: 'Für diesen Kunden ist keine weitere Lieferanschrift-Nummer verfügbar.',
    en: 'No further delivery address number is available for this customer.',
  },
  ORDER_NOT_FOUND: {
    de: 'Auftrag nicht gefunden.',
    en: 'Order not found.',
  },
  INVALID_ORDER_ID: {
    de: 'Ungueltige Auftrags-ID.',
    en: 'Invalid order ID.',
  },
  ORDER_PDF_NOT_FOUND: {
    de: 'Auftrags-PDF nicht gefunden.',
    en: 'Order PDF not found.',
  },
  ORDER_PDF_STORAGE_NOT_CONFIGURED: {
    de: 'Der Auftrags-PDF-Speicher ist nicht konfiguriert.',
    en: 'The order PDF storage is not configured.',
  },
  RESERVATION_NOT_FOUND: {
    de: 'Reservierung nicht gefunden.',
    en: 'Reservation not found.',
  },
  MISSING_USER_SHORT_CODE: {
    de: 'Mitarbeiterkuerzel (ma_Kuerzel) fuer den aktuellen Benutzer fehlt.',
    en: 'Missing employee short code (ma_Kuerzel) for current user.',
  },
  INVALID_RESERVATION_ID: {
    de: 'Ungueltige Reservierungs-ID.',
    en: 'Invalid reservation ID.',
  },
  INVALID_RESERVATION_AMOUNT: {
    de: 'Ungueltige Reservierungsmenge.',
    en: 'Invalid reservation amount.',
  },
  INVALID_RESERVATION_END_DATE: {
    de: 'Ungueltiges Reservierungs-Enddatum.',
    en: 'Invalid reservation end date.',
  },
  MISSING_RESERVATION_KEYS: {
    de: 'Fehlende Reservierungs-Schluessel: beNumber und warehouseId.',
    en: 'Missing reservation keys: beNumber and warehouseId.',
  },
  PRODUCT_AVAILABILITY_NOT_FOUND: {
    de: 'Verfuegbarkeitsdatensatz fuer die Reservierung nicht gefunden.',
    en: 'Product availability row not found for reservation.',
  },
  RESERVATION_AMOUNT_EXCEEDS_AVAILABLE: {
    de: (d) => `Reservierungsmenge ueberschreitet die verfuegbare Menge (${d?.availableAmount ?? 0}).`,
    en: (d) => `Reservation amount exceeds available quantity (${d?.availableAmount ?? 0}).`,
  },
  RESERVATION_ALREADY_EXISTS: {
    de: (d) => d?.reservedBy
      ? `F\u00FCr dieses Produkt liegt bereits eine Reservierung durch ${d.reservedBy} vor.`
      : 'F\u00FCr dieses Produkt liegt bereits eine Reservierung vor.',
    en: (d) => d?.reservedBy
      ? `A reservation for this product already exists by ${d.reservedBy}.`
      : 'A reservation for this product already exists.',
  },
  RESOURCE_NOT_FOUND: {
    de: 'Datensatz nicht gefunden.',
    en: 'Resource not found.',
  },
  ROUTE_NOT_FOUND: {
    de: 'Route nicht gefunden.',
    en: 'Route not found.',
  },
  INVALID_COMPANY_ID: {
    de: 'Ungueltige Mandanten-ID.',
    en: 'Invalid mandant company ID.',
  },
  TEMP_ORDER_MISSING_CLIENT_DATA: {
    de: 'Fehlende Kundendaten fuer den Auftrag.',
    en: 'Missing client data for temp order.',
  },
  INVALID_TEMP_ORDER_PAYLOAD: {
    de: 'Ungueltige Auftragsdaten.',
    en: 'Invalid temp order payload.',
  },
  ATTACHMENT_INVALID_TYPE: {
    de: 'Ungueltiger Dateityp. Erlaubt sind PDF und Bilddateien.',
    en: 'Invalid file type. Only PDF and image files are allowed.',
  },
  ATTACHMENT_TOO_LARGE: {
    de: 'Die Datei ist zu gross. Maximal 10 MB sind erlaubt.',
    en: 'The file is too large. Maximum allowed size is 10 MB.',
  },
  TEMP_ORDER_FINALIZED: {
    de: 'Der Auftrag wurde bereits an BMS gesendet und kann nicht mehr geaendert oder geloescht werden.',
    en: 'The order has already been sent to BMS and can no longer be edited or deleted.',
  },
  TEMP_ORDER_MAIL_RECIPIENT_MISSING: {
    de: 'Fuer diesen Mandanten ist kein E-Mail-Empfaenger konfiguriert.',
    en: 'No email recipient is configured for this mandant.',
  },
  TEMP_ORDER_MAIL_CONFIG_MISSING: {
    de: 'Der E-Mail-Versand ist noch nicht vollstaendig konfiguriert.',
    en: 'Email delivery is not fully configured yet.',
  },
  TEMP_ORDER_FINALIZATION_SCHEMA_MISSING: {
    de: 'Die Datenbankmigration fuer das Senden an BMS fehlt.',
    en: 'The database migration for sending orders to BMS is missing.',
  },
  TEMP_ORDER_PACKAGING_CHANGE_SCHEMA_MISSING: {
    de: 'Die Datenbankmigration fuer Verpackungsaenderungen fehlt.',
    en: 'The database migration for packaging changes is missing.',
  },
  TEMP_ORDER_AMOUNT_EXCEEDS_AVAILABLE: {
    de: (d) => `Die angeforderte Menge ueberschreitet die verfuegbare Restmenge (${d?.availableAmount ?? 0}).`,
    en: (d) => `The requested amount exceeds the remaining available quantity (${d?.availableAmount ?? 0}).`,
  },
};

function localizeMessage({ code, details, fallbackMessage, lang }) {
  if (!code) return fallbackMessage;
  const entry = errorTexts[code];
  if (!entry) return fallbackMessage;
  const value = entry[lang] || entry.de;
  if (typeof value === 'function') {
    return value(details || {});
  }
  return value || fallbackMessage;
}

function errorHandler(err, req, res, next) {
  const status = err instanceof HttpError ? err.status : 500;
  const fallbackMessage = err instanceof Error ? err.message : 'Unknown error';
  const code = err && err.code
    ? err.code
    : (err && err.details && err.details.code ? err.details.code : null);
  const lang = resolveLang(req);
  const message = localizeMessage({
    code,
    details: err && err.details ? err.details : null,
    fallbackMessage,
    lang,
  });

  // Log server-side
  if (status >= 500) {
    logger.critical(`Unhandled error on ${req.method} ${req.originalUrl}`, err);
  } else {
    logger.error(`Request error on ${req.method} ${req.originalUrl}`, err);
  }

  sendEnvelope(res, {
    status,
    data: null,
    meta: {},
    error: {
      message,
      status,
      code,
      details: err.details || null,
    },
  });
}

module.exports = { errorHandler };
