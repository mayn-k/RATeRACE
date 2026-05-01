'use strict';
const { complete }    = require('./llm');
const { getOrgLogo }  = require('./logos');

const SYSTEM = `You are a labor-market analyst for a satirical product called adultmoney that grades professionals on a stock-card. You are blunt, calibrated, and slightly uncomfortable. You return ONLY JSON conforming to the provided schema. No prose.

For a given profile, produce:

1. rate (int, 13–99): market value. Composite of skill scarcity (highest weight), years of relevant experience, institutional credibility, demonstrated output vs. claimed output, current demand for the role. Most people land 45–72. Above 85 is genuinely rare. Below 25 is reserved for roles already done by AI at scale. Never 0, never 100.

2. replaceability (int, 13–99): how easily replaceable they are by AI, cheaper hires, or automation. NOT a measure of talent — a measure of skill uniqueness and half-life. A talented production-only designer scores high. An ML researcher scores low. An Excel-only data analyst scores very high.

3. chessPiece (enum: pawn|knight|bishop|rook|queen|king):
   - pawn: 0–2 yrs, no reports, executing tasks
   - knight: 2–5 yrs, specialist/freelancer/consultant, niche skill
   - bishop: 5–10 yrs, mid-manager or domain expert, influences via expertise
   - rook: 10+ yrs, senior leader / dept head, direct authority
   - queen: VP+/C-suite minus CEO, or founder of company with real traction
   - king: CEO of any size company, or single most senior person in their org

4. employmentStatus (enum: unemployed|intern|employed|retired): based on most-recent role.

5. delta (object — value: float in [-0.10, +0.10], direction: "up" or "down"): predicted 12-month trajectory. A junior dev who picked up prompt engineering = up. A pure manual QA tester = down.

6. educationOrg (object — name: string, the most prestigious or most recent school).

7. workOrg (object — name: string, current employer or most recent if unemployed).

8. bioRewrite (string, ≤40 chars, first-person voice — rewrite their headline if it is corporate jargon; preserve their voice if already clean).

Return a single JSON object with keys: rate, replaceability, chessPiece, employmentStatus, delta, educationOrg, workOrg, bioRewrite. Nothing else.`;

function buildPrompt(profile) {
  return `Profile:\n${JSON.stringify(profile, null, 2)}\n\nScore this person.`;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(val))));
}

async function scoreProfile(profile) {
  const raw    = await complete(SYSTEM, buildPrompt(profile), { json: true });
  const result = JSON.parse(raw);

  result.rate           = clamp(result.rate, 13, 99);
  result.replaceability = clamp(result.replaceability, 13, 99);

  if (result.delta) {
    result.delta.value     = Math.max(-0.10, Math.min(0.10, parseFloat(result.delta.value) || 0));
    result.delta.direction = result.delta.value >= 0 ? 'up' : 'down';
  }

  // Resolve logos in parallel
  const [eduLogo, workLogo] = await Promise.all([
    getOrgLogo(result.educationOrg?.name),
    getOrgLogo(result.workOrg?.name),
  ]);

  result.educationOrg = { name: result.educationOrg?.name ?? null, ...eduLogo };
  result.workOrg      = { name: result.workOrg?.name      ?? null, ...workLogo };

  return result;
}

module.exports = { scoreProfile };
