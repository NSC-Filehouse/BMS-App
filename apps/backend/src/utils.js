class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status || 500;
    this.details = details || null;
  }
}

function createHttpError(status, message, details) {
  return new HttpError(status, message, details);
}

function asyncHandler(fn) {
  return function asyncWrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function sendEnvelope(res, { data = null, meta = {}, error = null, status = 200 } = {}) {
  res.status(status).json({ data, meta, error });
}

function parseListParams(query, defaults = {}) {
  const page = Math.max(parseInt(query.page || defaults.page || '1', 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(query.pageSize || defaults.pageSize || '25', 10) || 25, 1), 500);
  const q = (query.q || '').toString().trim();
  const sort = (query.sort || defaults.sort || '').toString().trim();
  const dirRaw = (query.dir || defaults.dir || 'ASC').toString().toUpperCase();
  const dir = dirRaw === 'DESC' ? 'DESC' : 'ASC';

  return { page, pageSize, q, sort, dir };
}

module.exports = {
  HttpError,
  createHttpError,
  asyncHandler,
  sendEnvelope,
  parseListParams,
};
