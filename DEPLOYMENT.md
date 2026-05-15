# Deployment Guide

Backend → Railway · Frontend → Vercel

---

## Before you deploy

Commit and push the deployment config to your branch:

```bash
git add Dockerfile railway.json backend/scripts/copyTemplates.js backend/middleware/rateLimiter.js backend/routes/auth.routes.js backend/routes/admin.routes.js backend/server.js backend/package.json backend/package-lock.json
git commit -m "chore: add Railway deployment config and security hardening"
git push origin development
```

---

## Railway (Backend)

### One-time setup

1. Create a new Railway project and connect your GitHub repo
2. **Settings → Service → Root Directory**: leave **empty** (must be repo root, not `backend`)
3. **Branch**: `development`
4. Railway auto-detects the `Dockerfile` at root via `railway.json`

> First deploy takes 5–10 min — Puppeteer downloads Chromium during `npm ci`.

### Environment variables

Set these in **Railway → Variables**:

| Variable | Value |
|---|---|
| `MONGODB_URI` | Atlas connection string |
| `JWT_SECRET` | Long random string — generate with `openssl rand -hex 32` |
| `ADMIN_SECRET` | Strong password for `/admin` panel |
| `GEMINI_API_KEY` | Gemini API key (free tier works) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `FRONTEND_ORIGIN` | `https://your-app.vercel.app` (fill after Vercel deploy) |
| `LINKEDIN_CLIENT_ID` | LinkedIn app client ID |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn app client secret |
| `LINKEDIN_REDIRECT_URI` | `https://your-backend.railway.app/api/auth/linkedin/callback` |
| `NODE_ENV` | `production` |
| `BRANDFETCH_API_KEY` | Brandfetch client ID (optional — falls back to monogram SVG) |
| `GROQ_API_KEY` | Groq API key (optional — used as Gemini fallback) |

**Do not set** `PORT` or `BASE_URL` — Railway injects `PORT` automatically and `BASE_URL` is derived from it.

### Verify

```bash
curl https://your-backend.railway.app/healthz
# → {"status":"ok"}
```

---

## Vercel (Frontend)

### One-time setup

1. Import the same GitHub repo on Vercel
2. **Root Directory**: `frontend`
3. **Framework**: Next.js (auto-detected)
4. **Branch**: `development`

### Environment variables

Set these in **Vercel → Settings → Environment Variables**:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | `https://your-backend.railway.app` |
| `NEXT_PUBLIC_IMAGEKIT_URL` | `https://ik.imagekit.io/2pg1fp1lr` |

---

## After both are live

### Wire the two services together

1. Copy your Railway backend URL → update `FRONTEND_ORIGIN` in Railway to your Vercel URL
2. Copy your Vercel URL → update `NEXT_PUBLIC_BACKEND_URL` in Vercel to your Railway URL
3. Redeploy both services to pick up the updated variables

### Update LinkedIn redirect URI

In [LinkedIn Developer Console](https://www.linkedin.com/developers/apps):

- Go to your app → **Auth** → **Authorized redirect URLs**
- Add: `https://your-backend.railway.app/api/auth/linkedin/callback`

---

## Re-deploying

Railway and Vercel auto-deploy on every push to `development`. No manual steps needed after initial setup.

To trigger a manual redeploy without a code change:

```bash
git commit --allow-empty -m "chore: trigger redeploy"
git push origin development
```

---

## How the Docker build works

Railway builds using the `Dockerfile` at the repo root (configured via `railway.json`). It:

1. Installs Chromium runtime dependencies
2. Runs `npm ci --omit=dev` inside the `backend/` directory
3. Copies `frontend/public/rate-card.html` and `frontend/public/assets/` into the image (Puppeteer template source)
4. Runs `npm start` → `prestart` copies templates → `node server.js` starts on `$PORT`

The `backend/Dockerfile` is kept for local Docker builds only (`docker build` from the `backend/` directory).
