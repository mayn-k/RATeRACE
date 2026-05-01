'use strict';
const cloudinary = require('cloudinary').v2;
const config     = require('../config');
const logger     = require('../utils/logger');

if (!config.CLOUDINARY_CLOUD_NAME || !config.CLOUDINARY_API_KEY || !config.CLOUDINARY_API_SECRET) {
  throw new Error('Missing required Cloudinary env vars: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
}

cloudinary.config({
  cloud_name: config.CLOUDINARY_CLOUD_NAME,
  api_key:    config.CLOUDINARY_API_KEY,
  api_secret: config.CLOUDINARY_API_SECRET,
});

/**
 * Uploads a PNG buffer to Cloudinary.
 * One card per user — public_id is deterministic so re-generates overwrite the old image.
 *
 * @param {Buffer} buffer
 * @param {string} userId
 * @returns {Promise<string>} secure_url
 */
function uploadCardImage(buffer, userId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder:    'rate-cards',
        public_id: `card_${userId}`,
        overwrite: true,
        format:    'png',
      },
      (err, result) => {
        if (err) return reject(err);
        logger.info({ publicId: result.public_id }, 'Card uploaded to Cloudinary');
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

function uploadPortrait(buffer, userId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'portraits', public_id: `portrait_${userId}`, overwrite: true },
      (err, result) => {
        if (err) return reject(err);
        logger.info({ publicId: result.public_id }, 'Portrait uploaded to Cloudinary');
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

module.exports = { uploadCardImage, uploadPortrait };
