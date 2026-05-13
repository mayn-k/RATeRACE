'use strict';

// ── Environment setup (must be before any require) ────────────────────────────
process.env.GEMINI_API_KEY  = 'test-gemini-key';
process.env.GROQ_API_KEY    = 'test-groq-key';
process.env.MONGODB_URI     = 'mongodb://localhost/test';
process.env.JWT_SECRET      = 'test-jwt-secret';
process.env.ADMIN_SECRET    = 'test-admin-secret';
process.env.LLM_PROVIDER    = 'gemini';
process.env.LLM_MODEL       = '';

// ── Mock external SDKs ────────────────────────────────────────────────────────
const mockGenerateContent = jest.fn();
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}));

const mockChatCreate = jest.fn();
jest.mock('groq-sdk', () =>
  jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockChatCreate } },
  }))
);

jest.mock('../models/ApiUsage', () => ({ create: jest.fn().mockResolvedValue({}) }));

// ── Helpers ───────────────────────────────────────────────────────────────────
const GEMINI_SUCCESS = {
  text: '{"rate":72}',
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 10, totalTokenCount: 130 },
};

const GROQ_SUCCESS = {
  choices: [{ message: { content: '{"rate":68}' } }],
  usage: { prompt_tokens: 90, completion_tokens: 18, total_tokens: 108 },
};

function geminiError(message, status = 0) {
  return Object.assign(new Error(message), { status });
}

// ── Module under test ─────────────────────────────────────────────────────────
const { complete, classifyGeminiError, _resetState } = require('../services/llm');

// ── Test suite ────────────────────────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
  _resetState();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('classifyGeminiError', () => {
  test('429 with per_day message → exhausted', () => {
    const err = geminiError('[429 Too Many Requests] Quota exceeded for quota metric requests_per_day', 429);
    expect(classifyGeminiError(err)).toBe('exhausted');
  });

  test('429 with daily message → exhausted', () => {
    const err = geminiError('free tier daily limit exceeded', 429);
    expect(classifyGeminiError(err)).toBe('exhausted');
  });

  test('429 without day reference → transient (per-minute rate limit)', () => {
    const err = geminiError('[429 Too Many Requests] Resource has been exhausted', 429);
    expect(classifyGeminiError(err)).toBe('transient');
  });

  test('503 overload → transient', () => {
    const err = geminiError('[503 Service Unavailable] The model is overloaded. Please try again later.', 503);
    expect(classifyGeminiError(err)).toBe('transient');
  });

  test('503 via message text only → transient', () => {
    const err = geminiError('high demand — service unavailable');
    expect(classifyGeminiError(err)).toBe('transient');
  });

  test('unrelated error → null (do not fallback)', () => {
    const err = geminiError('[400 Bad Request] Invalid JSON in request body', 400);
    expect(classifyGeminiError(err)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('complete() — Gemini primary, Groq fallback', () => {

  test('1. Gemini succeeds → returns result, Groq never called', async () => {
    mockGenerateContent.mockResolvedValueOnce(GEMINI_SUCCESS);

    const result = await complete('sys', 'user', { json: true });

    expect(result).toBe('{"rate":72}');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockChatCreate).not.toHaveBeenCalled();
  });

  test('2. Gemini 503 overload → falls back to Groq for this request only, Gemini not blocked', async () => {
    mockGenerateContent.mockRejectedValueOnce(
      geminiError('[503] The model is overloaded. Please try again later.', 503)
    );
    mockChatCreate.mockResolvedValueOnce(GROQ_SUCCESS);

    const result = await complete('sys', 'user', { json: true });

    expect(result).toBe('{"rate":68}');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1); // tried once, failed
    expect(mockChatCreate).toHaveBeenCalledTimes(1);      // groq handled it

    // Gemini should NOT be blocked — next request tries Gemini again
    mockGenerateContent.mockResolvedValueOnce(GEMINI_SUCCESS);
    const next = await complete('sys', 'user', { json: true });
    expect(next).toBe('{"rate":72}');
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  test('3. Gemini 429 per-minute rate limit → Groq fallback this request, Gemini not blocked', async () => {
    mockGenerateContent.mockRejectedValueOnce(
      geminiError('[429 Too Many Requests] Resource has been exhausted', 429)
    );
    mockChatCreate.mockResolvedValueOnce(GROQ_SUCCESS);

    const result = await complete('sys', 'user', { json: true });

    expect(result).toBe('{"rate":68}');
    expect(mockChatCreate).toHaveBeenCalledTimes(1);

    // Next request should try Gemini, not go straight to Groq
    mockGenerateContent.mockResolvedValueOnce(GEMINI_SUCCESS);
    await complete('sys', 'user', { json: true });
    expect(mockGenerateContent).toHaveBeenCalledTimes(2); // Gemini tried again
    expect(mockChatCreate).toHaveBeenCalledTimes(1);      // Groq not called again
  });

  test('4. Gemini 429 daily exhausted → Groq used, Gemini blocked until midnight', async () => {
    mockGenerateContent.mockRejectedValueOnce(
      geminiError('[429 Too Many Requests] Quota exceeded for quota metric requests_per_day', 429)
    );
    mockChatCreate.mockResolvedValueOnce(GROQ_SUCCESS);

    const result = await complete('sys', 'user', { json: true });

    expect(result).toBe('{"rate":68}');

    // Gemini should now be blocked — next request skips Gemini entirely
    mockChatCreate.mockResolvedValueOnce(GROQ_SUCCESS);
    await complete('sys', 'user', { json: true });

    // generateContent called only once total (the first failed attempt)
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockChatCreate).toHaveBeenCalledTimes(2);
  });

  test('5. Gemini already blocked (daily) → skips directly to Groq without attempting Gemini', async () => {
    // Simulate block set from a previous exhaustion
    mockGenerateContent.mockRejectedValueOnce(
      geminiError('requests_per_day quota exceeded', 429)
    );
    mockChatCreate.mockResolvedValue(GROQ_SUCCESS);

    await complete('sys', 'user'); // triggers the block

    jest.clearAllMocks();          // reset call counts

    // This request should go straight to Groq
    const result = await complete('sys', 'user', { json: true });

    expect(result).toBe('{"rate":68}');
    expect(mockGenerateContent).not.toHaveBeenCalled(); // Gemini skipped entirely
    expect(mockChatCreate).toHaveBeenCalledTimes(1);
  });

  test('6. Both fail → retries Gemini once → succeeds on retry', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(geminiError('[503] overloaded', 503))   // first attempt fails
      .mockResolvedValueOnce(GEMINI_SUCCESS);                          // retry succeeds
    mockChatCreate.mockRejectedValueOnce(new Error('Groq unavailable'));

    const result = await complete('sys', 'user', { json: true });

    expect(result).toBe('{"rate":72}');
    expect(mockGenerateContent).toHaveBeenCalledTimes(2); // initial + retry
    expect(mockChatCreate).toHaveBeenCalledTimes(1);
  });

  test('7. Both fail → Gemini retry also fails → throws user-friendly 503 error', async () => {
    mockGenerateContent.mockRejectedValue(geminiError('[503] overloaded', 503));
    mockChatCreate.mockRejectedValue(new Error('Groq unavailable'));

    await expect(complete('sys', 'user', { json: true })).rejects.toMatchObject({
      message: expect.stringContaining('Both AI providers are currently unavailable'),
      status: 503,
    });

    // gemini called twice: initial attempt + final retry
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(mockChatCreate).toHaveBeenCalledTimes(1);
  });

  test('8. Unrelated Gemini error (400 bad request) → thrown immediately, Groq never called', async () => {
    mockGenerateContent.mockRejectedValueOnce(
      geminiError('[400 Bad Request] Invalid argument', 400)
    );

    await expect(complete('sys', 'user')).rejects.toMatchObject({
      message: expect.stringContaining('400'),
    });

    expect(mockChatCreate).not.toHaveBeenCalled();
  });
});
