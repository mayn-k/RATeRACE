'use strict';
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name:         { type: String, required: true, trim: true },
    bio:          { type: String, maxlength: 80, default: null },
    portfolioUrl: { type: String, default: null },
    portraitUrl:  { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
