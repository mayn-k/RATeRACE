'use strict';
const express   = require('express');
const path      = require('path');
const cors      = require('cors');
const config    = require('./config');
const connectDB = require('./db/connect');
const logger    = require('./utils/logger');
const { initPuppeteer } = require('./services/puppeteer');
const errorHandler      = require('./middleware/error');

const app = express();

app.use(cors({
  origin: config.FRONTEND_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth',        require('./routes/auth.routes'));
app.use('/api/resume',     require('./routes/resume.routes'));
app.use('/api/score',      require('./routes/score.routes'));
app.use('/api/card',       require('./routes/card.routes'));
app.use('/api/user',       require('./routes/user.routes'));
app.use('/api/leaderboard', require('./routes/leaderboard.routes'));
app.use('/admin',          require('./routes/admin.routes'));

// Serves templates/ so Puppeteer can load rate-card.html over HTTP
app.use('/_internal/template', express.static(path.join(__dirname, 'templates')));

// Public pages
app.get('/leaderboard', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'leaderboard.html'));
});
app.get('/card/:slug', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'card-view.html'));
});
app.use(express.static(path.join(__dirname, 'public')));

app.use(errorHandler);

async function start() {
  await connectDB();
  await initPuppeteer();
  app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, 'Server started');
  });
}

start().catch(err => {
  logger.error(err);
  process.exit(1);
});

module.exports = app;
