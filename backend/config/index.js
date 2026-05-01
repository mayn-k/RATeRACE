'use strict';
require('dotenv').config();

const PORT = parseInt(process.env.PORT || '3000', 10);

const required = [
  ['MONGODB_URI', 'MongoDB Atlas connection string'],
  ['JWT_SECRET',  'Secret for signing JWTs'],
];

for (const [key, desc] of required) {
  if (!process.env[key]) throw new Error(`Missing required env var ${key}: ${desc}`);
}

module.exports = {
  PORT,
  NODE_ENV:               process.env.NODE_ENV || 'development',
  MONGODB_URI:            process.env.MONGODB_URI,
  JWT_SECRET:             process.env.JWT_SECRET,
  GEMINI_API_KEY:         process.env.GEMINI_API_KEY,
  CLOUDINARY_CLOUD_NAME:  process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY:     process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET:  process.env.CLOUDINARY_API_SECRET,
  FRONTEND_ORIGIN:        process.env.FRONTEND_ORIGIN || '*',
  BASE_URL:               process.env.BASE_URL || `http://127.0.0.1:${PORT}`,
};
