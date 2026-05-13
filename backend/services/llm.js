'use strict';
const config   = require('../config');
const logger   = require('../utils/logger');
const ApiUsage = require('../models/ApiUsage');

// ── Provider defaults ─────────────────────────────────────────────────────────
const PROVIDER_DEFAULTS = {
  gemini: 'gemini-3.1-flash-lite-preview',
  groq:   'llama-3.3-70b-versatile',
};

const PROVIDER   = config.LLM_PROVIDER || 'gemini';
const DEFAULT_MODEL = config.LLM_MODEL || PROVIDER_DEFAULTS[PROVIDER] || PROVIDER_DEFAULTS.gemini;

// ── Lazy-init clients (only instantiated when used) ───────────────────────────
let _geminiAI = null;
function geminiClient() {
  if (!_geminiAI) {
    if (!config.GEMINI_API_KEY) throw new Error('Missing required env var GEMINI_API_KEY');
    const { GoogleGenAI } = require('@google/genai');
    _geminiAI = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  }
  return _geminiAI;
}

let _groqClient = null;
function groqClient() {
  if (!_groqClient) {
    if (!config.GROQ_API_KEY) throw new Error('Missing required env var GROQ_API_KEY (set LLM_PROVIDER=groq)');
    const Groq = require('groq-sdk');
    _groqClient = new Groq({ apiKey: config.GROQ_API_KEY });
  }
  return _groqClient;
}

// ── Gemini adapter ────────────────────────────────────────────────────────────
async function completeGemini(systemPrompt, userPrompt, { json, model }) {
  const result = await geminiClient().models.generateContent({
    model,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: json ? 'application/json' : 'text/plain',
    },
  });

  const usage        = result.usageMetadata ?? {};
  const inputTokens  = usage.promptTokenCount     ?? 0;
  const outputTokens = usage.candidatesTokenCount ?? 0;
  const thinkingTokens = usage.thoughtsTokenCount ?? 0;
  const totalTokens  = usage.totalTokenCount      ?? (inputTokens + outputTokens + thinkingTokens);

  return { text: result.text, inputTokens, outputTokens, thinkingTokens, totalTokens };
}

// ── Groq adapter ──────────────────────────────────────────────────────────────
async function completeGroq(systemPrompt, userPrompt, { json, model }) {
  const completion = await groqClient().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ],
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  });

  const usage        = completion.usage ?? {};
  const inputTokens  = usage.prompt_tokens     ?? 0;
  const outputTokens = usage.completion_tokens ?? 0;
  const totalTokens  = usage.total_tokens      ?? (inputTokens + outputTokens);

  return { text: completion.choices[0]?.message?.content ?? '', inputTokens, outputTokens, thinkingTokens: 0, totalTokens };
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {{ json?: boolean, model?: string, userId?: string|null, callType?: string|null }} opts
 * @returns {Promise<string>}
 */
async function complete(systemPrompt, userPrompt, { json = false, model = DEFAULT_MODEL, userId = null, callType = null } = {}) {
  const t0 = Date.now();

  const adapter = PROVIDER === 'groq' ? completeGroq : completeGemini;
  const { text, inputTokens, outputTokens, thinkingTokens, totalTokens } = await adapter(systemPrompt, userPrompt, { json, model });

  const latencyMs = Date.now() - t0;

  logger.info(
    { provider: PROVIDER, model, inputTokens, outputTokens, thinkingTokens, totalTokens, latencyMs, outputPreview: text?.slice(0, 120) },
    'LLM call'
  );

  if (userId && callType) {
    ApiUsage.create({ userId, callType, inputTokens, outputTokens, thinkingTokens, totalTokens, model }).catch(() => {});
  }

  return text;
}

module.exports = { complete, PROVIDER, DEFAULT_MODEL };
