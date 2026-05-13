'use strict';
const { GoogleGenAI } = require('@google/genai');
const config   = require('../config');
const logger   = require('../utils/logger');
const ApiUsage = require('../models/ApiUsage');

if (!config.GEMINI_API_KEY) {
  throw new Error('Missing required env var GEMINI_API_KEY: Google Gemini API key');
}

const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });

const DEFAULT_MODEL = 'gemini-3.1-flash-lite-preview';

/**
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {{ json?: boolean, model?: string, userId?: string|null, callType?: string|null }} opts
 * @returns {Promise<string>}
 */
async function complete(systemPrompt, userPrompt, { json = false, model = DEFAULT_MODEL, userId = null, callType = null } = {}) {
  const t0 = Date.now();

  const result = await ai.models.generateContent({
    model,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: json ? 'application/json' : 'text/plain',
    },
  });

  const latencyMs    = Date.now() - t0;
  const text         = result.text;
  const usage        = result.usageMetadata ?? {};
  const inputTokens    = usage.promptTokenCount     ?? 0;
  const outputTokens   = usage.candidatesTokenCount ?? 0;
  const thinkingTokens = usage.thoughtsTokenCount   ?? 0;
  const totalTokens    = usage.totalTokenCount      ?? (inputTokens + outputTokens + thinkingTokens);

  logger.info(
    { model, inputTokens, outputTokens, thinkingTokens, totalTokens, latencyMs, outputPreview: text?.slice(0, 120) },
    'LLM call'
  );

  if (userId && callType) {
    ApiUsage.create({ userId, callType, inputTokens, outputTokens, thinkingTokens, totalTokens, model }).catch(() => {});
  }

  return text;
}

// TODO: openai adapter — same signature, swap provider in complete()

module.exports = { complete };
