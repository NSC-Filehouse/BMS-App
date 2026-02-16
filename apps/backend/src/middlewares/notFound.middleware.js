const { createHttpError } = require('../utils');

function notFound(req, res, next) {
  next(createHttpError(404, `Route not found: ${req.method} ${req.originalUrl}`, {
    code: 'ROUTE_NOT_FOUND',
    method: req.method,
    path: req.originalUrl,
  }));
}

module.exports = { notFound };
