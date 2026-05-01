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
    './rate-card-carousel/rate-card-1.png',
    './rate-card-carousel/rate-card-2.png',
    './rate-card-carousel/rate-card-3.png'
  ];

  const carouselImages = [];
  const CAROUSEL_INTERVAL = 2400;

  const HEADER_LOGO_SRC = './adultmoney-header-logo.png';
  const LINKEDIN_LOGO_SRC = './linkedin-logo.png';
  const DOWNLOAD_ICON_SRC = './modal-download-icon.png';
  const SHARE_ICON_SRC = './modal-share-icon.png';

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

  let hovered = null;
  let selected = null;
  let drag = null;
  let pointer = { x: -999, y: -999, active: false };
  let touchPinch = null;
  let suppressNextMouseClick = false;
  let hoverStartTime = 0;
  let expandedItem = null;
  let previewPinned = false;
  let heroButtonHit = null;

  const BACKEND_URL = (window.BACKEND_URL || 'http://localhost:3000').replace(/\/$/, '');

  const leadModal = {
    open: false,
    mode: 'signup',
    el: null,
    panel: null,
    codeInput: null,
    recoverCodeInput: null,
    errorEl: null,
    token: null,
    cardId: null,
    imageUrl: null
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
    const totalH = 401 + 84 + 64 + 32;
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

  function resetLandingCamera() {
    cam.x = 0;
    cam.depth = HERO_LAYER_Z - 920;
    cam.zoom = isMobileViewport() ? 0.30 : 0.6;

    const pScale = projectionAtDepth(HERO_LAYER_Z);
    const targetHeroCenterY = root.clientHeight * (isMobileViewport() ? 0.54 : 0.535);

    cam.y = heroLayer.y - ((targetHeroCenterY - root.clientHeight / 2) / Math.max(0.0001, pScale));
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

      .rr-modal-actions {
        position: absolute;
        top: 431px;
        left: 104px;
        width: 142px;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
      }

      .rr-modal-action {
        width: 48px;
        text-align: center;
        color: #ffffff;
        font-size: 7px;
        line-height: 1;
      }

      .rr-modal-action img {
        width: 24px;
        height: 24px;
        object-fit: contain;
        display: block;
        margin: 0 auto 7px;
      }

      .rr-leader-strip {
        position: absolute;
        left: 0;
        top: 485px;
        width: 350px;
        height: 64px;
        overflow: hidden;
        cursor: pointer;
        background-color: #ffffff;
        background-image:
          linear-gradient(45deg, #000000 25%, transparent 25%),
          linear-gradient(-45deg, #000000 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, #000000 75%),
          linear-gradient(-45deg, transparent 75%, #000000 75%);
        background-size: 16px 16px;
        background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
      }

      .rr-leader-inner {
        position: absolute;
        left: 70px;
        top: 15px;
        width: 210px;
        height: 34px;
        background: #dedede;
        color: #ff0000;
        font-size: 15px;
        letter-spacing: 0.08em;
        line-height: 34px;
        text-align: center;
        font-weight: 700;
      }
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

  async function runSignupFlow(email, getProfileFn) {
    try {
      const name = nameFromEmail(email);
      const signupData = await apiPost('/api/auth/signup', { email, password: email + '_am', name });
      leadModal.token = signupData.token;
      await getProfileFn(leadModal.token);
      await apiPost('/api/score/generate', {}, leadModal.token);
      const cardData = await apiPost('/api/card/generate', {}, leadModal.token);
      leadModal.cardId   = cardData.cardId;
      leadModal.imageUrl = cardData.imageUrl;
      setDownloadShareVisible(true);
      setLeadModalMode('login');
      const li = leadModal.el && leadModal.el.querySelector('.rr-login-email');
      if (li) li.value = email;
      if (leadModal.codeInput) leadModal.codeInput.value = cardData.amCode || '';
      showModalError('Card created! Save your code ↑', '#2a7a2a');
    } catch (err) {
      window.alert('Error: ' + err.message);
    }
  }

  function handleSignupWithLinkedIn(email) {
    const text = window.prompt('Paste your LinkedIn profile text here (copy from your LinkedIn page):');
    if (!text || !text.trim()) return;
    runSignupFlow(email, token => apiPost('/api/resume/linkedin', { urlOrText: text }, token));
  }

  function handleSignupWithCV(email) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      document.body.removeChild(input);
      const file = input.files[0];
      if (!file) return;
      runSignupFlow(email, token => {
        const form = new FormData();
        form.append('file', file);
        return apiPostForm('/api/resume/upload', form, token);
      });
    });
    input.click();
  }

  async function handleCodeLogin() {
    const emailEl = leadModal.el ? leadModal.el.querySelector('.rr-login-email') : null;
    const email = emailEl ? emailEl.value.trim() : '';
    const code  = leadModal.codeInput ? leadModal.codeInput.value.trim() : '';
    if (!email || !code) { showModalError('Please enter your email and code.'); return; }
    if (!/^[A-Z]{4}[0-9]{4}$/.test(code)) { showModalError('Please enter a valid code.'); return; }
    try {
      showModalError('Logging in…', '#555');
      const data = await apiPost('/api/auth/code-login', { email, code });
      leadModal.token    = data.token;
      leadModal.cardId   = data.cardId;
      leadModal.imageUrl = data.imageUrl;
      setDownloadShareVisible(true);
      showModalError('');
    } catch (err) {
      showModalError(err.message);
    }
  }

  async function handleDownload() {
    if (!leadModal.imageUrl) { showModalError('No card image available.'); return; }
    try {
      const res  = await fetch(leadModal.imageUrl);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'rate-card.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (_) {
      window.open(leadModal.imageUrl, '_blank');
    }
  }

  async function handleShare() {
    const url = leadModal.imageUrl || window.location.href;
    if (navigator.share) {
      navigator.share({ title: 'My Rate Card', url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
      showModalError('Link copied!', '#2a7a2a');
    }
  }

  function createLeadModalDOM() {
    injectLeadModalStyles();

    const overlay = document.createElement('div');
    overlay.className = 'rr-lead-overlay';

    overlay.innerHTML = `
      <div class="rr-lead-stage">
        <button class="rr-lead-close" type="button">×</button>

        <div class="rr-lead-panel">
          <div class="rr-lead-content rr-mode rr-mode-signup">
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
            <input class="rr-lead-input rr-code-input" type="text" maxlength="8" placeholder="ADMY-0000" autocomplete="off" />

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
            <input class="rr-lead-input rr-recover-code" type="text" maxlength="8" placeholder="ADMY-0000" autocomplete="off" />

            <div class="rr-bottom-account-row">
              Don’t have an account ? <span class="rr-red-link rr-signup-link">Sign-up</span>
            </div>
          </div>

          <div class="rr-lead-footer">
            By submitting your email, you’re giving ADULTMONEY<br/>
            permission to send you email about future ADULTMONEY<br/>
            releases. <a>Terms & Privacy</a>
          </div>
        </div>

        <div class="rr-modal-actions">
          <div class="rr-modal-action">
            <img src="${DOWNLOAD_ICON_SRC}" alt="Download" />
            Download
          </div>
          <div class="rr-modal-action">
            <img src="${SHARE_ICON_SRC}" alt="Share" />
            Share
          </div>
        </div>

        <div class="rr-leader-strip">
          <div class="rr-leader-inner">ENTER THE LEADERBOARD</div>
        </div>
      </div>
    `;

    root.appendChild(overlay);

    leadModal.el = overlay;
    leadModal.panel = overlay.querySelector('.rr-lead-stage');
    leadModal.codeInput = overlay.querySelector('.rr-code-input');
    leadModal.recoverCodeInput = overlay.querySelector('.rr-recover-code');
    leadModal.errorEl = overlay.querySelector('.rr-error-text');

    overlay.querySelector('.rr-lead-close').addEventListener('click', closeLeadModal);
    overlay.querySelector('.rr-login-link').addEventListener('click', () => setLeadModalMode('login'));
    overlay.querySelector('.rr-code-help').addEventListener('click', () => setLeadModalMode('recover'));

    overlay.querySelectorAll('.rr-signup-link').forEach(el => {
      el.addEventListener('click', () => setLeadModalMode('signup'));
    });

    function formatCodeInput(input, errorEl = null) {
      const raw = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      input.value = raw;

      if (!errorEl) return;

      if (!raw.length) {
        errorEl.textContent = '';
        return;
      }

      const valid = /^[A-Z]{4}[0-9]{4}$/.test(raw);
      errorEl.textContent = valid ? '' : 'Please enter a valid code.';
    }

    leadModal.codeInput.addEventListener('input', () => {
      formatCodeInput(leadModal.codeInput, leadModal.errorEl);
    });

    leadModal.recoverCodeInput.addEventListener('input', () => {
      formatCodeInput(leadModal.recoverCodeInput, null);
    });

    // Login: Enter key on code input submits
    leadModal.codeInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') handleCodeLogin();
    });

    // Signup: LinkedIn button
    const linkedinBtn = overlay.querySelector('.rr-linkedin-logo').closest('button');
    linkedinBtn.addEventListener('click', () => {
      const emailEl = overlay.querySelector('.rr-signup-email');
      const email   = emailEl ? emailEl.value.trim() : '';
      if (!email) { showModalError('Please enter your email first.'); return; }
      handleSignupWithLinkedIn(email);
    });

    // Signup: CV button (second mini-button)
    const miniButtons = overlay.querySelectorAll('.rr-lead-mini-button');
    const cvBtn = miniButtons[1];
    cvBtn.addEventListener('click', () => {
      const emailEl = overlay.querySelector('.rr-signup-email');
      const email   = emailEl ? emailEl.value.trim() : '';
      if (!email) { showModalError('Please enter your email first.'); return; }
      handleSignupWithCV(email);
    });

    // Download / Share action buttons
    const actionBtns = overlay.querySelectorAll('.rr-modal-action');
    if (actionBtns[0]) actionBtns[0].addEventListener('click', handleDownload);
    if (actionBtns[1]) actionBtns[1].addEventListener('click', handleShare);

    // Initially hide download/share until card is ready
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

    if (mode === 'login') {
      leadModal.codeInput.value = '';
      leadModal.errorEl.textContent = '';
    }

    if (mode === 'recover') {
      leadModal.recoverCodeInput.value = '';
    }
  }

  function openLeadModal(mode = 'signup') {
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

    for (let gx = startX; gx <= endX; gx += gridStep) {
      ctx.beginPath();

      for (let y = startY; y <= endY; y += segment) {
        const p = distortGridPoint(gx, y);
        if (y === startY) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }

      ctx.stroke();
    }

    for (let gy = startY; gy <= endY; gy += gridStep) {
      ctx.beginPath();

      for (let x = startX; x <= endX; x += segment) {
        const p = distortGridPoint(x, gy);
        if (x === startX) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }

      ctx.stroke();
    }

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

  function drawExpandedPreview() {
    if (!expandedItem || !expandedItem.img || leadModal.open) return;

    const img = expandedItem.img;
    const aspect = (img.naturalWidth || img.width) / (img.naturalHeight || img.height) || 1;
    const maxW = root.clientWidth * 0.58;
    const maxH = root.clientHeight * 0.76;

    let w = maxW;
    let h = w / aspect;

    if (h > maxH) {
      h = maxH;
      w = h * aspect;
    }

    const x = (root.clientWidth - w) / 2;
    const y = (root.clientHeight - h) / 2;
    const pad = 10;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.58)';
    ctx.fillRect(0, 0, root.clientWidth, root.clientHeight);

    ctx.shadowColor = 'rgba(255,255,255,0.28)';
    ctx.shadowBlur = 42;
    ctx.shadowOffsetY = 0;

    ctx.fillStyle = 'rgba(245,245,242,0.96)';
    ctx.fillRect(x - pad, y - pad, w + pad * 2, h + pad * 2);
    ctx.drawImage(img, x, y, w, h);

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - pad, y - pad, w + pad * 2, h + pad * 2);

    ctx.font = '500 11px Helvetica Neue, Helvetica, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fillText((expandedItem.title || 'IMAGE').toUpperCase().slice(0, 42), x - pad, y - pad - 8);

    ctx.restore();
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
      const drawOpacity = layerOpacity * nearFade;

      ctx.save();
      ctx.globalAlpha = drawOpacity;
      ctx.shadowColor = `rgba(235,235,235,${0.10 + depthShadow * 0.20 * layerOpacity})`;
      ctx.shadowBlur = Math.max(12, 26 * p.scale * depthShadow);
      ctx.shadowOffsetX = Math.max(0, 2 * p.scale * depthShadow);
      ctx.shadowOffsetY = Math.max(1, 5 * p.scale * depthShadow);
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

    drawFixedSideBlocks();
    drawFixedHeaderButtons();
    drawExpandedPreview();
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
      imageNumber
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
        candidates.push(`${folder}scatter-images:image${i}.${ext}`);
        candidates.push(`${folder}${encodeURIComponent(`scatter-images:image${i}.${ext}`)}`);
        candidates.push(`./scatter-images:image${i}.${ext}`);
        candidates.push(`./${encodeURIComponent(`scatter-images:image${i}.${ext}`)}`);
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

    const manual = Array.isArray(window.GALLERY_IMAGES) ? window.GALLERY_IMAGES : [];

    const manualLoads = manual.map(entry => new Promise(resolve => {
      if (!entry || !entry.src) {
        resolve(false);
        return;
      }

      const img = new Image();

      img.onload = () => {
        placeItem(img, entry.title || entry.src.split('/').pop() || 'image', entry.link || '');
        loadedCount++;
        resolve(true);
      };

      img.onerror = () => resolve(false);
      img.src = entry.src;
    }));

    await Promise.all(manualLoads);

    const groups = imageCandidateGroups();

    const autoLoads = groups.map(async group => {
      const result = await loadImageFromCandidates(group.candidates);
      if (!result) return false;

      placeItem(result.img, group.title, '');
      loadedCount++;
      return true;
    });

    await Promise.all(autoLoads);

    if (!loadedCount) {
      console.warn('[RR SCATTER] No gallery images loaded. Expected names like ./scatter-images/image1.png.');
    } else {
      console.log(`[RR SCATTER] Loaded ${loadedCount} gallery images.`);
    }

    relayoutItems();
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

    openLeadModal('signup');
    return true;
  }

  canvas.addEventListener('mousedown', e => {
    if (leadModal.open) {
      e.preventDefault();
      return;
    }

    if (suppressNextMouseClick) return;

    clearPinnedPreview();

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

  window.addEventListener('mousemove', e => {
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
      if (!previewPinned) expandedItem = null;
      render();
    }
  });

  canvas.addEventListener('mouseleave', () => {
    pointer.active = false;
    hovered = null;
    hoverStartTime = 0;
    if (!previewPinned) expandedItem = null;
  });

  window.addEventListener('mouseup', e => {
    if (leadModal.open) return;

    if (!drag) return;

    const { sx, sy } = pointerPos(e);

    if (drag.moved < 6) {
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
    if (leadModal.open) {
      e.preventDefault();
      return;
    }

    suppressNextMouseClick = true;
    clearPinnedPreview();
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
    if (leadModal.open) {
      e.preventDefault();
      return;
    }

    suppressNextMouseClick = true;

    if (!previewPinned) expandedItem = null;

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
        if (!clickHeroButton(pointer.x, pointer.y)) {
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
    if (leadModal.open) {
      expandedItem = null;
      previewPinned = false;
    } else if (!previewPinned) {
      if (
        hovered &&
        !drag &&
        hoverStartTime &&
        performance.now() - hoverStartTime >= HOVER_EXPAND_DELAY
      ) {
        expandedItem = hovered;
      } else if (!hovered) {
        expandedItem = null;
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
})();