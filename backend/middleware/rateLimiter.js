'use strict';
const rateLimit = require('express-rate-limit');

// Keyed by userId so limits are per-account, not per-IP.
// Auth middleware must run before this in the chain.
function makeUserLimiter(max, windowMs, label) {
  return rateLimit({
    windowMs,
    max,
    keyGenerator: (req) => req.user?.userId || req.ip,
    standardHeaders: true,
    legacyHeaders:   false,
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code:    'RATE_LIMITED',
          message: `${label}: limit of ${max} requests per hour exceeded. Try again later.`,
        },
      });
    },
  });
}

// 10 calls per hour for LLM-backed endpoints (cost center)
const scoreLimiter = makeUserLimiter(10, 60 * 60 * 1000, 'Score generation');
const cardLimiter  = makeUserLimiter(10, 60 * 60 * 1000, 'Card generation');

module.exports = { scoreLimiter, cardLimiter };
