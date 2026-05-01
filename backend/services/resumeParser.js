'use strict';
const pdfParse    = require('pdf-parse');
const { complete } = require('./llm');

const SYSTEM = `You are a resume parser. Extract structured information from the resume text provided. Return ONLY valid JSON — no prose, no markdown fences.`;

function buildPrompt(text) {
  return (
    `Resume text:\n\n${text}\n\n` +
    `Return JSON with exactly these keys:\n` +
    `  name        (string)\n` +
    `  headline    (string — professional title or tagline)\n` +
    `  skills      (array of strings)\n` +
    `  experience  (array of { title, company, duration })\n` +
    `  education   (array of { school, degree })`
  );
}

async function parseResume(pdfBuffer) {
  const { text } = await pdfParse(pdfBuffer);
  const raw = await complete(SYSTEM, buildPrompt(text), { json: true });
  return JSON.parse(raw);
}

module.exports = { parseResume };
