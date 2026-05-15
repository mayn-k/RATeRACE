'use client';

import { useEffect } from 'react';
import {
  BACKEND_URL,
  CAROUSEL_IMAGES,
  GALLERY_CONFIG,
  RATE_CARD_CTA_URL,
  SCATTER_IMAGES,
} from '@/lib/config';
import { TICKER_JOBS } from '@/lib/tickerJobs';
import JobTicker from './JobTicker';

declare global {
  interface Window {
    BACKEND_URL: string;
    GALLERY_IMAGE_FOLDER: string;
    GALLERY_IMAGE_SCAN_LIMIT: number;
    GALLERY_IMAGE_EXTENSIONS: string[];
    GALLERY_IMAGES: { src: string; title?: string; link?: string }[];
    RATE_CARD_CAROUSEL_IMAGES: string[];
    RATE_CARD_CTA_URL: string;
    RATE_RACE_TICKER_JOBS: typeof TICKER_JOBS;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

export default function GalleryPage() {
  // Force a fresh load when browser restores this page from BFCache
  // (happens after navigating to LinkedIn OAuth and pressing Back).
  // Without this, scatter-gallery.js never re-executes and the canvas stays blank.
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  useEffect(() => {
    window.BACKEND_URL = BACKEND_URL;
    window.GALLERY_IMAGE_FOLDER = GALLERY_CONFIG.folder;
    window.GALLERY_IMAGE_SCAN_LIMIT = GALLERY_CONFIG.scanLimit;
    window.GALLERY_IMAGE_EXTENSIONS = GALLERY_CONFIG.extensions;
    // Explicit CDN list bypasses the HTTP probe loop in scatter-gallery.js
    window.GALLERY_IMAGES = SCATTER_IMAGES;
    window.RATE_CARD_CAROUSEL_IMAGES = CAROUSEL_IMAGES;
    window.RATE_CARD_CTA_URL = RATE_CARD_CTA_URL;
    window.RATE_RACE_TICKER_JOBS = TICKER_JOBS;

    // Kick off all 50 image fetches in parallel immediately.
    // By the time scatter-gallery.js requests them, the browser has them cached.
    SCATTER_IMAGES.forEach(({ src }) => {
      const img = new Image();
      img.src = src;
    });

    let cancelled = false;

    const init = async () => {
      await loadScript('/js/ascii-logo.js');
      if (cancelled) return;
      await loadScript('/js/scatter-gallery.js');
    };

    init().catch(console.error);

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div id="root">
      <canvas id="canvas" />

      <JobTicker />

      {/* Link panel — managed by scatter-gallery.js */}
      <div id="linkPanel" className="panel">
        <button className="panel-close" id="closeLinkPanel">
          ×
        </button>
        <div className="field-label">Item settings</div>
        <input id="inpTitle" type="text" placeholder="Label (optional)" />
        <input id="inpUrl" type="url" placeholder="https://..." />
        <div className="row">
          <button id="saveBtn" className="btn btn-dark">
            Save
          </button>
          <button id="openBtn" className="btn btn-accent">
            Open ↗
          </button>
          <button id="delBtn" className="btn btn-light">
            Del
          </button>
        </div>
      </div>

      <div className="hint">
        Hold and drag or scroll to travel through the scatter · Hover over the
        images in scatter to preview · Pinch to Zoom
      </div>
    </div>
  );
}
