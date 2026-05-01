'use strict';
const puppeteer = require('puppeteer');
const fs        = require('fs');
const path      = require('path');
const config    = require('../config');
const logger    = require('../utils/logger');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const RENDER_DIR    = path.join(TEMPLATES_DIR, '_render');
const TEMPLATE_HTML = path.join(TEMPLATES_DIR, 'rate-card.html');

let browser = null;

async function getBrowser() {
  if (browser) return browser;
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  logger.info('Puppeteer browser launched');
  return browser;
}

/**
 * Renders rate-card.html with injected CARD_DATA and returns a PNG buffer.
 * Inject before </head> — simpler than splitting on <script> and guaranteed
 * to execute before any inline script in the body.
 *
 * @param {object} cardData
 * @returns {Promise<Buffer>}
 */
async function renderCard(cardData) {
  const t0   = Date.now();
  const uuid = crypto.randomUUID(); // Node 20 built-in — no uuid package needed
  const tmpPath = path.join(RENDER_DIR, `${uuid}.html`);

  // Inject window.CARD_DATA before </head> so the inline script reads it on load
  const html     = fs.readFileSync(TEMPLATE_HTML, 'utf8');
  const injection = `<script>window.CARD_DATA = ${JSON.stringify(cardData)};</script>`;
  const injected  = html.replace('</head>', `${injection}\n</head>`);

  fs.writeFileSync(tmpPath, injected, 'utf8');

  const b    = await getBrowser();
  const page = await b.newPage();

  try {
    await page.setViewport({ width: 1053, height: 1470, deviceScaleFactor: 2 });

    await page.goto(
      `${config.BASE_URL}/_internal/template/_render/${uuid}.html`,
      { waitUntil: 'networkidle0', timeout: 30000 }
    );

    await page.evaluateHandle('document.fonts.ready');

    const artboard = await page.$('#artboard');
    if (!artboard) throw new Error('#artboard element not found in rate-card.html');

    const buffer = await artboard.screenshot({ type: 'png', omitBackground: false });

    logger.info({ latencyMs: Date.now() - t0 }, 'Card rendered');
    return buffer;
  } finally {
    await page.close(); // close immediately — Render free tier is 512 MB
    fs.unlink(tmpPath, () => {});
  }
}

async function initPuppeteer() {
  await getBrowser();
}

module.exports = { renderCard, initPuppeteer };
