# About RATe RACE

## What it is

RATe RACE is a satirical AI-powered career grading system that turns your professional profile into a collectible trading card. It positions itself under the brand **adultmoney** — the premise being that your career, like a stock or a sports player, has a market value and a replacement risk, and both can be scored, displayed, and compared.

The product takes a resume PDF or LinkedIn profile as input, runs it through a deliberately blunt AI analyst, and produces a physical-looking card with two core numbers: **RATE** (your market value) and **REPLACEABILITY** (how easily AI or cheaper alternatives could take your job). The card can be shared, embedded, and browsed alongside everyone else's in a 3D interactive gallery.

---

## The Card

The card is styled as a sports/trading card — cream background, large bold numbers, portrait photo, org logos, a chess piece, and a pixel-art hourglass. Every element on it carries a specific meaning:

| Element | Meaning |
|---|---|
| **RATE** (13–99) | Overall career market value. Composite of skill scarcity, experience, institutional credibility, and role demand. Most people land 45–72. Above 85 is rare. Below 25 means the role is already being done by AI at scale. |
| **REPLACEABILITY** (13–99) | How easily your role could be filled by someone else or automated. Lower is better. A pure production designer scores high; an ML researcher scores low. Not a measure of talent — a measure of skill uniqueness and half-life. |
| **Chess piece** | Career archetype: pawn (0–2 yrs), knight (specialist/freelancer), bishop (domain expert), rook (senior leader), queen (VP+/C-suite/founder), king (CEO). |
| **Employment status chips** | Four coloured blocks top-right: yellow = retired, blue = fresher/intern, green = employed, red = unemployed. Active chip is fully opaque; inactive ones are dimmed. |
| **Ticker / delta** | 12-month trajectory. A float in [-0.10, +0.10] with a direction arrow. Down = market pressure increasing; up = leverage improving. |
| **Education badge** | Logo of highest credential institution, resolved via Brandfetch. |
| **Work badge** | Logo of current or most recent employer, resolved via Brandfetch. |
| **Hourglass** | Pixel-art animation frame (1–10) mapping replaceability to time pressure. High replaceability = nearly empty hourglass. |
| **Name and quote** | Legal name + bio rewritten by the AI into ≤40 chars, first-person voice. |
| **AM code** | 4-letter + 4-digit unique identifier (e.g. `ABCD 1234`). Used to retrieve, share, and return to your card. |

---

## How a card is generated

### Step 1 — Profile ingestion

The user provides their profile one of two ways:
- **Resume PDF** → `pdf-parse` extracts raw text → Gemini parses it into structured JSON (name, headline, LinkedIn URL, portfolio URL, skills, experience, education)
- **LinkedIn text/URL paste** → sent directly to Gemini for the same structured extraction

### Step 2 — AI scoring

The structured profile is sent to Gemini 3.1 Flash Lite Preview with a system prompt that positions it as a "blunt, calibrated, slightly uncomfortable labour-market analyst." It returns 13 fields:

```
rate · replaceability · chessPiece · employmentStatus · delta
educationOrg · workOrg · bioRewrite
marketVerdict · primaryRisk · humanEdge · recommendedAction · replaceabilityPercentile
```

`rate` and `replaceability` are clamped to `[13, 99]`. `delta.value` is clamped to `[-0.10, +0.10]`. Org logos are resolved concurrently via the Brandfetch CDN (domain guessed by the LLM from profile evidence); monogram SVG fallback if the logo fetch fails.

### Step 3 — Card rendering

`buildCardData()` assembles all scoring fields into a `window.CARD_DATA` object. Puppeteer injects this into `rate-card.html` (the 1053×1470 px artboard template), navigates to it on a local static route, and screenshots the `#artboard` element at 2× device pixel ratio, producing a 2106×2940 PNG.

### Step 4 — Storage and sharing

The PNG is uploaded to Cloudinary (`rate-cards/card_{userId}` — overwrites on re-generate). The AM code and Cloudinary URL are saved to the Card document in MongoDB. The user gets a shareable URL: `/card/:amCode`.

---

## The shareable card page (`/card/:amCode`)

The public page fetches the card data, shows the Cloudinary PNG in a three-panel layout:

- **Left panel** — "RATING REVIEW": personalised AI verdicts (Market Verdict, Primary Risk, Human Edge, Recommended Action)
- **Centre panel** — the card image, with 14 invisible hotspot overlays that show tooltips on hover explaining each card element
- **Right panel** — two animated gauge meters (RATE and REPLACEABILITY), percentile comparison ("MORE REPLACEABLE THAN X% OF USERS"), and a placeholder "MEME BACK" card reverse

The page also has a repeating red scan-line animation and a grid background for the aesthetic.

---

## The gallery

The homepage (`index.html` + `scatter-gallery.js`) renders all generated card images in a **3D perspective scatter** on a canvas. Images are loaded progressively from `./scatter-images/` (HTTP 200/404 probing), positioned in 3D space with a custom projection (`FOCAL = 920`), and depth-sorted each frame. Users can pan, drag, and pinch-to-zoom.

Clicking "FIND OUT YOUR REPLACEABILITY" opens a **lead modal** over the canvas that walks the user through:

1. **New user** → LinkedIn OAuth → collect bio/portfolio → AI scoring → card generation → view card
2. **Returning user** → LinkedIn OAuth or email + AM code → view existing card

The card is previewed inline in the modal with the same 14 hotspot tooltips, gauge meters, and sharing actions.

---

## AI model and persona

The LLM is **Gemini 3.1 Flash Lite Preview** via Google GenAI SDK. The scoring system prompt explicitly instructs the model to be "blunt, calibrated, and slightly uncomfortable" — the product is designed to feel like a harsh market verdict, not career coaching. The `marketVerdict` field (shown in red on the card page) is specifically prompted to "reference their actual field, role, or signals — not generic filler" and to "be precise and uncomfortable."

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS, HTML/CSS, Canvas 2D, no build step |
| Backend | Node.js 20+, Express |
| Database | MongoDB Atlas via Mongoose |
| AI | Google Gemini 3.1 Flash Lite Preview (via `@google/genai`) |
| Card rendering | Puppeteer (headless Chromium, singleton browser) |
| Image hosting | Cloudinary (card PNGs + portraits) |
| Auth | JWT (30-day user tokens, 8-hour admin tokens), LinkedIn OIDC |
| Logo resolution | Brandfetch CDN → monogram SVG fallback |
| Fonts | RateDisplay (custom), HelveticaNeue family |
| Deploy | Docker on Render (free 512 MB tier) |
