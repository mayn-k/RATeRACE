export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

export const GALLERY_CONFIG = {
  folder: '/scatter-images/',
  scanLimit: 50,
  extensions: ['png'],
  images: [] as { src: string; title?: string; link?: string }[],
};

export const CAROUSEL_IMAGES = [
  '/rate-card-carousel/rate-card-1.png',
  '/rate-card-carousel/rate-card-2.png',
  '/rate-card-carousel/rate-card-3.png',
];

export const RATE_CARD_CTA_URL = '';
