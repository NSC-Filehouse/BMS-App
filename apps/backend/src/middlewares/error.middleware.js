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
      ? `Fuer dieses Produkt liegt bereits eine Reservierung durch ${d.reservedBy} vor.`
      : 'Fuer dieses Produkt liegt bereits eine Reservierung vor.',
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
