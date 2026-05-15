# RATeRACE Security Audit Report

**Date:** 2026-05-15  
**Scope:** Full application — frontend (Next.js 16.2.6) + backend (Express)  
**Branch:** development  
**No code changes made — review only.**

---

## Priority Summary

| # | Issue | Severity | Effort |
|---|---|---|---|
| 1 | No rate limit on auth endpoints (login, code-login, admin login) | **HIGH** | Low |
| 2 | No security headers (CSP, X-Frame-Options, HSTS) | **HIGH** | Low |
| 3 | Puppeteer template script injection via `JSON.stringify` | **MEDIUM** | Low |
| 4 | CORS wildcard default — no production guard | **MEDIUM** | Low |
| 5 | Admin JWT stored in `localStorage` | **MEDIUM** | Medium |
| 6 | No JWT revocation / blocklist | **LOW** | High |
| 7 | `intent` param not validated in LinkedIn auth | **LOW** | Trivial |
| 8 | Admin password comparison not timing-safe | **LOW** | Trivial |

---

## 1. Rate Limiting — Critical Gaps

**File:** `backend/middleware/rateLimiter.js`, `backend/routes/auth.routes.js`

**What's covered:**
- `scoreLimiter` — 10 req/hr per `userId` on `POST /api/score/generate` ✅
- `cardLimiter` — 10 req/hr per `userId` on `POST /api/card/generate` ✅

**What's missing:**

| Endpoint | Rate Limited? | Risk |
|---|---|---|
| `POST /api/auth/signup` | ❌ | Credential stuffing / account enumeration |
| `POST /api/auth/login` | ❌ | Brute-force password attacks |
| `POST /api/auth/code-login` | ❌ | **AmCode brute-force — account takeover** |
| `POST /api/resume/upload` | ❌ | LLM/Puppeteer cost abuse |
| `GET /api/card/view/:code` | ❌ | Card enumeration |
| `POST /admin/api/auth` | ❌ | Admin password brute-force |

**Most critical: `POST /api/auth/code-login`**

Users log in with email + 8-character amCode (4 uppercase letters + 4 digits). The keyspace is `26^4 × 10^4 = ~4.6M` combinations — not billions. Without rate limiting, an attacker who knows a target's email can brute-force the amCode online. Success returns `{ token, cardId, imageUrl, amCode, photoLocked }` — full account takeover.

**Recommendation:**
```js
// backend/middleware/rateLimiter.js
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 10,
  keyGenerator: (req) => req.ip,
  message: { error: 'Too many login attempts, try again later.' },
});

// Apply to: /api/auth/login, /api/auth/signup, /api/auth/code-login, /admin/api/auth
```

---

## 2. Security Headers — None Set

**File:** `backend/server.js`

No HTTP security headers are set anywhere in the application.

| Header | Status | Risk |
|---|---|---|
| `Content-Security-Policy` | ❌ Missing | Amplifies any XSS to full script execution |
| `X-Frame-Options` | ❌ Missing | `/admin` can be embedded in an iframe for clickjacking |
| `X-Content-Type-Options` | ❌ Missing | MIME sniffing on uploaded files |
| `Strict-Transport-Security` | ❌ Missing | Protocol downgrade attacks in production |
| `Referrer-Policy` | ❌ Missing | `?oauth=CODE` leaks in Referer to third-party scripts |

**Most critical: `X-Frame-Options: DENY` on `/admin`** — without it, the admin panel can be embedded in an attacker-controlled iframe. A logged-in admin visiting the attacker's page could be tricked into clicking UI elements that perform admin actions (clickjacking).

**`Referrer-Policy: no-referrer`** is important on the OAuth callback redirect — the `FRONTEND_ORIGIN?oauth=CODE` URL (including the one-time session code) can appear in the `Referer` header of subsequent requests to third-party resources loaded by the frontend.

**Recommendation:**
```js
// backend/server.js
const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "https://ik.imagekit.io", "https://cdn.brandfetch.io", "https://logo.clearbit.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],  // tighten later
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  referrerPolicy: { policy: 'no-referrer' },
}));
```

---

## 3. Puppeteer Template Script Injection

**File:** `backend/services/puppeteer.js`

From the architecture docs, `window.CARD_DATA` is injected into `rate-card.html` via string replacement before `</head>`. The pattern is likely:

```js
const html = template.replace(
  '</head>',
  `<script>window.CARD_DATA=${JSON.stringify(cardData)}</script></head>`
);
```

**Node.js's `JSON.stringify` does NOT escape `<`, `>`, or `&` by default.** A user whose name or bio contains `</script><script>malicious code</script>` would inject arbitrary JavaScript into the Puppeteer-rendered page.

The Puppeteer browser is a sandboxed Chromium instance running server-side. Injected scripts run in that context and could:
- Make HTTP requests to internal services (SSRF within Puppeteer's network context)
- Read environment variables exposed to the page
- Exfiltrate data from the local rendering environment

**Severity:** Medium — requires a malicious user with a valid account.

**Recommendation:**
```js
// Escape HTML-sensitive chars in JSON output destined for inline <script> blocks
const safeJson = JSON.stringify(cardData)
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026');
const html = template.replace(
  '</head>',
  `<script>window.CARD_DATA=${safeJson}</script></head>`
);
```

---

## 4. CORS Wildcard Default — No Production Guard

**File:** `backend/config/index.js`, `backend/server.js`

`FRONTEND_ORIGIN` defaults to `'*'` (wildcard). If the production deployment ships without this env var set, the API accepts cross-origin requests from any domain.

With wildcard CORS, browsers block cookies but **Authorization headers still work** — any site can issue credentialed fetch requests using a stolen JWT (e.g., via phishing). There is also no `Vary: Origin` header emitted, which can cause CDN/proxy cache poisoning of API responses.

**Recommendation:**
```js
// backend/config/index.js — fail fast in production
if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_ORIGIN) {
  throw new Error('FRONTEND_ORIGIN must be set explicitly in production');
}
```

---

## 5. Admin JWT in localStorage

**File:** `backend/admin.html`

The 8-hour admin JWT is stored in `localStorage.adminToken`. Any JavaScript running on the admin page origin can read it. Since the admin panel has no Content-Security-Policy, a stored XSS (e.g. through a future change that renders user-controlled content) would immediately leak the admin token.

The admin JWT provides access to full user/card CRUD and deletion.

Currently the admin panel only renders data it fetches from its own API (no user-controlled strings rendered as HTML), so the XSS surface is low — but one template change away from being dangerous.

**Note:** User JWT is stored in a JS closure (`leadModal.token`) and never in localStorage ✅ — this is the better pattern.

**Recommendation:** Migrate admin JWT to `sessionStorage` (survives tab, not cross-tab) and add CSP to the admin page. Long-term, use `httpOnly` cookies.

---

## 6. No JWT Revocation

**File:** `backend/middleware/auth.js`

JWTs are signed with `JWT_SECRET` and valid for 30 days with no revocation mechanism. If a token is stolen (e.g. from a compromised device), it cannot be invalidated without rotating `JWT_SECRET` (which logs out all users).

**Recommendation (when this becomes a concern):** Add a `tokenVersion` field to the User document, increment on logout/password change, and include + verify in JWT claims.

---

## 7. LinkedIn `intent` Parameter Not Validated

**File:** `backend/controllers/auth.controller.js` — `linkedinAuth()`

```js
const { intent } = req.query;  // expects 'new' or 'existing'
nonces.set(nonce, { intent, exp: Date.now() + 10 * 60 * 1000 });
```

Any string value for `intent` is accepted and stored in the nonce map, then returned to the frontend via the OAuth callback. The frontend uses `data.isNew` (from DB) to route users, not `intent` directly — so the impact is low, but it's unnecessary attack surface.

**Recommendation:**
```js
const intent = ['new', 'existing'].includes(req.query.intent) ? req.query.intent : 'new';
```

---

## 8. Admin Password Comparison Not Timing-Safe

**File:** `backend/controllers/auth.controller.js` (admin auth section)

Admin login likely uses a direct string comparison: `secret === config.ADMIN_SECRET`. Timing attacks on string comparison are generally not practical over a network (network jitter dominates), but `crypto.timingSafeEqual` is the correct practice for secret comparison.

**Recommendation:**
```js
const crypto = require('crypto');
const provided = Buffer.from(req.body.secret ?? '', 'utf8');
const expected = Buffer.from(config.ADMIN_SECRET, 'utf8');
if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
  return res.status(401).json({ error: 'Invalid secret' });
}
```

---

## What's Fine

- **NoSQL injection:** Mongoose casts all query values to schema types — object injection (`{ "$gt": "" }`) is neutralized ✅
- **LinkedIn OAuth CSRF:** 16-byte random nonce, in-memory with 10-min TTL, deleted on use ✅
- **One-time OAuth session codes:** 2-min TTL, consumed on first exchange ✅
- **Open redirect:** `frontendOrigin` comes from env var, not user input ✅
- **Portfolio/CTA URL injection:** `javascript:` URIs prepended with `https://` ✅
- **Logo `img.src` injection:** Browsers don't execute `javascript:` from `img.src` ✅
- **User JWT storage:** In-memory JS closure, not localStorage — XSS-resistant ✅
- **ImageKit private key:** In `.env.local` (gitignored), never in client bundle ✅
- **PDF upload filtering:** Multer enforces PDF mimetype ✅

---

*No code was modified during this review.*
