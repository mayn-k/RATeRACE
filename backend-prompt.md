# Build the backend for adultmoney rate-card app

You are working inside the existing static frontend repo. The frontend is described in `CLAUDE.md` at the repo root. There is also a file `rate-card.html` at the repo root that defines the **exact visual design of the user's rate card** — you must NOT redesign it. It is consumed as-is, as a template.

Build the backend in a new top-level folder `backend/` so the frontend stays untouched.

---

## 1. Hard constraints

- Cost-first: must run on free tiers end-to-end while in development.
- The card UI is locked. You only inject data into `rate-card.html`. You do not edit its layout, CSS, or DOM. You do not write new card UI.
- Frontend is plain `fetch()` — no SDK, no framework. Backend exposes JSON REST.
- One card per user. Regenerating overwrites the previous card.
- Tight budget: pick free-tier services. No paid SaaS in v1.

---

## 2. Stack (pre-decided — do not substitute)

| Concern | Choice | Why |
|---|---|---|
| Runtime | Node.js 20 + Express | Spec says so |
| DB | MongoDB Atlas (free M0, 512MB) + Mongoose | Spec says so |
| Auth | JWT (jsonwebtoken) + bcrypt for password hashing | Spec says so |
| LLM | **Google Gemini API** (`@google/genai`), default model `gemini-2.0-flash` | Persistent free tier (15 RPM, 1B tokens/mo, no card). OpenAI/Anthropic free credits expire fast. |
| Resume parsing | `pdf-parse` | Cheap, dependency-light |
| LinkedIn intake | **Paste-URL/paste-text approach** (no OAuth) | LinkedIn OAuth no longer returns skills/jobs without paid Marketing API access. User pastes their LinkedIn profile URL or raw text; LLM extracts. |
| Card rendering | Puppeteer (`puppeteer` full, not `puppeteer-core`) | Spec says so |
| File storage | Cloudinary free tier (25GB) | Rendered PNG cards. Use `cloudinary` SDK with unsigned upload preset OR signed server-side. |
| Company/edu logos | Best effort: 1) LinkedIn-extracted domain → `https://logo.clearbit.com/{domain}` (free, no key) 2) fallback: first-letter monogram SVG generated server-side |
| Deployment target | Render free web service, Dockerfile-based | Only major PaaS with persistent free tier in 2026 that supports Chromium. |

The LLM provider must be **swappable**. Wrap it in `services/llm.js` with a single interface: `complete(systemPrompt, userPrompt, { json: true })`. Implement Gemini first; leave a `// TODO: openai adapter` stub.

---

## 3. Folder structure

```
backend/
├── server.js
├── package.json
├── Dockerfile
├── .env.example
├── .dockerignore
├── config/
│   └── index.js                # reads + validates env
├── db/
│   └── connect.js              # mongoose connection
├── middleware/
│   ├── auth.js                 # JWT verify
│   ├── error.js                # central error handler
│   └── upload.js               # multer (memory storage, 5MB pdf cap)
├── models/
│   ├── User.js
│   └── Card.js
├── routes/
│   ├── auth.routes.js
│   ├── resume.routes.js
│   ├── score.routes.js
│   ├── card.routes.js
│   └── user.routes.js
├── controllers/
│   ├── auth.controller.js
│   ├── resume.controller.js
│   ├── score.controller.js
│   ├── card.controller.js
│   └── user.controller.js
├── services/
│   ├── llm.js                  # Gemini wrapper, swappable
│   ├── resumeParser.js         # pdf-parse + LLM extraction
│   ├── linkedin.js             # paste-text → structured profile via LLM
│   ├── scoring.js              # the big one: rate, replaceability, chess, status, ticker, etc.
│   ├── cardData.js             # builds the exact CARD_DATA object
│   ├── puppeteer.js            # browser singleton + screenshot
│   ├── cloudinary.js           # upload buffer → URL
│   └── logos.js                # clearbit + monogram fallback
├── templates/
│   ├── rate-card.html          # COPY of root rate-card.html (do not modify)
│   └── assets/                 # COPY of root assets/ folder (fonts, chess, hourglass not needed since SVG)
└── utils/
    ├── amCode.js               # generates 4-letter + 3-digit code
    └── mappers.js              # replaceability → remaining, status → active index, etc.
```

The `templates/rate-card.html` and `templates/assets/` are **copies** taken from the project root at server startup (or at build time in Docker). They must be served by Express as static files at `/_internal/template/*` so Puppeteer can load `http://127.0.0.1:PORT/_internal/template/rate-card.html` and the relative `./assets/fonts/...` paths inside the HTML resolve.

---

## 4. Database schema

### `User`
```
{
  _id, email (unique), passwordHash,
  name, bio (string, max 80, optional),
  portfolioUrl (optional),
  createdAt, updatedAt
}
```

### `Card` (one per userId — `userId` is unique)
```
{
  _id, userId (ref User, unique),
  rate (Int 13–99),
  replaceability (Int 13–99),
  chessPiece (enum: pawn|knight|bishop|rook|queen|king),
  employmentStatus (enum: unemployed|intern|employed|retired),
  amCode (string, 7 chars, e.g. "ABCD123"),
  delta: { value: Number, direction: "up"|"down" },
  educationOrg: { name, domain, logoUrl },
  workOrg:      { name, domain, logoUrl },
  ctaUrl (string, optional),
  portraitUrl (string, optional),
  rawProfile (Mixed — the LLM-extracted JSON, kept for re-scoring),
  imageUrl (Cloudinary URL of latest rendered PNG),
  createdAt, updatedAt
}
```

---

## 5. API contract (exact)

All requests/responses are JSON unless noted. Errors: `{ error: { code, message } }`.

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/api/auth/signup` | - | `{ email, password, name }` | `{ token, user }` |
| POST | `/api/auth/login`  | - | `{ email, password }` | `{ token, user }` |
| GET  | `/api/auth/me`     | ✅ | - | `{ user }` |
| POST | `/api/resume/upload` | ✅ | multipart `file` (pdf, ≤5MB) | `{ profile }` (extracted JSON: name, headline, skills[], experience[], education[]) — also persists `rawProfile` on the user/card draft |
| POST | `/api/resume/linkedin` | ✅ | `{ urlOrText: string }` | same shape as above |
| POST | `/api/score/generate` | ✅ | `{ profile? }` (optional override; otherwise uses stored `rawProfile`) | `{ rate, replaceability, chessPiece, employmentStatus, delta, educationOrg, workOrg }` |
| POST | `/api/user/bio` | ✅ | `{ bio?, portfolioUrl?, portraitUrl? }` | `{ user }` |
| POST | `/api/card/generate` | ✅ | `{}` (uses stored score + user data) | `{ cardId, imageUrl }` |
| GET  | `/api/card/:id` | - (public — sharable) | - | `{ card, imageUrl }` |
| GET  | `/api/card/:id/image` | - | - | 302 redirect to Cloudinary URL |

Frontend flow: signup → upload resume **or** paste LinkedIn → POST score/generate → POST user/bio → POST card/generate → show `imageUrl`. The user can re-run any step; card/generate always overwrites.

---

## 6. Template injection mechanism (read carefully)

`rate-card.html` does NOT use `{{mustache}}` placeholders. Look at its `<script>` — it reads `window.CARD_DATA` and falls back to `fallbackCardData` if missing. So injection works like this in `services/puppeteer.js`:

1. Read `templates/rate-card.html` as a string.
2. Build the `cardData` object (see section 7 below for the exact shape).
3. Inject a `<script>window.CARD_DATA = <JSON.stringify(cardData)>;</script>` immediately **before** the existing inline `<script>` block. Use a stable marker — split on `<script>` and join with the injected line + `<script>`. Or insert just before `</head>`. Either works; pick one and comment why.
4. Write the modified HTML to a temp file inside `templates/_render/<uuid>.html` so relative `./assets/...` paths still resolve.
5. Puppeteer: `page.goto('http://127.0.0.1:PORT/_internal/template/_render/<uuid>.html', { waitUntil: 'networkidle0' })`.
6. Wait for fonts: `await page.evaluateHandle('document.fonts.ready')`.
7. Set viewport to the artboard size: `{ width: 1053, height: 1470, deviceScaleFactor: 2 }`.
8. Screenshot the `.artboard` element specifically (not full page) — `await page.$('#artboard').then(el => el.screenshot({ type: 'png', omitBackground: false }))`. This avoids the dark page background and the responsive scaling wrapper.
9. Upload buffer to Cloudinary, return URL.
10. Delete the temp HTML file.

Puppeteer browser must be a **singleton** launched once at server boot with `--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage` (required on Render/Docker). Reuse `browser`, create a fresh `page` per render, close the page after.

---

## 7. Exact `CARD_DATA` shape (must match `rate-card.html` keys 1:1)

```js
{
  rateLabel: "RATE",
  replaceLabel: "REPLACEABILITY",

  rate: <Int 13–99>,
  replaceability: <Int 13–99>,

  portrait: <absolute URL or data URI; Puppeteer will fetch it>,

  code: "ADMY " + <amCode>,        // e.g. "ADMY ABCD123"

  delta: {
    value: <Float, e.g. -0.030 or 0.045>,
    direction: "down" | "up",
    color: "#bf0000" or "#0b8e2b"
  },

  logos: [ <educationLogoUrl>, <workLogoUrl> ],

  cta: { label: "Click here", url: <portfolioUrl or "#"> },

  chessPiece: "pawn" | "knight" | "bishop" | "rook" | "queen" | "king",

  name: <full name>,
  bio:  <quoted bio, e.g. '"Building tools for fun"'>,

  // Order of statusBlocks is FIXED by the template fallback:
  //   index 0 = yellow  -> retired
  //   index 1 = blue    -> intern/fresher/student
  //   index 2 = green   -> employed
  //   index 3 = red     -> unemployed
  // Set exactly ONE block to active:true based on employmentStatus.
  statusBlocks: [
    { color: "#ece4b4", active: <bool> },
    { color: "#cad8ea", active: <bool> },
    { color: "#c7ddb8", active: <bool> },
    { color: "#ff001a", active: <bool> }
  ],

  // Hourglass is rendered as SVG diamonds inside the template (NOT a sprite).
  // Higher replaceability => less time => smaller `remaining`.
  // Mapping (in utils/mappers.js):
  //   remaining = Math.round(64 * (99 - replaceability) / 86)
  //   elapsed   = 64 - remaining
  hourglass: {
    totalPerDiamond: 64,
    remaining: <0–64>,
    elapsed:   <0–64>,
    color: "#c40000",
    cellSize: 10.4,
    gap: 2.4
  }
}
```

---

## 8. Scoring service spec (`services/scoring.js`)

This is the brain. One LLM call. The LLM output must be JSON only — use Gemini's `responseMimeType: "application/json"` and provide a JSON schema in the request.

**Input to LLM**: the structured profile (name, headline, skills, experience entries with title/company/duration, education entries with school/degree).

**System prompt** (use roughly this — refine for tone):

> You are a labor-market analyst for a satirical product called adultmoney that grades professionals on a stock-card. You are blunt, calibrated, and slightly uncomfortable. You return ONLY JSON conforming to the provided schema. No prose.
>
> For a given profile, produce:
>
> 1. **rate** (int, 13–99): market value. Composite of skill scarcity (highest weight), years of relevant experience, institutional credibility, demonstrated output vs. claimed output, current demand for the role. Most people land 45–72. Above 85 is genuinely rare. Below 25 is reserved for roles already done by AI at scale. Never 0, never 100.
>
> 2. **replaceability** (int, 13–99): how easily replaceable they are by AI, cheaper hires, or automation. NOT a measure of talent — a measure of skill uniqueness and half-life. A talented production-only designer scores high. An ML researcher scores low. An Excel-only data analyst scores very high.
>
> 3. **chessPiece** (enum: pawn|knight|bishop|rook|queen|king):
>    - pawn: 0–2 yrs, no reports, executing tasks
>    - knight: 2–5 yrs, specialist/freelancer/consultant, niche skill
>    - bishop: 5–10 yrs, mid-manager or domain expert, influences via expertise
>    - rook: 10+ yrs, senior leader / dept head, direct authority
>    - queen: VP+/C-suite minus CEO, or founder of company with real traction
>    - king: CEO of any size company, or single most senior person in their org
>
> 4. **employmentStatus** (enum: unemployed|intern|employed|retired): based on most-recent role.
>
> 5. **delta** (object: value Float in [-0.10, +0.10], direction "up"|"down"): predicted 12-month trajectory of their role's market value. A junior dev who picked up prompt engineering = up. A pure manual QA tester = down.
>
> 6. **educationOrg.name** (string, the most prestigious or most recent school).
>
> 7. **workOrg.name** (string, current employer or most recent if unemployed).
>
> 8. **bioRewrite** (string, ≤40 chars, in quotes, first-person voice — rewrite their headline if it's corporate jargon; preserve their voice if already clean).

After the LLM returns:
- Clamp `rate` and `replaceability` to [13, 99].
- For each org name, derive a domain via a simple `slugify(name) + ".com"` heuristic; pass to `services/logos.js` which tries Clearbit (`https://logo.clearbit.com/{domain}`) by HEAD-checking the URL, and falls back to a server-generated monogram SVG data URI if 404. Store both `name`, best-guess `domain`, and final `logoUrl`.
- Generate `amCode` via `utils/amCode.js`: 4 random uppercase A–Z letters + 3 random digits 0–9. Regenerate on every card generation.
- Map `replaceability` → hourglass `remaining` per the formula above.
- Map `employmentStatus` → `statusBlocks` active index.

---

## 9. Other notable details

- **Portrait**: not extracted by the LLM. Either the user uploads one via `POST /api/user/bio` (multipart) — store it on Cloudinary and save the URL — or the card renders without one (template handles missing `src` gracefully). Don't try to scrape LinkedIn for it.
- **CORS**: enable for the frontend origin via env var `FRONTEND_ORIGIN`.
- **Rate limit**: `express-rate-limit` on `/api/score/generate` and `/api/card/generate` — 10/hour per user. Important since the LLM call is the cost center.
- **Logging**: `pino` with `pino-pretty` in dev. Log every LLM call's input-token estimate, output, and latency.
- **Environment**: `.env.example` must list every required var with a one-line comment. At minimum: `PORT`, `MONGODB_URI`, `JWT_SECRET`, `GEMINI_API_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `FRONTEND_ORIGIN`, `BASE_URL` (used by Puppeteer to load the template — defaults to `http://127.0.0.1:${PORT}`).

---

## 10. Dockerfile (Render needs this for Chromium)

Use `node:20-slim` base. Install Chromium's runtime deps (`libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 fonts-liberation`). Set `PUPPETEER_SKIP_DOWNLOAD=false` so Puppeteer brings its own Chromium. `EXPOSE 3000`. `CMD ["node", "server.js"]`. Memory hint comment for Render: needs at least 512MB; the free instance is 512MB so it's tight — close pages aggressively.

---

## 11. Build order

Implement in this order, committing after each step. After each step, print a one-line summary of what was added.

1. `package.json`, `server.js` skeleton (Express, healthcheck `GET /healthz`), `config/`, `db/connect.js`, `.env.example`, `.dockerignore`, `Dockerfile`.
2. `models/User.js`, `models/Card.js`.
3. `middleware/auth.js`, `routes/auth.routes.js`, `controllers/auth.controller.js` (signup/login/me with JWT + bcrypt).
4. `services/llm.js` (Gemini adapter with `complete()` signature; fail loudly if `GEMINI_API_KEY` missing).
5. `services/resumeParser.js` + `middleware/upload.js` + `routes/resume.routes.js`. Test with a sample PDF.
6. `services/linkedin.js` + the LinkedIn paste-text endpoint. Same output shape as resume parser.
7. `services/scoring.js` + `routes/score.routes.js`. Use the system prompt above. JSON-mode output only.
8. `utils/amCode.js`, `utils/mappers.js`, `services/logos.js`.
9. `services/cardData.js` — pure function: `(user, card) => CARD_DATA`.
10. Static template route: in `server.js`, `app.use('/_internal/template', express.static(path.join(__dirname, 'templates')))`. Copy root `rate-card.html` and `assets/` into `backend/templates/` (script in `package.json` scripts: `prestart`).
11. `services/puppeteer.js` — singleton launch, `renderCard(cardData) => Buffer`.
12. `services/cloudinary.js` — `uploadCardImage(buffer, userId) => url`.
13. `routes/card.routes.js` + `controllers/card.controller.js` (generate + get). Wire it all.
14. `routes/user.routes.js` for bio/portfolio/portrait.
15. `middleware/error.js` + rate-limiting + CORS + final hardening.
16. `README.md` with: local setup, env vars, how to run with Docker, Render deploy steps (build command empty, start command `node server.js`, set env vars in dashboard, persistent disk not needed).

---

## 12. What you must NOT do

- Do not add a frontend framework, bundler, or TypeScript. Plain Node.js + ESM (`"type": "module"`) or CJS — pick one, be consistent.
- Do not modify `rate-card.html` or any file in the project root. Copy what you need into `backend/`.
- Do not invent new card fields. The `CARD_DATA` keys are fixed by the template.
- Do not call LinkedIn's API. The user pastes their profile.
- Do not add a queue/Redis/worker for v1. Card render is synchronous in the request handler. It's slow (~2–4s) but acceptable.
- Do not store generated PNGs on local disk — Render's free tier has ephemeral storage. Cloudinary only.

Begin with step 1.
