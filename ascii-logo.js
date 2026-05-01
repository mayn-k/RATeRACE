// ascii-logo.js
// Handles only the RATe RACE ASCII logo particle/ripple animation.
// Keep scatter placement, image loading, zoom, and dragging in scatter-gallery.js.

(() => {
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function randomFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

class AsciiLogoEffect {
    constructor() {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
      this.scratch = document.createElement('canvas');
      this.scratchCtx = this.scratch.getContext('2d');
      this.W = 2033;
      this.H = 610;
      this.canvas.width = this.W;
      this.canvas.height = this.H;
      this.scratch.width = this.W;
      this.scratch.height = this.H;

      this.CHARS = ['≠','A','D','M','≠','R','A','≠','R','≠'];
      this.HALO_CHARS = ['A','R','D','M','3','4','T','F','#','@','*','-','≠'];
      this.BASE_CHAR_SIZE = 7.75;
      this.BASE_REPEL_RADIUS = 80;
      this.BASE_REPEL_STRENGTH = 35;
      this.BASE_HOME_LIMIT = 40;
      this.LOGO_SCALE_DESKTOP = 1.0;
      this.RETURN_SPEED = 0.011;
      this.DAMPING = 0.92;
      this.WOBBLE_AMP = 0.08;
      this.WOBBLE_SPEED = 0.0008;
      this.FONT_FAMILY = '"Anonymous Pro", monospace';

      this.CHAR_SIZE = this.BASE_CHAR_SIZE;
      this.GRID = 7;
      this.ASCII_SCALE = 1;
      this.REPEL_RADIUS = this.BASE_REPEL_RADIUS;
      this.REPEL_STRENGTH = this.BASE_REPEL_STRENGTH;
      this.HOME_LIMIT = this.BASE_HOME_LIMIT;

      this.particles = [];
      this.haloChars = [];
      this.frame = 0;
      this.mouse = { x: -999, y: -999 };
      this.lastMouseX = -999;
      this.lastMouseY = -999;
      this.mouseVelX = 0;
      this.mouseVelY = 0;
      this.cursorOnLogo = false;
      this.logoLayout = { x: 0, y: 0, w: 0, h: 0 };
      this.ready = false;

      this.logoImg = new Image();
      this.logoImg.onload = () => {
        this.resize(this.W, this.H);
        this.ready = true;
      };
      this.logoImg.onerror = () => {
        this.buildFallbackLogo();
        this.resize(this.W, this.H);
        this.ready = true;
      };
      this.logoImg.src = 'ratrace-logo.png';
    }

    buildFallbackLogo() {
      const f = document.createElement('canvas');
      f.width = 1600;
      f.height = 360;
      const fctx = f.getContext('2d');
      fctx.fillStyle = '#d7d7d2';
      fctx.font = '700 205px monospace';
      fctx.textAlign = 'center';
      fctx.textBaseline = 'middle';
      fctx.fillText('RAT≠RACE', f.width / 2, f.height / 2 + 8);
      this.logoImg = f;
    }

    resize(w, h) {
      this.W = Math.max(815, Math.floor(w));
      this.H = Math.max(324, Math.floor(h));
      this.canvas.width = this.W;
      this.canvas.height = this.H;
      this.scratch.width = this.W;
      this.scratch.height = this.H;
      this.computeLogoLayout();
      this.updateResponsiveAsciiSystem();
      this.buildParticles();
      this.buildHaloChars();
    }

    computeLogoLayout() {
      const naturalW = this.logoImg.naturalWidth || this.logoImg.width || 1600;
      const naturalH = this.logoImg.naturalHeight || this.logoImg.height || 360;
      const maxW = this.W * this.LOGO_SCALE_DESKTOP;
      const maxH = this.H * 0.9;
      const scale = Math.min(maxW / naturalW, maxH / naturalH);
      const lw = naturalW * scale;
      const lh = naturalH * scale;
      const lx = (this.W - lw) / 2;
      const ly = (this.H - lh) / 2;
      this.logoLayout = { x: lx, y: ly, w: lw, h: lh };
    }

    updateResponsiveAsciiSystem() {
      const targetColumns = 132;
      this.GRID = clamp(this.logoLayout.w / targetColumns, 5.2, 8.2);
      this.CHAR_SIZE = clamp(this.GRID * 1.08, 3.05, this.BASE_CHAR_SIZE + 1.1);
      this.ASCII_SCALE = this.CHAR_SIZE / this.BASE_CHAR_SIZE;
      this.REPEL_RADIUS = clamp(this.BASE_REPEL_RADIUS * this.ASCII_SCALE, 32, this.BASE_REPEL_RADIUS * 1.12);
      this.REPEL_STRENGTH = clamp(this.BASE_REPEL_STRENGTH * this.ASCII_SCALE, 14, this.BASE_REPEL_STRENGTH * 1.1);
      this.HOME_LIMIT = clamp(this.BASE_HOME_LIMIT * this.ASCII_SCALE, 16, this.BASE_HOME_LIMIT * 1.1);
    }

    getLogoPixels() {
      const c2 = this.scratchCtx;
      c2.clearRect(0, 0, this.W, this.H);
      c2.drawImage(this.logoImg, this.logoLayout.x, this.logoLayout.y, this.logoLayout.w, this.logoLayout.h);
      return c2.getImageData(0, 0, this.W, this.H);
    }

    buildParticles() {
      this.particles = [];
      const imgData = this.getLogoPixels();
      const data = imgData.data;
      const startX = Math.floor(this.logoLayout.x);
      const endX = Math.ceil(this.logoLayout.x + this.logoLayout.w);
      const startY = Math.floor(this.logoLayout.y);
      const endY = Math.ceil(this.logoLayout.y + this.logoLayout.h);

      for (let x = startX; x < endX; x += this.GRID) {
        for (let y = startY; y < endY; y += this.GRID) {
          const px = clamp(Math.floor(x), 0, this.W - 1);
          const py = clamp(Math.floor(y), 0, this.H - 1);
          const i = (py * this.W + px) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          const isLogoPixel = a > 20;
          if (!isLogoPixel) continue;

          this.particles.push({
            ox: x,
            oy: y,
            x: x + (Math.random() - 0.5) * this.W * 1.2,
            y: y + (Math.random() - 0.5) * this.H * 3,
            vx: 0,
            vy: 0,
            char: randomFrom(this.CHARS),
            charTimer: Math.floor(Math.random() * 8),
            charInterval: 3 + Math.floor(Math.random() * 8),
            disturbed: 0,
            alpha: 0.9 + Math.random() * 0.1,
            phase: Math.random() * Math.PI * 2,
            r,
            g,
            b,
            pixelAlpha: a / 255
          });
        }
      }
    }

    resetHaloChar(h, firstRun = false) {
      h.char = randomFrom(this.HALO_CHARS);
      h.charTimer = Math.floor(Math.random() * 18);
      h.charInterval = 8 + Math.floor(Math.random() * 20);
      h.life = 0;
      h.maxLife = 90 + Math.floor(Math.random() * 150);
      h.delay = firstRun ? Math.floor(Math.random() * 180) : Math.floor(Math.random() * 80);
      h.targetAlpha = 0.12 + Math.random() * 0.36;
      h.phase = Math.random() * Math.PI * 2;
    }

    buildHaloChars() {
      this.haloChars = [];
      const imgData = this.getLogoPixels();
      const data = imgData.data;
      const step = this.GRID;
      const padding = step * 5;
      const startX = Math.floor(this.logoLayout.x - padding);
      const endX = Math.ceil(this.logoLayout.x + this.logoLayout.w + padding);
      const startY = Math.floor(this.logoLayout.y - padding);
      const endY = Math.ceil(this.logoLayout.y + this.logoLayout.h + padding);
      const maxHaloChars = 230;
      const density = 0.22;

      for (let x = startX; x < endX; x += step) {
        for (let y = startY; y < endY; y += step) {
          const px = clamp(Math.floor(x), 0, this.W - 1);
          const py = clamp(Math.floor(y), 0, this.H - 1);
          const i = (py * this.W + px) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          const isLogoPixel = a > 20;
          if (isLogoPixel) continue;

          let nearLogo = false;
          for (let nx = -step * 2; nx <= step * 2; nx += step) {
            for (let ny = -step * 2; ny <= step * 2; ny += step) {
              if (nx === 0 && ny === 0) continue;
              const npx = clamp(Math.floor(x + nx), 0, this.W - 1);
              const npy = clamp(Math.floor(y + ny), 0, this.H - 1);
              const ni = (npy * this.W + npx) * 4;
              const nr = data[ni];
              const ng = data[ni + 1];
              const nb = data[ni + 2];
              const na = data[ni + 3];
              if (na > 20) {
                nearLogo = true;
                break;
              }
            }
            if (nearLogo) break;
          }

          if (!nearLogo) continue;
          if (Math.random() > density) continue;

          const h = {
            ox: x + (Math.random() - 0.5) * step * 0.55,
            oy: y + (Math.random() - 0.5) * step * 0.55,
            char: randomFrom(this.HALO_CHARS),
            charTimer: 0,
            charInterval: 12,
            life: 0,
            maxLife: 120,
            delay: 0,
            targetAlpha: 0.2,
            phase: Math.random() * Math.PI * 2
          };
          this.resetHaloChar(h, true);
          this.haloChars.push(h);
          if (this.haloChars.length >= maxHaloChars) return;
        }
      }
    }

    applyFont(size) {
      this.ctx.font = `400 ${size}px ${this.FONT_FAMILY}`;
    }

    setMouse(x, y, active) {
      if (!active) {
        this.mouse.x = -999;
        this.mouse.y = -999;
        this.lastMouseX = -999;
        this.lastMouseY = -999;
        this.mouseVelX = 0;
        this.mouseVelY = 0;
        this.particles.forEach(p => { p.vx *= 0.1; p.vy *= 0.1; });
        return;
      }
      this.mouseVelX = this.lastMouseX > -999 ? x - this.lastMouseX : 0;
      this.mouseVelY = this.lastMouseY > -999 ? y - this.lastMouseY : 0;
      this.lastMouseX = x;
      this.lastMouseY = y;
      this.mouse.x = x;
      this.mouse.y = y;
    }

    drawHaloChars() {
      this.applyFont(this.CHAR_SIZE);
      for (const h of this.haloChars) {
        if (h.delay > 0) {
          h.delay--;
          continue;
        }
        h.life++;
        if (h.life >= h.maxLife) {
          this.resetHaloChar(h);
          continue;
        }
        const t = h.life / h.maxLife;
        let fade;
        if (t < 0.22) fade = t / 0.22;
        else if (t > 0.68) fade = (1 - t) / 0.32;
        else fade = 1;
        fade = clamp(fade, 0, 1);
        h.charTimer++;
        if (h.charTimer > h.charInterval) {
          h.char = randomFrom(this.HALO_CHARS);
          h.charTimer = 0;
          h.charInterval = 6 + Math.floor(Math.random() * 18);
        }
        const jitterX = Math.sin(this.frame * 0.018 + h.phase) * 0.22 * this.ASCII_SCALE;
        const jitterY = Math.cos(this.frame * 0.015 + h.phase) * 0.18 * this.ASCII_SCALE;
        this.ctx.fillStyle = `rgba(0,0,0,${(h.targetAlpha * fade).toFixed(3)})`;
        this.ctx.fillText(h.char, h.ox + jitterX, h.oy + jitterY);
      }
    }

    tick() {
      if (!this.ready) return;
      this.frame++;
      this.mouseVelX *= 0.85;
      this.mouseVelY *= 0.85;
      this.ctx.clearRect(0, 0, this.W, this.H);
      this.drawHaloChars();

      this.cursorOnLogo = this.particles.some(p =>
        Math.abs(p.x - this.mouse.x) < Math.max(8, 14 * this.ASCII_SCALE) &&
        Math.abs(p.y - this.mouse.y) < Math.max(8, 14 * this.ASCII_SCALE)
      );

      const cursorSpeed = Math.sqrt(this.mouseVelX * this.mouseVelX + this.mouseVelY * this.mouseVelY);
      const motionScale = Math.min(cursorSpeed / 5, 1.0);
      this.applyFont(this.CHAR_SIZE);

      for (const p of this.particles) {
        p.disturbed = Math.max(0, p.disturbed - 1);
        const flicker = p.disturbed > 0 ? 2 : p.charInterval;
        p.charTimer++;
        if (p.charTimer >= flicker) {
          p.char = randomFrom(this.CHARS);
          p.charTimer = 0;
        }

        const targetX = p.ox + Math.sin(this.frame * this.WOBBLE_SPEED + p.phase) * this.WOBBLE_AMP * this.ASCII_SCALE;
        const targetY = p.oy + Math.cos(this.frame * this.WOBBLE_SPEED * 1.2 + p.phase) * this.WOBBLE_AMP * this.ASCII_SCALE;
        let rx = 0;
        let ry = 0;

        if (this.mouse.x > 0) {
          const dx = p.x - this.mouse.x;
          const dy = p.y - this.mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < this.REPEL_RADIUS && dist > 1) {
            const t = 1.0 - dist / this.REPEL_RADIUS;
            const curve = t * t * t * (t * (t * 6 - 15) + 10);
            const force = curve * this.REPEL_STRENGTH;
            rx = (dx / dist) * force * motionScale;
            ry = (dy / dist) * force * motionScale;
            if (force > 5 * this.ASCII_SCALE) {
              p.char = randomFrom(this.CHARS);
              p.disturbed = 8;
            }
          }
        }

        p.vx += rx * 0.05 + (targetX - p.x) * this.RETURN_SPEED;
        p.vy += ry * 0.05 + (targetY - p.y) * this.RETURN_SPEED;
        p.vx *= this.DAMPING;
        p.vy *= this.DAMPING;
        p.x += p.vx;
        p.y += p.vy;

        const dHome = Math.sqrt((p.x - p.ox) ** 2 + (p.y - p.oy) ** 2);
        if (dHome > this.HOME_LIMIT) {
          const ang = Math.atan2(p.y - p.oy, p.x - p.ox);
          p.x = p.ox + Math.cos(ang) * this.HOME_LIMIT;
          p.y = p.oy + Math.sin(ang) * this.HOME_LIMIT;
          p.vx *= 0.5;
          p.vy *= 0.5;
        }

        this.ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${(p.alpha * p.pixelAlpha).toFixed(3)})`;
        this.ctx.fillText(p.char, p.x, p.y);
      }

      if (this.mouse.x > 0 && this.mouse.x < this.W && this.mouse.y > 0 && this.mouse.y < this.H) {
        if (this.cursorOnLogo) {
          this.applyFont(Math.max(10, 16 * this.ASCII_SCALE));
          this.ctx.fillStyle = 'rgba(0,0,0,0.9)';
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText('≠', this.mouse.x, this.mouse.y);
          this.ctx.textAlign = 'left';
          this.ctx.textBaseline = 'alphabetic';
        }
      }
    }
  }

  window.AsciiLogoEffect = AsciiLogoEffect;
})();
