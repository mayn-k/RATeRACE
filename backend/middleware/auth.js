'use strict';
const jwt    = require('jsonwebtoken');
const config = require('../config');

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing token' } });
  }
  try {
    req.user = jwt.verify(header.slice(7), config.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
  }
}

module.exports = auth;
