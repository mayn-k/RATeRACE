'use strict';
const jwt    = require('jsonwebtoken');
const config = require('../config');

function adminAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(header.slice(7), config.JWT_SECRET);
    if (!payload.admin) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = adminAuth;
