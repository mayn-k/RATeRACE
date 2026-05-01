'use strict';
const pino = require('pino');

const logger = pino(
  process.env.NODE_ENV !== 'production'
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}
);

module.exports = logger;
