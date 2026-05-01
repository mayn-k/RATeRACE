RR SCATTER — Hero fixed-layer build

Replace only scatter-gallery.js if your index.html already includes:
- Pixelify Sans in the Google Fonts link
- window.RATE_CARD_CAROUSEL_IMAGES config

This version:
1. Draws the carousel and CTA at the same depth pass as the ASCII logo, not as a final screen overlay.
2. Keeps the carousel/button proportions from the current build.
3. Uses the carousel top as the spacing anchor:
   - Blue link text: 45px above carousel top
   - Red text: 42px above blue text
   - ASCII logo bottom: 38px above red text
4. Keeps scatter images outside the full hero protected area.
