// TavernScribe: A living pixel world control for audio notes and evening journaling.
// 260x180 Grand Tavern with Moonlit Gothic Window, 3-Candle Chandelier, Roaring Fireplace,
// Scribe sitting by the bar on the left, and listening patrons on the right.
(() => {
  'use strict';

  const W = 260, H = 180, BAR_Y = 120;
  const PAL = [
    '#05050e', '#0b0c1a', '#121426', '#1a1d36', '#262a4a', '#373c64', '#4e5684', '#6d78a8', '#94a0cc', '#c2cef0', '#ffffff',
    '#1c1008', '#2e190d', '#452513', '#61351b', '#824924', '#a65f2f', '#cc7a3d', '#ed974e', '#f8b66e', '#fcd598', '#fff1c7',
    '#0a1f16', '#123324', '#1c4d37', '#2a6e4f', '#3c966c', '#57be8d', '#84e1b3', '#c6f5dd',
    '#28080c', '#440e15', '#6b1721', '#96222e', '#c43333', '#e8584f', '#f48773', '#fbc0b0',
    '#181614', '#2b2723', '#443e38', '#635b52', '#877c70', '#b0a394', '#d8cebf', '#f5eee4',
    '#3e1e12', '#61301d', '#8c472a', '#bc653d', '#e08759', '#f2ae85', '#fad0b1',
    '#142328', '#20373e', '#32525c', '#4d7582', '#729fae', '#a3cad6', '#d6edf3',
    '#6b4507', '#9c660e', '#ce8c17', '#f2b227', '#f8ce53', '#fde789', '#fffcc7'
  ];

  const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], SPREAD = 7;
  const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  
  const RGB = PAL.map(h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]);
  const u32 = h => (255 << 24) | (parseInt(h.slice(5,7),16) << 16) | (parseInt(h.slice(3,5),16) << 8) | parseInt(h.slice(1,3),16);
  const PAL32 = new Uint32Array(PAL.map(u32)), LUT = new Uint8Array(32768);
  for (let r = 0; r < 32; r++) for (let g = 0; g < 32; g++) for (let b = 0; b < 32; b++) {
    let best = 0, bd = 1e9; const Rr = r * 8 + 4, Gg = g * 8 + 4, Bb = b * 8 + 4;
    for (let q = 0; q < RGB.length; q++) {
      const c = RGB[q], e = 2 * (Rr - c[0]) ** 2 + 4 * (Gg - c[1]) ** 2 + 3 * (Bb - c[2]) ** 2;
      if (e < bd) { bd = e; best = q; }
    }
    LUT[(r << 10) | (g << 5) | b] = best;
  }

  const soft = mk(W, H), sctx = soft.getContext('2d', { willReadFrequently: true });
  const art = mk(W, H), actx = art.getContext('2d'), artImg = actx.createImageData(W, H), art32 = new Uint32Array(artImg.data.buffer);
  const POOL = [];
  function scratch() {
    const c = POOL.pop() || mk(W, H), x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.clearRect(0, 0, W, H);
    return c;
  }
  const release = (...cs) => { for (const c of cs) if (c) POOL.push(c); };

  function drawLayer(fn) {
    const L = scratch(), ctx = L.getContext('2d');
    ctx.save(); fn(ctx); ctx.restore(); return L;
  }

  function applyLight(L, amb, lights) {
    const k = L.getContext('2d'), M = scratch(), m = M.getContext('2d');
    m.fillStyle = amb; m.fillRect(0, 0, W, H); m.globalCompositeOperation = 'lighter';
    for (const [x, y, r, rgb, a] of lights) {
      const s = Math.min(1.2, Math.max(0, a));
      if (s <= 0) continue;
      const gr = m.createRadialGradient(x, y, 2, x, y, r);
      gr.addColorStop(0, `rgba(${rgb},${s})`);
      gr.addColorStop(0.38, `rgba(${rgb},${s * 0.6})`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      m.fillStyle = gr; m.fillRect(0, 0, W, H);
    }
    m.globalCompositeOperation = 'destination-in'; m.drawImage(L, 0, 0);
    k.globalCompositeOperation = 'multiply'; k.drawImage(M, 0, 0); k.globalCompositeOperation = 'source-over';
    release(M); return L;
  }

  function applyRim(L, dx, dy, x, y, r, rgb, a) {
    if (a <= 0) return;
    const k = L.getContext('2d'), R = scratch(), q = R.getContext('2d');
    q.drawImage(L, 0, 0); q.globalCompositeOperation = 'source-in';
    const gr = q.createRadialGradient(x, y, 2, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},${a})`);
    gr.addColorStop(0.5, `rgba(${rgb},${a * 0.5})`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    q.fillStyle = gr; q.fillRect(0, 0, W, H);
    q.globalCompositeOperation = 'destination-out'; q.drawImage(L, dx, dy);
    k.globalCompositeOperation = 'source-atop'; k.drawImage(R, 0, 0); k.globalCompositeOperation = 'source-over';
    release(R);
  }

  function crush() {
    const d = sctx.getImageData(0, 0, W, H).data;
    for (let y = 0, i = 0, j = 0; y < H; y++) for (let x = 0; x < W; x++, i += 4, j++) {
      const nz = ((B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5) * SPREAD;
      let r = d[i] + nz, g = d[i + 1] + nz, b = d[i + 2] + nz;
      r = r < 0 ? 0 : r > 255 ? 255 : r; g = g < 0 ? 0 : g > 255 ? 255 : g; b = b < 0 ? 0 : b > 255 ? 255 : b;
      art32[j] = PAL32[LUT[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)]];
    }
    actx.putImageData(artImg, 0, 0);
    return art;
  }

  // Pre-bake environment
  const ROOM = mk(W, H), BAR = mk(W, H);
  {
    const r = ROOM.getContext('2d');
    const wg = r.createLinearGradient(0, 0, 0, BAR_Y);
    wg.addColorStop(0, '#3e1e12'); wg.addColorStop(0.5, '#2e190d'); wg.addColorStop(1, '#1c1008');
    r.fillStyle = wg; r.fillRect(0, 0, W, BAR_Y);

    r.fillStyle = '#2b2723'; r.fillRect(0, 0, W, 14); r.fillStyle = '#443e38'; r.fillRect(0, 14, W, 2);

    for (const bx of [14, 75, 138, 198]) {
      r.fillStyle = '#24130a'; r.fillRect(bx, 0, 10, BAR_Y);
      r.fillStyle = '#61351b'; r.fillRect(bx + 1, 0, 2, BAR_Y);
      r.fillStyle = '#120a05'; r.fillRect(bx + 8, 0, 2, BAR_Y);
    }
    for (let y = 22; y < BAR_Y; y += 16) {
      r.fillStyle = 'rgba(11, 12, 26, 0.7)'; r.fillRect(0, y, W, 1.8);
      r.fillStyle = 'rgba(166, 95, 47, 0.25)'; r.fillRect(0, y + 1.8, W, 1.0);
    }

    // Moonlit Window
    r.fillStyle = '#181614'; r.beginPath(); r.arc(37, 34, 18, Math.PI, Math.PI * 2); r.rect(19, 34, 36, 34); r.fill();
    r.strokeStyle = '#443e38'; r.lineWidth = 2.5; r.stroke();
    const skyGrad = r.createLinearGradient(19, 16, 19, 68);
    skyGrad.addColorStop(0, '#0b0c1a'); skyGrad.addColorStop(0.7, '#1a1d36'); skyGrad.addColorStop(1, '#262a4a');
    r.fillStyle = skyGrad; r.beginPath(); r.arc(37, 34, 16, Math.PI, Math.PI * 2); r.rect(21, 34, 32, 32); r.fill();
    r.fillStyle = '#fffcc7'; r.beginPath(); r.arc(42, 28, 6.5, 0, Math.PI * 2); r.fill();
    r.fillStyle = '#1a1d36'; r.beginPath(); r.arc(44, 27, 5.5, 0, Math.PI * 2); r.fill();
    for (const [sx, sy] of [[26, 24], [34, 22], [48, 24], [25, 42], [50, 40], [32, 54]]) {
      r.fillStyle = '#ffffff'; r.fillRect(sx, sy, 1, 1);
    }

    // Shelves & Bottles
    for (const sy of [38, 66, 94]) {
      r.fillStyle = '#61351b'; r.fillRect(86, sy, 114, 4);
      r.fillStyle = '#824924'; r.fillRect(86, sy, 114, 1.2);
      r.fillStyle = '#1c1008'; r.fillRect(86, sy + 4, 114, 2.5);
      r.fillStyle = '#121426'; r.fillRect(94, sy + 4, 3, 6); r.fillRect(140, sy + 4, 3, 6); r.fillRect(188, sy + 4, 3, 6);
      if (sy === 94) {
        for (const kx of [90, 116, 172]) {
          r.fillStyle = '#824924'; r.beginPath(); r.arc(kx + 9, 83, 10, 0, Math.PI * 2); r.fill();
          r.fillStyle = '#452513'; r.fillRect(kx, 73, 18, 20);
          r.fillStyle = '#ce8c17'; r.fillRect(kx, 76, 18, 1.5); r.fillRect(kx, 89, 18, 1.5);
          r.fillStyle = '#f8ce53'; r.fillRect(kx + 8, 86, 3, 3);
        }
      }
      const bcols = ['#2a6e4f', '#96222e', '#ce8c17', '#373c64', '#a65f2f', '#4d7582'];
      for (let bx = 90; bx < 194; bx += 7) {
        if (sy === 94 && (bx < 136 || bx > 170)) continue;
        const col = bcols[(bx / 7) % bcols.length], bh = 7 + ((bx * 3) % 7);
        r.fillStyle = col; r.fillRect(bx, sy - bh, 5, bh);
        r.fillStyle = 'rgba(255,255,255,0.55)'; r.fillRect(bx + 1, sy - bh + 1, 1.2, bh - 2);
        r.fillStyle = '#824924'; r.fillRect(bx + 1.5, sy - bh - 3, 2, 3);
      }
    }

    // Roaring Fireplace on Right Wall
    r.fillStyle = '#2b2723'; r.fillRect(206, 14, 54, BAR_Y - 14);
    r.fillStyle = '#61351b'; r.fillRect(202, 60, 58, 5);
    r.fillStyle = '#05050e'; r.beginPath(); r.arc(233, 85, 18, Math.PI, Math.PI * 2); r.rect(215, 85, 36, 35); r.fill();
    r.fillStyle = '#452513'; r.fillRect(220, 110, 26, 4);
    r.fillStyle = '#6b1721'; r.beginPath(); r.ellipse(233, 118, 18, 3, 0, 0, Math.PI * 2); r.fill();
    r.fillStyle = '#ed974e'; r.beginPath(); r.ellipse(235, 117, 4.5, 2.5, 0, 0, Math.PI * 2); r.fill();

    // Bar Surface
    const b = BAR.getContext('2d');
    const bg = b.createLinearGradient(0, BAR_Y, 0, BAR_Y + 16);
    bg.addColorStop(0, '#cc7a3d'); bg.addColorStop(0.12, '#a65f2f'); bg.addColorStop(0.65, '#824924'); bg.addColorStop(1, '#61351b');
    b.fillStyle = bg; b.fillRect(0, BAR_Y, W, 16);
    b.fillStyle = '#fcd598'; b.fillRect(0, BAR_Y, W, 1.5);
    b.fillStyle = 'rgba(255,252,199,0.7)'; b.fillRect(0, BAR_Y + 1.5, W, 0.8);
    b.fillStyle = '#1c1008'; b.fillRect(0, BAR_Y + 16, W, 2.5);

    const ag = b.createLinearGradient(0, BAR_Y + 18, 0, H);
    ag.addColorStop(0, '#452513'); ag.addColorStop(0.7, '#2e190d'); ag.addColorStop(1, '#1c1008');
    b.fillStyle = ag; b.fillRect(0, BAR_Y + 18, W, H - (BAR_Y + 18));
    for (let x = 14; x < W; x += 20) {
      b.fillStyle = '#0b0c1a'; b.fillRect(x, BAR_Y + 18, 1.8, H - (BAR_Y + 18));
    }
    b.fillStyle = '#ce8c17'; b.fillRect(0, 171, W, 3.5);
    b.fillStyle = '#fffcc7'; b.fillRect(0, 171, W, 1);
    for (let rx = 28; rx < W; rx += 56) {
      b.fillStyle = '#6b4507'; b.fillRect(rx - 2, 170, 5, 5);
    }
  }

  function reach(S, T, U = 10, F = 12, bend = 1) {
    let dx = T[0] - S[0], dy = T[1] - S[1], d = Math.hypot(dx, dy) || 1;
    const m = U + F - 0.4, lo = Math.abs(U - F) + 0.4, k = d > m ? m / d : d < lo ? lo / d : 1;
    dx *= k; dy *= k; d *= k;
    const e = Math.atan2(dy, dx) + bend * Math.acos(Math.min(1, Math.max(-1, (U * U + d * d - F * F) / (2 * U * d))));
    return [[S[0] + U * Math.cos(e), S[1] + U * Math.sin(e)], [S[0] + dx, S[1] + dy]];
  }

  const LIVE = new Set();

  class TavernScribeElement extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).innerHTML = `
        <style>
          :host { display: block; position: relative; width: 100%; height: 100%; min-height: 400px; user-select: none; }
          canvas { display: block; width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated; }
          .screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
        </style>
        <canvas width="${W * 2}" height="${H * 2}"></canvas>
        <div class="screen-reader" role="status">The Tavern Scribe</div>
      `;
      this.canvas = this.shadowRoot.querySelector('canvas');
      this.viewCtx = this.canvas.getContext('2d');
      this.viewCtx.imageSmoothingEnabled = false;
      this.sr = this.shadowRoot.querySelector('.screen-reader');

      this.time = 0;
      this.stateVal = 'listening';
      this.volVal = 0.05;
      this.blinkTimer = 2.5;
      this.isBlinking = false;
      this.inkLines = 0;
      this.activeComment = null;
      this.commentCooldown = 2.0;

      this.barkeepComments = ["Pour another for that...", "By the hearth, speak on!", "Aye, an honest day's toil."];
      this.dwarfComments = ["Write that down, scribe!", "A fierce battle today!", "Drink deep, brave soul!"];
      this.rangerComments = ["The stars bore witness.", "A heavy burden, traveler.", "Silence... let him speak."];
    }

    static get observedAttributes() { return ['state', 'volume', 'speaking']; }

    attributeChangedCallback(name, oldVal, newVal) {
      if (name === 'state') this.state = newVal;
      if (name === 'volume') this.volume = parseFloat(newVal) || 0.05;
      if (name === 'speaking') this.state = (newVal === 'true' || newVal === '') ? 'writing' : 'listening';
    }

    get state() { return this.stateVal; }
    set state(v) {
      const prev = this.stateVal;
      this.stateVal = (v === 'writing' || v === 'speaking') ? 'writing' : 'listening';
      if (prev !== this.stateVal) {
        this.sr.textContent = this.stateVal === 'writing' ? 'Scribe is writing down your words' : 'Scribe has lifted his head to listen to you';
        if (this.stateVal === 'writing') this.triggerRandomComment();
      }
    }

    get volume() { return this.volVal; }
    set volume(v) { this.volVal = Math.max(0, Math.min(1, v)); }

    connectedCallback() {
      LIVE.add(this);
      this.canvas.addEventListener('click', () => this.triggerRandomComment());
    }

    disconnectedCallback() { LIVE.delete(this); }

    triggerRandomComment(txt) {
      const pIdx = Math.floor(Math.random() * 3);
      let text = txt, x = 116, y = 84;
      if (pIdx === 0) { text = text || this.barkeepComments[Math.floor(Math.random() * this.barkeepComments.length)]; x = 116; y = 84; }
      else if (pIdx === 1) { text = text || this.dwarfComments[Math.floor(Math.random() * this.dwarfComments.length)]; x = 162; y = 84; }
      else { text = text || this.rangerComments[Math.floor(Math.random() * this.rangerComments.length)]; x = 202; y = 80; }
      this.activeComment = { text, x, y, timer: 3.5 };
    }

    advance(dt) {
      this.time += dt;
      const isWriting = this.stateVal === 'writing';
      if (isWriting) this.inkLines = Math.min(4, this.inkLines + dt * 0.8);

      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.isBlinking = !this.isBlinking;
        this.blinkTimer = this.isBlinking ? 0.16 : 2.5 + Math.random() * 2;
      }

      if (this.activeComment) {
        this.activeComment.timer -= dt;
        if (this.activeComment.timer <= 0) {
          this.activeComment = null;
          this.commentCooldown = 4.0 + Math.random() * 3;
        }
      } else {
        this.commentCooldown -= dt;
        if (this.commentCooldown <= 0) this.triggerRandomComment();
      }

      this.paint();
    }

    paint() {
      const t = this.time, isWriting = this.stateVal === 'writing', breath = Math.sin(t * 2.4) * 0.9;
      sctx.clearRect(0, 0, W, H);

      const amb = 'rgb(48, 40, 68)';
      const candleFlick = 0.88 + 0.12 * Math.sin(t * 14);
      const audioGlow = isWriting ? this.volVal * 0.5 : 0;
      const chandelierFlick = 0.9 + 0.1 * Math.cos(t * 8);
      const fireFlick = 0.85 + 0.15 * Math.sin(t * 11);

      const lights = [
        [33, 105, 80, '255, 210, 110', (1.1 + audioGlow) * candleFlick],
        [135, 34, 120, '255, 220, 130', 1.0 * chandelierFlick],
        [233, 104, 110, '255, 120, 50', 1.1 * fireFlick],
        [37, 34, 55, '148, 175, 245', 0.65]
      ];

      // 1. Room
      const lRoom = drawLayer(ctx => ctx.drawImage(ROOM, 0, 0));
      applyLight(lRoom, amb, lights);
      sctx.drawImage(lRoom, 0, 0); release(lRoom);

      // 2. Characters
      const lChars = drawLayer(ctx => {
        // Scribe Stool & Body
        ctx.fillStyle = '#2e190d'; ctx.fillRect(32, 124, 22, 5); ctx.fillRect(34, 129, 4, 38); ctx.fillRect(48, 129, 4, 38);
        const torsoY = 94 + breath;
        ctx.fillStyle = '#123324';
        ctx.beginPath(); ctx.moveTo(30, 124); ctx.lineTo(34, torsoY + 12); ctx.lineTo(52, torsoY + 12); ctx.lineTo(56, 124); ctx.fill();
        ctx.fillStyle = '#2a6e4f'; ctx.fillRect(38, torsoY + 6, 4, 24); ctx.fillRect(46, torsoY + 8, 3, 22);
        ctx.fillStyle = '#f8ce53'; ctx.fillRect(42, torsoY + 2, 4, 4);

        if (!isWriting) {
          // Scribe Facing User
          const headX = 43, headY = 78 + breath * 0.7;
          ctx.fillStyle = '#0a1f16'; ctx.beginPath(); ctx.arc(headX, headY - 1, 10, Math.PI, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#3c966c'; ctx.fillRect(headX - 10, headY - 2, 20, 2.5);
          ctx.fillStyle = '#fad0b1'; ctx.beginPath(); ctx.arc(headX, headY + 4, 8, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#635b52'; ctx.beginPath(); ctx.arc(headX, headY + 8, 6, 0, Math.PI); ctx.fill();

          if (this.isBlinking) {
            ctx.fillStyle = '#452513'; ctx.fillRect(headX - 5, headY + 3, 4, 1.2); ctx.fillRect(headX + 2, headY + 3, 4, 1.2);
          } else {
            ctx.strokeStyle = '#f8ce53'; ctx.lineWidth = 1;
            ctx.strokeRect(headX - 6, headY + 1, 5, 4); ctx.strokeRect(headX + 2, headY + 1, 5, 4);
            ctx.fillStyle = '#f8ce53'; ctx.fillRect(headX - 1, headY + 2.5, 3, 1);
            ctx.fillStyle = '#05050e'; ctx.fillRect(headX - 4.5, headY + 2.5, 2.2, 2.2); ctx.fillRect(headX + 3.5, headY + 2.5, 2.2, 2.2);
            ctx.fillStyle = '#ffffff'; ctx.fillRect(headX - 4.5, headY + 2.5, 1, 1); ctx.fillRect(headX + 3.5, headY + 2.5, 1, 1);
          }

          // Upright Arm
          const [elbow, hand] = reach([50, torsoY + 6], [64, 102 + breath * 0.5], 10, 11, 1);
          ctx.strokeStyle = '#123324'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(50, torsoY + 6); ctx.lineTo(elbow[0], elbow[1]); ctx.stroke();
          ctx.strokeStyle = '#2a6e4f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(elbow[0], elbow[1]); ctx.lineTo(hand[0], hand[1]); ctx.stroke();
          ctx.fillStyle = '#fad0b1'; ctx.fillRect(hand[0] - 2, hand[1] - 2, 4, 4);

          ctx.save(); ctx.translate(hand[0], hand[1]); ctx.rotate(-0.55 + Math.sin(t * 3) * 0.05);
          ctx.fillStyle = '#f8ce53'; ctx.fillRect(-0.6, 0, 1.4, 5);
          ctx.strokeStyle = '#c2cef0'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -18); ctx.stroke();
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.quadraticCurveTo(5, -13, 0, -20); ctx.quadraticCurveTo(-5, -13, 0, -6); ctx.fill();
          ctx.restore();
        } else {
          // Scribe Head Down Writing
          const headX = 48, headY = 82 + breath * 0.4;
          ctx.fillStyle = '#0a1f16'; ctx.beginPath(); ctx.arc(headX, headY - 1, 10, Math.PI * 0.8, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#3c966c'; ctx.fillRect(headX - 8, headY - 1, 18, 2.5);
          ctx.fillStyle = '#fad0b1'; ctx.beginPath(); ctx.arc(headX + 3, headY + 4, 7.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#635b52'; ctx.beginPath(); ctx.moveTo(headX, headY + 7); ctx.lineTo(headX + 8, headY + 12); ctx.lineTo(headX + 2, headY + 12); ctx.fill();

          const penX = 52 + ((t * 7) % 1) * 18, penY = 115 + (Math.sin(t * 36) > 0 ? 1 : -1) * this.volVal;
          const [elbow, hand] = reach([50, torsoY + 6], [penX, penY], 10, 11, 1);
          ctx.strokeStyle = '#123324'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(50, torsoY + 6); ctx.lineTo(elbow[0], elbow[1]); ctx.stroke();
          ctx.strokeStyle = '#2a6e4f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(elbow[0], elbow[1]); ctx.lineTo(hand[0], hand[1]); ctx.stroke();
          ctx.fillStyle = '#fad0b1'; ctx.fillRect(hand[0] - 2, hand[1] - 2, 4, 4);

          ctx.save(); ctx.translate(hand[0], hand[1]); ctx.rotate(-1.25 + Math.sin(t * 26) * 0.1);
          ctx.fillStyle = '#f8ce53'; ctx.fillRect(-0.6, 0, 1.4, 5);
          ctx.strokeStyle = '#c2cef0'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -18); ctx.stroke();
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(0, -5); ctx.quadraticCurveTo(5, -12, 0, -20); ctx.quadraticCurveTo(-5, -12, 0, -5); ctx.fill();
          ctx.restore();
        }

        // Parchment on counter
        ctx.fillStyle = '#fff1c7'; ctx.fillRect(48, 116, 34, 11);
        ctx.fillStyle = '#2e190d';
        const lines = Math.min(4, Math.floor(this.inkLines));
        for (let i = 0; i < lines; i++) ctx.fillRect(52, 119 + i * 2, 26, 1);
        if (isWriting) ctx.fillRect(52, 119 + (lines % 4) * 2, Math.floor(((t * 7) % 1) * 26), 1);
        ctx.fillStyle = '#ce8c17'; ctx.fillRect(28, 118, 9, 3); ctx.fillStyle = '#f5eee4'; ctx.fillRect(31, 108, 4, 10);
        ctx.fillStyle = '#1c1008'; ctx.fillRect(32.5, 106, 1.2, 2);

        // Patrons
        const bkX = 116, bkY = 94, bkb = Math.sin(t * 2.1 + 1) * 0.8;
        ctx.fillStyle = '#f5eee4'; ctx.fillRect(bkX - 10, bkY + 8 + bkb, 20, 18);
        ctx.fillStyle = '#824924'; ctx.fillRect(bkX - 10, bkY + 8 + bkb, 5, 18); ctx.fillRect(bkX + 5, bkY + 8 + bkb, 5, 18);
        if (!isWriting) {
          ctx.fillStyle = '#fad0b1'; ctx.beginPath(); ctx.arc(bkX, bkY + bkb, 8, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.fillRect(bkX - 3, bkY - 6 + bkb, 6, 1.5);
          ctx.fillStyle = '#61351b'; ctx.fillRect(bkX - 5, bkY + 2 + bkb, 10, 3.5);
          ctx.fillStyle = '#05050e'; ctx.fillRect(bkX - 4, bkY - 1 + bkb, 2, 2); ctx.fillRect(bkX + 2, bkY - 1 + bkb, 2, 2);
          const mugX = bkX - 4 + Math.cos(t * 4) * 2, mugY = 114 + Math.sin(t * 4) * 1.5;
          ctx.fillStyle = '#a65f2f'; ctx.fillRect(mugX, mugY - 8, 8, 10);
        } else {
          ctx.fillStyle = '#fad0b1'; ctx.beginPath(); ctx.arc(bkX - 3, bkY + 2, 8, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#61351b'; ctx.fillRect(bkX - 8, bkY + 4, 8, 3.5);
          ctx.fillStyle = '#05050e'; ctx.fillRect(bkX - 7, bkY + 1, 2.5, 2.5);
          ctx.fillStyle = '#fad0b1'; ctx.fillRect(bkX - 12, 114, 8, 5); ctx.fillRect(bkX + 4, 114, 8, 5);
          ctx.fillStyle = '#a65f2f'; ctx.fillRect(bkX + 14, 110, 8, 10);
        }

        // Dwarf
        const dwX = 162, dwY = 94, dwb = Math.sin(t * 1.8 + 2) * 0.8;
        ctx.fillStyle = '#262a4a'; ctx.fillRect(dwX - 11, dwY + 9 + dwb, 22, 18);
        ctx.fillStyle = '#6d78a8'; ctx.fillRect(dwX - 13, dwY + 7 + dwb, 6, 6); ctx.fillRect(dwX + 7, dwY + 7 + dwb, 6, 6);
        if (!isWriting) {
          ctx.fillStyle = '#6d78a8'; ctx.beginPath(); ctx.arc(dwX, dwY - 2 + dwb, 9, Math.PI, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#f8ce53'; ctx.fillRect(dwX - 8, dwY - 3 + dwb, 16, 2.5);
          ctx.fillStyle = '#c43333'; ctx.beginPath(); ctx.moveTo(dwX - 9, dwY + 3 + dwb); ctx.lineTo(dwX + 9, dwY + 3 + dwb); ctx.lineTo(dwX + 5, dwY + 22 + dwb); ctx.lineTo(dwX - 5, dwY + 22 + dwb); ctx.fill();
          ctx.fillStyle = '#fad0b1'; ctx.fillRect(dwX - 5, dwY - 1 + dwb, 10, 5);
          ctx.fillStyle = '#a65f2f'; ctx.fillRect(dwX - 12, 110, 9, 10); ctx.fillStyle = '#ffffff'; ctx.fillRect(dwX - 13, 108, 11, 3);
        } else {
          const nod = Math.sin(t * 3.5) * 1.2;
          ctx.fillStyle = '#6d78a8'; ctx.beginPath(); ctx.arc(dwX - 4, dwY - 1 + nod, 9, Math.PI * 0.9, Math.PI * 2.1); ctx.fill();
          ctx.fillStyle = '#c43333'; ctx.beginPath(); ctx.moveTo(dwX - 11, dwY + 4 + nod); ctx.lineTo(dwX + 5, dwY + 4 + nod); ctx.lineTo(dwX - 1, dwY + 22 + nod); ctx.lineTo(dwX - 10, dwY + 22 + nod); ctx.fill();
          ctx.fillStyle = '#fad0b1'; ctx.fillRect(dwX - 9, dwY + nod, 6, 4.5);
          ctx.fillStyle = '#05050e'; ctx.fillRect(dwX - 8, dwY + 1 + nod, 2.5, 2.5);
          ctx.fillStyle = '#a65f2f'; ctx.fillRect(dwX - 16, 111, 9, 9);
        }

        // Ranger
        const rnX = 202, rnY = 92, rnb = Math.sin(t * 1.5 + 3) * 0.7;
        ctx.fillStyle = '#142328'; ctx.beginPath(); ctx.moveTo(rnX - 10, 122); ctx.lineTo(rnX - 9, rnY + 8 + rnb); ctx.lineTo(rnX + 9, rnY + 8 + rnb); ctx.lineTo(rnX + 11, 122); ctx.fill();
        ctx.fillStyle = '#0b0c1a'; ctx.beginPath(); ctx.arc(rnX, rnY + rnb, 9.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#05050e'; ctx.fillRect(rnX - 6, rnY - 2 + rnb, 12, 6);
        ctx.fillStyle = '#57be8d';
        if (!isWriting) {
          ctx.fillRect(rnX - 4.5, rnY - 1 + rnb, 2, 1.5); ctx.fillRect(rnX + 2, rnY - 1 + rnb, 2, 1.5);
          ctx.strokeStyle = '#824924'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(rnX - 1, rnY + 4 + rnb); ctx.lineTo(rnX - 9, rnY + 9 + rnb); ctx.stroke();
          ctx.fillStyle = '#e8584f'; ctx.fillRect(rnX - 10.5, rnY + 5.5 + rnb, 2.5, 2);
        } else {
          ctx.fillRect(rnX - 6.5, rnY, 2.5, 1.5); ctx.fillRect(rnX - 1, rnY, 2.5, 1.5);
          ctx.strokeStyle = '#824924'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(rnX - 3, 114); ctx.lineTo(rnX - 10, 110); ctx.stroke();
          ctx.fillStyle = '#e8584f'; ctx.fillRect(rnX - 11, 109, 3, 3);
        }
      });
      applyLight(lChars, amb, lights);
      applyRim(lChars, -1.2, 0, 135, 34, 90, '255, 225, 140', 0.45);
      sctx.drawImage(lChars, 0, 0); release(lChars);

      // 3. Bar Counter
      const lBar = drawLayer(ctx => ctx.drawImage(BAR, 0, 0));
      applyLight(lBar, amb, lights);
      applyRim(lBar, 0, 1.2, 135, 34, 80, '255, 230, 150', 0.5);
      sctx.drawImage(lBar, 0, 0); release(lBar);

      // 4. Glowing Chandelier & Flames
      ctx.fillStyle = '#f8b66e';
      const scHeight = (6 + (isWriting ? this.volVal * 0.5 : 0) * 5) * candleFlick;
      sctx.beginPath(); sctx.moveTo(31.5, 106); sctx.quadraticCurveTo(31, 106 - scHeight * 0.5, 33, 106 - scHeight); sctx.quadraticCurveTo(35, 106 - scHeight * 0.5, 34.5, 106); sctx.fill();
      const fGrad = sctx.createRadialGradient(233, 102, 0, 233, 102, 45);
      fGrad.addColorStop(0, `rgba(244, 135, 115, ${0.7 * fireFlick})`); fGrad.addColorStop(1, 'rgba(107, 23, 33, 0)');
      sctx.fillStyle = fGrad; sctx.fillRect(195, 65, 65, 65);

      // 5. Crush
      const finalArt = crush();

      // 6. Speech Bubble Post-Crush
      if (this.activeComment) {
        const c = this.activeComment;
        actx.font = 'bold 9px monospace';
        const tw = actx.measureText(c.text).width, bw = tw + 14, bh = 16;
        let bx = c.x - bw / 2;
        if (bx < 8) bx = 8; if (bx + bw > W - 8) bx = W - 8 - bw;
        const by = c.y - bh - 7;

        actx.fillStyle = '#05050e'; actx.fillRect(bx + 1, by + 1, bw, bh);
        actx.fillStyle = '#fff1c7'; actx.fillRect(bx, by, bw, bh);
        actx.strokeStyle = '#61351b'; actx.lineWidth = 1.2; actx.strokeRect(bx, by, bw, bh);
        actx.fillStyle = '#fff1c7'; actx.beginPath(); actx.moveTo(c.x - 4, by + bh); actx.lineTo(c.x + 4, by + bh); actx.lineTo(c.x, by + bh + 5); actx.fill();
        actx.fillStyle = '#2e190d'; actx.textBaseline = 'middle'; actx.fillText(c.text, bx + 7, by + bh / 2 + 0.5);
      }

      this.viewCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.viewCtx.drawImage(finalArt, 0, 0, this.canvas.width, this.canvas.height);
    }
  }

  customElements.define('tavern-scribe', TavernScribeElement);

  const q = new URLSearchParams(location.search);
  if (q.get('film') === '1') {
    let t = 0;
    const step = (fps = 60) => {
      const dt = 1 / fps; t += dt;
      for (const el of LIVE) el.advance(dt);
    };
    window.__film = { duration: 10, step, seek(to, fps = 60) { while (t < to) step(fps); } };
    window.__film.seek(parseFloat(q.get('seek')) || 1 / 60);
  } else {
    let last = performance.now();
    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (const el of LIVE) el.advance(dt);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }
})();
