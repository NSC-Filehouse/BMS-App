const { HttpError, sendEnvelope } = require('../utils');
const logger = require('../logger');

function errorHandler(err, req, res, next) {
  const status = err instanceof HttpError ? err.status : 500;
  const message = err instanceof Error ? err.message : 'Unknown error';
  const code = err && err.code
    ? err.code
    : (err && err.details && err.details.code ? err.details.code : null);

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
