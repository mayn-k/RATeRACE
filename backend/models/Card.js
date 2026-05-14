'use strict';
const mongoose = require('mongoose');

const orgSchema = new mongoose.Schema(
  {
    name:    { type: String, default: null },
    domain:  { type: String, default: null },
    logoUrl: { type: String, default: null },
  },
  { _id: false }
);

const cardSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

    rate:          { type: Number, min: 13, max: 99, default: null },
    replaceability:{ type: Number, min: 13, max: 99, default: null },

    chessPiece: {
      type: String,
      enum: ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'],
      default: null,
    },
    employmentStatus: {
      type: String,
      enum: ['unemployed', 'intern', 'employed', 'retired'],
      default: null,
    },

    amCode: { type: String, length: 7, default: null },

    delta: {
      value:     { type: Number, default: null },
      direction: { type: String, enum: ['up', 'down'], default: null },
    },

    educationOrg: { type: orgSchema, default: () => ({}) },
    workOrg:      { type: orgSchema, default: () => ({}) },

    marketVerdict:             { type: String, default: null },
    primaryRisk:               { type: String, default: null },
    humanEdge:                 { type: String, default: null },
    recommendedAction:         { type: String, default: null },
    replaceabilityPercentile:  { type: Number, min: 0, max: 100, default: null },

    bioRewrite:  { type: String, default: null },
    ctaUrl:      { type: String, default: null },
    linkedinUrl: { type: String, default: null },
    portraitUrl: { type: String, default: null },

    rawProfile: { type: mongoose.Schema.Types.Mixed, default: null },
    imageUrl:   { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Card', cardSchema);
