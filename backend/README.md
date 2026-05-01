# adultmoney rate-card backend

Node.js + Express API that parses resumes/LinkedIn profiles, scores them with Gemini, renders a PNG rate-card with Puppeteer, and stores it on Cloudinary.

---

## Local setup

### Prerequisites
- Node.js 20+ (install via [nvm](https://github.com/nvm-sh/nvm): `nvm install 20 && nvm use 20`)
- A MongoDB Atlas M0 free cluster
- A Google Gemini API key (from [aistudio.google.com/apikey](https://aistudio.google.com/apikey))
- A Cloudinary free account

### Steps

```bash
cd backend
cp .env.example .env   # fill in all values (see table below)
npm install
npm start              # runs prestart (copies templates) then starts the server
```

Server starts on `http://localhost:3000`. Check `GET /healthz` to confirm.

> **MongoDB Atlas network access**: add your current IP (or `0.0.0.0/0` for dev) under  
> Atlas → Network Access → Add IP Address.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | no | HTTP port (default `3000`) |
| `NODE_ENV` | no | `development` or `production` |
| `MONGODB_URI` | **yes** | Atlas connection string |
| `JWT_SECRET` | **yes** | Long random string for signing tokens |
| `GEMINI_API_KEY` | **yes** | Google Gemini API key (free tier: 15 RPM) |
| `CLOUDINARY_CLOUD_NAME` | **yes** | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | **yes** | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | **yes** | Cloudinary API secret |
| `FRONTEND_ORIGIN` | no | CORS allowed origin (default `*`) |
| `BASE_URL` | no | Base URL Puppeteer uses to load templates (default `http://127.0.0.1:PORT`) |

---

## API routes

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/healthz` | — | Health check |
| POST | `/api/auth/signup` | — | Register `{ email, password, name }` |
| POST | `/api/auth/login` | — | Login, returns JWT |
| GET | `/api/auth/me` | ✅ | Current user |
| POST | `/api/resume/upload` | ✅ | Upload PDF resume (multipart `file`) |
| POST | `/api/resume/linkedin` | ✅ | Paste LinkedIn text `{ urlOrText }` |
| POST | `/api/score/generate` | ✅ | Score stored profile (rate-limited 10/hr) |
| POST | `/api/user/bio` | ✅ | Update `{ bio, portfolioUrl, portraitUrl }` or upload `portrait` file |
| POST | `/api/card/generate` | ✅ | Render + upload card PNG (rate-limited 10/hr) |
| GET | `/api/card/:id` | — | Public card data |
| GET | `/api/card/:id/image` | — | 302 redirect to Cloudinary PNG |

---

## Run with Docker

```bash
cd backend
docker build -t raterace-backend .
docker run --env-file .env -p 3000:3000 raterace-backend
```

The Dockerfile installs Chromium's runtime dependencies and lets Puppeteer download its own Chromium bundle (`PUPPETEER_SKIP_DOWNLOAD=false`).

> **Memory**: Puppeteer + Chromium uses ~300–400 MB. Render's free instance is 512 MB — pages are closed immediately after each render to stay within budget.

---

## Deploy to Render

1. Push the repo to GitHub.
2. Go to [render.com](https://render.com) → **New → Web Service** → connect your repo.
3. Set **Root Directory** to `backend`.
4. Leave **Build Command** empty (no build step needed).
5. Set **Start Command** to `npm start`.
6. Under **Environment**, add every variable from the table above.
7. Set **Instance Type** to **Free** (512 MB) — sufficient for development.
8. No persistent disk needed — card PNGs are stored on Cloudinary.

On first deploy Render will run `npm install`, then `npm start` (which runs `prestart` to copy templates before booting the server).

> **Cold starts**: the free instance spins down after inactivity. First request after a cold start takes ~15–20 s (Puppeteer boot). Subsequent requests are fast.
