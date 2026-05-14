export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

// ImageKit CDN base URL — set NEXT_PUBLIC_IMAGEKIT_URL in .env.local
export const IMAGEKIT_URL =
  process.env.NEXT_PUBLIC_IMAGEKIT_URL || '';

// Raw CDN path — no transformations (logos, fonts, etc.)
export const cdn = (path: string): string =>
  IMAGEKIT_URL ? `${IMAGEKIT_URL}${path}` : path;

// CDN path with ImageKit real-time transformations.
// tr:f-auto → serves AVIF on Chrome, WebP on Safari/Firefox, PNG fallback
// q-75      → 75% quality (visually lossless for photography, ~5-10× smaller than PNG)
// w-{n}     → resize down to at most n px wide (never upscaled due to c-at_max)
export const cdnImage = (path: string, tr: string): string =>
  IMAGEKIT_URL ? `${IMAGEKIT_URL}/tr:${tr}${path}` : path;

// Scatter gallery images: cap at 900 px — generous for 3× DPR on a ~300 px slot.
// Expected result: ~850 KB PNG avg → ~50-80 KB WebP/AVIF avg.
export const SCATTER_TR = 'f-auto,q-75,w-900,c-at_max';

// Priority image numbers mirrored from scatter-gallery.js (line ~38)
export const SCATTER_PRIORITY = new Set([7, 8, 12, 14, 15, 17, 18, 21]);

// Explicit image list — bypasses the HTTP probe loop, required for CDN origins.
export const SCATTER_IMAGES = Array.from({ length: 50 }, (_, i) => ({
  src: cdnImage(`/scatter-images/image${i + 1}.png`, SCATTER_TR),
}));

// Carousel rate-card previews: no width cap, quality 85 (shown at large size).
export const CAROUSEL_IMAGES = [
  cdnImage('/rate-card-carousel/rate-card-1.png', 'f-auto,q-85'),
  cdnImage('/rate-card-carousel/rate-card-2.png', 'f-auto,q-85'),
  cdnImage('/rate-card-carousel/rate-card-3.png', 'f-auto,q-85'),
];

export const GALLERY_CONFIG = {
  folder: cdn('/scatter-images/'),
  scanLimit: 50,
  extensions: ['png'],
};

export const RATE_CARD_CTA_URL = '';
