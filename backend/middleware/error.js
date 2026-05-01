'use strict';
const logger = require('../utils/logger');

const HTTP_CODES = {
  400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN',
  404: 'NOT_FOUND',   409: 'CONFLICT',     429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR', 503: 'SERVICE_UNAVAILABLE',
};

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';

  logger.error({ err, method: req.method, path: req.path }, 'Request error');

  // Third-party errors (Gemini, Cloudinary) embed JSON in their message —
  // unwrap it for a cleaner response; hide internals in production
  let message = err.message || 'Internal server error';
  if (status >= 500) {
    if (isProd) {
      message = 'Internal server error';
    } else {
      try {
        const parsed = JSON.parse(message);
        message = parsed?.error?.message || message;
      } catch { /* not JSON, keep as-is */ }
    }
  }

  res.status(status).json({
    error: {
      code:    err.code || HTTP_CODES[status] || 'ERROR',
      message,
    },
  });
}

module.exports = errorHandler;
