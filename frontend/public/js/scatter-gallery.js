// scatter-gallery.js
// RATe RACE scatter gallery
// 3D hero billboard + deterministic surrounding scatter layout.
// Requires ascii-logo.js to be loaded first.

(() => {
  const root = document.getElementById('root');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  const linkPanel = document.getElementById('linkPanel');
  const closeLinkPanel = document.getElementById('closeLinkPanel');
  const saveBtn = document.getElementById('saveBtn');
  const openBtn = document.getElementById('openBtn');
  const delBtn = document.getElementById('delBtn');

  const BG = '#000000';
  const FOCAL = 920;
  const NEAR_CULL = FOCAL * 0.78;
  const MAX_ZOOM = 3.2;
  const MIN_ZOOM = 0.22;

  const SCENE_VIEW_SCALE = 0.75;

  const HERO_LAYER_Z = 1120;
  const HERO_LOCAL_W = 2200;
  const HERO_LOCAL_H = 1450;

  const heroLayer = {
    type: 'hero',
    x: 0,
    y: 0,
    z: HERO_LAYER_Z,
    baseW: HERO_LOCAL_W,
    baseH: HERO_LOCAL_H
  };

  const priorityNumbers = new Set([7, 8, 12, 14, 15, 17, 18, 21]);

  const carouselSources = window.RATE_CARD_CAROUSEL_IMAGES || [
    'https://ik.imagekit.io/2pg1fp1lr/rate-card-carousel/rate-card-1.png',
    'https://ik.imagekit.io/2pg1fp1lr/rate-card-carousel/rate-card-2.png',
    'https://ik.imagekit.io/2pg1fp1lr/rate-card-carousel/rate-card-3.png'
  ];

  const carouselImages = [];
  const CAROUSEL_INTERVAL = 2400;

  const HEADER_LOGO_SRC = 'https://ik.imagekit.io/2pg1fp1lr/adultmoney-header-logo.png';
  const LINKEDIN_LOGO_SRC = 'https://ik.imagekit.io/2pg1fp1lr/linkedin-logo.png';
  const DOWNLOAD_ICON_SRC = 'https://ik.imagekit.io/2pg1fp1lr/modal-download-icon.png';
  const SHARE_ICON_SRC = 'https://ik.imagekit.io/2pg1fp1lr/modal-share-icon.png';

  const headerLogo = new Image();
  let headerLogoLoaded = false;

  headerLogo.onload = () => {
    headerLogoLoaded = true;
    render();
  };

  headerLogo.onerror = () => {
    console.warn(`[RR SCATTER] Could not load header logo: ${HEADER_LOGO_SRC}`);
  };

  headerLogo.src = HEADER_LOGO_SRC;

  const items = [];
  const attemptedSources = new Set();
  const asciiEffect = new window.AsciiLogoEffect();

  const cam = {
    x: 0,
    y: 0,
    depth: HERO_LAYER_Z - 920,
    zoom: 1
  };

  let homeState    = null;   // saved after resetLandingCamera; pan/return target
  let inactTimer   = null;   // setTimeout handle for inactivity
  let autoReturn   = null;   // { from:{x,y,depth,zoom}, startTime } when animating back
  const INACT_DELAY     = 5000;  // ms before auto-return triggers
  const RETURN_DURATION = 1400;  // ms for the smooth return animation

  let revealStartTime = 0;      // performance.now() when the current layout's reveal began
  let revealComplete  = false;  // true once every item has fully faded in
  const REVEAL_SPREAD = 2500;   // ms — random window over which items begin fading in
  const REVEAL_FADE   = 500;    // ms — duration of each individual item's fade

  const HOVER_ZOOM_IN_MS  = 1400;
  const HOVER_ZOOM_OUT_MS = 1400;
  let hoverZoom          = null;  // { from:{x,y,zoom}, to:{x,y,zoom}, startTime, duration, returning }
  let savedCamBeforeZoom = null;
  let zoomedIn           = false; // true once zoom-in animation completes; cleared on zoom-out
  let zoomedIdleTimer    = null;
  const ZOOMED_IDLE_DELAY = 4000; // ms of no cursor/pan movement before auto zoom-out
  let zoomedTarget       = null;  // the item currently zoomed into
  let zoomFadeT          = 0;     // 0 = no fade, 1 = foreground images fully faded
  let zoomFadeFrom       = 0;
  let zoomFadeTo         = 0;
  let zoomFadeStart      = 0;
  const ZOOM_FADE_MS     = 400;

  let hovered = null;
  let selected = null;
  let drag = null;
  let pointer = { x: -999, y: -999, active: false };
  let touchPinch = null;
  let suppressNextMouseClick = false;
  let hoverStartTime = 0;
  let expandedItem = null;
  let previewPinned = false;
  let heroButtonHit  = null;
  let headerBtnHit   = null; // { leaderboard: {x,y,w,h} } in canvas pixel coords

  const BACKEND_URL = (window.BACKEND_URL || 'http://localhost:3000').replace(/\/$/, '');

  const leadModal = {
    open: false,
    mode: 'signup',
    el: null,
    panel: null,
    codeInput: null,
    recoverCodeInput: null,
    errorEl: null,
    loadingStatusEl: null,
    loadingBackBtn: null,
    cardImageEl: null,
    cardCodeEl: null,
    token: null,
    cardId: null,
    imageUrl: null,
    amCode: null
  };

  const HOVER_EXPAND_DELAY = 1250;

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function seeded(seed) {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  function uiScale() {
    return clamp(root.clientWidth / 1440, 0.55, 1);
  }

  function modalScale() {
    const totalH = 440 + 84 + 64 + 32;
    const totalW = 350;

    return clamp(
      Math.min((root.clientWidth - 34) / totalW, (root.clientHeight - 80) / totalH, 1),
      0.62,
      1
    );
  }

  function isMobileViewport() {
    return root.clientWidth <= 820 ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }

  function getSceneBounds() {
    const cx = root.clientWidth / 2;
    const cy = root.clientHeight / 2;

    return {
      left: cx + (0 - cx) / SCENE_VIEW_SCALE,
      right: cx + (root.clientWidth - cx) / SCENE_VIEW_SCALE,
      top: cy + (0 - cy) / SCENE_VIEW_SCALE,
      bottom: cy + (root.clientHeight - cy) / SCENE_VIEW_SCALE
    };
  }

  function toScenePoint(sx, sy) {
    const cx = root.clientWidth / 2;
    const cy = root.clientHeight / 2;

    return {
      sx: cx + (sx - cx) / SCENE_VIEW_SCALE,
      sy: cy + (sy - cy) / SCENE_VIEW_SCALE
    };
  }

  function beginSceneScale() {
    const cx = root.clientWidth / 2;
    const cy = root.clientHeight / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(SCENE_VIEW_SCALE, SCENE_VIEW_SCALE);
    ctx.translate(-cx, -cy);
  }

  function endSceneScale() {
    ctx.restore();
  }

  function projectionAtDepth(zPlane) {
    return (FOCAL / Math.max(FOCAL * 0.2, FOCAL + (zPlane - cam.depth))) * cam.zoom;
  }

  function screenToWorld(sx, sy, zPlane = HERO_LAYER_Z) {
    const scale = projectionAtDepth(zPlane);

    return {
      x: (sx - root.clientWidth / 2) / scale + cam.x,
      y: (sy - root.clientHeight / 2) / scale + cam.y
    };
  }

  function project(it) {
    const relZ = it.z - cam.depth;
    if (relZ < -NEAR_CULL) return null;

    const denom = Math.max(FOCAL * 0.26, FOCAL + relZ);
    const scale = (FOCAL / denom) * cam.zoom;

    const x = root.clientWidth / 2 + (it.x - cam.x) * scale;
    const y = root.clientHeight / 2 + (it.y - cam.y) * scale;
    const w = it.baseW * scale;
    const h = it.baseH * scale;

    let alpha = clamp(1.04 - relZ / 4200, 0.62, 1);
    if (relZ < 0) alpha *= clamp(1 + relZ / NEAR_CULL, 0, 1);

    return { relZ, scale, x, y, w, h, alpha };
  }

  function getDepthBounds() {
    let min = heroLayer.z;
    let max = heroLayer.z;

    for (const it of items) {
      if (it.z < min) min = it.z;
      if (it.z > max) max = it.z;
    }

    return { min, max };
  }

  function currentDragScale() {
    const bounds = getDepthBounds();
    const focusPlane = clamp(cam.depth + 420, bounds.min, bounds.max);
    return Math.max(0.0001, projectionAtDepth(focusPlane));
  }

  // Clamp cam.x/y so panning never exceeds 12.5% of screen beyond the home position
  function clampCameraPan() {
    if (!homeState) return;
    const proj = Math.max(0.001, currentDragScale());
    const maxX = (root.clientWidth  * 0.25) / proj;
    const maxY = (root.clientHeight * 0.25) / proj;
    cam.x = clamp(cam.x, homeState.x - maxX, homeState.x + maxX);
    cam.y = clamp(cam.y, homeState.y - maxY, homeState.y + maxY);
  }

  // Reset the 10-second inactivity countdown; also cancel any in-progress auto-return
  function resetInactivityTimer() {
    if (autoReturn) autoReturn = null;
    clearTimeout(inactTimer);
    inactTimer = setTimeout(() => {
      if (!leadModal.open && homeState && !zoomedIn) {
        autoReturn = {
          from: { x: cam.x, y: cam.y, depth: cam.depth, zoom: cam.zoom },
          startTime: performance.now(),
        };
      }
    }, INACT_DELAY);
  }

  function _triggerHoverZoom(it) {
    const relZ = it.z - cam.depth;
    const projFactor = FOCAL / Math.max(FOCAL * 0.26, FOCAL + relZ);
    const aspect = it.baseW / (it.baseH || 1);
    const targetW = Math.min(root.clientWidth * 0.58, root.clientHeight * 0.76 * aspect);
    const targetZoom = targetW / (it.baseW * projFactor * SCENE_VIEW_SCALE);

    if (!savedCamBeforeZoom) savedCamBeforeZoom = { x: cam.x, y: cam.y, zoom: cam.zoom };
    zoomedTarget = it;
    autoReturn = null;

    hoverZoom = {
      from:      { x: cam.x, y: cam.y, zoom: cam.zoom },
      to:        { x: it.x,  y: it.y,  zoom: clamp(targetZoom, MIN_ZOOM, MAX_ZOOM) },
      startTime: performance.now(),
      duration:  HOVER_ZOOM_IN_MS,
      returning: false,
    };
  }

  function _releaseHoverZoom(immediate = false) {
    if (!savedCamBeforeZoom) return;
    if (immediate) {
      cam.x = savedCamBeforeZoom.x;
      cam.y = savedCamBeforeZoom.y;
      cam.zoom = savedCamBeforeZoom.zoom;
      hoverZoom = null;
      savedCamBeforeZoom = null;
      zoomedTarget = null;
      zoomFadeFrom = zoomFadeT; zoomFadeTo = 0; zoomFadeStart = performance.now();
      return;
    }
    zoomFadeFrom = zoomFadeT; zoomFadeTo = 0; zoomFadeStart = performance.now();
    hoverZoom = {
      from:      { x: cam.x, y: cam.y, zoom: cam.zoom },
      to:        { x: savedCamBeforeZoom.x, y: savedCamBeforeZoom.y, zoom: savedCamBeforeZoom.zoom },
      startTime: performance.now(),
      duration:  HOVER_ZOOM_OUT_MS,
      returning: true,
    };
  }

  function startZoomedIdleTimer() {
    clearTimeout(zoomedIdleTimer);
    zoomedIdleTimer = setTimeout(() => {
      if (zoomedIn) {
        zoomedIn = false;
        expandedItem = null;
        _releaseHoverZoom();
      }
    }, ZOOMED_IDLE_DELAY);
  }

  function resetZoomedIdleTimer() {
    if (zoomedIn) startZoomedIdleTimer();
  }

  function resetLandingCamera() {
    cam.x = 0;
    cam.depth = HERO_LAYER_Z - 920;
    cam.zoom = isMobileViewport() ? 0.30 : 0.6;

    const pScale = projectionAtDepth(HERO_LAYER_Z);
    const targetHeroCenterY = root.clientHeight * (isMobileViewport() ? 0.54 : 0.535);

    cam.y = heroLayer.y - ((targetHeroCenterY - root.clientHeight / 2) / Math.max(0.0001, pScale));

    homeState = { x: cam.x, y: cam.y, depth: cam.depth, zoom: cam.zoom };
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(root.clientWidth * dpr);
    canvas.height = Math.round(root.clientHeight * dpr);
    canvas.style.width = root.clientWidth + 'px';
    canvas.style.height = root.clientHeight + 'px';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    updateLeadModalScale();

    if (items.length) relayoutItems();
    else {
      resetLandingCamera();
      render();
    }
  }

  function loadRateCardCarousel() {
    carouselImages.length = 0;

    carouselSources.forEach((src, index) => {
      const img = new Image();

      img.onload = () => {
        carouselImages[index] = { img, src };
        render();
      };

      img.onerror = () => {
        console.warn(`[RR SCATTER] Could not load carousel image: ${src}`);
      };

      img.src = src;
    });
  }

  function injectLeadModalStyles() {
    if (document.getElementById('lead-modal-styles')) return;

    const style = document.createElement('style');
    style.id = 'lead-modal-styles';

    style.textContent = `
      .rr-lead-overlay {
        position: absolute;
        inset: 0;
        z-index: 90;
        display: none;
        background: rgba(0,0,0,0.94);
        color: #ffffff;
        font-family: "Pixelify Sans", monospace;
        pointer-events: auto;
      }

      .rr-lead-stage {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 350px;
        height: 549px;
        transform-origin: center center;
      }

      .rr-lead-close {
        position: absolute;
        left: 326px;
        top: -54px;
        width: 34px;
        height: 34px;
        border: 0;
        background: transparent;
        color: #ff0000;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 42px;
        line-height: 34px;
        text-align: center;
        cursor: pointer;
        padding: 0;
        z-index: 3;
      }

      .rr-lead-panel {
        position: absolute;
        left: 31.5px;
        top: 0;
        width: 287px;
        height: 401px;
        background: #1a1a1a;
        border: 2px dashed #ffffff;
        box-sizing: border-box;
      }

      .rr-lead-content {
        position: absolute;
        left: 21px;
        top: 0;
        width: 245px;
        height: 401px;
      }

      .rr-lead-label {
        position: absolute;
        left: 0;
        color: #ffffff;
        font-size: 14px;
        letter-spacing: 0.18em;
        line-height: 1;
        margin: 0;
        font-weight: 700;
      }

      .rr-lead-input {
        position: absolute;
        left: 0;
        width: 245px;
        height: 30px;
        border: 0;
        outline: 0;
        border-radius: 2px;
        background: #e6e6e6;
        color: #1a1a1a;
        padding: 0 12px;
        font-family: "Pixelify Sans", monospace;
        font-size: 10px;
        box-sizing: border-box;
        appearance: none;
        -webkit-appearance: none;
      }

      .rr-lead-input::placeholder {
        color: #b9b9b9;
        opacity: 1;
      }

      .rr-red-link {
        color: #ff0000;
        cursor: pointer;
        text-decoration: underline;
        text-underline-offset: 2px;
      }

      .rr-hidden {
        display: none;
      }

      /* SIGNUP SCREEN */
      .rr-mode-signup .rr-email-label {
        top: 70px;
      }

      .rr-mode-signup .rr-signup-email {
        top: 103px;
      }

      .rr-lead-small-row {
        position: absolute;
        top: 150px;
        left: 0;
        width: 245px;
        text-align: center;
        font-size: 8px;
        color: #ffffff;
        line-height: 1.2;
      }

      .rr-lead-buttons {
        position: absolute;
        left: 0;
        top: 215px;
        width: 245px;
        display: grid;
        grid-template-columns: 108px 29px 108px;
        align-items: center;
        justify-items: center;
      }

      .rr-lead-mini-button {
        width: 108px;
        height: 30px;
        background: #000000;
        border: 0;
        color: #ffffff;
        font-family: "Pixelify Sans", monospace;
        font-size: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        padding: 0;
      }

      .rr-linkedin-logo {
        width: 65px;
        height: 18px;
        object-fit: contain;
        display: block;
      }

      .rr-or {
        color: #ffffff;
        font-size: 11px;
        width: 29px;
        text-align: center;
      }

      /* LOGIN SCREEN */
      .rr-mode-login .rr-login-email-label {
        top: 68px;
      }

      .rr-mode-login .rr-login-email {
        top: 101px;
      }

      .rr-mode-login .rr-code-label {
        top: 170px;
      }

      .rr-mode-login .rr-code-input {
        top: 203px;
        border-radius: 2px;
      }

      .rr-code-help-line {
        position: absolute;
        top: 245px;
        left: 0;
        width: 245px;
        text-align: center;
        font-size: 8px;
        line-height: 1;
      }

      .rr-valid-error {
        position: absolute;
        top: 262px;
        left: 0;
        width: 245px;
        height: 10px;
        text-align: center;
        color: #ffffff;
        font-size: 5px;
        line-height: 1;
      }

      .rr-bottom-account-row {
        position: absolute;
        left: 0;
        top: 300px;
        width: 245px;
        text-align: center;
        font-size: 8px;
        color: #ffffff;
        line-height: 1;
      }

      /* RECOVER CODE SCREEN */
      .rr-mode-recover .rr-recover-title {
        top: 60px;
        width: 245px;
        line-height: 1.15;
      }

      .rr-mode-recover .rr-recover-email {
        top: 89px;
      }

      .rr-recover-copy {
        position: absolute;
        top: 138px;
        left: 0;
        width: 245px;
        color: #ffffff;
        font-size: 10px;
        line-height: 1.35;
        letter-spacing: 0.08em;
        text-align: center;
      }

      .rr-mode-recover .rr-recover-code-label {
        top: 178px;
      }

      .rr-mode-recover .rr-recover-code {
        top: 208px;
        border-radius: 2px;
      }

      .rr-lead-footer {
        position: absolute;
        left: 21px;
        bottom: 21px;
        width: 245px;
        text-align: center;
        font-size: 7px;
        line-height: 1.35;
        color: #ffffff;
      }

      .rr-lead-footer a {
        color: #bfbfbf;
        text-decoration: underline;
        text-underline-offset: 2px;
      }

      /* LOADING VIEW */
      .rr-mode-loading:not(.rr-hidden) {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }

      .rr-loading-spinner {
        width: 32px;
        height: 32px;
        border: 3px solid #333;
        border-top-color: #ff0000;
        border-radius: 50%;
        animation: rr-spin 0.9s linear infinite;
        margin-bottom: 18px;
      }

      @keyframes rr-spin {
        to { transform: rotate(360deg); }
      }

      .rr-loading-status {
        font-size: 10px;
        color: #cccccc;
        letter-spacing: 0.12em;
        text-align: center;
        line-height: 1.5;
        max-width: 200px;
      }

      .rr-loading-back {
        margin-top: 20px;
        background: transparent;
        border: 1px solid #555;
        color: #aaaaaa;
        font-family: "Pixelify Sans", monospace;
        font-size: 9px;
        letter-spacing: 0.1em;
        padding: 6px 14px;
        cursor: pointer;
      }

      /* CARD VIEW */
      .rr-mode-card:not(.rr-hidden) {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 16px 0 8px;
        gap: 0;
      }

      .rr-card-image-wrap { display: none; }
      .rr-card-image { display: none; }

      .rr-card-ready-label {
        font-size: 9px;
        letter-spacing: 0.22em;
        color: #888;
        font-weight: 700;
        text-align: center;
        margin-bottom: 6px;
      }

      .rr-card-code-label {
        text-align: center;
        width: 100%;
        font-size: 9px;
        letter-spacing: 0.22em;
        color: #888888;
        font-weight: 700;
        margin-top: 18px;
      }

      .rr-card-code-value {
        text-align: center;
        width: 100%;
        font-size: 22px;
        letter-spacing: 0.18em;
        color: #ff0000;
        font-weight: 700;
        margin-bottom: 4px;
      }

      .rr-card-code-hint {
        text-align: center;
        width: 100%;
        font-size: 7px;
        color: #666666;
        letter-spacing: 0.08em;
        margin-bottom: 18px;
      }

      .rr-card-view-btn {
        display: block;
        width: 100%;
        padding: 11px 0;
        background: #ff0000;
        color: #fff;
        font-family: "Pixelify Sans", monospace;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-align: center;
        text-decoration: none;
        border: none;
        cursor: pointer;
        margin-bottom: 10px;
      }

      .rr-card-view-btn:hover { background: #cc0000; }

      .rr-logout-btn {
        width: 108px;
        height: 36px;
        background: #000;
        border: 1px solid #444;
        color: #fff;
        font-family: "Pixelify Sans", monospace;
        font-size: 9px;
        letter-spacing: 0.12em;
        cursor: pointer;
        margin-top: 14px;
      }
      .rr-logout-btn:hover { border-color: #fff; }

      .rr-logout-confirm {
        font-family: "Pixelify Sans", monospace;
        font-size: 8px;
        letter-spacing: 0.10em;
        color: #ff4444;
        text-align: center;
        margin-top: 10px;
      }

      /* ── height overrides for new modes ── */
      .rr-lead-panel   { height: 440px; }
      .rr-lead-content { height: 440px; overflow-y: auto; }

      /* ── ENTRY MODE ── */
      .rr-mode-entry:not(.rr-hidden) {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0;
      }
      .rr-entry-headline {
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 0.18em;
        color: #fff;
        margin-bottom: 6px;
      }
      .rr-entry-sub {
        font-size: 8px;
        color: #666;
        letter-spacing: 0.14em;
        margin-bottom: 44px;
      }
      .rr-entry-buttons { display: flex; gap: 14px; }
      .rr-entry-btn {
        width: 108px;
        height: 36px;
        background: #000;
        border: 1px solid #444;
        color: #fff;
        font-family: "Pixelify Sans", monospace;
        font-size: 9px;
        letter-spacing: 0.12em;
        cursor: pointer;
      }
      .rr-entry-btn:hover { border-color: #fff; }
      .rr-entry-btn.rr-entry-primary {
        background: #fff;
        color: #000;
        border-color: #fff;
      }
      .rr-entry-btn.rr-entry-primary:hover { background: #B90000; border-color: #B90000; color: #fff; }

      /* ── EXISTING-LOGIN MODE ── */
      .rr-mode-existing-login .rr-el-subtitle {
        position: absolute; top: 14px; left: 0;
        font-size: 8px; color: #555; letter-spacing: .16em;
      }
      .rr-mode-existing-login .rr-el-title {
        position: absolute; top: 32px; left: 0;
        font-size: 13px; font-weight: 700; color: #fff; letter-spacing: .14em;
      }
      .rr-el-li-btn {
        position: absolute; top: 68px; left: 0;
        width: 245px; height: 34px;
        background: #0a66c2; border: 0;
        color: #fff; font-family: "Pixelify Sans", monospace;
        font-size: 9px; letter-spacing: .12em; cursor: pointer;
      }
      .rr-el-li-btn:hover { background: #0958a8; }
      .rr-el-or {
        position: absolute; top: 114px; left: 0;
        width: 245px; text-align: center;
        font-size: 8px; color: #444; letter-spacing: .1em;
      }
      .rr-el-email-label { position: absolute; top: 144px; left: 0; }
      .rr-el-email { position: absolute; top: 162px; left: 0; width: 245px; }
      .rr-el-code-label  { position: absolute; top: 206px; left: 0; }
      .rr-el-code  { position: absolute; top: 224px; left: 0; width: 245px; }
      .rr-el-submit {
        position: absolute; top: 274px; left: 0;
        width: 245px; height: 32px;
        background: #fff; border: 0; color: #000;
        font-family: "Pixelify Sans", monospace;
        font-size: 10px; letter-spacing: .14em; cursor: pointer;
      }
      .rr-el-submit:hover { background: #b90000; color: #fff; }
      .rr-el-error {
        position: absolute; top: 318px; left: 0;
        width: 245px; text-align: center;
        font-size: 8px; color: #c40000; min-height: 12px;
      }
      .rr-el-back {
        position: absolute; top: 370px; left: 0;
        width: 245px; text-align: center;
        font-size: 8px; color: #555;
      }

      /* ── CONFIRM MODE ── */
      .rr-mode-confirm .rr-cf-step {
        position: absolute; top: 10px; left: 0;
        font-size: 8px; color: #555; letter-spacing: .16em;
      }
      .rr-mode-confirm .rr-cf-title {
        position: absolute; top: 28px; left: 0;
        font-size: 13px; font-weight: 700; color: #fff; letter-spacing: .14em;
      }
      .rr-cf-photo-wrap {
        position: absolute; top: 56px;
        left: calc(50% - 26px);
        width: 52px; height: 52px;
      }
      .rr-cf-photo {
        width: 52px; height: 52px; border-radius: 50%;
        border: 1px solid #444; object-fit: cover;
        background: #1a1a1a; display: block;
      }
      .rr-cf-disclaimer {
        position: absolute; top: 116px; left: 0; width: 245px;
        border: 1px solid rgba(255,255,255,0.12); padding: 7px 22px 7px 8px; box-sizing: border-box;
      }
      .rr-cf-disclaimer-text {
        font-size: 9px; line-height: 1.5; color: rgba(255,255,255,0.36); letter-spacing: 0.03em;
      }
      .rr-cf-disclaimer-text strong { color: rgba(255,255,255,0.50); font-weight: 600; }
      .rr-cf-disclaimer-close {
        position: absolute; top: 5px; right: 6px; border: 0; background: transparent;
        color: rgba(255,255,255,0.22); font-size: 14px; line-height: 1; cursor: pointer; padding: 0; font-family: sans-serif;
      }
      .rr-cf-disclaimer-close:hover { color: rgba(255,255,255,0.60); }
      .rr-cf-bio-label   { position: absolute; top: 202px; left: 0; }
      .rr-cf-bio   { position: absolute; top: 220px; left: 0; width: 245px; }
      .rr-cf-port-label  { position: absolute; top: 262px; left: 0; }
      .rr-cf-port  { position: absolute; top: 280px; left: 0; width: 245px; }
      .rr-cf-next {
        position: absolute; top: 324px; left: 0;
        width: 245px; height: 32px;
        background: #fff; border: 0; color: #000;
        font-family: "Pixelify Sans", monospace;
        font-size: 10px; letter-spacing: .14em; cursor: pointer;
      }
      .rr-cf-next:hover { background: #b90000; color: #fff; }
      .rr-cf-back {
        position: absolute; top: 366px; left: 0;
        font-size: 8px; color: #555; cursor: pointer;
      }
      .rr-cf-back:hover { color: #fff; }

      /* ── UPLOAD-CV MODE ── */
      .rr-mode-upload-cv .rr-uv-step {
        position: absolute; top: 26px; left: 0;
        font-size: 8px; color: #555; letter-spacing: .16em;
      }
      .rr-mode-upload-cv .rr-uv-title {
        position: absolute; top: 44px; left: 0;
        font-size: 13px; font-weight: 700; color: #fff; letter-spacing: .14em;
      }
      .rr-uv-desc {
        position: absolute; top: 80px; left: 0; width: 245px;
        font-size: 9px; color: #888; line-height: 1.5; letter-spacing: .06em;
      }
      .rr-uv-area {
        position: absolute; top: 152px; left: 0;
        width: 245px; height: 88px;
        border: 1.5px dashed #444;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        gap: 6px; cursor: pointer;
      }
      .rr-uv-area:hover, .rr-uv-area.has-file { border-color: #fff; }
      .rr-uv-area.has-file { border-color: #3dde6e; }
      .rr-uv-area-icon { font-size: 20px; line-height: 1; }
      .rr-uv-area-lbl { font-size: 9px; color: #888; letter-spacing: .1em; }
      .rr-uv-filename {
        position: absolute; top: 254px; left: 0; width: 245px;
        font-size: 8px; color: #3dde6e; text-align: center;
        letter-spacing: .06em; white-space: nowrap;
        overflow: hidden; text-overflow: ellipsis;
        min-height: 12px;
      }
      .rr-uv-analyze {
        position: absolute; top: 280px; left: 0;
        width: 245px; height: 32px;
        background: #fff; border: 0; color: #000;
        font-family: "Pixelify Sans", monospace;
        font-size: 10px; letter-spacing: .14em;
        cursor: pointer; opacity: .3; pointer-events: none;
      }
      .rr-uv-analyze.ready { opacity: 1; pointer-events: auto; }
      .rr-uv-analyze.ready:hover { background: #b90000; color: #fff; }
      .rr-uv-back {
        position: absolute; top: 328px; left: 0;
        font-size: 8px; color: #555; cursor: pointer;
      }
      .rr-uv-back:hover { color: #fff; }

    `;

    document.head.appendChild(style);
  }

  async function apiPost(path, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BACKEND_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || `Request failed (${res.status})`);
    return json;
  }

  async function apiPatch(path, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BACKEND_URL}${path}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || `Request failed (${res.status})`);
    return json;
  }

  async function apiGet(path) {
    const res = await fetch(`${BACKEND_URL}${path}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
    return json;
  }

  async function apiPostForm(path, formData, token) {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BACKEND_URL}${path}`, { method: 'POST', headers, body: formData });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || `Request failed (${res.status})`);
    return json;
  }

  function nameFromEmail(email) {
    const local = email.split('@')[0].replace(/[._\-+]/g, ' ');
    return local.replace(/\b\w/g, c => c.toUpperCase());
  }

  function showModalError(msg, color) {
    if (!leadModal.errorEl) return;
    leadModal.errorEl.style.color = color || '#c40000';
    leadModal.errorEl.textContent = msg;
  }

  function setDownloadShareVisible(visible) {
    if (!leadModal.el) return;
    const actions = leadModal.el.querySelector('.rr-modal-actions');
    if (actions) actions.style.display = visible ? '' : 'none';
  }

  function setLoadingStatus(msg) {
    if (leadModal.loadingStatusEl) leadModal.loadingStatusEl.textContent = msg;
  }

  // ── Auth persistence ─────────────────────────────────────────────────────────
  function saveAuthToStorage() {
    if (!leadModal.token) return;
    localStorage.setItem('rr_auth', JSON.stringify({
      token:    leadModal.token,
      cardId:   leadModal.cardId   || null,
      imageUrl: leadModal.imageUrl || null,
      amCode:   leadModal.amCode   || null,
    }));
  }

  function clearAuthFromStorage() {
    localStorage.removeItem('rr_auth');
  }

  async function hydrateAuthFromStorage() {
    let stored;
    try { stored = JSON.parse(localStorage.getItem('rr_auth') || 'null'); } catch (_) {}
    if (!stored?.token) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${stored.token}` },
      });

      if (res.status === 401) {
        clearAuthFromStorage();
        showToast('Session expired — please sign in again.', 3500);
        return;
      }

      if (!res.ok) return;

      leadModal.token    = stored.token;
      leadModal.cardId   = stored.cardId   || null;
      leadModal.imageUrl = stored.imageUrl || null;
      leadModal.amCode   = stored.amCode   || null;

      // Refresh card data in case imageUrl or amCode changed server-side
      if (stored.amCode) {
        try {
          const cardRes = await fetch(`${BACKEND_URL}/api/card/view/${encodeURIComponent(stored.amCode)}`);
          if (cardRes.ok) {
            const cardData = await cardRes.json();
            if (cardData.card?.imageUrl) {
              leadModal.imageUrl = cardData.card.imageUrl;
              saveAuthToStorage();
            }
          }
        } catch (_) {}
      }
    } catch (_) {
      // Network error — leave stored auth intact for next load
    }
  }

  // ── OAuth return handler (called on page load when ?oauth= param is present) ──
  async function handleOAuthReturn(code) {
    openLeadModal('loading');
    setLoadingStatus('Connecting to LinkedIn…');
    if (leadModal.loadingBackBtn) leadModal.loadingBackBtn.classList.add('rr-hidden');
    try {
      const data = await apiGet(`/api/auth/linkedin/exchange?code=${encodeURIComponent(code)}`);
      leadModal.token = data.token;

      if (data.isNew) {
        const el = leadModal.el;
        const photoEl = el.querySelector('.rr-cf-photo');
        if (photoEl && data.photo) photoEl.src = data.photo;
        setLeadModalMode('confirm');
      } else if (!data.hasCard) {
        leadModal.uploadCvBackMode = 'existing-login';
        setLeadModalMode('upload-cv');
      } else {
        leadModal.cardId   = data.cardId;
        leadModal.imageUrl = data.imageUrl;
        leadModal.amCode   = data.amCode || '';
        if (leadModal.cardCodeEl) leadModal.cardCodeEl.textContent = data.amCode || '';
        saveAuthToStorage();
        setDownloadShareVisible(true);
        setLeadModalMode('card');
      }
    } catch (err) {
      setLoadingStatus('LinkedIn error: ' + err.message);
      if (leadModal.loadingBackBtn) leadModal.loadingBackBtn.classList.remove('rr-hidden');
    }
  }

  async function handleConfirmSubmit() {
    const el = leadModal.el;
    const bio          = el.querySelector('.rr-cf-bio').value.trim();
    const portfolioUrl = el.querySelector('.rr-cf-port').value.trim();

    setLeadModalMode('loading');
    setLoadingStatus('Saving your details…');
    if (leadModal.loadingBackBtn) leadModal.loadingBackBtn.classList.add('rr-hidden');

    try {
      await apiPost('/api/user/bio', { bio, portfolioUrl }, leadModal.token);
      leadModal.uploadCvBackMode = 'confirm';
      setLeadModalMode('upload-cv');
    } catch (err) {
      setLoadingStatus('Error: ' + err.message);
      if (leadModal.loadingBackBtn) leadModal.loadingBackBtn.classList.remove('rr-hidden');
    }
  }

  async function handleCVAnalyze(file) {
    setLeadModalMode('loading');
    if (leadModal.loadingBackBtn) leadModal.loadingBackBtn.classList.add('rr-hidden');
    try {
      setLoadingStatus('Parsing your CV…');
      const form = new FormData();
      form.append('file', file);
      await apiPostForm('/api/resume/upload', form, leadModal.token);

      setLoadingStatus('Scoring your profile…');
      await apiPost('/api/score/generate', {}, leadModal.token);

      setLoadingStatus('Generating your rate card…');
      const cardData = await apiPost('/api/card/generate', {}, leadModal.token);
      leadModal.cardId   = cardData.cardId;
      leadModal.imageUrl = cardData.imageUrl;
      leadModal.amCode   = cardData.amCode || '';

      if (leadModal.cardCodeEl) leadModal.cardCodeEl.textContent = cardData.amCode || '';
      saveAuthToStorage();
      setDownloadShareVisible(true);
      setLeadModalMode('card');
    } catch (err) {
      setLoadingStatus('Error: ' + err.message);
      if (leadModal.loadingBackBtn) leadModal.loadingBackBtn.classList.remove('rr-hidden');
    }
  }

  async function handleExistingCodeLogin() {
    const el     = leadModal.el;
    const email  = el.querySelector('.rr-el-email').value.trim();
    const raw    = el.querySelector('.rr-el-code').value.trim().toUpperCase();
    const errEl  = el.querySelector('.rr-el-error');

    if (!email || !raw)                       { errEl.textContent = 'Enter your email and code.'; return; }
    if (!/^[A-Z]{4}[0-9]{4}$/.test(raw))     { errEl.textContent = '4 letters + 4 digits (e.g. ABCD1234).'; return; }

    errEl.textContent = '';
    setLeadModalMode('loading');
    setLoadingStatus('Logging in…');
    if (leadModal.loadingBackBtn) leadModal.loadingBackBtn.classList.add('rr-hidden');

    try {
      const data = await apiPost('/api/auth/code-login', { email, code: raw });
      leadModal.token = data.token;

      if (data.imageUrl) {
        leadModal.cardId   = data.cardId;
        leadModal.imageUrl = data.imageUrl;
        leadModal.amCode   = data.amCode || raw;
        if (leadModal.cardCodeEl) leadModal.cardCodeEl.textContent = data.amCode || raw;
        saveAuthToStorage();
        setDownloadShareVisible(true);
        setLeadModalMode('card');
      } else {
        leadModal.uploadCvBackMode = 'existing-login';
        setLeadModalMode('upload-cv');
      }
    } catch (err) {
      setLeadModalMode('existing-login');
      const errEl2 = leadModal.el.querySelector('.rr-el-error');
      if (errEl2) errEl2.textContent = err.message;
    }
  }

  function ensureAbsoluteUrl(url) {
    if (!url) return url;
    url = url.trim();
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    return url;
  }

  function showToast(message, duration = 2500) {
    const prev = document.getElementById('rr-toast');
    if (prev) prev.remove();
    const toast = document.createElement('div');
    toast.id = 'rr-toast';
    toast.textContent = message;
    Object.assign(toast.style, {
      position: 'fixed', right: '20px', top: '50%',
      transform: 'translateY(-50%)',
      background: '#1a1a1a', color: '#fff',
      border: '1px solid #444',
      padding: '10px 18px',
      fontFamily: '"Pixelify Sans", monospace',
      fontSize: '11px', letterSpacing: '0.14em',
      zIndex: '99999', opacity: '1',
      transition: 'opacity 0.4s',
      pointerEvents: 'none',
    });
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 400);
    }, duration);
  }

  let _modalEscHandler = null;

  function injectFinalModalStyles() {
    if (document.getElementById('rr-final-modal-style')) return;
    const el = document.createElement('style');
    el.id = 'rr-final-modal-style';
    el.textContent = `
      .rr-final-modal {
        --rr-red: #e60000; --rr-green: #1fd15f; --rr-yellow: #f5df33; --rr-blue: #2d5fa9;
        --rr-card-w: clamp(250px, 24.3vw, 388px);
        --rr-pixel: "Pixelify Sans", Helvetica Neue, Helvetica, Arial, sans-serif;
        --rr-sans: Helvetica Neue, Helvetica, Arial, sans-serif;
        position: fixed; inset: 0; z-index: 9999;
        overflow-y: auto; overflow-x: hidden;
        scrollbar-width: none; -ms-overflow-style: none;
        background:
          radial-gradient(circle at 50% 52%, rgba(255,255,255,0.105), rgba(255,255,255,0.025) 23%, transparent 44%),
          radial-gradient(circle at 78% 50%, rgba(230,0,0,0.08), transparent 34%),
          #000;
        color: #fff; isolation: isolate; font-family: var(--rr-sans);
      }
      .rr-final-modal::-webkit-scrollbar { display: none; }
      .rr-final-modal::before {
        content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 0;
        background-image:
          linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px),
          linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px);
        background-size: 48px 48px, 48px 48px, 12px 12px, 12px 12px;
        opacity: 0.72;
      }
      .rr-final-modal::after {
        content: ""; position: fixed; left: 0; right: 0; top: -22%; height: 18%;
        background: linear-gradient(180deg, transparent, rgba(255,255,255,0.055), rgba(230,0,0,0.09), transparent);
        filter: blur(2px); opacity: 0; pointer-events: none;
        animation: rrScanPass 3s 0.24s linear infinite; z-index: 0;
      }
      @keyframes rrScanPass {
        0%    { transform: translateY(-10vh); opacity: 0; }
        10%   { opacity: 1; }
        57%   { transform: translateY(135vh); opacity: 0; }
        57.1% { transform: translateY(-10vh); opacity: 0; }
        100%  { transform: translateY(-10vh); opacity: 0; }
      }
      .rr-modal-close {
        position: fixed; top: 22px; left: 28px; z-index: 10001;
        border: 0; background: transparent; color: var(--rr-red);
        font-size: 36px; line-height: 1; cursor: pointer; padding: 0;
        font-family: var(--rr-pixel);
      }
      .rr-final-header {
        position: sticky; top: 0;
        display: flex; align-items: center; justify-content: center;
        gap: clamp(28px, 4.6vw, 78px); z-index: 15; user-select: none;
        padding-top: clamp(18px, 2.5vw, 34px); width: 100%;
      }
      .rr-top-pill, .rr-leader-pill {
        font-family: var(--rr-pixel); font-size: clamp(15px, 1.45vw, 24px);
        line-height: 1; letter-spacing: 0.05em; padding: 0.34em 0.62em 0.42em;
        white-space: nowrap; cursor: pointer;
      }
      .rr-top-pill { color: #000; background: #f4dd34; }
      .rr-leader-pill { color: #fff; background: var(--rr-blue); }
      .rr-header-logo-img { height: clamp(26px, 2.8vw, 40px); width: auto; object-fit: contain; display: block; }
      .rr-final-layout {
        position: relative; z-index: 4;
        width: min(92vw, 1560px); margin: 0 auto;
        display: grid;
        grid-template-columns: minmax(260px, 370px) minmax(320px, 520px) minmax(270px, 390px);
        align-items: center; justify-content: center;
        column-gap: clamp(30px, 5vw, 94px);
        padding-top: 52px; padding-bottom: 60px; min-height: calc(100vh - 80px);
      }
      .rr-review-panel { align-self: center; transform: translateY(-4px); }
      .rr-section-title {
        margin: 0 0 28px; font-family: var(--rr-pixel);
        color: var(--rr-red); font-size: clamp(28px, 3.2vw, 50px);
        line-height: 0.95; letter-spacing: 0.14em; text-transform: uppercase;
        text-shadow: 0 0 14px rgba(230,0,0,0.22);
      }
      .rr-review-copy { width: min(100%, 340px); color: rgba(255,255,255,0.88); font-size: 13px; line-height: 1.35; }
      .rr-case-line { padding: 10px 0 12px; border-top: 1px solid rgba(255,255,255,0.14); }
      .rr-case-line:last-child { border-bottom: 1px solid rgba(255,255,255,0.14); }
      .rr-case-label {
        display: block; margin-bottom: 5px; font-family: var(--rr-pixel);
        color: rgba(255,255,255,0.42); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase;
      }
      .rr-case-value { display: block; color: #fff; font-size: 13px; line-height: 1.35; }
      .rr-case-value.red { color: var(--rr-red); text-shadow: 0 0 10px rgba(230,0,0,0.18); }
      .rr-card-stage {
        position: relative; display: flex; flex-direction: column;
        align-items: center; justify-content: center; align-self: center; min-width: 0;
      }
      .rr-verdict-line {
        margin: 0 0 18px; font-family: var(--rr-pixel);
        color: rgba(255,255,255,0.72); font-size: 13px;
        letter-spacing: 0.22em; text-align: center; text-transform: uppercase;
        opacity: 0; animation: rrRiseIn 600ms 130ms ease-out forwards;
      }
      .rr-card-wrap {
        position: relative; width: var(--rr-card-w); aspect-ratio: 1053 / 1470;
        transform: rotate(1deg); border-radius: 9px;
        filter: drop-shadow(0 0 26px rgba(255,255,255,0.20)) drop-shadow(0 34px 46px rgba(255,255,255,0.12));
        opacity: 0; animation: rrCardSettle 820ms 120ms cubic-bezier(.16,.95,.18,1) forwards;
      }
      @keyframes rrCardSettle {
        from { opacity: 0; transform: translateY(28px) rotate(1deg) scale(0.96); }
        to   { opacity: 1; transform: translateY(0)   rotate(1deg) scale(1); }
      }
      .rr-card-wrap::before {
        content: ""; position: absolute; left: 50%; bottom: -54px; width: 108%; height: 76px;
        transform: translateX(-50%); border-radius: 50%;
        background: rgba(255,255,255,0.58); filter: blur(31px); opacity: 0.44;
        z-index: -1; mix-blend-mode: screen; pointer-events: none;
      }
      .rr-card-wrap::after {
        content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
        background: linear-gradient(115deg, transparent 0 39%, rgba(255,255,255,0.22) 48%, transparent 58%),
                    radial-gradient(circle at 20% 0%, rgba(255,255,255,0.2), transparent 24%);
        opacity: 0; mix-blend-mode: screen; animation: rrCardGlint 1.15s 0.65s ease-out both;
      }
      @keyframes rrCardGlint {
        0%   { opacity: 0; transform: translateX(-18%); }
        35%  { opacity: 0.6; }
        100% { opacity: 0; transform: translateX(22%); }
      }
      .rr-final-card-img {
        position: absolute; inset: 0; width: 100%; height: 100%;
        object-fit: cover; border-radius: inherit; display: none; z-index: 2;
      }
      .rr-card-wrap.has-card-image .rr-final-card-img { display: block; }
      .rr-card-wrap.has-card-image .rr-generated-card-fallback { display: none; }
      .rr-generated-card-fallback {
        position: absolute; inset: 0; overflow: hidden; border-radius: inherit;
        background: #f4f1e8; color: #0b0b0b; z-index: 1; padding: 22px;
      }
      .rr-fallback-stats { display: flex; justify-content: space-between; font-family: var(--rr-pixel); font-weight: 800; line-height: 0.8; }
      .rr-fallback-stats small { display: block; margin-bottom: 7px; font-size: 8px; letter-spacing: 0.06em; }
      .rr-fallback-rate { font-size: 60px; color: #000; }
      .rr-fallback-repl { font-size: 50px; color: #a50000; text-align: right; }
      .rr-fallback-portrait {
        position: absolute; left: 22%; top: 30%; width: 56%; height: 42%;
        background: radial-gradient(circle at 51% 26%, #ffdfc0 0 13%, transparent 14%),
                    radial-gradient(circle at 51% 23%, #5a33c9 0 17%, transparent 18%),
                    linear-gradient(180deg, transparent 0 45%, #1f2430 45% 68%, transparent 68%),
                    linear-gradient(180deg, #eee8d8, #f9f4e3);
        border: 1px solid rgba(0,0,0,0.12);
      }
      .rr-fallback-name {
        position: absolute; left: 24px; right: 24px; bottom: 28px;
        display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #1b1b1b;
      }
      .rr-fallback-symbol {
        width: 34px; height: 34px; border: 1px solid #888;
        display: grid; place-items: center; font-family: var(--rr-pixel); font-size: 21px; color: #111;
      }
      .rr-card-hotspot {
        position: absolute; z-index: 5; border: 1px solid transparent; cursor: help; pointer-events: auto;
      }
      .rr-card-hotspot:hover { }
      .hotspot-rate           { left: 6%;   top: 5%;   width: 37%; height: 22%; }
      .hotspot-replaceability { right: 4%;  top: 6%;   width: 37%; height: 20%; }
      .hotspot-portrait       { left: 22%;  top: 26%;  width: 56%; height: 37%; }
      .hotspot-chip-yellow    { right: 13%; top: 2%;   width: 5%;  height: 6%;  }
      .hotspot-chip-blue      { right: 9%;  top: 2%;   width: 5%;  height: 6%;  }
      .hotspot-chip-green     { right: 5%;  top: 2%;   width: 5%;  height: 6%;  }
      .hotspot-chip-red       { right: 1%;  top: 2%;   width: 5%;  height: 6%;  }
      .hotspot-ticker         { left: 40%;  top: 63%;  width: 35%; height: 5%;  }
      .hotspot-edu-badge      { left: 27%;  top: 68%;  width: 23%; height: 9%;  }
      .hotspot-work-badge     { left: 50%;  top: 68%;  width: 23%; height: 9%;  }
      .hotspot-portfolio      { left: 20%;  top: 79%;  width: 60%; height: 5%;  }
      .hotspot-chess          { left: 1%;   top: 86%;  width: 17%; height: 12%; }
      .hotspot-identity       { left: 21%;  top: 90%;  width: 58%; height: 9%;  }
      .hotspot-hourglass      { right: 0%;  top: 86%;  width: 17%; height: 12%; }
      .rr-tooltip {
        position: fixed; z-index: 10000; max-width: 260px; padding: 10px 12px 11px;
        background: rgba(5,5,5,0.96); border: 1px solid rgba(255,255,255,0.18);
        color: #fff; font-size: 11px; line-height: 1.35; pointer-events: none;
        transform: translate(-50%, calc(-100% - 14px)); opacity: 0; transition: opacity 120ms ease;
        box-shadow: 0 0 26px rgba(255,255,255,0.09);
      }
      .rr-tooltip.is-visible { opacity: 1; }
      .rr-tooltip b {
        display: block; margin-bottom: 4px; font-family: var(--rr-pixel);
        color: var(--rr-red); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;
      }
      .rr-employee-file {
        margin-top: 48px; font-family: var(--rr-pixel); color: var(--rr-red);
        font-size: clamp(17px, 1.65vw, 25px); letter-spacing: 0.18em;
        text-align: center; text-transform: uppercase; text-shadow: 0 0 16px rgba(230,0,0,0.22);
      }
      .rr-actions {
        margin-top: 32px; display: grid; grid-template-columns: repeat(3, minmax(96px, 132px));
        gap: 14px; justify-content: center;
      }
      .rr-action-btn {
        height: 58px; border: 1px solid rgba(255,255,255,0.72); background: rgba(0,0,0,0.25);
        color: #fff; font-family: var(--rr-pixel); font-size: 15px; line-height: 0.95;
        letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer;
        transition: transform 160ms ease, background 160ms ease, color 160ms ease,
                    border-color 160ms ease, box-shadow 160ms ease;
      }
      .rr-action-btn:hover { transform: translateY(-2px); border-color: #fff; box-shadow: 0 0 20px rgba(255,255,255,0.14); }
      .rr-action-btn.primary { border-color: #fff; background: #fff; color: #000; }
      .rr-action-btn.primary:hover { background: var(--rr-red); border-color: var(--rr-red); color: #fff; box-shadow: 0 0 24px rgba(230,0,0,0.35); }
      .rr-action-btn:disabled { opacity: 0.45; cursor: not-allowed; pointer-events: none; }
      /* Inline edit forms */
      .rr-inline-form {
        display: flex; flex-direction: column; gap: 14px;
        width: min(100%, 360px); margin: 24px auto 0;
      }
      .rr-inline-form-title {
        font-family: var(--rr-pixel); color: var(--rr-red);
        font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase;
      }
      .rr-if-field { display: flex; flex-direction: column; gap: 5px; }
      .rr-if-label {
        font-family: var(--rr-pixel); color: rgba(255,255,255,0.42);
        font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase;
      }
      .rr-if-input {
        width: 100%; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.18);
        color: #fff; padding: 10px 12px; font-size: 13px; outline: none;
        font-family: inherit; box-sizing: border-box;
      }
      .rr-if-input:focus { border-color: rgba(255,255,255,0.45); }
      .rr-if-actions { display: flex; gap: 10px; }
      .rr-if-msg { font-size: 11px; color: rgba(255,255,255,0.42); min-height: 16px; }
      .rr-if-upload-area {
        width: 100%; min-height: 120px; border: 1px dashed rgba(255,255,255,0.22);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        cursor: pointer; transition: 160ms ease; gap: 8px; padding: 16px; box-sizing: border-box;
      }
      .rr-if-upload-area:hover { border-color: rgba(255,255,255,0.5); background: rgba(255,255,255,0.04); }
      .rr-if-upload-hint { font-family: var(--rr-pixel); font-size: 10px; letter-spacing: 0.1em; color: rgba(255,255,255,0.42); text-transform: uppercase; }
      .rr-if-preview { width: 100%; max-height: 180px; object-fit: contain; display: none; border: 1px solid rgba(255,255,255,0.14); }
      .rr-if-restore { font-family: var(--rr-pixel); font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.32); background: none; border: none; padding: 0; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; text-align: left; }
      .rr-if-restore:hover { color: rgba(255,255,255,0.65); }
      .rr-if-linkedin-photo { display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 8px 10px; border: 1px solid rgba(255,255,255,0.12); border-radius: 4px; background: rgba(255,255,255,0.03); }
      .rr-if-linkedin-photo:hover { border-color: rgba(255,255,255,0.32); background: rgba(255,255,255,0.06); }
      .rr-if-linkedin-photo.is-selected { border-color: rgba(255,255,255,0.55); background: rgba(255,255,255,0.08); }
      .rr-if-linkedin-thumb { width: 42px; height: 42px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.18); flex-shrink: 0; }
      .rr-if-linkedin-label { font-family: var(--rr-pixel); font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.55); }
      .rr-if-preview.is-visible { display: block; }
      .rr-bottom-hint {
        position: relative; z-index: 4; padding: 16px 16px 32px;
        text-align: center; color: rgba(255,255,255,0.46); font-size: 10px; letter-spacing: 0.06em; line-height: 1.4; pointer-events: none;
      }
      .rr-return-hook {
        display: block; margin-top: 6px; font-family: var(--rr-pixel);
        color: rgba(255,255,255,0.70); letter-spacing: 0.13em; text-transform: uppercase;
      }
      .rr-linkedin-overlay {
        position: absolute; z-index: 6; top: 80%; left: 5%; width: 90%; height: 6%;
        background: transparent; cursor: pointer;
      }
      .rr-meter-panel { align-self: center; display: flex; flex-direction: column; gap: 30px; transform: translateY(-2px); }
      .rr-meter-card { position: relative; min-height: 180px; display: grid; place-items: center; }
      .rr-meter-svg {
        width: 230px; height: 128px; overflow: visible;
        filter: drop-shadow(0 0 10px rgba(255,255,255,0.08)) drop-shadow(0 0 28px rgba(255,255,255,0.04));
      }
      .rr-meter-track { fill: none; stroke: rgba(255,255,255,0.14); stroke-width: 16; stroke-linecap: round; }
      .rr-meter-zone { fill: none; stroke-width: 16; stroke-linecap: round; }
      .rr-meter-needle {
        transform-origin: 115px 115px;
        transform: rotate(var(--needle-rot, 0deg));
        animation: rrNeedleTwitch 950ms 0.7s cubic-bezier(.16,.95,.18,1) both;
      }
      @keyframes rrNeedleTwitch {
        0%   { transform: rotate(calc(var(--needle-rot) - 8deg)); }
        48%  { transform: rotate(calc(var(--needle-rot) + 3deg)); }
        100% { transform: rotate(var(--needle-rot)); }
      }
      .rr-needle-line { stroke: #ffffff; stroke-width: 2; stroke-linecap: round; opacity: 0.92; }
      .rr-needle-dot { fill: #ffffff; stroke: rgba(0,0,0,0.5); stroke-width: 1; }
      .rr-meter-score {
        position: absolute; top: 75px; left: 50%; transform: translateX(-50%);
        font-family: var(--rr-pixel); font-size: 42px; color: #fff; letter-spacing: 0.03em; line-height: 1;
      }
      .rr-meter-status { position: absolute; top: 142px; left: 50%; width: 260px; transform: translateX(-50%); text-align: center; }
      .rr-meter-status-sub {
        display: block; font-family: var(--rr-pixel); color: var(--rr-red);
        font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; text-shadow: 0 0 10px rgba(230,0,0,0.22);
      }
      .rr-meter-labels {
        position: absolute; top: 16px; left: 50%; width: 228px; transform: translateX(-50%);
        display: flex; justify-content: space-between; color: rgba(255,255,255,0.32);
        font-family: var(--rr-pixel); font-size: 8px; letter-spacing: 0.12em; text-transform: uppercase; pointer-events: none;
      }
      .rr-rank-module {
        width: min(100%, 330px); margin: 0 auto; padding: 14px 16px;
        border-top: 1px solid rgba(255,255,255,0.14); border-bottom: 1px solid rgba(255,255,255,0.14);
        background: rgba(255,255,255,0.018);
      }
      .rr-rank-kicker {
        display: block; margin-bottom: 6px; font-family: var(--rr-pixel);
        color: rgba(255,255,255,0.42); font-size: 9px; letter-spacing: 0.17em; text-transform: uppercase;
      }
      .rr-rank-value { display: block; font-family: var(--rr-pixel); color: #fff; font-size: 22px; letter-spacing: 0.04em; text-transform: uppercase; }
      .rr-rank-value strong { color: var(--rr-red); font-weight: 700; }
      .rr-back-preview {
        display: grid; grid-template-columns: 76px 1fr; gap: 14px; align-items: center;
        width: min(100%, 330px); margin: 4px auto 0; padding: 12px;
        border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.025);
        cursor: pointer; transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
      }
      .rr-back-preview:hover { transform: translateY(-1px); border-color: rgba(255,255,255,0.42); background: rgba(255,255,255,0.045); }
      .rr-back-thumb {
        position: relative; width: 76px; aspect-ratio: 1053 / 1470; overflow: hidden; border-radius: 5px;
        background: radial-gradient(circle at 50% 38%, rgba(230,0,0,0.35), transparent 35%),
                    linear-gradient(150deg, #111, #272727 52%, #050505);
        transform: rotate(-2deg); box-shadow: 0 0 18px rgba(255,255,255,0.10);
      }
      .rr-back-thumb::after {
        content: "MEME BACK"; position: absolute; left: 8px; right: 8px; top: 50%; transform: translateY(-50%);
        font-family: var(--rr-pixel); color: #fff; font-size: 10px; line-height: 0.9;
        letter-spacing: 0.08em; text-align: center; text-shadow: 0 0 10px rgba(230,0,0,0.8);
      }
      .rr-back-text b { display: block; margin-bottom: 6px; font-family: var(--rr-pixel); color: var(--rr-red); font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; }
      .rr-back-text span { display: block; color: rgba(255,255,255,0.70); font-size: 11px; line-height: 1.35; }
      .rr-back-text em { display: block; margin-top: 7px; color: #fff; font-family: var(--rr-pixel); font-size: 10px; font-style: normal; letter-spacing: 0.12em; text-transform: uppercase; }
      .rr-back-lightbox {
        position: fixed; inset: 0; z-index: 10002; display: none; place-items: center;
        background: rgba(0,0,0,0.82);
      }
      .rr-back-lightbox.is-open { display: grid; }
      .rr-back-close {
        position: fixed; top: 22px; right: 28px; border: 0; background: transparent;
        color: var(--rr-red); font-size: 46px; line-height: 1; cursor: pointer; padding: 0; z-index: 10003;
      }
      .rr-back-wrap { display: flex; flex-direction: column; align-items: center; gap: 22px; }
      .rr-back-large {
        height: min(calc(clamp(220px, 42vw, 420px) * 1470 / 1053), calc(100vh - 200px));
        width: auto;
      }
      .rr-back-large img { height: 100%; width: auto; display: block; }
      .rr-back-coming { font-family: var(--rr-pixel); font-size: 36px; font-weight: 700; letter-spacing: 0.18em; color: #fff; text-transform: uppercase; }
      @keyframes rrRiseIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      @media (max-width: 1180px) {
        .rr-final-layout {
          width: min(92vw, 720px); grid-template-columns: 1fr; row-gap: 34px;
          padding-top: 32px; padding-bottom: 110px; min-height: auto;
        }
        .rr-card-stage  { order: 1; }
        .rr-review-panel { order: 2; width: min(100%, 520px); margin: 0 auto; }
        .rr-meter-panel  { order: 3; width: min(100%, 520px); margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .rr-back-preview, .rr-rank-module { grid-column: 1 / -1; }
        .rr-review-copy { width: 100%; max-width: none; }
        .rr-actions { grid-template-columns: 1fr; width: min(100%, 360px); }
        .rr-action-btn { height: 50px; }
      }
      @media (max-width: 720px) {
        .rr-final-modal { --rr-card-w: min(75vw, 330px); }
        .rr-final-header { gap: 12px; }
        .rr-header-logo-img { height: 24px; }
        .rr-final-layout { width: min(92vw, 430px); padding-top: 16px; }
        .rr-section-title { font-size: 34px; }
        .rr-meter-panel { grid-template-columns: 1fr; }
        .rr-meter-card { min-height: 162px; }
      }

      /* ── Share modal ── */
      .rr-share-overlay {
        position: fixed; inset: 0; z-index: 10100;
        background: rgba(0,0,0,0.84); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        display: flex; align-items: center; justify-content: center; padding: 20px;
      }
      .rr-share-panel {
        width: min(460px, 92vw); position: relative;
        border: 1px solid rgba(255,255,255,0.20);
        background: linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.015)),#060606;
        box-shadow: 0 0 80px rgba(0,0,0,0.92); padding: 36px 28px 28px;
      }
      .rr-share-close {
        position: absolute; top: 10px; right: 16px;
        border: 0; background: transparent; color: var(--rr-red);
        font-size: 38px; line-height: 1; cursor: pointer; padding: 0;
      }
      .rr-share-preview {
        width: 100%; max-width: 200px; aspect-ratio: 1053/1470; overflow: hidden;
        margin: 0 auto 22px; background: rgba(255,255,255,0.04);
        transform: rotate(0.6deg); box-shadow: 0 0 32px rgba(255,255,255,0.10);
      }
      .rr-share-preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .rr-share-heading {
        font-family: var(--rr-pixel); font-size: clamp(14px,1.4vw,18px); letter-spacing: 0.08em;
        color: #fff; text-transform: uppercase; margin-bottom: 20px; text-align: center;
      }
      .rr-share-btns { display: flex; flex-direction: column; gap: 10px; }
      .rr-share-btn {
        width: 100%; min-height: 46px; border: 1px solid rgba(255,255,255,0.36);
        background: transparent; color: #fff; font-family: var(--rr-pixel);
        font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;
        cursor: pointer; transition: 160ms ease;
        display: flex; align-items: center; justify-content: center; gap: 10px;
      }
      .rr-share-btn:hover { background: rgba(255,255,255,0.06); border-color: #fff; }
      .rr-share-btn.primary { border-color: #fff; background: #fff; color: #000; }
      .rr-share-btn.primary:hover { background: var(--rr-red); border-color: var(--rr-red); color: #fff; box-shadow: 0 0 24px rgba(230,0,0,0.30); }
      .rr-share-btn.whatsapp:hover { background: rgba(37,211,102,0.10); border-color: #25D366; color: #25D366; }
      .rr-share-url {
        margin-top: 16px; padding: 9px 12px;
        border: 1px solid rgba(255,255,255,0.10); background: rgba(255,255,255,0.03);
        font-family: monospace; font-size: 10px; color: rgba(255,255,255,0.44);
        word-break: break-all; text-align: center; letter-spacing: 0.04em;
      }
      /* RateDisplay — numbers only */
      #rrRateScore, #rrReplaceabilityScore { font-family: "RateDisplay", monospace; }
      #rrPercentileText { font-family: "RateDisplay", monospace; }
      #rrEmployeeFile { font-family: "RateDisplay", monospace; }
      .rr-card-code-value { font-family: "RateDisplay", monospace; }
    `;
    document.head.appendChild(el);
  }

  // ── Manifesto modal ─────────────────────────────────────────────────────────

  function injectManifestoStyles() {
    if (document.getElementById('rr-manifesto-style')) return;
    const el = document.createElement('style');
    el.id = 'rr-manifesto-style';
    el.textContent = `
      .rr-manifesto-overlay {
        position: fixed; inset: 0; z-index: 10200;
        background: rgba(0,0,0,0.92); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
        display: flex; align-items: center; justify-content: center; padding: 20px;
      }
      .rr-manifesto-panel {
        width: min(860px, 94vw); height: min(88vh, 820px);
        overflow: hidden; position: relative;
        border: 1px solid rgba(255,255,255,0.13);
        background: linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01)),#050505;
        box-shadow: 0 0 120px rgba(0,0,0,0.98);
        padding: clamp(28px,3.5vh,44px) clamp(20px,3vw,40px) clamp(20px,3vh,36px);
        display: flex; flex-direction: column;
      }
      .rr-manifesto-close {
        position: absolute; top: 14px; right: 22px; border: 0; background: transparent;
        color: rgba(255,255,255,0.40); font-size: 36px; line-height: 1; cursor: pointer; padding: 0;
        transition: color 120ms ease; font-family: sans-serif;
      }
      .rr-manifesto-close:hover { color: #e60000; }
      .rr-manifesto-cols {
        display: grid; grid-template-columns: 1fr 1fr;
        gap: clamp(20px,3vw,40px); align-items: stretch;
        flex: 1; min-height: 0;
      }
      .rr-manifesto-left {
        border-right: 1px solid rgba(255,255,255,0.09);
        padding-right: clamp(20px,3vw,40px);
        display: flex; flex-direction: column; justify-content: space-between;
        overflow: hidden;
      }
      .rr-manifesto-rr-logo { height: clamp(32px,3.5vw,48px); width: auto; display: block; margin-bottom: clamp(28px,3.5vh,44px); }
      .rr-manifesto-rule { border: none; border-top: 1px solid rgba(255,255,255,0.18); margin: 0 0 16px; }
      .rr-manifesto-am-footer { display: flex; justify-content: center; padding-top: 16px; flex-shrink: 0; }
      .rr-manifesto-body {
        font-family: "HelveticaNeue", "Helvetica Neue", Helvetica, Arial, sans-serif;
        font-size: clamp(12px,1.05vw,14.5px); line-height: 1.78;
        color: rgba(255,255,255,0.72); letter-spacing: 0.01em; overflow: hidden;
      }
      .rr-manifesto-body p { margin: 0 0 clamp(10px,1.2vh,16px); }
      .rr-manifesto-body p:last-child { margin-bottom: 0; }
      .rr-manifesto-left .rr-manifesto-body { color: #e60000; }
      .rr-manifesto-cols > .rr-manifesto-body > p:last-child { color: #e60000; }
      @media (max-width: 620px) {
        .rr-manifesto-cols { grid-template-columns: 1fr; }
        .rr-manifesto-left { border-right: none; padding-right: 0; border-bottom: 1px solid rgba(255,255,255,0.09); padding-bottom: 16px; }
      }
    `;
    document.head.appendChild(el);
  }

  function openManifestoModal() {
    injectManifestoStyles();
    const existing = document.getElementById('rrManifestoOverlay');
    if (existing) { existing.remove(); return; }

    const el = document.createElement('div');
    el.className = 'rr-manifesto-overlay';
    el.id        = 'rrManifestoOverlay';
    el.innerHTML = `
      <div class="rr-manifesto-panel">
        <button class="rr-manifesto-close" id="rrManifestoClose" aria-label="Close">×</button>
        <div class="rr-manifesto-cols">
          <div class="rr-manifesto-left">
            <div>
              <img class="rr-manifesto-rr-logo" src="${BACKEND_URL}/rateracelogo.png" alt="RATeRACE">
              <hr class="rr-manifesto-rule">
              <div class="rr-manifesto-body">
                <p>Growing up is often the slow act of surrendering to circumstances, systems, people, and realities you can no longer afford to ignore.</p>
              </div>
            </div>
            <div class="rr-manifesto-am-footer">
              <img src="${BACKEND_URL}/adultmoneylogo.png" width="28" height="28" alt="AdultMoney">
            </div>
          </div>
          <div class="rr-manifesto-body">
            <p>RATeRACE is built as a provocation of that surrender.</p>
            <p>It does not shame the race. It does not glorify it. It simply acknowledges how deeply the rat race has become the survival symbol of our generation.</p>
            <p>At every stage of human civilization, the symbol of survival has changed. Today, survival is measured through resumes, skills, salaries, titles, networks, dashboards, and market value.</p>
            <p>The project rates a person based on their current professional signal, market demand, role relevance, skill strength, and exposure to automation. The backend draws from job-market indicators such as Andrej Karpathy's job market visualizer, hiring trends, role demand, AI capability benchmarks, skill saturation, and automation risk across different kinds of work.</p>
            <p>The RATE shows how strongly the market values your current profile.</p>
            <p>The Replaceability Index estimates how exposed your current work is to automation and market compression — in simple terms, the closest visible measure of how much time your current version has before it needs to evolve.</p>
            <p>RATeRACE is not here to define your worth.</p>
            <p>It is here to remind you what you gave up to become a number on a dashboard.</p>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(el);

    const close = () => { const o = document.getElementById('rrManifestoOverlay'); if (o) o.remove(); };
    el.querySelector('#rrManifestoClose').addEventListener('click', close);
    el.addEventListener('click', e => { if (e.target === el) close(); });
    const escHandler = e => { if (e.key === 'Escape') { close(); window.removeEventListener('keydown', escHandler); } };
    window.addEventListener('keydown', escHandler);
  }

  // ── end Manifesto modal ──────────────────────────────────────────────────────

  function buildFinalModalHTML(amCode) {
    return `
      <button class="rr-modal-close" id="rrModalCloseBtn" type="button" aria-label="Go back">←</button>

      <header class="rr-final-header">
        <div class="rr-top-pill">MANIFESTO</div>
        <img class="rr-header-logo-img" src="https://ik.imagekit.io/2pg1fp1lr/adultmoney-header-logo.png" alt="ADULTMONEY" />
        <div class="rr-leader-pill">LEADERBOARD</div>
      </header>

      <section class="rr-final-layout">
        <aside class="rr-review-panel" aria-label="Rating review">
          <h1 class="rr-section-title">RATING<br>REVIEW</h1>
          <div class="rr-review-copy">
            <div class="rr-case-line">
              <span class="rr-case-label">Market Verdict</span>
              <span class="rr-case-value red" id="rrMarketVerdict">SUBJECT SHOWS HIGH EXPOSURE TO REPEATABLE KNOWLEDGE WORK.</span>
            </div>
            <div class="rr-case-line">
              <span class="rr-case-label">Primary Risk</span>
              <span class="rr-case-value" id="rrPrimaryRisk">Tasks can be explained, copied, packaged, and automated.</span>
            </div>
            <div class="rr-case-line">
              <span class="rr-case-label">Human Edge</span>
              <span class="rr-case-value" id="rrHumanEdge">Taste / judgment / trust / original context.</span>
            </div>
            <div class="rr-case-line">
              <span class="rr-case-label">Recommended Action</span>
              <span class="rr-case-value" id="rrRecommendedAction">Build non-automatable leverage before the market reprices you.</span>
            </div>
          </div>
        </aside>

        <section class="rr-card-stage" aria-label="Generated card">
          <p class="rr-verdict-line">THE MARKET HAS ISSUED A VERDICT.</p>
          <div class="rr-card-wrap" id="rrCardWrap">
            <img id="rrFinalCardImage" class="rr-final-card-img" alt="Generated RATe RACE card" />
            <div class="rr-generated-card-fallback" aria-hidden="true">
              <div class="rr-fallback-stats">
                <div class="rr-fallback-rate"><small>RATE</small><span>--</span></div>
                <div class="rr-fallback-repl"><small>REPLACEABILITY</small><span>--</span></div>
              </div>
              <div class="rr-fallback-portrait"></div>
              <div class="rr-fallback-name"><div class="rr-fallback-symbol">↯</div><div>Loading&hellip;</div></div>
            </div>
            <div class="rr-card-hotspot hotspot-rate" data-title="RATE" data-tooltip="Your overall career score. A combined measure of your skills, experience, and market demand."></div>
            <div class="rr-card-hotspot hotspot-replaceability" data-title="REPLACEABILITY" data-tooltip="How easily your role could be filled by someone else or automated by AI. Lower is better."></div>
            <div class="rr-card-hotspot hotspot-portrait" data-title="PORTRAIT" data-tooltip="Your public labour-market face. The visual identity attached to your card when shared."></div>
            <div class="rr-card-hotspot hotspot-ticker" data-title="TICKER" data-tooltip="Your career momentum. Tracks whether your professional growth has been trending up or down over the last 90 days."></div>
            <div class="rr-card-hotspot hotspot-edu-badge" data-title="EDUCATION BADGE" data-tooltip="Your highest qualification and the institution you attended."></div>
            <div class="rr-card-hotspot hotspot-work-badge" data-title="WORK BADGE" data-tooltip="Your current or most recent employer."></div>
            <div class="rr-card-hotspot hotspot-portfolio" data-title="CLICK ME LINK" data-tooltip="Your portfolio, LinkedIn, or any link you want people to visit from your card."></div>
            <div class="rr-card-hotspot hotspot-chess" data-title="CHESS PIECE" data-tooltip="Your career archetype. The role you play in the professional world."></div>
            <div class="rr-card-hotspot hotspot-identity" data-title="NAME AND QUOTE" data-tooltip="Your identity on the RATe RACE system."></div>
            <div class="rr-card-hotspot hotspot-hourglass" data-title="HOURGLASS" data-tooltip="Time remaining before AI could significantly impact or replace your current role."></div>
            <div class="rr-card-hotspot hotspot-chip-yellow" data-title="RETIRED" data-tooltip=""></div>
            <div class="rr-card-hotspot hotspot-chip-blue" data-title="FRESHER INTERN" data-tooltip=""></div>
            <div class="rr-card-hotspot hotspot-chip-green" data-title="EMPLOYED" data-tooltip=""></div>
            <div class="rr-card-hotspot hotspot-chip-red" data-title="UNEMPLOYED" data-tooltip=""></div>
          </div>
          <div class="rr-employee-file">EMPLOYEE FILE: <span id="rrEmployeeFile">${amCode}</span></div>
          <div class="rr-actions">
            <button class="rr-action-btn" id="rrFixPortfolioBtn" type="button">FIX<br>PORTFOLIO</button>
            <button class="rr-action-btn primary" id="rrPostCardBtn" type="button">POST<br>MY CARD</button>
            <button class="rr-action-btn" id="rrChangeFaceBtn" type="button">CHANGE<br>FACE</button>
          </div>
        </section>

        <aside class="rr-meter-panel" aria-label="Market meters">
          <section class="rr-meter-card" aria-label="Replaceability pressure meter">
            <div class="rr-meter-labels"><span>LOW</span><span>WATCH</span><span>CRITICAL</span></div>
            <svg class="rr-meter-svg" viewBox="0 0 230 135" aria-hidden="true">
              <path class="rr-meter-track" d="M 25 115 A 90 90 0 0 1 205 115"></path>
              <path class="rr-meter-zone" stroke="#1fd15f" d="M 25 115 A 90 90 0 0 1 71 37"></path>
              <path class="rr-meter-zone" stroke="#f5df33" d="M 75 35 A 90 90 0 0 1 155 35"></path>
              <path class="rr-meter-zone" stroke="#e60000" d="M 159 37 A 90 90 0 0 1 205 115"></path>
              <g class="rr-meter-needle" id="rrReplaceabilityNeedle">
                <line class="rr-needle-line" x1="115" y1="115" x2="115" y2="37"></line>
                <circle class="rr-needle-dot" cx="115" cy="115" r="5"></circle>
              </g>
            </svg>
            <div class="rr-meter-score" id="rrReplaceabilityScore">--</div>
            <div class="rr-meter-status"><span class="rr-meter-status-sub">REPLACEABILITY</span></div>
          </section>

          <section class="rr-meter-card" aria-label="Labour rate meter">
            <div class="rr-meter-labels"><span>WEAK</span><span>BILLABLE</span><span>RARE</span></div>
            <svg class="rr-meter-svg" viewBox="0 0 230 135" aria-hidden="true">
              <path class="rr-meter-track" d="M 25 115 A 90 90 0 0 1 205 115"></path>
              <path class="rr-meter-zone" stroke="#e60000" d="M 25 115 A 90 90 0 0 1 71 37"></path>
              <path class="rr-meter-zone" stroke="#f5df33" d="M 75 35 A 90 90 0 0 1 155 35"></path>
              <path class="rr-meter-zone" stroke="#1fd15f" d="M 159 37 A 90 90 0 0 1 205 115"></path>
              <g class="rr-meter-needle" id="rrRateNeedle">
                <line class="rr-needle-line" x1="115" y1="115" x2="115" y2="37"></line>
                <circle class="rr-needle-dot" cx="115" cy="115" r="5"></circle>
              </g>
            </svg>
            <div class="rr-meter-score" id="rrRateScore">--</div>
            <div class="rr-meter-status"><span class="rr-meter-status-sub">RATE</span></div>
          </section>

          <section class="rr-rank-module" aria-label="Market rank">
            <span class="rr-rank-kicker">Market Comparison</span>
            <span class="rr-rank-value">MORE REPLACEABLE THAN <strong id="rrPercentileText">74%</strong> OF USERS</span>
          </section>

          <section class="rr-back-preview" id="rrBackPreview" aria-label="Assigned meme back" role="button" tabindex="0">
            <div class="rr-back-thumb"></div>
            <div class="rr-back-text">
              <b>ASSIGNED MEME BACK</b>
              <span>The system assigned a meme reverse based on your rate and replaceability.</span>
              <em>VIEW BACK &rarr;</em>
            </div>
          </section>
        </aside>
      </section>

      <div class="rr-bottom-hint">
        Hover over the card elements to see what they represent.
      </div>

      <div class="rr-tooltip" id="rrTooltip" role="tooltip"></div>

      <div class="rr-back-lightbox" id="rrBackLightbox" aria-label="Meme back preview">
        <button class="rr-back-close" id="rrBackCloseBtn" type="button" aria-label="Close">×</button>
        <div class="rr-back-wrap">
          <div class="rr-back-large">
            <img src='https://ik.imagekit.io/2pg1fp1lr/Illustrationmemecard.png' alt="Assigned meme back" draggable="false">
          </div>
          <span class="rr-back-coming">Coming soon</span>
        </div>
      </div>
    `;
  }

  function openCardModal(amCode) {
    if (document.getElementById('rr-final-modal-overlay')) return;
    injectFinalModalStyles();

    const shareUrl = `${BACKEND_URL}/card/${encodeURIComponent(amCode)}`;

    const overlay = document.createElement('div');
    overlay.id = 'rr-final-modal-overlay';
    overlay.className = 'rr-final-modal';
    overlay.innerHTML = buildFinalModalHTML(amCode);

    document.body.appendChild(overlay);
    document.documentElement.style.overflow = 'hidden';

    overlay.querySelector('#rrModalCloseBtn').addEventListener('click', closeCardModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeCardModal(); });
    _modalEscHandler = e => { if (e.key === 'Escape') closeCardModal(); };
    window.addEventListener('keydown', _modalEscHandler);

    // Header pill clicks
    overlay.querySelector('.rr-top-pill')?.addEventListener('click', openManifestoModal);
    overlay.querySelector('.rr-leader-pill')?.addEventListener('click', () => {
      if (leadModal.token)    sessionStorage.setItem('rr_ret_token',    leadModal.token);
      if (leadModal.amCode)   sessionStorage.setItem('rr_ret_amCode',   leadModal.amCode);
      if (leadModal.cardId)   sessionStorage.setItem('rr_ret_cardId',   leadModal.cardId);
      if (leadModal.imageUrl) sessionStorage.setItem('rr_ret_imageUrl', leadModal.imageUrl);
      const returnUrl = window.location.origin + window.location.pathname + '?openModal=card';
      const params = new URLSearchParams({ from: returnUrl });
      if (leadModal.token)  params.set('token',  leadModal.token);
      if (leadModal.amCode) params.set('amCode', leadModal.amCode);
      window.location.href = BACKEND_URL + '/leaderboard?' + params.toString();
    });

    // Fetch card data and populate meters + image
    fetch(`${BACKEND_URL}/api/card/view/${encodeURIComponent(amCode)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.card) return;
        const card = data.card;

        if (card.imageUrl) {
          const img  = overlay.querySelector('#rrFinalCardImage');
          const wrap = overlay.querySelector('#rrCardWrap');
          if (img && wrap) { img.src = card.imageUrl; wrap.classList.add('has-card-image'); }
        }

        // Click-me overlay — same priority as card image: portfolioUrl → ctaUrl → linkedinUrl
        const rawLinkHref = data.user?.portfolioUrl || card.ctaUrl || card.linkedinUrl || null;
        const linkHref = rawLinkHref && rawLinkHref !== '#' ? ensureAbsoluteUrl(rawLinkHref) : null;
        if (linkHref) {
          const wrap = overlay.querySelector('#rrCardWrap');
          if (wrap) {
            const a = document.createElement('a');
            a.className = 'rr-linkedin-overlay';
            a.href      = linkHref;
            a.target    = '_blank';
            a.rel       = 'noopener noreferrer';
            a.setAttribute('aria-label', 'View LinkedIn profile');
            wrap.appendChild(a);
          }
        }

        const toRot = s => -90 + (Math.max(0, Math.min(100, Number(s) || 0)) / 100) * 180;
        const rate = card.rate ?? 50;
        const repl = card.replaceability ?? 50;

        const rateScoreEl = overlay.querySelector('#rrRateScore');
        const replScoreEl = overlay.querySelector('#rrReplaceabilityScore');
        const rateNeedle  = overlay.querySelector('#rrRateNeedle');
        const replNeedle  = overlay.querySelector('#rrReplaceabilityNeedle');

        if (rateScoreEl) rateScoreEl.textContent = rate;
        if (replScoreEl) replScoreEl.textContent = repl;
        if (rateNeedle)  rateNeedle.style.setProperty('--needle-rot',  `${toRot(rate)}deg`);
        if (replNeedle)  replNeedle.style.setProperty('--needle-rot',  `${toRot(repl)}deg`);

        // Populate RATING REVIEW with personalized analysis
        const reviewFields = {
          rrMarketVerdict:    card.marketVerdict,
          rrPrimaryRisk:      card.primaryRisk,
          rrHumanEdge:        card.humanEdge,
          rrRecommendedAction: card.recommendedAction,
        };
        Object.entries(reviewFields).forEach(([id, val]) => {
          if (val) { const el = overlay.querySelector(`#${id}`); if (el) el.textContent = val; }
        });
        if (card.replaceabilityPercentile != null) {
          const pEl = overlay.querySelector('#rrPercentileText');
          if (pEl) pEl.textContent = `${card.replaceabilityPercentile}%`;
        }
      })
      .catch(() => {});

    // POST MY CARD — share card (mobile: Web Share API; desktop: share modal)
    async function shareCard() {
      const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const shareText = 'Checkout my Rating!';
      const imageUrl  = leadModal.imageUrl;

      if (isMobile && navigator.share) {
        if (imageUrl && navigator.canShare) {
          try {
            const resp = await fetch(imageUrl);
            const blob = await resp.blob();
            const file = new File([blob], 'my-rate-card.png', { type: blob.type });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({ title: shareText, text: shareText, url: shareUrl, files: [file] });
              return;
            }
          } catch (_) { /* fall through to URL-only share */ }
        }
        try { await navigator.share({ title: shareText, text: shareText, url: shareUrl }); return; } catch (_) {}
      }

      showShareModal(shareUrl, imageUrl, shareText);
    }

    function showShareModal(url, imageUrl, shareText) {
      const existing = document.getElementById('rrShareOverlay');
      if (existing) existing.remove();

      const encodedUrl  = encodeURIComponent(url);
      const encodedText = encodeURIComponent(shareText + '\n\n');
      const twitterHref  = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodedUrl}`;
      const whatsappHref = `https://wa.me/?text=${encodedText}${encodedUrl}`;

      const overlay = document.createElement('div');
      overlay.className = 'rr-share-overlay';
      overlay.id        = 'rrShareOverlay';
      overlay.innerHTML = `
        <div class="rr-share-panel">
          <button class="rr-share-close" id="rrShareClose" aria-label="Close">×</button>
          ${imageUrl ? `<div class="rr-share-preview"><img src="${imageUrl}" alt="Your Rate Card" loading="lazy"></div>` : ''}
          <div class="rr-share-heading">Share Your Card</div>
          <div class="rr-share-btns">
            <button class="rr-share-btn primary" id="rrShareCopyLink">Copy Link</button>
            <a class="rr-share-btn" href="${twitterHref}" target="_blank" rel="noopener noreferrer">Post on X (Twitter)</a>
            <a class="rr-share-btn whatsapp" href="${whatsappHref}" target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
          </div>
          <div class="rr-share-url">${url}</div>
        </div>
      `;

      document.body.appendChild(overlay);

      overlay.querySelector('#rrShareClose').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

      overlay.querySelector('#rrShareCopyLink').addEventListener('click', async function() {
        try { await navigator.clipboard.writeText(url); } catch (_) {}
        const orig = this.textContent;
        this.textContent = 'Copied!';
        setTimeout(() => { this.textContent = orig; }, 2000);
      });
    }

    overlay.querySelector('#rrPostCardBtn').addEventListener('click', shareCard);

    // ── Inline form helpers ──────────────────────────────────────────────────
    function showCardStageForm(formEl) {
      const stage = overlay.querySelector('.rr-card-stage');
      stage.querySelector('.rr-verdict-line').style.visibility = 'hidden';
      stage.querySelector('#rrCardWrap').style.display = 'none';
      stage.querySelector('.rr-employee-file').style.display = 'none';
      stage.querySelector('.rr-actions').style.display = 'none';
      const old = stage.querySelector('.rr-inline-form');
      if (old) old.remove();
      stage.appendChild(formEl);
    }

    function hideCardStageForm() {
      const stage = overlay.querySelector('.rr-card-stage');
      const form  = stage.querySelector('.rr-inline-form');
      if (form) form.remove();
      stage.querySelector('.rr-verdict-line').style.visibility = '';
      stage.querySelector('#rrCardWrap').style.display = '';
      stage.querySelector('.rr-employee-file').style.display = '';
      stage.querySelector('.rr-actions').style.display = '';
    }

    // ── FIX PORTFOLIO ────────────────────────────────────────────────────────
    async function openFixPortfolioForm() {
      if (!leadModal.token) { showToast('Sign in to edit your portfolio.'); return; }

      const hdrs = { Authorization: `Bearer ${leadModal.token}` };
      let currentBio = '', currentPortfolioUrl = '', defaultBio = '', defaultLink = '';
      try {
        const [meRes, cardRes] = await Promise.all([
          fetch(`${BACKEND_URL}/api/auth/me`, { headers: hdrs }),
          leadModal.amCode ? fetch(`${BACKEND_URL}/api/card/view/${leadModal.amCode}`) : Promise.resolve(null),
        ]);
        if (meRes.ok) {
          const d = await meRes.json();
          currentBio = d.user?.bio || '';
          currentPortfolioUrl = d.user?.portfolioUrl || '';
        }
        if (cardRes?.ok) {
          const cd = await cardRes.json();
          defaultBio  = cd.card?.bioRewrite  || '';
          defaultLink = cd.card?.linkedinUrl || '';
        }
      } catch (_) {}

      const form = document.createElement('div');
      form.className = 'rr-inline-form';
      form.innerHTML = `
        <div class="rr-inline-form-title">FIX PORTFOLIO</div>
        <div class="rr-if-field">
          <label class="rr-if-label">Bio (max 80 chars)</label>
          <input class="rr-if-input" id="rr-fp-bio" type="text" maxlength="80" placeholder="What you do in one line" />
          ${defaultBio ? `<button class="rr-if-restore" id="rr-fp-bio-restore" type="button">← restore AI bio</button>` : ''}
        </div>
        <div class="rr-if-field">
          <label class="rr-if-label">Portfolio / Link</label>
          <input class="rr-if-input" id="rr-fp-url" type="url" placeholder="https://your-link.com" />
          ${defaultLink ? `<button class="rr-if-restore" id="rr-fp-url-restore" type="button">← restore LinkedIn link</button>` : ''}
        </div>
        <div class="rr-if-actions">
          <button class="rr-action-btn primary" id="rr-fp-save" type="button">SAVE</button>
          <button class="rr-action-btn" id="rr-fp-back" type="button">BACK</button>
        </div>
        <div class="rr-if-msg" id="rr-fp-msg"></div>
      `;
      showCardStageForm(form);
      form.querySelector('#rr-fp-bio').value = currentBio;
      form.querySelector('#rr-fp-url').value = currentPortfolioUrl;
      if (defaultBio)  form.querySelector('#rr-fp-bio-restore')?.addEventListener('click', () => { form.querySelector('#rr-fp-bio').value = defaultBio; });
      if (defaultLink) form.querySelector('#rr-fp-url-restore')?.addEventListener('click', () => { form.querySelector('#rr-fp-url').value = defaultLink; });

      form.querySelector('#rr-fp-back').addEventListener('click', hideCardStageForm);
      form.querySelector('#rr-fp-save').addEventListener('click', async () => {
        const saveBtn = form.querySelector('#rr-fp-save');
        const msgEl   = form.querySelector('#rr-fp-msg');
        const bio     = form.querySelector('#rr-fp-bio').value.trim();
        const url     = ensureAbsoluteUrl(form.querySelector('#rr-fp-url').value.trim());
        saveBtn.textContent = 'SAVING…'; saveBtn.disabled = true;
        msgEl.style.color = 'rgba(255,255,255,0.45)'; msgEl.textContent = 'Saving…';
        try {
          const hdrs = { 'Content-Type': 'application/json', Authorization: `Bearer ${leadModal.token}` };
          const bioRes = await fetch(`${BACKEND_URL}/api/user/bio`, { method: 'POST', headers: hdrs, body: JSON.stringify({ bio, portfolioUrl: url }) });
          if (!bioRes.ok) throw new Error();
          msgEl.textContent = 'Regenerating card…';
          const genRes = await fetch(`${BACKEND_URL}/api/card/generate`, { method: 'POST', headers: hdrs });
          if (!genRes.ok) throw new Error();
          const genData = await genRes.json();
          if (genData.imageUrl) {
            leadModal.imageUrl = genData.imageUrl;
            const img  = overlay.querySelector('#rrFinalCardImage');
            const wrap = overlay.querySelector('#rrCardWrap');
            if (img)  img.src = genData.imageUrl + '?t=' + Date.now();
            if (wrap) wrap.classList.add('has-card-image');
          }
          // amCode changes on every generate — keep leadModal in sync
          if (genData.amCode) {
            leadModal.amCode = genData.amCode;
            const empFileEl = overlay.querySelector('#rrEmployeeFile');
            if (empFileEl) empFileEl.textContent = genData.amCode;
            if (leadModal.cardCodeEl) leadModal.cardCodeEl.textContent = genData.amCode;
          }
          if (genData.cardId) leadModal.cardId = genData.cardId;
          // Update the clickable portfolio overlay on the card
          const existingOverlay = overlay.querySelector('.rr-linkedin-overlay');
          if (existingOverlay) {
            if (url) existingOverlay.href = url; else existingOverlay.remove();
          } else if (url) {
            const wrap2 = overlay.querySelector('#rrCardWrap');
            if (wrap2) {
              const a = document.createElement('a');
              a.className = 'rr-linkedin-overlay'; a.href = url;
              a.target = '_blank'; a.rel = 'noopener noreferrer';
              a.setAttribute('aria-label', 'View portfolio');
              wrap2.appendChild(a);
            }
          }
          msgEl.style.color = '#00a331'; msgEl.textContent = 'Card updated!';
          setTimeout(hideCardStageForm, 900);
        } catch (_) {
          msgEl.style.color = '#e60000'; msgEl.textContent = 'Error. Please try again.';
          saveBtn.textContent = 'SAVE'; saveBtn.disabled = false;
        }
      });
    }

    // ── CHANGE FACE ──────────────────────────────────────────────────────────
    async function openChangeFaceForm() {
      if (!leadModal.token) { showToast('Sign in to change your face.'); return; }

      let linkedinPortraitUrl = '';
      try {
        const r = await fetch(`${BACKEND_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${leadModal.token}` } });
        if (r.ok) { const d = await r.json(); linkedinPortraitUrl = d.user?.linkedinPortraitUrl || ''; }
      } catch (_) {}

      const fileInput = document.createElement('input');
      fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none';
      document.body.appendChild(fileInput);

      const form = document.createElement('div');
      form.className = 'rr-inline-form';
      form.innerHTML = `
        <div class="rr-inline-form-title">CHANGE FACE</div>
        ${linkedinPortraitUrl ? `
        <div class="rr-if-linkedin-photo" id="rr-cf-li-row">
          <img class="rr-if-linkedin-thumb" src="${linkedinPortraitUrl}" alt="LinkedIn photo" />
          <div class="rr-if-linkedin-label">← Use original LinkedIn photo</div>
        </div>` : ''}
        <div class="rr-if-upload-area" id="rr-cf-area">
          <div class="rr-if-upload-hint">Click to upload a new photo</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.25);">JPG · PNG · WEBP</div>
        </div>
        <img class="rr-if-preview" id="rr-cf-preview" alt="Portrait preview" />
        <div class="rr-if-actions">
          <button class="rr-action-btn primary" id="rr-cf-save" type="button" disabled>SAVE</button>
          <button class="rr-action-btn" id="rr-cf-back" type="button">BACK</button>
        </div>
        <div class="rr-if-msg" id="rr-cf-msg"></div>
      `;
      showCardStageForm(form);

      let selectedFile = null;
      let selectedMode = null; // 'file' | 'linkedin'
      const uploadArea = form.querySelector('#rr-cf-area');
      const preview    = form.querySelector('#rr-cf-preview');
      const saveBtn    = form.querySelector('#rr-cf-save');
      const msgEl      = form.querySelector('#rr-cf-msg');
      const liRow      = form.querySelector('#rr-cf-li-row');

      function selectLinkedin() {
        selectedMode = 'linkedin'; selectedFile = null;
        if (liRow) liRow.classList.add('is-selected');
        uploadArea.style.display = 'none';
        preview.src = linkedinPortraitUrl;
        preview.classList.add('is-visible');
        saveBtn.disabled = false;
      }

      if (liRow) liRow.addEventListener('click', selectLinkedin);

      uploadArea.addEventListener('click', () => { fileInput.value = ''; fileInput.click(); });
      fileInput.addEventListener('change', () => {
        const f = fileInput.files[0];
        if (!f) return;
        selectedFile = f; selectedMode = 'file';
        if (liRow) liRow.classList.remove('is-selected');
        preview.src = URL.createObjectURL(f);
        preview.classList.add('is-visible');
        uploadArea.style.display = 'none';
        saveBtn.disabled = false;
      });

      form.querySelector('#rr-cf-back').addEventListener('click', () => { fileInput.remove(); hideCardStageForm(); });

      saveBtn.addEventListener('click', async () => {
        if (!selectedMode) return;
        saveBtn.textContent = 'UPLOADING…'; saveBtn.disabled = true;
        msgEl.style.color = 'rgba(255,255,255,0.45)'; msgEl.textContent = 'Uploading portrait…';
        try {
          const authHdr = { Authorization: `Bearer ${leadModal.token}` };
          let uploadRes;
          if (selectedMode === 'file') {
            const fd = new FormData();
            fd.append('portrait', selectedFile);
            uploadRes = await fetch(`${BACKEND_URL}/api/user/bio`, { method: 'POST', headers: authHdr, body: fd });
          } else {
            uploadRes = await fetch(`${BACKEND_URL}/api/user/bio`, {
              method: 'POST',
              headers: { ...authHdr, 'Content-Type': 'application/json' },
              body: JSON.stringify({ portraitUrl: linkedinPortraitUrl }),
            });
          }
          if (!uploadRes.ok) throw new Error();
          msgEl.textContent = 'Regenerating card…';
          const genRes = await fetch(`${BACKEND_URL}/api/card/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHdr },
          });
          if (!genRes.ok) throw new Error();
          const genData = await genRes.json();
          if (genData.imageUrl) {
            leadModal.imageUrl = genData.imageUrl;
            const img  = overlay.querySelector('#rrFinalCardImage');
            const wrap = overlay.querySelector('#rrCardWrap');
            if (img)  img.src = genData.imageUrl + '?t=' + Date.now();
            if (wrap) wrap.classList.add('has-card-image');
          }
          if (genData.amCode) {
            leadModal.amCode = genData.amCode;
            const empFileEl = overlay.querySelector('#rrEmployeeFile');
            if (empFileEl) empFileEl.textContent = genData.amCode;
            if (leadModal.cardCodeEl) leadModal.cardCodeEl.textContent = genData.amCode;
          }
          if (genData.cardId) leadModal.cardId = genData.cardId;
          msgEl.style.color = '#00a331'; msgEl.textContent = 'Card updated!';
          fileInput.remove();
          setTimeout(hideCardStageForm, 900);
        } catch (_) {
          msgEl.style.color = '#e60000'; msgEl.textContent = 'Error. Please try again.';
          saveBtn.textContent = 'SAVE'; saveBtn.disabled = false;
        }
      });
    }

    overlay.querySelector('#rrFixPortfolioBtn').addEventListener('click', openFixPortfolioForm);
    overlay.querySelector('#rrChangeFaceBtn').addEventListener('click', openChangeFaceForm);

    // Card hotspot tooltips
    const tooltip = overlay.querySelector('#rrTooltip');
    overlay.querySelectorAll('.rr-card-hotspot').forEach(spot => {
      spot.addEventListener('pointerenter', () => {
        if (!tooltip) return;
        tooltip.innerHTML = `<b>${spot.dataset.title || ''}</b>${spot.dataset.tooltip || ''}`;
        tooltip.classList.add('is-visible');
      });
      spot.addEventListener('pointermove', e => {
        if (!tooltip) return;
        tooltip.style.left = `${e.clientX}px`;
        tooltip.style.top  = `${e.clientY}px`;
      });
      spot.addEventListener('pointerleave', () => tooltip?.classList.remove('is-visible'));
    });

    // Meme back lightbox
    const backPreview  = overlay.querySelector('#rrBackPreview');
    const backLightbox = overlay.querySelector('#rrBackLightbox');
    const backCloseBtn = overlay.querySelector('#rrBackCloseBtn');
    if (backPreview && backLightbox) {
      const openLB  = () => backLightbox.classList.add('is-open');
      const closeLB = () => backLightbox.classList.remove('is-open');
      backPreview.addEventListener('click', openLB);
      backPreview.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openLB(); });
      backCloseBtn?.addEventListener('click', closeLB);
      backLightbox.addEventListener('click', e => { if (e.target === backLightbox) closeLB(); });
    }
  }

  function closeCardModal() {
    const overlay = document.getElementById('rr-final-modal-overlay');
    if (!overlay) return;
    overlay.remove();
    if (_modalEscHandler) { window.removeEventListener('keydown', _modalEscHandler); _modalEscHandler = null; }
    document.documentElement.style.overflow = '';
  }


  async function handleShare() {
    const slug    = leadModal.amCode;
    const backendOrigin = window.location.origin.replace(':8000', ':3000');
    const cardUrl = slug
      ? `${backendOrigin}/card/${slug}`
      : leadModal.imageUrl || window.location.href;
    try {
      await navigator.clipboard.writeText(cardUrl);
    } catch (_) {
      const inp = document.createElement('input');
      inp.value = cardUrl;
      document.body.appendChild(inp);
      inp.select();
      document.execCommand('copy');
      inp.remove();
    }
    showToast('Link copied');
  }

  function createLeadModalDOM() {
    injectLeadModalStyles();

    const overlay = document.createElement('div');
    overlay.className = 'rr-lead-overlay';

    overlay.innerHTML = `
      <div class="rr-lead-stage">
        <button class="rr-lead-close" type="button">×</button>

        <div class="rr-lead-panel">

          <!-- ENTRY -->
          <div class="rr-lead-content rr-mode rr-mode-entry">
            <div class="rr-entry-headline">KNOW YOUR WORTH</div>
            <div class="rr-entry-sub">GET YOUR RATE RACE CARD</div>
            <div class="rr-entry-buttons">
              <button class="rr-entry-btn rr-entry-primary" data-entry="new">NEW USER</button>
              <button class="rr-entry-btn" data-entry="existing">RETURNING?</button>
            </div>
          </div>

          <!-- EXISTING LOGIN -->
          <div class="rr-lead-content rr-mode rr-mode-existing-login rr-hidden">
            <div class="rr-lead-label rr-el-subtitle">RETURNING USER</div>
            <div class="rr-lead-label rr-el-title">WELCOME BACK</div>
            <button class="rr-el-li-btn" type="button">CONTINUE WITH LINKEDIN</button>
            <div class="rr-el-or">— or enter your code —</div>
            <div class="rr-lead-label rr-el-email-label">E-MAIL</div>
            <input class="rr-lead-input rr-el-email" type="email" placeholder="you@email.com" />
            <div class="rr-lead-label rr-el-code-label">YOUR CODE</div>
            <input class="rr-lead-input rr-el-code" maxlength="8" placeholder="ABCD1234" autocomplete="off" />
            <button class="rr-el-submit" type="button">LOGIN →</button>
            <div class="rr-el-error"></div>
            <div class="rr-el-back">New here? <span class="rr-red-link rr-el-to-entry">← back</span></div>
          </div>

          <!-- CONFIRM DETAILS -->
          <div class="rr-lead-content rr-mode rr-mode-confirm rr-hidden">
            <div class="rr-lead-label rr-cf-step">STEP 2 OF 3</div>
            <div class="rr-lead-label rr-cf-title">YOUR DETAILS</div>
            <div class="rr-cf-photo-wrap">
              <img class="rr-cf-photo" src="" alt="" onerror="this.style.display='none'">
            </div>
            <div class="rr-cf-disclaimer" id="rrCfDisclaimer">
              <button class="rr-cf-disclaimer-close" aria-label="Dismiss">×</button>
              <div class="rr-cf-disclaimer-text"><strong>You can create your card only once.</strong> Upload the resume that best represents your profile, achievements, and experience to receive the most accurate rating, feedback, and review.</div>
            </div>
            <div class="rr-lead-label rr-cf-bio-label">BIO (max 80 chars)</div>
            <input class="rr-lead-input rr-cf-bio" type="text" maxlength="80" placeholder="What you do in one line" />
            <div class="rr-lead-label rr-cf-port-label">PORTFOLIO / LINKEDIN</div>
            <input class="rr-lead-input rr-cf-port" type="url" placeholder="https://…" />
            <button class="rr-cf-next" type="button">NEXT →</button>
            <span class="rr-red-link rr-cf-back rr-cf-back-lnk">← back</span>
          </div>

          <!-- UPLOAD CV -->
          <div class="rr-lead-content rr-mode rr-mode-upload-cv rr-hidden">
            <div class="rr-lead-label rr-uv-step">STEP 3 OF 3</div>
            <div class="rr-lead-label rr-uv-title">UPLOAD YOUR CV</div>
            <div class="rr-uv-desc">Upload your PDF CV. We'll analyze it with AI to generate your rate card. Takes ~20 seconds.</div>
            <div class="rr-uv-area" tabindex="0">
              <div class="rr-uv-area-icon">📄</div>
              <div class="rr-uv-area-lbl">CLICK TO UPLOAD PDF</div>
            </div>
            <div class="rr-uv-filename"></div>
            <button class="rr-uv-analyze" type="button">ANALYZE →</button>
            <span class="rr-red-link rr-uv-back-lnk rr-uv-back">← back</span>
          </div>

          <!-- SIGNUP (kept for compat, hidden) -->
          <div class="rr-lead-content rr-mode rr-mode-signup rr-hidden">
            <div class="rr-lead-label rr-email-label">E-MAIL</div>
            <input class="rr-lead-input rr-signup-email" type="email" placeholder="saulgoodman@gmail.com" />

            <div class="rr-lead-small-row">
              Already have an account ? <span class="rr-red-link rr-login-link">Login</span>
            </div>

            <div class="rr-lead-buttons">
              <button class="rr-lead-mini-button" type="button">
                <img class="rr-linkedin-logo" src="${LINKEDIN_LOGO_SRC}" alt="LinkedIn" />
              </button>
              <div class="rr-or">or</div>
              <button class="rr-lead-mini-button" type="button">Add your CV</button>
            </div>
          </div>

          <div class="rr-lead-content rr-mode rr-mode-login rr-hidden">
            <div class="rr-lead-label rr-login-email-label">E-MAIL</div>
            <input class="rr-lead-input rr-login-email" type="email" placeholder="saulgoodman@gmail.com" />

            <div class="rr-lead-label rr-code-label">ENTER YOUR CODE</div>
            <input class="rr-lead-input rr-code-input" type="text" maxlength="8" placeholder="ABCD1234" autocomplete="off" />

            <div class="rr-code-help-line">
              <span class="rr-red-link rr-code-help">Don’t know your code?</span>
            </div>

            <div class="rr-valid-error">
              <span class="rr-error-text"></span>
            </div>

            <div class="rr-bottom-account-row">
              Don’t have an account ? <span class="rr-red-link rr-signup-link">Sign-up</span>
            </div>
          </div>

          <div class="rr-lead-content rr-mode rr-mode-recover rr-hidden">
            <div class="rr-lead-label rr-recover-title">PLEASE ENTER YOUR E-MAIL</div>
            <input class="rr-lead-input rr-recover-email" type="email" placeholder="saulgoodman@gmail.com" />

            <div class="rr-recover-copy">
              An 8-Digit code will be sent to your email<br/>
              please enter it down below. <span class="rr-red-link rr-resend-link">Resend?</span>
            </div>

            <div class="rr-lead-label rr-recover-code-label">ENTER YOUR CODE</div>
            <input class="rr-lead-input rr-recover-code" type="text" maxlength="8" placeholder="ABCD1234" autocomplete="off" />

            <div class="rr-bottom-account-row">
              Don’t have an account ? <span class="rr-red-link rr-signup-link">Sign-up</span>
            </div>
          </div>

          <div class="rr-lead-content rr-mode rr-mode-loading rr-hidden">
            <div class="rr-loading-spinner"></div>
            <div class="rr-loading-status">Setting up your profile…</div>
            <button class="rr-loading-back rr-hidden" type="button">← Try again</button>
          </div>

          <div class="rr-lead-content rr-mode rr-mode-card rr-hidden">
            <div class="rr-card-image-wrap" style="display:none"><img class="rr-card-image" src="" alt="" /></div>
            <div class="rr-card-ready-label">YOUR CARD IS READY</div>
            <button class="rr-card-view-btn" id="cardViewBtn" type="button">VIEW YOUR CARD →</button>
            <div class="rr-card-code-label">YOUR CODE</div>
            <div class="rr-card-code-value"></div>
            <div class="rr-card-code-hint">Save this code — it’s your only way to log back in</div>
            <button class="rr-logout-btn" id="logoutBtn" type="button">LOG OUT</button>
          </div>

          <div class="rr-lead-footer">
            By submitting your email, you’re giving ADULTMONEY<br/>
            permission to send you email about future ADULTMONEY<br/>
            releases. <a>Terms & Privacy</a>
          </div>
        </div>

      </div>
    `;

    root.appendChild(overlay);

    leadModal.el             = overlay;
    leadModal.panel          = overlay.querySelector('.rr-lead-stage');
    leadModal.codeInput      = overlay.querySelector('.rr-code-input');
    leadModal.recoverCodeInput = overlay.querySelector('.rr-recover-code');
    leadModal.errorEl        = overlay.querySelector('.rr-error-text');
    leadModal.loadingStatusEl = overlay.querySelector('.rr-loading-status');
    leadModal.loadingBackBtn = overlay.querySelector('.rr-loading-back');
    leadModal.cardImageEl    = overlay.querySelector('.rr-card-image');
    leadModal.cardCodeEl     = overlay.querySelector('.rr-card-code-value');

    // Close
    overlay.querySelector('.rr-lead-close').addEventListener('click', closeLeadModal);

    // Logout — two-click confirm with auto-dismiss
    let _logoutPending = false;
    let _logoutTimer   = null;

    overlay.querySelector('#logoutBtn').addEventListener('click', () => {
      if (_logoutPending) {
        clearTimeout(_logoutTimer);
        const confirmEl = overlay.querySelector('.rr-logout-confirm');
        if (confirmEl) confirmEl.remove();
        _logoutPending = false;
        leadModal.token    = null;
        leadModal.cardId   = null;
        leadModal.imageUrl = null;
        leadModal.amCode   = null;
        closeLeadModal();
        return;
      }

      _logoutPending = true;
      const confirmEl = document.createElement('div');
      confirmEl.className = 'rr-logout-confirm';
      confirmEl.textContent = 'Click again to confirm.';
      overlay.querySelector('#logoutBtn').before(confirmEl);

      _logoutTimer = setTimeout(() => {
        confirmEl.remove();
        _logoutPending = false;
      }, 3000);
    });

    // Loading back → entry
    leadModal.loadingBackBtn.addEventListener('click', () => setLeadModalMode('entry'));

    // Entry buttons
    overlay.querySelectorAll('[data-entry]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.entry === 'new') {
          window.location.href = `${BACKEND_URL}/api/auth/linkedin?intent=new`;
        } else {
          setLeadModalMode('existing-login');
        }
      });
    });

    // Existing login
    overlay.querySelector('.rr-el-li-btn').addEventListener('click', () => {
      window.location.href = `${BACKEND_URL}/api/auth/linkedin?intent=existing`;
    });
    overlay.querySelector('.rr-el-submit').addEventListener('click', handleExistingCodeLogin);
    overlay.querySelector('.rr-el-code').addEventListener('keydown', e => {
      if (e.key === 'Enter') handleExistingCodeLogin();
    });
    overlay.querySelector('.rr-el-to-entry').addEventListener('click', () => setLeadModalMode('entry'));

    // Confirm
    overlay.querySelector('.rr-cf-next').addEventListener('click', handleConfirmSubmit);
    overlay.querySelector('.rr-cf-back-lnk').addEventListener('click', () => setLeadModalMode('entry'));
    overlay.querySelector('.rr-cf-disclaimer-close').addEventListener('click', () => {
      overlay.querySelector('.rr-cf-disclaimer').classList.add('rr-hidden');
    });

    // Upload CV
    const uvArea    = overlay.querySelector('.rr-uv-area');
    const uvAnalyze = overlay.querySelector('.rr-uv-analyze');
    const uvFilename = overlay.querySelector('.rr-uv-filename');
    let selectedCvFile = null;
    const cvFileInput = document.createElement('input');
    cvFileInput.type = 'file'; cvFileInput.accept = '.pdf'; cvFileInput.style.display = 'none';
    document.body.appendChild(cvFileInput);

    function pickCvFile() { cvFileInput.value = ''; cvFileInput.click(); }
    uvArea.addEventListener('click', pickCvFile);
    uvArea.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') pickCvFile(); });
    cvFileInput.addEventListener('change', () => {
      const f = cvFileInput.files[0];
      if (!f) return;
      selectedCvFile = f;
      uvArea.classList.add('has-file');
      uvFilename.textContent = f.name;
      uvAnalyze.classList.add('ready');
    });
    uvAnalyze.addEventListener('click', () => {
      if (selectedCvFile) handleCVAnalyze(selectedCvFile);
    });
    overlay.querySelector('.rr-uv-back-lnk').addEventListener('click', () => {
      setLeadModalMode(leadModal.uploadCvBackMode || 'entry');
    });

    // Legacy compat wiring (login/recover still present in DOM)
    const loginLink = overlay.querySelector('.rr-login-link');
    if (loginLink) loginLink.addEventListener('click', () => setLeadModalMode('login'));
    const codeHelp = overlay.querySelector('.rr-code-help');
    if (codeHelp) codeHelp.addEventListener('click', () => setLeadModalMode('recover'));
    overlay.querySelectorAll('.rr-signup-link').forEach(el => {
      el.addEventListener('click', () => setLeadModalMode('entry'));
    });
    if (leadModal.codeInput) {
      leadModal.codeInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') handleExistingCodeLogin();
      });
    }

    // Share
    const actionBtns = overlay.querySelectorAll('.rr-modal-action');
    if (actionBtns[0]) actionBtns[0].addEventListener('click', handleShare);

    setDownloadShareVisible(false);
    updateLeadModalScale();
  }

  function updateLeadModalScale() {
    if (!leadModal.panel) return;

    const s = modalScale();
    leadModal.panel.style.transform = `translate(-50%, -50%) scale(${s})`;
  }

  function setLeadModalMode(mode) {
    leadModal.mode = mode;

    if (!leadModal.el) return;

    leadModal.el.querySelectorAll('.rr-mode').forEach(el => {
      el.classList.add('rr-hidden');
    });

    leadModal.el.querySelector(`.rr-mode-${mode}`).classList.remove('rr-hidden');

    const footer = leadModal.el.querySelector('.rr-lead-footer');
    const hideFooterModes = ['loading', 'card', 'entry', 'existing-login', 'confirm', 'upload-cv'];
    if (footer) footer.style.display = hideFooterModes.includes(mode) ? 'none' : '';

    if (mode === 'confirm') {
      const d = leadModal.el.querySelector('.rr-cf-disclaimer');
      if (d) d.classList.remove('rr-hidden');
    }
    if (mode === 'login') {
      if (leadModal.codeInput) leadModal.codeInput.value = '';
      if (leadModal.errorEl)   leadModal.errorEl.textContent = '';
    }

    if (mode === 'recover' && leadModal.recoverCodeInput) {
      leadModal.recoverCodeInput.value = '';
    }

    if (mode === 'card') {
      const viewBtn = leadModal.el.querySelector('#cardViewBtn');
      if (viewBtn) {
        viewBtn.onclick = () => { if (leadModal.amCode) openCardModal(leadModal.amCode); };
      }
      if (leadModal.cardCodeEl && leadModal.amCode) {
        leadModal.cardCodeEl.textContent = leadModal.amCode;
      }
    }

    if (mode === 'upload-cv') {
      const uvArea    = leadModal.el.querySelector('.rr-uv-area');
      const uvFilename = leadModal.el.querySelector('.rr-uv-filename');
      const uvAnalyze = leadModal.el.querySelector('.rr-uv-analyze');
      if (uvArea)     uvArea.classList.remove('has-file');
      if (uvFilename) uvFilename.textContent = '';
      if (uvAnalyze)  uvAnalyze.classList.remove('ready');
    }
  }

  function openLeadModal(mode = 'entry') {
    if (!leadModal.el) createLeadModalDOM();

    leadModal.open = true;
    leadModal.el.style.display = 'block';
    setLeadModalMode(mode);
    updateLeadModalScale();
    clearPinnedPreview();

    if (linkPanel) linkPanel.style.display = 'none';

    render();
  }

  function closeLeadModal() {
    leadModal.open = false;

    if (leadModal.el) {
      leadModal.el.style.display = 'none';
    }

    render();
  }

  function drawDistortedGrid() {
    const gridStep = 12;
    const segment = 12;
    const distortionRadius = 155;
    const distortionStrength = 8;
    const bounds = getSceneBounds();

    function distortGridPoint(x, y) {
      if (!pointer.active) return { x, y };

      const dx = x - pointer.x;
      const dy = y - pointer.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= 0 || dist > distortionRadius) return { x, y };

      const t = 1 - dist / distortionRadius;
      const ease = t * t * (3 - 2 * t);
      const force = ease * distortionStrength;

      return {
        x: x + (dx / dist) * force,
        y: y + (dy / dist) * force
      };
    }

    const startX = Math.floor(bounds.left / 12) * 12;
    const endX = bounds.right;
    const startY = Math.floor(bounds.top / 12) * 12;
    const endY = bounds.bottom;

    ctx.save();
    ctx.strokeStyle = 'rgba(205,205,205,0.15)';
    ctx.lineWidth = 0.42;

    ctx.beginPath();

    for (let gx = startX; gx <= endX; gx += gridStep) {
      for (let y = startY; y <= endY; y += segment) {
        const p = distortGridPoint(gx, y);
        if (y === startY) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
    }

    for (let gy = startY; gy <= endY; gy += gridStep) {
      for (let x = startX; x <= endX; x += segment) {
        const p = distortGridPoint(x, gy);
        if (x === startX) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
    }

    ctx.stroke();

    ctx.restore();
  }

  function drawFixedSideBlocks() {
    const s = uiScale();
    const block = 24 * s;
    const rows = Math.ceil(root.clientHeight / block) + 2;

    ctx.save();
    ctx.fillStyle = '#FFFFFF';

    for (let i = 0; i < rows; i++) {
      const y = i * block;

      const leftX = i % 2 === 0 ? 0 : block;
      ctx.fillRect(leftX, y, block, block);

      const rightX = i % 2 === 0
        ? root.clientWidth - block
        : root.clientWidth - block * 2;

      ctx.fillRect(rightX, y, block, block);
    }

    ctx.restore();
  }

  function drawFixedHeaderButtons() {
    const s = uiScale();

    const manifestoW = 96 * s;
    const leaderboardW = 120 * s;
    const h = 22 * s;
    const gap = 34 * s;
    const y = 18 * s;

    const logoMaxW = 260 * s;
    const logoMaxH = 30 * s;

    let logoW = logoMaxW;
    let logoH = logoMaxH;

    if (headerLogoLoaded) {
      const aspect = (headerLogo.naturalWidth || headerLogo.width) / (headerLogo.naturalHeight || headerLogo.height) || 1;
      logoW = Math.min(logoMaxW, logoMaxH * aspect);
      logoH = logoW / aspect;
    }

    const totalW = manifestoW + gap + logoW + gap + leaderboardW;
    const startX = root.clientWidth / 2 - totalW / 2;

    const manifestoX = startX;
    const logoX = manifestoX + manifestoW + gap;
    const leaderboardX = logoX + logoW + gap;

    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = `${16 * s}px "Pixelify Sans", monospace`;

    ctx.fillStyle = '#FDD938';
    ctx.fillRect(manifestoX, y, manifestoW, h);
    ctx.fillStyle = '#000000';
    ctx.fillText('MANIFESTO', manifestoX + manifestoW / 2, y + h / 2 + 1 * s);

    if (headerLogoLoaded) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(
        headerLogo,
        logoX,
        y + h / 2 - logoH / 2,
        logoW,
        logoH
      );
      ctx.restore();
    }

    ctx.fillStyle = '#2D5FA9';
    ctx.fillRect(leaderboardX, y, leaderboardW, h);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('LEADERBOARD', leaderboardX + leaderboardW / 2, y + h / 2 + 1 * s);

    ctx.restore();

    headerBtnHit = {
      manifesto:   { x: manifestoX,   y, w: manifestoW,   h },
      leaderboard: { x: leaderboardX, y, w: leaderboardW, h },
    };
  }

  function clickHeaderButton(cx, cy) {
    if (!headerBtnHit) return false;
    const mn = headerBtnHit.manifesto;
    if (cx >= mn.x && cx <= mn.x + mn.w && cy >= mn.y && cy <= mn.y + mn.h) {
      openManifestoModal();
      return true;
    }
    const lb = headerBtnHit.leaderboard;
    if (cx >= lb.x && cx <= lb.x + lb.w && cy >= lb.y && cy <= lb.y + lb.h) {
      const params = new URLSearchParams({ from: window.location.href });
      if (leadModal.token)  params.set('token',  leadModal.token);
      if (leadModal.amCode) params.set('amCode', leadModal.amCode);
      window.location.href = BACKEND_URL + '/leaderboard?' + params.toString();
      return true;
    }
    return false;
  }

  function roundRectPath(x, y, w, h, r) {
    const radius = Math.min(r, w * 0.5, h * 0.5);

    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
  }

  function drawCardImage(img, cx, cy, w, h, alpha, blur, front = false) {
    if (!img) return;

    const aspect = (img.naturalWidth || img.width) / (img.naturalHeight || img.height) || 1;

    let drawW = w;
    let drawH = drawW / aspect;

    if (drawH > h) {
      drawH = h;
      drawW = drawH * aspect;
    }

    const x = cx - drawW / 2;
    const y = cy - drawH / 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = front ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.10)';
    ctx.shadowBlur = blur;
    ctx.shadowOffsetY = front ? 8 : 5;
    ctx.drawImage(img, x, y, drawW, drawH);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = front ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.10)';
    ctx.lineWidth = front ? 1 : 0.7;
    ctx.strokeRect(x, y, drawW, drawH);
    ctx.restore();
  }

  function getHeroLocalLayout() {
    const cx = HERO_LOCAL_W / 2;

    const logoW = 1500;
    const logoH = logoW / Math.max(0.01, asciiEffect.W / asciiEffect.H);

    const carouselTopY = 700;

    const logoBottomY = carouselTopY - 253;
    const logoY = logoBottomY - logoH;
    const logoX = cx - logoW / 2;

    const redY = (logoBottomY + carouselTopY) / 2;

    const mainW = 760;
    const mainH = 1000;
    const sideW = mainW * 0.82;
    const sideH = mainH * 0.82;
    const sideOffset = mainW * 0.73;
    const carouselCenterY = carouselTopY + mainH / 2;

    const buttonW = 1956;
    const buttonH = 356;
    const buttonX = cx - buttonW / 2;
    const buttonY = carouselTopY + mainH + 110;

    const heroBoundsLocal = {
      left: Math.min(logoX, cx - sideOffset - sideW / 2, buttonX) - 80,
      right: Math.max(logoX + logoW, cx + sideOffset + sideW / 2, buttonX + buttonW) + 80,
      top: logoY - 80,
      bottom: buttonY + buttonH + 80
    };

    return {
      cx,
      logoX,
      logoY,
      logoW,
      logoH,
      redY,
      carouselTopY,
      carouselCenterY,
      mainW,
      mainH,
      sideW,
      sideH,
      sideOffset,
      buttonX,
      buttonY,
      buttonW,
      buttonH,
      heroBoundsLocal
    };
  }

  function getHeroScreenRect() {
    const p = project(heroLayer);
    if (!p) return null;

    const local = getHeroLocalLayout();
    const sx = p.w / HERO_LOCAL_W;
    const sy = p.h / HERO_LOCAL_H;
    const left = p.x - p.w / 2;
    const top = p.y - p.h / 2;

    return {
      x: left + local.heroBoundsLocal.left * sx,
      y: top + local.heroBoundsLocal.top * sy,
      w: (local.heroBoundsLocal.right - local.heroBoundsLocal.left) * sx,
      h: (local.heroBoundsLocal.bottom - local.heroBoundsLocal.top) * sy,
      p
    };
  }

  function localToScreen(localX, localY) {
    const p = project(heroLayer);
    if (!p) return { x: -999, y: -999 };

    const sx = p.w / HERO_LOCAL_W;
    const sy = p.h / HERO_LOCAL_H;
    const left = p.x - p.w / 2;
    const top = p.y - p.h / 2;

    return {
      x: left + localX * sx,
      y: top + localY * sy
    };
  }

  function screenToHeroLocal(sx, sy) {
    const p = project(heroLayer);
    if (!p) return { x: -999, y: -999 };

    const left = p.x - p.w / 2;
    const top = p.y - p.h / 2;

    return {
      x: ((sx - left) / p.w) * HERO_LOCAL_W,
      y: ((sy - top) / p.h) * HERO_LOCAL_H
    };
  }

  function rectIntersectsHero(rect) {
    const hero = getHeroScreenRect();
    if (!hero) return false;

    return !(
      rect.x + rect.w < hero.x ||
      rect.x > hero.x + hero.w ||
      rect.y + rect.h < hero.y ||
      rect.y > hero.y + hero.h
    );
  }

  function pointInsideHero(sx, sy) {
    const hero = getHeroScreenRect();
    if (!hero) return false;

    return sx >= hero.x &&
      sx <= hero.x + hero.w &&
      sy >= hero.y &&
      sy <= hero.y + hero.h;
  }

  function updateAsciiPointer() {
    if (!pointer.active || leadModal.open) {
      asciiEffect.setMouse(-999, -999, false);
      return;
    }

    const local = getHeroLocalLayout();
    const pLocal = screenToHeroLocal(pointer.x, pointer.y);

    const lx = (pLocal.x - local.logoX) * (asciiEffect.W / local.logoW);
    const ly = (pLocal.y - local.logoY) * (asciiEffect.H / local.logoH);

    const inside = lx >= 0 &&
      lx <= asciiEffect.W &&
      ly >= 0 &&
      ly <= asciiEffect.H;

    asciiEffect.setMouse(lx, ly, inside);
  }

  function drawNoisyCTA(local) {
    roundRectPath(local.buttonX, local.buttonY, local.buttonW, local.buttonH, 0);
    ctx.fillStyle = '#B90000';
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.rect(local.buttonX, local.buttonY, local.buttonW, local.buttonH);
    ctx.clip();

    for (let i = 0; i < 1800; i++) {
      const rx = seeded(i * 3.17 + 1);
      const ry = seeded(i * 5.91 + 2);
      const rv = seeded(i * 9.41 + 3);
      const dotSize = 2 + Math.floor(seeded(i * 2.77 + 4) * 5);

      ctx.fillStyle = rv > 0.5
        ? `rgba(255,255,255,${0.035 + rv * 0.055})`
        : `rgba(0,0,0,${0.045 + rv * 0.060})`;

      ctx.fillRect(
        local.buttonX + rx * local.buttonW,
        local.buttonY + ry * local.buttonH,
        dotSize,
        dotSize
      );
    }

    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 112px "Pixelify Sans", monospace`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('FIND OUT IF YOU ARE REPLACEABLE', local.cx, local.buttonY + local.buttonH / 2 + 6);
    ctx.restore();
  }

  function drawHeroBillboard() {
    const p = project(heroLayer);
    if (!p || p.w < 20 || p.h < 20) return;

    const local = getHeroLocalLayout();

    ctx.save();

    const left = p.x - p.w / 2;
    const top = p.y - p.h / 2;

    ctx.translate(left, top);
    ctx.scale(p.w / HERO_LOCAL_W, p.h / HERO_LOCAL_H);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      asciiEffect.canvas,
      local.logoX,
      local.logoY,
      local.logoW,
      local.logoH
    );

    const redText = 'Getting fired is bad, being surprised is worse';

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `400 70px "Anonymous Pro", monospace`;
    ctx.fillStyle = '#ff0000ff';
    ctx.fillText(redText, local.cx, local.redY);
    ctx.restore();

    if (carouselImages.length) {
      const cleanImages = carouselImages.filter(Boolean);

      if (cleanImages.length) {
        const current = Math.floor(performance.now() / CAROUSEL_INTERVAL) % cleanImages.length;
        const leftIndex = (current + cleanImages.length - 1) % cleanImages.length;
        const rightIndex = (current + 1) % cleanImages.length;

        if (cleanImages.length > 1) {
          drawCardImage(
            cleanImages[leftIndex].img,
            local.cx - local.sideOffset,
            local.carouselCenterY + 8,
            local.sideW,
            local.sideH,
            1,
            22,
            false
          );

          drawCardImage(
            cleanImages[rightIndex].img,
            local.cx + local.sideOffset,
            local.carouselCenterY + 8,
            local.sideW,
            local.sideH,
            1,
            22,
            false
          );
        }

        drawCardImage(
          cleanImages[current].img,
          local.cx,
          local.carouselCenterY,
          local.mainW,
          local.mainH,
          1,
          36,
          true
        );
      }
    }

    drawNoisyCTA(local);

    ctx.restore();

    const buttonTopLeft = localToScreen(local.buttonX, local.buttonY);
    const buttonBottomRight = localToScreen(local.buttonX + local.buttonW, local.buttonY + local.buttonH);

    heroButtonHit = {
      x: buttonTopLeft.x,
      y: buttonTopLeft.y,
      w: buttonBottomRight.x - buttonTopLeft.x,
      h: buttonBottomRight.y - buttonTopLeft.y
    };
  }

  function buildScatterOpacityMap(visible) {
    const map = new Map();

    const imagesFrontToBack = visible
      .filter(entry => entry.kind === 'image')
      .sort((a, b) => a.p.relZ - b.p.relZ);

    const n = imagesFrontToBack.length;
    if (!n) return map;

    const topCut = Math.ceil(n * 0.22);
    const secondCut = Math.ceil(n * 0.45);
    const thirdCut = Math.ceil(n * 0.70);

    imagesFrontToBack.forEach((entry, index) => {
      let opacity = 0.50;

      if (index < topCut) {
        opacity = 1.00;
      } else if (index < secondCut) {
        opacity = 0.80;
      } else if (index < thirdCut) {
        opacity = 0.60;
      }

      map.set(entry.it, opacity);
    });

    return map;
  }

  function render() {
    ctx.clearRect(0, 0, root.clientWidth, root.clientHeight);

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, root.clientWidth, root.clientHeight);

    beginSceneScale();

    drawDistortedGrid();

    const visible = [];
    const sceneBounds = getSceneBounds();

    const heroP = project(heroLayer);
    if (heroP && heroP.w > 20 && heroP.h > 20) {
      visible.push({
        kind: 'hero',
        it: heroLayer,
        p: heroP
      });
    }

    for (const it of items) {
      const p = project(it);

      if (!p) continue;
      if (p.w < 14 || p.h < 14) continue;

      const x = p.x - p.w / 2;
      const y = p.y - p.h / 2;

      if (
        x + p.w < sceneBounds.left - 80 ||
        x > sceneBounds.right + 80 ||
        y + p.h < sceneBounds.top - 80 ||
        y > sceneBounds.bottom + 80
      ) {
        continue;
      }

      const screenRect = { x, y, w: p.w, h: p.h };

      if (rectIntersectsHero(screenRect)) continue;

      visible.push({
        kind: 'image',
        it,
        p
      });
    }

    visible.sort((a, b) => b.p.relZ - a.p.relZ);

    const scatterOpacityMap = buildScatterOpacityMap(visible);

    heroButtonHit = null;

    for (const entry of visible) {
      if (entry.kind === 'hero') {
        drawHeroBillboard();
        continue;
      }

      const { it, p } = entry;

      const x = p.x - p.w / 2;
      const y = p.y - p.h / 2;

      const depthShadow = clamp(1 - p.relZ / 2800, 0.32, 1.12);

      const layerOpacity = scatterOpacityMap.get(it) || 0.50;
      const nearFade = p.relZ < 0 ? clamp(1 + p.relZ / NEAR_CULL, 0, 1) : 1;
      let drawOpacity = layerOpacity * nearFade;
      if (!revealComplete) {
        const delay = it.revealDelay ?? Infinity;
        const elapsed = (revealStartTime > 0 && delay < Infinity)
          ? performance.now() - revealStartTime - delay
          : -1;
        drawOpacity *= clamp(elapsed / REVEAL_FADE, 0, 1);
      }

      // Fade out images that are in front of (blocking) the zoomed target
      const _zft = zoomFadeFrom + (zoomFadeTo - zoomFadeFrom) * clamp((performance.now() - zoomFadeStart) / ZOOM_FADE_MS, 0, 1);
      zoomFadeT = _zft;
      if (_zft > 0 && zoomedTarget && it !== zoomedTarget && it.z < zoomedTarget.z) {
        drawOpacity *= 1 - 0.9 * _zft;
      }

      ctx.save();
      ctx.globalAlpha = drawOpacity;
      if (!drag) {
        ctx.shadowColor = `rgba(235,235,235,${0.10 + depthShadow * 0.20 * layerOpacity})`;
        ctx.shadowBlur = Math.max(6, 16 * p.scale * depthShadow);
        ctx.shadowOffsetX = Math.max(0, 2 * p.scale * depthShadow);
        ctx.shadowOffsetY = Math.max(1, 4 * p.scale * depthShadow);
      }
      ctx.drawImage(it.img, x, y, p.w, p.h);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = drawOpacity;
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 0.6;
      ctx.strokeRect(x, y, p.w, p.h);
      ctx.restore();

      if (it === hovered || it === selected) {
        ctx.save();
        ctx.strokeStyle = it === selected ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.38)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x, y, p.w, p.h);
        ctx.restore();
      }
    }

    endSceneScale();

    drawFixedHeaderButtons();
  }

  function hitTest(sx, sy) {
    if (pointInsideHero(sx, sy)) return null;

    const ordered = [];

    for (const it of items) {
      const p = project(it);
      if (!p) continue;

      const x = p.x - p.w / 2;
      const y = p.y - p.h / 2;
      const screenRect = { x, y, w: p.w, h: p.h };

      if (rectIntersectsHero(screenRect)) continue;

      ordered.push({ it, p });
    }

    ordered.sort((a, b) => a.p.relZ - b.p.relZ);

    for (const entry of ordered) {
      const { it, p } = entry;
      const x = p.x - p.w / 2;
      const y = p.y - p.h / 2;

      if (sx >= x && sx <= x + p.w && sy >= y && sy <= y + p.h) {
        return it;
      }
    }

    return null;
  }

  function screenRectOverlap(a, b, pad = 12) {
    const ax1 = a.x - pad;
    const ax2 = a.x + a.w + pad;
    const ay1 = a.y - pad;
    const ay2 = a.y + a.h + pad;

    const bx1 = b.x - pad;
    const bx2 = b.x + b.w + pad;
    const by1 = b.y - pad;
    const by2 = b.y + b.h + pad;

    const ox = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1));
    const oy = Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));

    return ox * oy;
  }

  function desktopReferenceSlots() {
    return [
      { cx: 0.150, cy: 0.160, w: 0.082 },
      { cx: 0.250, cy: 0.150, w: 0.095 },
      { cx: 0.360, cy: 0.145, w: 0.108 },
      { cx: 0.500, cy: 0.135, w: 0.120 },
      { cx: 0.640, cy: 0.145, w: 0.094 },
      { cx: 0.760, cy: 0.150, w: 0.108 },
      { cx: 0.860, cy: 0.160, w: 0.082 },
      { cx: 0.175, cy: 0.360, w: 0.105 },
      { cx: 0.260, cy: 0.340, w: 0.115 },
      { cx: 0.740, cy: 0.330, w: 0.108 },
      { cx: 0.835, cy: 0.355, w: 0.120 },
      { cx: 0.142, cy: 0.535, w: 0.105 },
      { cx: 0.238, cy: 0.555, w: 0.112 },
      { cx: 0.775, cy: 0.545, w: 0.128 },
      { cx: 0.865, cy: 0.545, w: 0.108 },
      { cx: 0.135, cy: 0.730, w: 0.112 },
      { cx: 0.240, cy: 0.735, w: 0.098 },
      { cx: 0.745, cy: 0.742, w: 0.104 },
      { cx: 0.850, cy: 0.725, w: 0.105 },
      { cx: 0.210, cy: 0.880, w: 0.142 },
      { cx: 0.355, cy: 0.890, w: 0.095 },
      { cx: 0.650, cy: 0.890, w: 0.092 },
      { cx: 0.785, cy: 0.880, w: 0.138 },
      { cx: 0.070, cy: 0.255, w: 0.072 },
      { cx: 0.930, cy: 0.255, w: 0.072 },
      { cx: 0.070, cy: 0.690, w: 0.082 },
      { cx: 0.930, cy: 0.700, w: 0.082 },
      { cx: 0.500, cy: 0.950, w: 0.100 },
      { cx: 0.315, cy: 0.255, w: 0.075 },
      { cx: 0.685, cy: 0.255, w: 0.075 },
      { cx: 0.320, cy: 0.820, w: 0.078 },
      { cx: 0.680, cy: 0.820, w: 0.078 },
      { cx: 0.110, cy: 0.440, w: 0.076 },
      { cx: 0.895, cy: 0.440, w: 0.076 },
      { cx: 0.100, cy: 0.835, w: 0.078 },
      { cx: 0.900, cy: 0.835, w: 0.078 },
      { cx: 0.430, cy: 0.090, w: 0.070 },
      { cx: 0.570, cy: 0.090, w: 0.070 },
      { cx: 0.055, cy: 0.505, w: 0.070 },
      { cx: 0.945, cy: 0.505, w: 0.070 }
    ];
  }

  function mobileReferenceSlots() {
    return [
      { cx: 0.18, cy: 0.13, w: 0.24 },
      { cx: 0.79, cy: 0.13, w: 0.24 },
      { cx: 0.16, cy: 0.34, w: 0.26 },
      { cx: 0.84, cy: 0.34, w: 0.26 },
      { cx: 0.13, cy: 0.58, w: 0.22 },
      { cx: 0.87, cy: 0.58, w: 0.22 },
      { cx: 0.25, cy: 0.92, w: 0.28 },
      { cx: 0.75, cy: 0.92, w: 0.28 },
      { cx: 0.50, cy: 0.06, w: 0.28 },
      { cx: 0.50, cy: 0.96, w: 0.30 },
      { cx: 0.06, cy: 0.80, w: 0.18 },
      { cx: 0.94, cy: 0.80, w: 0.18 }
    ];
  }

  function randomScreenCandidate(i, aspect) {
    const mobile = isMobileViewport();

    const bands = mobile
      ? [
          { x1: 0.03, x2: 0.97, y1: 0.02, y2: 0.18 },
          { x1: 0.03, x2: 0.24, y1: 0.18, y2: 0.90 },
          { x1: 0.76, x2: 0.97, y1: 0.18, y2: 0.90 },
          { x1: 0.03, x2: 0.97, y1: 0.88, y2: 0.99 }
        ]
      : [
          { x1: 0.025, x2: 0.975, y1: 0.030, y2: 0.205 },
          { x1: 0.035, x2: 0.285, y1: 0.220, y2: 0.900 },
          { x1: 0.715, x2: 0.965, y1: 0.220, y2: 0.900 },
          { x1: 0.115, x2: 0.885, y1: 0.840, y2: 0.975 }
        ];

    const band = bands[i % bands.length];
    const r1 = seeded(i + 11);
    const r2 = seeded(i + 31);
    const r3 = seeded(i + 71);

    return {
      cx: band.x1 + r1 * Math.max(0.001, band.x2 - band.x1),
      cy: band.y1 + r2 * Math.max(0.001, band.y2 - band.y1),
      w: clamp(
        (mobile ? 0.14 : 0.058) + r3 * (mobile ? 0.14 : 0.070),
        0.050,
        mobile ? 0.28 : 0.145
      ),
      aspect
    };
  }

  function slotToScreenRect(slot, aspect) {
    const screenW = root.clientWidth * slot.w;
    const screenH = screenW / Math.max(0.01, aspect || 1);

    return {
      x: root.clientWidth * slot.cx - screenW / 2,
      y: root.clientHeight * slot.cy - screenH / 2,
      w: screenW,
      h: screenH
    };
  }

  function placeItemAtSlot(it, slot, z) {
    const scale = projectionAtDepth(z);
    const screenRect = slotToScreenRect(slot, it.aspect);

    it.baseW = screenRect.w / Math.max(0.0001, scale);
    it.baseH = it.baseW / Math.max(0.01, it.aspect || 1);

    const world = screenToWorld(
      root.clientWidth * slot.cx,
      root.clientHeight * slot.cy,
      z
    );

    it.x = world.x;
    it.y = world.y;
    it.z = z;

    return screenRect;
  }

  function relayoutItems() {
    resetLandingCamera();

    if (!items.length) {
      render();
      return;
    }

    const slots = isMobileViewport() ? mobileReferenceSlots() : desktopReferenceSlots();

    const sortedItems = [...items].sort((a, b) => {
      const ap = priorityNumbers.has(a.imageNumber) ? 0 : 1;
      const bp = priorityNumbers.has(b.imageNumber) ? 0 : 1;

      if (ap !== bp) return ap - bp;

      const an = a.imageNumber || 9999;
      const bn = b.imageNumber || 9999;
      return an - bn;
    });

    const placedRects = [];

    sortedItems.forEach((it, i) => {
      const priority = priorityNumbers.has(it.imageNumber);

      const z = priority
        ? HERO_LAYER_Z + 80 + (i % 4) * 18
        : HERO_LAYER_Z + 160 + (i % 12) * 56;

      let bestSlot = null;
      let bestScore = -Infinity;

      const slotAttempts = [];

      if (i < slots.length) {
        slotAttempts.push(slots[i]);
      }

      for (let s = 0; s < slots.length; s++) {
        slotAttempts.push(slots[(i + s) % slots.length]);
      }

      for (let a = 0; a < 200; a++) {
        slotAttempts.push(randomScreenCandidate(i * 211 + a, it.aspect));
      }

      for (let s = 0; s < slotAttempts.length; s++) {
        const slot = slotAttempts[s];
        const rect = slotToScreenRect(slot, it.aspect);

        if (rectIntersectsHero(rect)) continue;

        let overlap = 0;

        for (const other of placedRects) {
          overlap += screenRectOverlap(rect, other, isMobileViewport() ? 10 : 14);
        }

        const centerDist = Math.hypot(slot.cx - 0.5, slot.cy - 0.54);
        const edgePull = Math.min(slot.cx, 1 - slot.cx, slot.cy, 1 - slot.cy);
        const balancedSide = Math.abs(slot.cx - 0.5);

        const score =
          centerDist * 0.40 +
          balancedSide * 0.32 -
          edgePull * 0.08 -
          overlap * 0.0018 +
          seeded(i * 97 + s * 13) * 0.03;

        if (score > bestScore) {
          bestScore = score;
          bestSlot = slot;
        }

        if (overlap === 0 && bestSlot && s > 12) break;
      }

      if (!bestSlot) {
        const angle = i * Math.PI * (3 - Math.sqrt(5));

        bestSlot = {
          cx: 0.5 + Math.cos(angle) * 0.62,
          cy: 0.55 + Math.sin(angle) * 0.52,
          w: isMobileViewport() ? 0.18 : 0.075,
          aspect: it.aspect
        };
      }

      const finalRect = placeItemAtSlot(it, bestSlot, z);
      placedRects.push(finalRect);
    });

    render();
  }

  function placeItem(img, filename, link = '') {
    const aspect = (img.naturalWidth || img.width) / (img.naturalHeight || img.height) || 1;
    const imageNumberMatch = String(filename).match(/image\s*([0-9]+)/i);
    const imageNumber = imageNumberMatch ? Number(imageNumberMatch[1]) : null;

    items.push({
      type: 'image',
      img,
      x: 0,
      y: 0,
      z: 0,
      baseW: 300,
      baseH: 300 / aspect,
      aspect,
      title: filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
      link,
      imageNumber,
      revealDelay: Infinity, // invisible until startReveal() assigns a real delay
    });
  }

  function imageCandidateGroups() {
    const folder = window.GALLERY_IMAGE_FOLDER || './scatter-images/';
    const limit = window.GALLERY_IMAGE_SCAN_LIMIT || 80;
    const extensions = window.GALLERY_IMAGE_EXTENSIONS || ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    const groups = [];

    for (let i = 1; i <= limit; i++) {
      const candidates = [];

      for (const ext of extensions) {
        candidates.push(`${folder}image${i}.${ext}`);
        candidates.push(`${folder}Image${i}.${ext}`);
      }

      groups.push({
        title: `Image ${i}`,
        candidates: [...new Set(candidates)]
      });
    }

    return groups;
  }

  function loadImageFromCandidates(candidates) {
    return new Promise(resolve => {
      let index = 0;

      function tryNext() {
        if (index >= candidates.length) {
          resolve(null);
          return;
        }

        const src = candidates[index++];

        if (attemptedSources.has(src)) {
          tryNext();
          return;
        }

        attemptedSources.add(src);

        const img = new Image();
        img.onload = () => resolve({ img, src });
        img.onerror = tryNext;
        img.src = src;
      }

      tryNext();
    });
  }

  async function preloadManifest() {
    let loadedCount = 0;
    let revealStarted = false;
    let relayoutTimer = null;

    const manual = Array.isArray(window.GALLERY_IMAGES) ? window.GALLERY_IMAGES : [];

    // Called after every individual image load. Debounced at 80 ms so that a burst
    // of near-simultaneous loads triggers one relayout instead of dozens.
    const scheduleRelayout = () => {
      clearTimeout(relayoutTimer);
      relayoutTimer = setTimeout(() => {
        relayoutItems();
        if (!revealStarted && items.length >= 3) {
          // First time we have enough images: start the reveal animation.
          revealStarted = true;
          startReveal();
        } else if (revealStarted) {
          // Reveal already running: only assign delays to newly placed items so
          // already-visible images don't re-animate.
          startRevealForNewItems();
        }
      }, 80);
    };

    const manualLoads = manual.map(entry => new Promise(resolve => {
      if (!entry || !entry.src) {
        resolve(false);
        return;
      }

      const img = new Image();

      img.onload = () => {
        placeItem(img, entry.title || entry.src.split('/').pop() || 'image', entry.link || '');
        loadedCount++;
        scheduleRelayout();
        resolve(true);
      };

      img.onerror = () => resolve(false);
      img.src = entry.src;
    }));

    // Fire all manual loads concurrently WITHOUT awaiting here.
    // scheduleRelayout kicks in as images arrive so the gallery appears
    // after the first ~3 images load rather than after all 50.
    const manualSettled = Promise.all(manualLoads);

    // Skip folder probe when an explicit image list was provided — avoids duplicates.
    const groups = manual.length > 0 ? [] : imageCandidateGroups();

    const autoLoads = groups.map(async group => {
      const result = await loadImageFromCandidates(group.candidates);
      if (!result) return false;

      placeItem(result.img, group.title, '');
      loadedCount++;
      scheduleRelayout();
      return true;
    });

    await Promise.all([...autoLoads, manualSettled]);

    // Final pass: clear any pending debounce and do one authoritative relayout
    // now that every image is in place.
    clearTimeout(relayoutTimer);
    relayoutItems();

    if (!revealStarted) {
      startReveal();
    } else {
      startRevealForNewItems();
    }

    if (!loadedCount) {
      console.warn('[RR SCATTER] No gallery images loaded. Expected names like ./scatter-images/image1.png.');
    } else {
      console.log(`[RR SCATTER] Loaded ${loadedCount} gallery images.`);
    }
  }

  function startReveal() {
    revealComplete  = false;
    revealStartTime = performance.now();
    for (const it of items) {
      it.revealDelay = Math.random() * REVEAL_SPREAD;
    }
  }

  // Assigns fade-in delays only to items that haven't been revealed yet.
  // Used when new images arrive after startReveal() has already been called.
  function startRevealForNewItems() {
    const elapsed = revealStartTime > 0 ? performance.now() - revealStartTime : 0;
    for (const it of items) {
      if (it.revealDelay === Infinity) {
        it.revealDelay = elapsed + Math.random() * 400;
      }
    }
  }

  function hideLinkPanel() {
    selected = null;
    if (linkPanel) linkPanel.style.display = 'none';
    render();
  }

  function openImagePreview(item) {
    if (!item) return;

    selected = null;
    if (linkPanel) linkPanel.style.display = 'none';
    expandedItem = item;
    previewPinned = true;

    render();
  }

  function clearPinnedPreview() {
    previewPinned = false;
    expandedItem = null;
  }

  function pointerPos(evt) {
    const r = canvas.getBoundingClientRect();
    return toScenePoint(evt.clientX - r.left, evt.clientY - r.top);
  }

  function rawPointerPos(evt) {
    const r = canvas.getBoundingClientRect();
    return {
      sx: evt.clientX - r.left,
      sy: evt.clientY - r.top
    };
  }

  function depthStep() {
    const bounds = getDepthBounds();
    const span = Math.max(600, bounds.max - bounds.min);
    return clamp(span * 0.026, 50, 160);
  }

  function zoomBy(direction, sx, sy, strength = 1) {
    const bounds = getDepthBounds();

    const minDepth = Math.min(120, bounds.min) - 220;
    const maxDepth = Math.max(bounds.max, HERO_LAYER_Z) + FOCAL * 0.22;

    const focusPlane = hovered
      ? hovered.z
      : clamp(cam.depth + 420, bounds.min, bounds.max);

    const anchorBefore = screenToWorld(sx, sy, focusPlane);

    cam.depth = clamp(
      cam.depth + direction * depthStep() * strength,
      minDepth,
      maxDepth
    );

    cam.zoom = clamp(
      cam.zoom + direction * 0.08 * strength,
      MIN_ZOOM,
      MAX_ZOOM
    );

    const anchorAfter = screenToWorld(sx, sy, focusPlane);

    cam.x += anchorBefore.x - anchorAfter.x;
    cam.y += anchorBefore.y - anchorAfter.y;

    render();
  }

  function clickHeroButton(sx, sy) {
    if (!heroButtonHit) return false;

    const inside =
      sx >= heroButtonHit.x &&
      sx <= heroButtonHit.x + heroButtonHit.w &&
      sy >= heroButtonHit.y &&
      sy <= heroButtonHit.y + heroButtonHit.h;

    if (!inside) return false;

    if (leadModal.token && leadModal.amCode) {
      openLeadModal('card');
    } else {
      openLeadModal('entry');
    }
    return true;
  }

  canvas.addEventListener('mousedown', e => {
    if (e.button === 2) return; // right-click: do nothing
    resetInactivityTimer();
    if (leadModal.open) {
      e.preventDefault();
      return;
    }

    if (suppressNextMouseClick) return;

    clearPinnedPreview();
    if (!zoomedIn && expandedItem) { _releaseHoverZoom(true); expandedItem = null; }
    hoverZoom = null; // cancel any in-progress zoom animation so drag has immediate control

    const { sx, sy } = pointerPos(e);

    drag = {
      sx,
      sy,
      cx: cam.x,
      cy: cam.y,
      moved: 0,
      scale: currentDragScale()
    };
  });

  canvas.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('mousemove', e => {
    if (drag) resetInactivityTimer(); // only camera movement resets the pan inactivity timer
    resetZoomedIdleTimer();           // any mouse movement resets the zoomed-in idle timer
    if (leadModal.open) return;

    const { sx, sy } = pointerPos(e);

    pointer.x = sx;
    pointer.y = sy;

    const bounds = getSceneBounds();

    pointer.active =
      sx >= bounds.left &&
      sx <= bounds.right &&
      sy >= bounds.top &&
      sy <= bounds.bottom;

    if (drag) {
      const dx = sx - drag.sx;
      const dy = sy - drag.sy;

      drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));

      const dragScale = drag.scale || cam.zoom;

      cam.x = drag.cx - dx / dragScale;
      cam.y = drag.cy - dy / dragScale;
      if (!zoomedIn) clampCameraPan(); // no clamp while exploring in zoomed mode

      canvas.style.cursor = 'grabbing';
      render();
      return;
    }

    const prev = hovered;
    hovered = hitTest(sx, sy);

    canvas.style.cursor = hovered ? 'pointer' : 'grab';

    if (
      heroButtonHit &&
      sx >= heroButtonHit.x &&
      sx <= heroButtonHit.x + heroButtonHit.w &&
      sy >= heroButtonHit.y &&
      sy <= heroButtonHit.y + heroButtonHit.h
    ) {
      canvas.style.cursor = 'pointer';
    }

    if (hovered !== prev) {
      hoverStartTime = hovered ? performance.now() : 0;
      // While zoomed in, let animate() handle re-zooming; don't release here
      if (!zoomedIn && !previewPinned && expandedItem) { _releaseHoverZoom(); expandedItem = null; }
      render();
    }
  });

  canvas.addEventListener('mouseleave', () => {
    pointer.active = false;
    hovered = null;
    hoverStartTime = 0;
    // While zoomed, leaving the canvas doesn't exit zoom — idle timer handles that
    if (!zoomedIn && !previewPinned && expandedItem) { _releaseHoverZoom(); expandedItem = null; }
  });

  window.addEventListener('mouseup', e => {
    if (leadModal.open) return;

    if (!drag) return;

    const { sx, sy } = pointerPos(e);

    if (drag.moved < 6) {
      const { sx: cx, sy: cy } = rawPointerPos(e);
      if (clickHeaderButton(cx, cy)) {
        drag = null;
        return;
      }
      if (!clickHeroButton(sx, sy)) {
        const hit = hitTest(sx, sy);

        if (hit && isMobileViewport()) {
          openImagePreview(hit);
        } else {
          hideLinkPanel();
        }
      }
    }

    drag = null;
    canvas.style.cursor = hovered ? 'pointer' : 'grab';
  });

  function touchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function touchMidpoint(touches) {
    const rect = canvas.getBoundingClientRect();

    return toScenePoint(
      ((touches[0].clientX + touches[1].clientX) * 0.5) - rect.left,
      ((touches[0].clientY + touches[1].clientY) * 0.5) - rect.top
    );
  }

  function zoomByScale(scaleFactor, sx, sy) {
    const bounds = getDepthBounds();

    const focusPlane = hovered
      ? hovered.z
      : clamp(cam.depth + 420, bounds.min, bounds.max);

    const anchorBefore = screenToWorld(sx, sy, focusPlane);

    cam.zoom = clamp(cam.zoom * scaleFactor, MIN_ZOOM, MAX_ZOOM);

    const anchorAfter = screenToWorld(sx, sy, focusPlane);

    cam.x += anchorBefore.x - anchorAfter.x;
    cam.y += anchorBefore.y - anchorAfter.y;

    render();
  }

  canvas.addEventListener('touchstart', e => {
    resetInactivityTimer();
    if (leadModal.open) {
      e.preventDefault();
      return;
    }

    suppressNextMouseClick = true;
    clearPinnedPreview();
    if (!zoomedIn && expandedItem) { _releaseHoverZoom(true); expandedItem = null; }
    hoverZoom = null; // cancel any in-progress animation so touch has immediate control
    if (linkPanel) linkPanel.style.display = 'none';

    if (e.touches.length === 1) {
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const p = toScenePoint(t.clientX - rect.left, t.clientY - rect.top);
      const sx = p.sx;
      const sy = p.sy;

      pointer.x = sx;
      pointer.y = sy;
      pointer.active = true;

      hovered = hitTest(sx, sy);

      drag = {
        sx,
        sy,
        cx: cam.x,
        cy: cam.y,
        moved: 0,
        scale: currentDragScale(),
        touch: true,
        clientX: t.clientX,
        clientY: t.clientY
      };
    } else if (e.touches.length === 2) {
      drag = null;

      const mid = touchMidpoint(e.touches);

      touchPinch = {
        distance: touchDistance(e.touches),
        sx: mid.sx,
        sy: mid.sy
      };

      pointer.x = mid.sx;
      pointer.y = mid.sy;
      pointer.active = true;
    }

    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    resetInactivityTimer();
    if (leadModal.open) {
      e.preventDefault();
      return;
    }

    suppressNextMouseClick = true;

    if (!zoomedIn && !previewPinned && expandedItem) { _releaseHoverZoom(true); expandedItem = null; }

    if (e.touches.length === 1 && drag && drag.touch) {
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const p = toScenePoint(t.clientX - rect.left, t.clientY - rect.top);
      const sx = p.sx;
      const sy = p.sy;

      const dx = sx - drag.sx;
      const dy = sy - drag.sy;

      const dragScale = drag.scale || currentDragScale();

      drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));

      cam.x = drag.cx - dx / dragScale;
      cam.y = drag.cy - dy / dragScale;
      if (!zoomedIn) clampCameraPan(); // no clamp while exploring in zoomed mode
      resetZoomedIdleTimer();

      pointer.x = sx;
      pointer.y = sy;
      pointer.active = true;

      render();
    } else if (e.touches.length === 2) {
      const mid = touchMidpoint(e.touches);
      const distance = touchDistance(e.touches);

      if (!touchPinch) {
        touchPinch = {
          distance,
          sx: mid.sx,
          sy: mid.sy
        };
      } else {
        const scaleFactor = clamp(
          distance / Math.max(1, touchPinch.distance),
          0.86,
          1.16
        );

        zoomByScale(scaleFactor, mid.sx, mid.sy);

        touchPinch = {
          distance,
          sx: mid.sx,
          sy: mid.sy
        };
      }

      pointer.x = mid.sx;
      pointer.y = mid.sy;
      pointer.active = true;
    }

    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    if (leadModal.open) {
      e.preventDefault();
      return;
    }

    if (drag && drag.touch && e.touches.length === 0) {
      const hit = drag.moved < 8 ? hitTest(pointer.x, pointer.y) : null;

      if (hit) {
        openImagePreview(hit);
      } else if (drag.moved < 8) {
        if (clickHeaderButton(pointer.x, pointer.y)) {
          // handled
        } else if (!clickHeroButton(pointer.x, pointer.y)) {
          clearPinnedPreview();
        }
      }
    }

    if (e.touches.length === 0) {
      drag = null;
      touchPinch = null;
      pointer.active = false;
      hovered = null;
      hoverStartTime = 0;

      window.setTimeout(() => {
        suppressNextMouseClick = false;
      }, 350);
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const p = toScenePoint(t.clientX - rect.left, t.clientY - rect.top);
      const sx = p.sx;
      const sy = p.sy;

      touchPinch = null;

      drag = {
        sx,
        sy,
        cx: cam.x,
        cy: cam.y,
        moved: 0,
        scale: currentDragScale(),
        touch: true,
        clientX: t.clientX,
        clientY: t.clientY
      };
    }

    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchcancel', e => {
    drag = null;
    touchPinch = null;
    pointer.active = false;
    hovered = null;
    hoverStartTime = 0;
    clearPinnedPreview();

    window.setTimeout(() => {
      suppressNextMouseClick = false;
    }, 350);

    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('wheel', e => {
    resetInactivityTimer();
    if (leadModal.open) {
      e.preventDefault();
      return;
    }

    clearPinnedPreview();
    e.preventDefault();

    const { sx: rawSx, sy: rawSy } = rawPointerPos(e);
    const scenePointer = toScenePoint(rawSx, rawSy);
    const sx = scenePointer.sx;
    const sy = scenePointer.sy;

    pointer.x = sx;
    pointer.y = sy;
    pointer.active = true;

    if (e.ctrlKey || e.metaKey) {
      const strength = clamp(Math.abs(e.deltaY) / 90, 0.35, 1.6);
      zoomBy(e.deltaY < 0 ? 1 : -1, sx, sy, strength);
      return;
    }

    const panScale = currentDragScale();
    cam.x += e.deltaX / panScale;
    cam.y += e.deltaY / panScale;

    render();
  }, { passive: false });

  if (closeLinkPanel) closeLinkPanel.addEventListener('click', hideLinkPanel);

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      hideLinkPanel();
    });
  }

  if (openBtn) {
    openBtn.addEventListener('click', () => {});
  }

  if (delBtn) {
    delBtn.addEventListener('click', () => {
      hideLinkPanel();
    });
  }

  function animate() {
    // Mark reveal complete once the full spread + fade window has passed
    if (!revealComplete && revealStartTime > 0 &&
        performance.now() >= revealStartTime + REVEAL_SPREAD + REVEAL_FADE + 200) {
      revealComplete = true;
    }

    // Smooth auto-return to home after inactivity (skip while zoom is active)
    if (autoReturn && !hoverZoom && !zoomedIn) {
      const t = Math.min(1, (performance.now() - autoReturn.startTime) / RETURN_DURATION);
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // cubic ease-in-out
      cam.x     = autoReturn.from.x     + (homeState.x     - autoReturn.from.x)     * ease;
      cam.y     = autoReturn.from.y     + (homeState.y     - autoReturn.from.y)     * ease;
      cam.depth = autoReturn.from.depth + (homeState.depth - autoReturn.from.depth) * ease;
      cam.zoom  = autoReturn.from.zoom  + (homeState.zoom  - autoReturn.from.zoom)  * ease;
      if (t >= 1) {
        cam.x = homeState.x; cam.y = homeState.y;
        cam.depth = homeState.depth; cam.zoom = homeState.zoom;
        autoReturn = null;
      }
    }

    // Hover zoom animation
    if (hoverZoom) {
      const t = Math.min(1, (performance.now() - hoverZoom.startTime) / hoverZoom.duration);
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      cam.x    = hoverZoom.from.x    + (hoverZoom.to.x    - hoverZoom.from.x)    * ease;
      cam.y    = hoverZoom.from.y    + (hoverZoom.to.y    - hoverZoom.from.y)    * ease;
      cam.zoom = hoverZoom.from.zoom + (hoverZoom.to.zoom - hoverZoom.from.zoom) * ease;
      if (t >= 1) {
        cam.x = hoverZoom.to.x; cam.y = hoverZoom.to.y; cam.zoom = hoverZoom.to.zoom;
        if (hoverZoom.returning) {
          hoverZoom = null; savedCamBeforeZoom = null;
          zoomedIn = false; clearTimeout(zoomedIdleTimer);
          expandedItem = null; zoomedTarget = null;
        } else {
          hoverZoom = null;
          zoomedIn = true;
          zoomFadeFrom = zoomFadeT; zoomFadeTo = 1; zoomFadeStart = performance.now();
          startZoomedIdleTimer();
        }
      }
    }

    if (leadModal.open) {
      if (expandedItem || zoomedIn) {
        _releaseHoverZoom(true);
        expandedItem = null;
        zoomedIn = false;
        clearTimeout(zoomedIdleTimer);
      }
      previewPinned = false;
    } else if (!previewPinned) {
      if (zoomedIn) {
        // Locked in: immediately re-zoom to a newly hovered image; empty space is fine (idle timer handles exit)
        if (hovered && !drag && expandedItem !== hovered) {
          expandedItem = hovered;
          _triggerHoverZoom(hovered);
        }
      } else {
        // Normal mode: 1250ms hover delay before zooming in
        if (hovered && !drag && hoverStartTime && performance.now() - hoverStartTime >= HOVER_EXPAND_DELAY) {
          if (expandedItem !== hovered) {
            expandedItem = hovered;
            _triggerHoverZoom(hovered);
          }
        } else if (!hovered && expandedItem) {
          expandedItem = null;
          _releaseHoverZoom();
        }
      }
    }

    updateAsciiPointer();
    asciiEffect.tick();
    render();

    requestAnimationFrame(animate);
  }

  window.addEventListener('resize', resize);

  resize();
  loadRateCardCarousel();
  preloadManifest();
  createLeadModalDOM();
  animate();

  // Handle LinkedIn OAuth callback (?oauth=CODE or ?oauth_error=...)
  function checkOAuthReturn() {
    const params = new URLSearchParams(window.location.search);
    const oauthCode  = params.get('oauth');
    const oauthError = params.get('oauth_error');
    if (!oauthCode && !oauthError) return;
    history.replaceState({}, '', window.location.pathname);
    if (oauthCode) {
      handleOAuthReturn(oauthCode);
    } else {
      const msgs = {
        not_found: 'No account found with this LinkedIn email. Please sign up.',
        expired:   'Session expired. Please try again.',
        no_email:  'LinkedIn did not share your email. Please allow email access.',
        server:    'LinkedIn sign-in failed. Please try again.',
      };
      openLeadModal('existing-login');
      const errEl = leadModal.el && leadModal.el.querySelector('.rr-el-error');
      if (errEl) errEl.textContent = msgs[oauthError] || 'LinkedIn sign-in failed.';
    }
  }

  // If returning from leaderboard, reopen the card modal
  function checkReturnFromLeaderboard() {
    const urlP = new URLSearchParams(window.location.search);
    if (urlP.get('openModal') !== 'card') return;
    history.replaceState(null, '', window.location.pathname);

    const tok = sessionStorage.getItem('rr_ret_token');
    const am  = sessionStorage.getItem('rr_ret_amCode');
    const cid = sessionStorage.getItem('rr_ret_cardId');
    const img = sessionStorage.getItem('rr_ret_imageUrl');
    ['rr_ret_token','rr_ret_amCode','rr_ret_cardId','rr_ret_imageUrl']
      .forEach(k => sessionStorage.removeItem(k));

    if (!tok || !am) return;

    leadModal.token    = tok;
    leadModal.amCode   = am;
    leadModal.cardId   = cid || null;
    leadModal.imageUrl = img || null;

    openLeadModal('card');
    openCardModal(am);
  }

  // Hydrate saved session first, then handle any OAuth callback or leaderboard return
  hydrateAuthFromStorage().then(() => {
    checkOAuthReturn();
    checkReturnFromLeaderboard();
  });
})();