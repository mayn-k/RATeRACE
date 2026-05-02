'use strict';
const { complete } = require('./llm');

const SYSTEM = `You are a LinkedIn profile parser. Extract structured professional information from the provided input — it may be a LinkedIn URL, pasted profile text, or a mix. Return ONLY valid JSON — no prose, no markdown fences. If only a URL is provided with no profile content, extract what you can from the URL path and return empty arrays for skills/experience/education.`;

function buildPrompt(urlOrText) {
  return (
    `LinkedIn input (URL or pasted profile text):\n\n${urlOrText}\n\n` +
    `Return JSON with exactly these keys:\n` +
    `  name        (string)\n` +
    `  headline    (string — professional title or tagline)\n` +
    `  photoUrl    (string or null — profile photo URL if present in the text, e.g. media.licdn.com image URL; null if not found)\n` +
    `  skills      (array of strings)\n` +
    `  experience  (array of { title, company, duration })\n` +
    `  education   (array of { school, degree })`
  );
}

async function parseLinkedIn(urlOrText) {
  if (!urlOrText || !urlOrText.trim()) {
    throw Object.assign(new Error('urlOrText is required'), { status: 400 });
  }
  const raw = await complete(SYSTEM, buildPrompt(urlOrText.trim()), { json: true });
  return JSON.parse(raw);
}

module.exports = { parseLinkedIn };
