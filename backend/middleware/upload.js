'use strict';
const multer = require('multer');

const MAX_5MB = 5 * 1024 * 1024;

const pdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_5MB },
  fileFilter(_req, file, cb) {
    file.mimetype === 'application/pdf'
      ? cb(null, true)
      : cb(Object.assign(new Error('Only PDF files are accepted'), { status: 400 }));
  },
});

const portrait = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_5MB },
  fileFilter(_req, file, cb) {
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
      ? cb(null, true)
      : cb(Object.assign(new Error('Only JPEG, PNG, or WebP images are accepted'), { status: 400 }));
  },
});

module.exports = { pdf, portrait };
