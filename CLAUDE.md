# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Repository layout

```
/                       ← frontend (static, no build)
  index.html
  scatter-gallery.js
  ascii-logo.js
  assets/
  scatter-images/
  rate-card-carousel/
  rate-card.html        ← Puppeteer template (copied into backend/templates/ at server start)

backend/                ← Node.js + Express API
  server.js
  config/
  controllers/
  routes/
  models/
  services/
  middleware/
  utils/
  scripts/
  Dockerfile
```

---

## Running the frontend

No build step. Serve the repo root over HTTP — do **not** open `index.html` as a `file://` URL (image scanning uses HTTP 200/404).

```bash
# from repo root
python3 -m http.server 8000
# then open http://localhost:8000
```

VS Code Live Server (right-click `index.html` → "Open with Live Server") also works.

---

## Running the backend

### Prerequisites

- Node.js 20+ — install via [nvm](https://github.com/nvm-sh/nvm):
  ```bash
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm" && \. "$NVM_DIR/nvm.sh"
  nvm install 20 && nvm use 20
  ```
- MongoDB Atlas free M0 cluster — [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
- Google Gemini API key — [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (use a project **without** billing enabled for free-tier quota; model: `gemini-2.5-flash`)
- Cloudinary free account — [cloudinary.com](https://cloudinary.com)

### First-time setup

```bash
cd backend
cp .env.example .env   # fill in all values (see table below)
npm install
npm start              # runs prestart (copies templates) then starts the server
```

Server starts on `http://localhost:3000`. Verify with `GET /healthz`.

> **MongoDB Atlas — network access**: add your IP under Atlas → Network Access → Add IP Address (or `0.0.0.0/0` for dev).

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | no | HTTP port (default `3000`) |
| `NODE_ENV` | no | `development` or `production` |
| `MONGODB_URI` | **yes** | Atlas connection string |
| `JWT_SECRET` | **yes** | Long random string for signing tokens |
| `GEMINI_API_KEY` | **yes** | Gemini API key — use `gemini-2.5-flash` model |
| `CLOUDINARY_CLOUD_NAME` | **yes** | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | **yes** | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | **yes** | Cloudinary API secret |
| `FRONTEND_ORIGIN` | no | CORS allowed origin (default `*`; set to `http://localhost:8000` locally) |
| `BASE_URL` | no | Base URL Puppeteer uses to load templates (default `http://127.0.0.1:PORT`) |

### Dev mode (auto-restart)

```bash
cd backend
export NVM_DIR="$HOME/.nvm" && \. "$NVM_DIR/nvm.sh"
npm run dev   # node --watch, restarts on file changes
```

---

## Testing the full flow manually

Both servers must be running: frontend on `:8000`, backend on `:3000`.

### 1 — Health check
```bash
curl http://localhost:3000/healthz
# → {"status":"ok"}
```

### 2 — Signup + score + card (curl)

```bash
# Signup
curl -s -X POST http://localhost:3000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"test@example.com_am","name":"Test User"}' | jq .

# Save the token
TOKEN="<paste token here>"

# Upload a PDF resume
curl -s -X POST http://localhost:3000/api/resume/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/resume.pdf" | jq .

# Or paste LinkedIn text
curl -s -X POST http://localhost:3000/api/resume/linkedin \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"urlOrText":"Paste LinkedIn profile text here..."}' | jq .

# Generate score (calls Gemini — takes ~5 s)
curl -s -X POST http://localhost:3000/api/score/generate \
  -H "Authorization: Bearer $TOKEN" | jq .

# Render + upload card PNG (calls Puppeteer + Cloudinary — takes ~10 s)
curl -s -X POST http://localhost:3000/api/card/generate \
  -H "Authorization: Bearer $TOKEN" | jq .
# Response includes: cardId, imageUrl, amCode

# Code login (frontend uses this)
curl -s -X POST http://localhost:3000/api/auth/code-login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","code":"ABCD1234"}' | jq .
```

### 3 — Frontend modal flow

1. Open `http://localhost:8000`
2. Click the hero card's "Get my rate card" button
3. Enter your email → click LinkedIn (paste text in prompt) or "Add your CV" (pick a PDF)
4. Wait ~20 s — card is generated; modal switches to login view and pre-fills your amCode
5. **Save the 8-character code** (format: 4 letters + 4 digits, e.g. `ABCD1234`) — it's the only way to log back in
6. Download or Share the card via the action buttons at the bottom

To log in later: open modal → click "Login" → enter email + code → Enter

---

## API routes

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/healthz` | — | Health check |
| POST | `/api/auth/signup` | — | Register `{ email, password, name }` |
| POST | `/api/auth/login` | — | Password login (internal) |
| POST | `/api/auth/code-login` | — | Login with `{ email, code }` — returns `{ token, cardId, imageUrl }` |
| GET | `/api/auth/me` | JWT | Current user |
| POST | `/api/resume/upload` | JWT | Upload PDF resume (`multipart file`) |
| POST | `/api/resume/linkedin` | JWT | Parse LinkedIn text `{ urlOrText }` |
| POST | `/api/score/generate` | JWT | Score stored profile via Gemini (10/hr) |
| POST | `/api/user/bio` | JWT | Update `{ bio, portfolioUrl, portraitUrl }` or upload `portrait` file |
| POST | `/api/card/generate` | JWT | Render + upload card PNG (10/hr) — returns `{ cardId, imageUrl, amCode }` |
| GET | `/api/card/:id` | — | Public card data |
| GET | `/api/card/:id/image` | — | 302 redirect to Cloudinary PNG |

---

## Backend architecture

### Auth strategy

The frontend is passwordless from the user's perspective. Internally:
- **Signup**: password is derived as `email + '_am'` (never shown to user)
- **Login**: user supplies their email + 8-char `amCode`; the `/api/auth/code-login` endpoint verifies `amCode` against the stored card and returns a JWT
- **amCode format**: 4 uppercase letters + 4 digits (e.g. `ABCD1234`), regenerated on every `POST /api/card/generate`

### Key services

| File | Role |
|---|---|
| `services/llm.js` | Gemini adapter — `complete(systemPrompt, userPrompt, { json, model })` |
| `services/resumeParser.js` | pdf-parse → LLM → structured profile |
| `services/linkedin.js` | LLM from pasted text → structured profile |
| `services/scoring.js` | LLM → score fields + org logos in parallel |
| `services/logos.js` | Clearbit logo lookup → monogram SVG fallback |
| `services/cardData.js` | `buildCardData(user, card)` → `window.CARD_DATA` shape for the template |
| `services/puppeteer.js` | Singleton browser; `renderCard(cardData)` screenshots `#artboard` at 2× DPI |
| `services/cloudinary.js` | `uploadCardImage` / `uploadPortrait` — overwrites on re-generate |

### Data models

- **User**: email (unique lowercase), passwordHash, name, bio (max 80 chars), portfolioUrl, portraitUrl
- **Card** (1-per-user): userId, rate/replaceability (13–99), chessPiece, employmentStatus, amCode, delta, educationOrg/workOrg (name + domain + logoUrl), ctaUrl, portraitUrl, rawProfile, imageUrl

### Rate limits

Score and card generation are limited to **10 requests/hour per user** (keyed by `userId`, fallback `IP`) via `express-rate-limit`.

---

## Frontend architecture

### Entry point

`index.html` sets global config consumed by JS:
- `window.GALLERY_IMAGE_FOLDER`, `GALLERY_IMAGE_SCAN_LIMIT`, `GALLERY_IMAGE_EXTENSIONS`
- `window.RATE_CARD_CAROUSEL_IMAGES` — 3-image carousel
- `window.RATE_CARD_CTA_URL` — optional hero CTA link
- `window.BACKEND_URL` — API base (default `http://localhost:3000`)

### Core modules

**`scatter-gallery.js`** — 3D scatter gallery + modal:
- Custom perspective projection (`FOCAL = 920`), camera `(x, y, zoom)`, depth-sorted render loop
- Deterministic layout via seeded PRNG (stable across reloads)
- Hero billboard with Canvas-drawn 3-image carousel (2400 ms rotation)
- Lead modal (signup/login/recover) wired to backend — no DOM overlays, rendered on canvas
- Signup flow: email → LinkedIn paste or PDF upload → score → card → switches to login, pre-fills amCode
- Login flow: email + amCode → Enter key → JWT stored in `leadModal.token`
- Download/Share buttons appear only after card is generated or user logs in
- Touch: drag to pan, pinch to zoom; `passive: false` on all touch listeners
- Zoom range: 0.22×–3.2×

**`ascii-logo.js`** — "RAT≠RACE" particle logo with mouse-repulsion and orbiting halo characters.

### Styling

CSS custom properties in `index.html`: `--bg`, `--panel`, `--accent`. Canvas fills full viewport; all UI is drawn onto the canvas (not DOM overlays) except the lead modal which is a DOM element overlaid on top.

---

## Docker / Deploy

```bash
cd backend
docker build -t raterace-backend .
docker run --env-file .env -p 3000:3000 raterace-backend
```

For Render: set Root Directory to `backend`, Start Command to `npm start`, add all env vars. Free 512 MB instance is sufficient. Cold starts take ~15–20 s (Puppeteer boot).
