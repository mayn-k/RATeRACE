'use strict';
const config   = require('../config');
const logger   = require('../utils/logger');
const ApiUsage = require('../models/ApiUsage');

// ── Provider defaults ─────────────────────────────────────────────────────────
const PROVIDER_DEFAULTS = {
  gemini: 'gemini-3.1-flash-lite-preview',
  groq:   'llama-3.3-70b-versatile',
};

const PROVIDER      = config.LLM_PROVIDER || 'gemini';
const DEFAULT_MODEL = config.LLM_MODEL || PROVIDER_DEFAULTS[PROVIDER] || PROVIDER_DEFAULTS.gemini;

// ── Daily-quota block state (in-memory; resets on server restart) ─────────────
let geminiBlockedUntil = 0; // epoch ms; 0 = not blocked

function isGeminiBlocked() {
  return Date.now() < geminiBlockedUntil;
}

function nextMidnightUTC() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

// ── Error classification ──────────────────────────────────────────────────────
/**
 * Returns:
 *   'exhausted'  — daily quota used up → block Gemini until midnight
 *   'transient'  — per-minute rate limit or overload → fallback this request only
 *   null         — unrelated error, do not fallback
 */
function classifyGeminiError(err) {
  const msg    = (err.message || '').toLowerCase();
  const status = err.status || err.statusCode || 0;

  const is429 = status === 429 || msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('quota');
  const is503 = status === 503 || msg.includes('503') || msg.includes('overload') ||
                msg.includes('service unavailable') || msg.includes('high demand');

  if (is429) {
    // Daily quota signals
    if (
      msg.includes('per_day') ||
      msg.includes('requests_per_day') ||
      msg.includes('daily') ||
      (msg.includes('free tier') && msg.includes('day'))
    ) {
      return 'exhausted';
    }
    return 'transient'; // per-minute / per-hour rate limit
  }

  if (is503) return 'transient';
  return null;
}

// ── Lazy-init clients ─────────────────────────────────────────────────────────
let _geminiAI    = null;
let _groqClient  = null;

function geminiClient() {
  if (!_geminiAI) {
    if (!config.GEMINI_API_KEY) throw new Error('Missing required env var GEMINI_API_KEY');
    const { GoogleGenAI } = require('@google/genai');
    _geminiAI = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  }
  return _geminiAI;
}

function groqClient() {
  if (!_groqClient) {
    if (!config.GROQ_API_KEY) throw new Error('Missing required env var GROQ_API_KEY (needed for Groq fallback)');
    const Groq = require('groq-sdk');
    _groqClient = new Groq({ apiKey: config.GROQ_API_KEY, timeout: 30000, maxRetries: 0 });
  }
  return _groqClient;
}

// ── Provider adapters ─────────────────────────────────────────────────────────
async function completeGemini(systemPrompt, userPrompt, { json, model }) {
  const result = await geminiClient().models.generateContent({
    model,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: json ? 'application/json' : 'text/plain',
    },
  });

  const usage          = result.usageMetadata ?? {};
  const inputTokens    = usage.promptTokenCount     ?? 0;
  const outputTokens   = usage.candidatesTokenCount ?? 0;
  const thinkingTokens = usage.thoughtsTokenCount   ?? 0;
  const totalTokens    = usage.totalTokenCount      ?? (inputTokens + outputTokens + thinkingTokens);

  return { text: result.text, inputTokens, outputTokens, thinkingTokens, totalTokens };
}

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

  return {
    text: completion.choices[0]?.message?.content ?? '',
    inputTokens,
    outputTokens,
    thinkingTokens: 0,
    totalTokens,
  };
}

// ── Usage persistence + logging ───────────────────────────────────────────────
function finalise({ text, inputTokens, outputTokens, thinkingTokens, totalTokens }, provider, model, userId, callType, t0) {
  const latencyMs = Date.now() - t0;
  logger.info(
    { provider, model, inputTokens, outputTokens, thinkingTokens, totalTokens, latencyMs, outputPreview: text?.slice(0, 120) },
    'LLM call'
  );
  if (userId && callType) {
    ApiUsage.create({ userId, callType, inputTokens, outputTokens, thinkingTokens, totalTokens, model }).catch(() => {});
  }
  return text;
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

  // ── Non-Gemini primary: no fallback logic ─────────────────────────────────
  if (PROVIDER !== 'gemini') {
    const result = await completeGroq(systemPrompt, userPrompt, { json, model });
    return finalise(result, PROVIDER, model, userId, callType, t0);
  }

  // ── Gemini primary ────────────────────────────────────────────────────────
  const groqModel = PROVIDER_DEFAULTS.groq;
  let needsFallback = false;

  if (!isGeminiBlocked()) {
    try {
      const result = await completeGemini(systemPrompt, userPrompt, { json, model });
      return finalise(result, 'gemini', model, userId, callType, t0);
    } catch (err) {
      const errType = classifyGeminiError(err);

      if (errType === 'exhausted') {
        geminiBlockedUntil = nextMidnightUTC();
        logger.warn(
          { blockedUntil: new Date(geminiBlockedUntil).toISOString(), error: err.message },
          'Gemini daily quota exhausted — routing to Groq until midnight UTC'
        );
        needsFallback = true;
      } else if (errType === 'transient') {
        logger.warn({ error: err.message }, 'Gemini transient error — falling back to Groq for this request');
        needsFallback = true;
      } else {
        throw err; // not a quota/overload error — surface it
      }
    }
  } else {
    logger.info(
      { blockedUntil: new Date(geminiBlockedUntil).toISOString() },
      'Gemini daily quota blocked — routing to Groq'
    );
    needsFallback = true;
  }

  // ── Groq fallback ─────────────────────────────────────────────────────────
  if (needsFallback) {
    try {
      const result = await completeGroq(systemPrompt, userPrompt, { json, model: groqModel });
      return finalise(result, 'groq', groqModel, userId, callType, t0);
    } catch (groqErr) {
      logger.warn(
        { error: groqErr.message, status: groqErr.status ?? groqErr.statusCode ?? null, type: groqErr.constructor?.name },
        'Groq fallback failed — retrying Gemini once'
      );
    }

    // ── Final Gemini retry ────────────────────────────────────────────────
    try {
      const result = await completeGemini(systemPrompt, userPrompt, { json, model });
      return finalise(result, 'gemini', model, userId, callType, t0);
    } catch {
      throw Object.assign(
        new Error('Both AI providers are currently unavailable. Please try again in a few minutes.'),
        { status: 503 }
      );
    }
  }
}

// ── Test helpers (not used in production) ────────────────────────────────────
function _resetState() {
  _geminiAI         = null;
  _groqClient       = null;
  geminiBlockedUntil = 0;
}

module.exports = { complete, PROVIDER, DEFAULT_MODEL, classifyGeminiError, _resetState };
