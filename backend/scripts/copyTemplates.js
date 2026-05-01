'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT      = path.join(__dirname, '..', '..');
const TEMPLATES = path.join(__dirname, '..', 'templates');

// Ensure templates/_render exists for Puppeteer temp files
fs.mkdirSync(path.join(TEMPLATES, '_render'), { recursive: true });

// Copy rate-card.html
fs.copyFileSync(
  path.join(ROOT, 'rate-card.html'),
  path.join(TEMPLATES, 'rate-card.html')
);

// Copy assets/ recursively (fonts, chess pieces, etc.)
fs.cpSync(
  path.join(ROOT, 'assets'),
  path.join(TEMPLATES, 'assets'),
  { recursive: true }
);

console.log('Templates copied to backend/templates/');
