'use strict';
const mongoose = require('mongoose');

const apiUsageSchema = new mongoose.Schema(
  {
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    callType:     { type: String, enum: ['resume_parse', 'linkedin_parse', 'score'], required: true },
    inputTokens:  { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    model:        { type: String, default: null },
  },
  { timestamps: true }
);

apiUsageSchema.index({ userId: 1 });
apiUsageSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ApiUsage', apiUsageSchema);
