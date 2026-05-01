'use strict';
const { GoogleGenAI } = require('@google/genai');
const config = require('../config');
const logger = require('../utils/logger');

if (!config.GEMINI_API_KEY) {
  throw new Error('Missing required env var GEMINI_API_KEY: Google Gemini API key');
}

const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });

const DEFAULT_MODEL = 'gemini-2.5-flash';

/**
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {{ json?: boolean, model?: string }} opts
 * @returns {Promise<string>}
 */
async function complete(systemPrompt, userPrompt, { json = false, model = DEFAULT_MODEL } = {}) {
  const t0 = Date.now();

  const result = await ai.models.generateContent({
    model,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: json ? 'application/json' : 'text/plain',
    },
  });

  const latencyMs = Date.now() - t0;
  const text      = result.text;
  const usage     = result.usageMetadata ?? {};

  logger.info(
    {
      model,
      inputTokens:  usage.promptTokenCount     ?? null,
      outputTokens: usage.candidatesTokenCount ?? null,
      latencyMs,
      outputPreview: text?.slice(0, 120),
    },
    'LLM call'
  );

  return text;
}

// TODO: openai adapter — same signature, swap provider in complete()

module.exports = { complete };
