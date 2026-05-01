'use strict';
const mongoose = require('mongoose');
const config   = require('../config');
const logger   = require('../utils/logger');

let connected = false;

async function connectDB() {
  if (connected) return;
  await mongoose.connect(config.MONGODB_URI);
  connected = true;
  logger.info('MongoDB connected');
  mongoose.connection.on('error', err => logger.error({ err }, 'MongoDB error'));
}

module.exports = connectDB;
