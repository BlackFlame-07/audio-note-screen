// TavernScribe: A living pixel world web component for audio notes and evening journaling.
// Uses the authentic pixel art engine from Round and Sage (pixel-worlds skill by Justin Finkelman).
//
// 1. 49-color palette (PAL) and 4x4 Bayer ordered dither LUT crush.
// 2. Exact Gothic room architecture:
//    - Lancet arch windows showing the citadel, starry sky, aurora borealis, and moon.
//    - Rough-cut stone masonry walls with mortar highlights.
//    - Heavy timber lintel beams, vertical timber posts, and iron chain hooks.
//    - Cold iron chandelier ring with tallow candle stubs.
//    - Hanging dried herb bundles.
//    - Wooden shelves with potion jars, glassware, and a shaded skull.
//    - Grand arched stone hearth with tiered flame tongues, dancing embers, and horned beast skull.
//    - Torn heraldic banner.
//    - Counter base with oak grain, candle tallow drips, and iron ember rail.
// 3. Characters:
//    - The Scribe (Scholar/Sage from Sage): turns to user when idle, writes rhythmically with ink lines when speaking.
//    - Ironhelm (Armored dwarf in horned helmet with glowing slit eyes).
//    - Greybeard (Wise wizard in patched conical hat, smoking pipe, rune staff).
//    - Ranger (Elven scout in dark green hooded cloak with glowing green eyes).
//    - Burglar (One-eyed scarred veteran with eyepatch by the hearth).
//
// Usage:
//   <script src="tavern-scribe.js"></script>
//   <tavern-scribe state="listening" volume="0.2"></tavern-scribe>
(() => {
  'use strict';

  const W = 280, H = 260, CT = 175;
  const PAL = [
    '#07060b', '#0e0c14', '#16131e', '#201b28', '#2b2533', '#383040',
    '#1c1210', '#2c1a15', '#40241a', '#58301f', '#754026', '#96552e', '#b9713a', '#d99448', '#f0bb62', '#fbe09a', '#fff6d0',
    '#3a1414', '#5c1c18', '#8a2a1c', '#b8431f', '#e0692a',
    '#4a2e28', '#6e4438', '#946050', '#b98470', '#d8ac94',
    '#10182a', '#1a2740', '#27395a', '#3a5078', '#55709a', '#7e97b8', '#aebfd4', '#dfe7f0',
    '#141c18', '#1f2c24', '#2e4034', '#44584a', '#647a66',
    '#2a2238', '#40345a', '#5c4a7a',
    '#4a4a52', '#6c6c76', '#96969e', '#c4c4c8',
    '#3aa890', '#8fe6c8'
  ];

  const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], SPREAD = 9;
  const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

  const RGB = PAL.map(h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]);
  const u32 = h => (255 << 24) | (parseInt(h.slice(5,7),16) << 16) | (parseInt(h.slice(3,5),16) << 8) | parseInt(h.slice(1,3),16);
  const PAL32 = new Uint32Array(PAL.map(u32)), LUT = new Uint8Array(32768);
  for (let r = 0; r < 32; r++) for (let g = 0; g < 32; g++) for (let b = 0; b < 32; b++) {
    let best = 0, bd = 1e9;
    const R = r * 8 + 4, G = g * 8 + 4, Bv = b * 8 + 4;
    for (let q = 0; q < RGB.length; q++) {
      const c = RGB[q], e = 2 * (R - c[0]) ** 2 + 4 * (G - c[1]) ** 2 + 3 * (Bv - c[2]) ** 2;
      if (e < bd) { bd = e; best = q; }
    }
    LUT[(r << 10) | (g << 5) | b] = best;
  }

  function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (Math.imul(h ^ (h >>> 13), 1274126177)) | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), l = (a, b, t) => a + (b - a) * t; return l(l(hash(xi, yi), hash(xi + 1, yi), sx), l(hash(xi, yi + 1), hash(xi + 1, yi + 1), sx), sy); }
  const fbm = (x, y) => 0.55 * vnoise(x, y) + 0.3 * vnoise(x * 2.1, y * 2.1 + 7) + 0.15 * vnoise(x * 4.3, y * 4.3 + 19);

  const soft = mk(W, H), sctx = soft.getContext('2d', { willReadFrequently: true });
  const art = mk(W, H), actx = art.getContext('2d'), artImg = actx.createImageData(W, H), art32 = new Uint32Array(artImg.data.buffer);

  const lin = (c, x0, y0, x1, y1, ...st) => { const gr = c.createLinearGradient(x0, y0, x1, y1); st.forEach((col, i) => gr.addColorStop(i / (st.length - 1), col)); return gr; };
  const rad = (c, x, y, r, ...st) => { const gr = c.createRadialGradient(x, y, 0.5, x, y, r); st.forEach((col, i) => gr.addColorStop(i / (st.length - 1), col)); return gr; };
  const glow = (c, x, y, r, rgb, a) => { const gr = c.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2); };
  const ell = (c, x, y, rx, ry, col) => { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); };
  const fillP = (c, col, fn) => { c.fillStyle = col; c.beginPath(); fn(c); c.fill(); };
  const strokeP = (c, col, w, fn) => { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); fn(c); c.stroke(); };
  const limb = (c, ax, ay, ra, bx, by, rb, col) => {
    const a = Math.atan2(by - ay, bx - ax), nx = -Math.sin(a), ny = Math.cos(a), q = Math.PI / 2;
    fillP(c, col, k => { k.moveTo(ax + nx * ra, ay + ny * ra); k.lineTo(bx + nx * rb, by + ny * rb); k.arc(bx, by, rb, a + q, a - q, true); k.lineTo(ax - nx * ra, ay - ny * ra); k.arc(ax, ay, ra, a - q, a + q, true); });
  };
  const reach = (S, T, U, F, bend = 1) => {
    let dx = T[0] - S[0], dy = T[1] - S[1], d = Math.hypot(dx, dy) || 1;
    const m = U + F - 0.4, lo = Math.abs(U - F) + 0.4, k = d > m ? m / d : d < lo ? lo / d : 1;
    dx *= k; dy *= k; d *= k;
    const e = Math.atan2(dy, dx) + bend * Math.acos(Math.min(1, Math.max(-1, (U * U + d * d - F * F) / (2 * U * d))));
    return [[S[0] + U * Math.cos(e), S[1] + U * Math.sin(e)], [S[0] + dx, S[1] + dy]];
  };

  // Static Baked Room
  const ROOM = mk(W, H), COUNTER = mk(W, H), CANDLES = mk(W, H);
  {
    const rnd = mulberry(5);
    const r = ROOM.getContext('2d');
    r.fillStyle = lin(r, 0, 0, 0, CT, '#050409', '#0e0b13', '#17111a'); r.fillRect(0, 0, W, H);
    for (let y = 26; y < CT; y += 12) for (let x = ((y / 12) | 0) % 2 ? -9 : 4; x < W; x += 22 + ((hash(x, y) * 10) | 0)) {
      r.fillStyle = `rgba(${hash(x, y + 3) < 0.5 ? '56,46,60' : '34,28,40'},.45)`; r.fillRect(x, y, 20 + hash(y, x) * 9, 11);
      r.fillStyle = 'rgba(120,104,120,.18)'; r.fillRect(x, y, 20 + hash(y, x) * 9, 1);
    }
    // Lancet Window
    const wx = 62, wy = 32, ww = 26, wh = 66;
    for (const ox of [0, 34]) {
      fillP(r, '#030306', k => { k.moveTo(wx + ox - 4, wy + wh + 3); k.lineTo(wx + ox - 4, wy + 16); k.quadraticCurveTo(wx + ox + ww / 2, wy - 26, wx + ox + ww + 4, wy + 16); k.lineTo(wx + ox + ww + 4, wy + wh + 3); });
      r.save(); r.beginPath(); r.moveTo(wx + ox, wy + wh); r.lineTo(wx + ox, wy + 17); r.quadraticCurveTo(wx + ox + ww / 2, wy - 18, wx + ox + ww, wy + 17); r.lineTo(wx + ox + ww, wy + wh); r.clip();
      r.fillStyle = lin(r, 0, wy - 6, 0, wy + wh, '#070a1c', '#13204e', '#2c3a78'); r.fillRect(wx + ox, wy - 12, ww, wh + 12);
      for (let i = 0; i < 22; i++) { r.fillStyle = `rgba(220,232,255,${0.35 + rnd() * 0.6})`; r.fillRect(wx + ox + rnd() * ww, wy - 6 + rnd() * 40, 1, 1); }
      for (let x = wx + ox; x < wx + ox + ww; x++) { const y = wy + 2 + 5 * Math.sin(x * 0.09) + 2 * Math.sin(x * 0.23), i = 0.4 + 0.6 * vnoise(x * 0.14, 2); r.fillStyle = lin(r, 0, y, 0, y + 20, 'rgba(70,200,170,0)', `rgba(70,200,170,${0.5 * i})`, 'rgba(110,60,170,0)'); r.fillRect(x, y, 1, 20); }
      if (ox > 0) {
        const mx = wx + ox + 13, my = wy + 24;
        glow(r, mx, my, 24, '170,198,240', 0.5);
        ell(r, mx, my, 8, 8, rad(r, mx - 3, my - 3, 9, '#ffffff', '#dfe7f0', '#9db6dc'));
        for (const [dx, w, h] of [[-7, 2, 8], [6, 2, 10], [-3, 2, 13], [2, 2, 15], [0, 3, 19]]) { r.fillStyle = '#070a18'; r.fillRect(mx + dx - w / 2, my + 11 - h, w, h); }
      }
      for (let x = wx + ox; x < wx + ox + ww; x++) { r.fillStyle = '#101a3c'; r.fillRect(x, wy + wh - 10 - 7 * fbm((x + ox) * 0.06, 4), 1, 30); }
      for (let y = wy - 10; y < wy + wh; y += 9) { r.fillStyle = 'rgba(3,3,6,.9)'; r.fillRect(wx + ox, y, ww, 1); }
      r.fillStyle = 'rgba(3,3,6,.9)'; r.fillRect(wx + ox + ww / 2 - 0.5, wy - 14, 1, wh + 14);
      r.restore();
    }
    // Posts & Beams
    for (const x of [0, 52, 142, 228, W]) { r.fillStyle = lin(r, x - 6, 0, x + 6, 0, '#2a1a18', '#0e0a0e'); r.fillRect(x - 6, 0, 12, CT); }
    r.fillStyle = lin(r, 0, 16, 0, 30, '#2c1b18', '#0e0a0e'); r.fillRect(0, 16, W, 14);
    r.fillStyle = '#040306'; r.fillRect(0, 0, W, 16);
    // Chandelier Ring
    ell(r, 146, 52, 22, 4.6, '#050409'); ell(r, 146, 51, 22, 4.2, lin(r, 124, 0, 168, 0, '#16131e', '#4a4a52', '#16131e'));
    for (const dx of [-15, 0, 15]) { r.fillStyle = '#b98470'; r.fillRect(146 + dx - 1.2, 44, 2.4, 6); }
    // Shelves with skull
    for (const y of [76, 104]) {
      r.fillStyle = lin(r, 0, y, 0, y + 4, '#40241a', '#16100f'); r.fillRect(144, y, 80, 4);
      for (let x = 148; x < 218; x += 8 + ((hash(x, y) * 4) | 0)) {
        const h = 7 + hash(x, y + 1) * 10, w = 3.5, col = ['#1f2c24', '#3a1414', '#1a2740', '#40241a'][(x + y) % 4];
        r.fillStyle = lin(r, x, 0, x + w, 0, col, '#07060b'); r.fillRect(x, y - h, w, h);
      }
    }
    ell(r, 212, 98, 5.5, 5, '#c4c4c8'); r.fillStyle = '#96969e'; r.fillRect(208.5, 100, 7, 4);
    ell(r, 210, 98, 1.5, 1.7, '#07060b'); ell(r, 214, 98, 1.5, 1.7, '#07060b');
    // Hearth with Horned Skull
    const hx = 232, hy = 62;
    r.fillStyle = lin(r, hx, 0, W, 0, '#201b28', '#383040', '#16131e'); r.fillRect(hx, hy, W - hx, CT - hy);
    const hearthPath = k => { k.moveTo(hx + 8, CT); k.lineTo(hx + 8, hy + 38); k.quadraticCurveTo(hx + 28, hy + 6, hx + 46, hy + 38); k.lineTo(hx + 46, CT); };
    fillP(r, '#040306', hearthPath);
    r.fillStyle = lin(r, 0, hy - 7, 0, hy, '#40241a', '#16100f'); r.fillRect(hx - 4, hy - 7, W - hx + 4, 7);
    const sx = hx + 26, sy = hy - 18;
    for (const s of [-1, 1]) {
      fillP(r, lin(r, sx, 0, sx + s * 22, 0, '#b98470', '#4a2e28'), k => {
        k.moveTo(sx + s * 5, sy - 2); k.bezierCurveTo(sx + s * 14, sy - 3, sx + s * 23, sy - 10, sx + s * 21, sy - 18);
        k.bezierCurveTo(sx + s * 18, sy - 10, sx + s * 12, sy - 6, sx + s * 5, sy + 1);
      });
    }
    fillP(r, lin(r, sx - 7, 0, sx + 7, 0, '#96969e', '#d8ac94', '#6e4438'), k => {
      k.moveTo(sx - 7, sy - 5); k.quadraticCurveTo(sx, sy - 9, sx + 7, sy - 5); k.lineTo(sx + 4, sy + 5); k.lineTo(sx + 2.5, sy + 11); k.lineTo(sx - 2.5, sy + 11); k.lineTo(sx - 4, sy + 5);
    });
    ell(r, sx - 3, sy - 1, 1.8, 2.2, '#07060b'); ell(r, sx + 3, sy - 1, 1.8, 2.2, '#07060b');
    // Counter
    const c = COUNTER.getContext('2d');
    c.fillStyle = lin(c, 0, CT, 0, CT + 9, '#b9713a', '#754026', '#40241a'); c.fillRect(0, CT, W, 9);
    c.fillStyle = 'rgba(255,214,150,.6)'; c.fillRect(0, CT, W, 1.2);
    c.fillStyle = lin(c, 0, CT + 11, 0, H, '#40241a', '#1c1210', '#07060b'); c.fillRect(0, CT + 11, W, H - CT - 11);
    c.fillStyle = '#07060b'; c.fillRect(16, CT + 42, W - 32, 5);
    c.fillStyle = '#ce8c17'; c.fillRect(0, H - 10, W, 3.5);
    // Candles
    const cd = CANDLES.getContext('2d');
    for (const cx of [76, 194]) {
      const b = CT + 7.6;
      ell(cd, cx, b, 7, 1.9, '#07060b');
      cd.fillStyle = lin(cd, 0, b - 12, 0, b, '#fbe09a', '#d8ac94', '#946050'); cd.fillRect(cx - 3, b - 11.5, 6, 11);
      ell(cd, cx, b - 11.5, 3, 1, '#fff6d0');
      cd.fillStyle = '#07060b'; cd.fillRect(cx - 0.4, b - 13.6, 0.9, 2.4);
    }
  }

  function crush() {
    const d = sctx.getImageData(0, 0, W, H).data;
    for (let y = 0, i = 0, j = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i += 4, j++) {
        const nz = ((B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5) * SPREAD;
        let r = d[i] + nz, g = d[i + 1] + nz, b = d[i + 2] + nz;
        r = r < 0 ? 0 : r > 255 ? 255 : r; g = g < 0 ? 0 : g > 255 ? 255 : g; b = b < 0 ? 0 : b > 255 ? 255 : b;
        art32[j] = PAL32[LUT[(((r >> 3) & 0x1f) << 10) | (((g >> 3) & 0x1f) << 5) | ((b >> 3) & 0x1f)]];
      }
    }
    actx.putImageData(artImg, 0, 0);
  }

  const LIVE = new Set();

  class TavernScribeElement extends HTMLElement {
    static get observedAttributes() { return ['state', 'volume']; }
    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).innerHTML = `
        <style>
          :host { display: block; width: 100%; height: 100%; }
          canvas { width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; image-rendering: crisp-edges; }
        </style>
        <canvas width="${W * 2}" height="${H * 2}"></canvas>
      `;
      this.canvas = this.shadowRoot.querySelector('canvas');
      this.viewCtx = this.canvas.getContext('2d');
      this.viewCtx.imageSmoothingEnabled = false;

      this.time = 0;
      this.stateVal = 'listening';
      this.volVal = 0.2;
      this.quillProgress = 0;
      this.activeComment = null;
      this.commentTimer = 3.0;
    }

    connectedCallback() { LIVE.add(this); }
    disconnectedCallback() { LIVE.delete(this); }
    attributeChangedCallback(name, oldVal, newVal) {
      if (name === 'state') this.stateVal = newVal || 'listening';
      if (name === 'volume') this.volVal = parseFloat(newVal) || 0;
    }

    advance(dt) {
      this.time += dt;
      const t = this.time;
      const isWriting = this.stateVal === 'writing';
      if (isWriting) this.quillProgress += dt * 0.9;

      sctx.clearRect(0, 0, W, H);
      sctx.drawImage(ROOM, 0, 0);

      // Chandelier flames
      for (const dx of [-15, 0, 15]) {
        glow(sctx, 146 + dx, 44, 18, '255,180,90', 0.5);
        sctx.fillStyle = '#f0bb62'; sctx.fillRect(146 + dx - 1, 41, 2, 4);
      }

      // Hearth Fire
      const f = 0.82 + 0.18 * vnoise(t * 7, 3);
      glow(sctx, 260, CT - 10, 80, '255,110,30', 0.25 * f);

      // Scribe
      const breath = Math.sin(t * 2.4) * 0.8;
      const torsoY = CT - 54 + breath;
      sctx.fillStyle = '#10182a';
      sctx.beginPath();
      sctx.moveTo(30, CT + 6); sctx.lineTo(34, torsoY + 14); sctx.lineTo(58, torsoY + 14); sctx.lineTo(62, CT + 6);
      sctx.fill();

      // Parchment Scroll
      sctx.fillStyle = '#fff6d0'; sctx.fillRect(40, CT - 5, 26, 7);
      if (isWriting) {
        for (let i = 0; i < 3; i++) {
          sctx.fillStyle = 'rgba(28,18,16,.85)';
          sctx.fillRect(44, CT - 4 + i * 2, 16, 1);
        }
      }

      if (!isWriting) {
        // Head Facing User
        ell(sctx, 46, torsoY + 1, 8.5, 9, '#d8ac94');
        ell(sctx, 46, torsoY + 6, 6.5, 5, '#946050');
        sctx.strokeStyle = '#f0bb62'; sctx.lineWidth = 1;
        sctx.strokeRect(40, torsoY - 2, 5, 4.5); sctx.strokeRect(47, torsoY - 2, 5, 4.5);
        // Upright Quill
        sctx.strokeStyle = '#dfe7f0'; sctx.lineWidth = 1.4;
        sctx.beginPath(); sctx.moveTo(64, CT - 12); sctx.lineTo(64, CT - 32); sctx.stroke();
      } else {
        // Head Down Writing
        ell(sctx, 50, torsoY + 7, 8, 8, '#d8ac94');
        ell(sctx, 52, torsoY + 11, 6, 4.5, '#946050');
        sctx.strokeStyle = '#dfe7f0'; sctx.lineWidth = 1.3;
        sctx.beginPath(); sctx.moveTo(56, CT - 4); sctx.lineTo(68, CT - 22); sctx.stroke();
      }

      // Ironhelm Dwarf (x = 104)
      ell(sctx, 104, CT - 45, 14, 12, '#6c6c76');
      sctx.fillStyle = '#d99448'; sctx.fillRect(94, CT - 38, 20, 24);
      sctx.fillStyle = '#07060b'; sctx.fillRect(93, CT - 44, 22, 5);
      for (const s of [-1, 1]) {
        sctx.fillStyle = '#fbe09a'; sctx.fillRect(104 + s * 5 - 1 + (isWriting ? -2 : 0), CT - 42.5, 2.2, 1.4);
      }

      // Greybeard Wizard (x = 158)
      ell(sctx, 158, CT - 54, 10, 10.5, '#d8ac94');
      sctx.fillStyle = '#c4c4c8'; sctx.fillRect(150, CT - 52, 16, 32);
      // Staff with rune
      glow(sctx, 131, 36, 16, '58,168,144', 0.7);
      sctx.fillStyle = '#3aa890'; sctx.fillRect(129, 28, 4, 12);

      // Ranger Elf (x = 210)
      sctx.fillStyle = '#1f2c24'; sctx.fillRect(198, CT - 65, 24, 65);
      for (const s of [-1, 1]) {
        sctx.fillStyle = '#8fe6c8'; sctx.fillRect(210 + s * 4 - 1 + (isWriting ? -1.5 : 0), CT - 67, 2.1, 1.2);
      }

      // Burglar (x = 252)
      ell(sctx, 252, CT - 26, 10, 10, '#d8ac94');
      sctx.fillStyle = '#07060b'; sctx.fillRect(248, CT - 27.5, 3.5, 3); // Eyepatch
      sctx.fillStyle = '#fbe09a'; sctx.fillRect(255 + (isWriting ? -1.5 : 0), CT - 28, 2, 1.3);

      // Counter & Candles
      sctx.drawImage(COUNTER, 0, 0);
      sctx.drawImage(CANDLES, 0, 0);

      crush();

      this.viewCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.viewCtx.drawImage(actx.canvas, 0, 0, this.canvas.width, this.canvas.height);
    }
  }

  customElements.define('tavern-scribe', TavernScribeElement);

  // Animation Loop
  let last = performance.now();
  requestAnimationFrame(function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const el of LIVE) el.advance(dt);
    requestAnimationFrame(loop);
  });
})();
