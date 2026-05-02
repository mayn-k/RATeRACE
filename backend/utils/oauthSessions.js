'use strict';
const crypto = require('crypto');
const sessions = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessions) if (now > v.exp) sessions.delete(k);
}, 300_000);

function store(data) {
  const code = crypto.randomBytes(16).toString('hex');
  sessions.set(code, { ...data, exp: Date.now() + 120_000 });
  return code;
}

function consume(code) {
  const s = sessions.get(code);
  sessions.delete(code);
  if (!s || Date.now() > s.exp) return null;
  return s;
}

module.exports = { store, consume };
