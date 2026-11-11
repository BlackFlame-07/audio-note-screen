// TavernScribe: A living pixel world control for audio notes and evening journaling.
// A scribe sits by the bar counter on the left; patrons sit along the counter to the right.
// When user stops speaking: scribe lifts head, turns face towards user, quill poised, patrons talk and drink.
// When user speaks: scribe dips head to paper, writes vigorously, patrons quiet down, turn and listen.
// Everything is painted in Canvas2D, lit by candle, lantern and hearth, and crushed with a 4x4 Bayer dither to a 56-color palette.
//
// Usage:
//   <script src="tavern-scribe.js"></script>
//   <tavern-scribe state="listening" volume="0.2"></tavern-scribe>
//   el.setAttribute('state', 'writing'); // or el.state = 'writing'
//   el.setAttribute('volume', '0.75');  // or el.volume = 0.75
(() => {
  'use strict';

  const W = 240, H = 110, BAR_Y = 76;
  const PAL = [
    '#05050c', '#0c0d18', '#141626', '#1c2138', '#283050', '#3b476e', '#596996', '#879bc4', '#cad5ea', '#ffffff',
    '#1a100a', '#2c190f', '#442614', '#61371b', '#844c24', '#ab6630', '#d4843d', '#f3aa57', '#fad089', '#fef1cb',
    '#0c2118', '#143829', '#1d543e', '#2c7a5c', '#42a780', '#6fd1ab', '#b2ebd4',
    '#300d11', '#54151c', '#7e2029', '#ab2d38', '#d64545', '#ea7462', '#f6a99b',
    '#201d1a', '#36302a', '#544c43', '#796e62', '#a69989', '#d1c6b6', '#ece4d8',
    '#4a2618', '#733e24', '#a65d35', '#d68752', '#f2b585', '#fad7bb',
    '#1a2b30', '#2a444c', '#3f6773', '#6093a1', '#8ec5d1',
    '#704d0a', '#a37413', '#d9a124', '#f7cb48', '#fae584', '#fffdd4'
  ];

  const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], SPREAD = 8;
  const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  
  // Build LUT
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

  // Shared Painter & Canvas Buffers
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
      const s = Math.min(1, Math.max(0, a));
      if (s <= 0) continue;
      const gr = m.createRadialGradient(x, y, 1, x, y, r);
      gr.addColorStop(0, `rgba(${rgb},${s})`);
      gr.addColorStop(0.35, `rgba(${rgb},${s * 0.55})`);
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
    wg.addColorStop(0, '#2c190f'); wg.addColorStop(0.7, '#1a100a'); wg.addColorStop(1, '#0c0d18');
    r.fillStyle = wg; r.fillRect(0, 0, W, BAR_Y);
    for (let y = 14; y < BAR_Y; y += 14) {
      r.fillStyle = 'rgba(10, 6, 12, 0.65)'; r.fillRect(0, y, W, 1.5);
      r.fillStyle = 'rgba(132, 76, 36, 0.2)'; r.fillRect(0, y + 1.5, W, 0.8);
    }
    for (const bx of [16, 76, 134, 192]) {
      r.fillStyle = '#1e1109'; r.fillRect(bx, 0, 8, BAR_Y);
      r.fillStyle = 'rgba(171, 102, 48, 0.25)'; r.fillRect(bx + 1, 0, 1.5, BAR_Y);
      r.fillStyle = 'rgba(5, 5, 12, 0.5)'; r.fillRect(bx + 7, 0, 1.5, BAR_Y);
    }
    for (const sy of [24, 44, 62]) {
      r.fillStyle = '#442614'; r.fillRect(86, sy, 98, 3);
      r.fillStyle = '#61371b'; r.fillRect(86, sy, 98, 1);
      r.fillStyle = 'rgba(5, 5, 12, 0.7)'; r.fillRect(86, sy + 3, 98, 2);
      r.fillStyle = '#1c2138'; r.fillRect(92, sy + 3, 2, 4); r.fillRect(178, sy + 3, 2, 4);
      const bcols = ['#1d543e', '#7e2029', '#d9a124', '#3b476e', '#844c24'];
      for (let bx = 90; bx < 180; bx += 8) {
        if ((bx * 7) % 11 < 8) {
          const col = bcols[(bx / 8) % bcols.length], bh = 6 + ((bx * 3) % 5);
          r.fillStyle = col; r.fillRect(bx, sy - bh, 4, bh);
          r.fillStyle = 'rgba(255,255,255,0.35)'; r.fillRect(bx + 1, sy - bh + 1, 1, bh - 2);
          r.fillStyle = '#ab6630'; r.fillRect(bx + 1, sy - bh - 2, 2, 2);
        }
      }
    }
    r.fillStyle = '#141626'; r.fillRect(28, 18, 42, 16);
    r.strokeStyle = '#61371b'; r.lineWidth = 1.5; r.strokeRect(28, 18, 42, 16);
    r.fillStyle = 'rgba(236, 228, 216, 0.55)'; r.fillRect(32, 23, 22, 1.2); r.fillRect(32, 27, 34, 1.2); r.fillRect(32, 31, 18, 1.2);
    r.fillStyle = '#201d1a'; r.beginPath(); r.arc(238, 42, 24, Math.PI * 0.5, Math.PI * 1.5); r.fill();

    const b = BAR.getContext('2d');
    const bg = b.createLinearGradient(0, BAR_Y, 0, BAR_Y + 14);
    bg.addColorStop(0, '#ab6630'); bg.addColorStop(0.15, '#844c24'); bg.addColorStop(0.7, '#61371b'); bg.addColorStop(1, '#442614');
    b.fillStyle = bg; b.fillRect(0, BAR_Y, W, 14);
    b.fillStyle = '#f3aa57'; b.fillRect(0, BAR_Y, W, 1.2);
    b.fillStyle = 'rgba(254, 241, 203, 0.4)'; b.fillRect(0, BAR_Y + 1.2, W, 0.8);
    b.fillStyle = '#1a100a'; b.fillRect(0, BAR_Y + 14, W, 2);
    const fg = b.createLinearGradient(0, BAR_Y + 16, 0, H);
    fg.addColorStop(0, '#361e12'); fg.addColorStop(1, '#1a100a');
    b.fillStyle = fg; b.fillRect(0, BAR_Y + 16, W, H - (BAR_Y + 16));
    for (let x = 12; x < W; x += 18) { b.fillStyle = '#0c0d18'; b.fillRect(x, BAR_Y + 16, 1.5, H - (BAR_Y + 16)); }
    b.fillStyle = '#d9a124'; b.fillRect(0, 104, W, 2.5); b.fillStyle = '#fae584'; b.fillRect(0, 104, W, 0.8);
    for (let rx = 24; rx < W; rx += 52) { b.fillStyle = '#704d0a'; b.fillRect(rx - 2, 103, 4, 4); }
  }

  function reach(S, T, U = 8, F = 9, bend = 1) {
    let dx = T[0] - S[0], dy = T[1] - S[1], d = Math.hypot(dx, dy) || 1;
    const m = U + F - 0.4, lo = Math.abs(U - F) + 0.4, k = d > m ? m / d : d < lo ? lo / d : 1;
    dx *= k; dy *= k; d *= k;
    const e = Math.atan2(dy, dx) + bend * Math.acos(Math.min(1, Math.max(-1, (U * U + d * d - F * F) / (2 * U * d))));
    return [[S[0] + U * Math.cos(e), S[1] + U * Math.sin(e)], [S[0] + dx, S[1] + dy]];
  }

  // Active custom elements registry
  const LIVE = new Set();

  class TavernScribeElement extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).innerHTML = `
        <style>
          :host { display: block; position: relative; width: 100%; aspect-ratio: 240/110; user-select: none; }
          canvas { display: block; width: 100%; height: 100%; image-rendering: pixelated; }
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
      this.stateVal = 'listening'; // 'listening' | 'writing'
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
      let text = txt, x = 110, y = 48;
      if (pIdx === 0) { text = text || this.barkeepComments[Math.floor(Math.random() * this.barkeepComments.length)]; x = 110; y = 48; }
      else if (pIdx === 1) { text = text || this.dwarfComments[Math.floor(Math.random() * this.dwarfComments.length)]; x = 154; y = 48; }
      else { text = text || this.rangerComments[Math.floor(Math.random() * this.rangerComments.length)]; x = 196; y = 46; }
      this.activeComment = { text, x, y, timer: 3.5 };
    }

    advance(dt) {
      this.time += dt;
      const isWriting = this.stateVal === 'writing';
      if (isWriting) {
        this.inkLines = Math.min(4, this.inkLines + dt * 0.8);
      }

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
      const t = this.time, isWriting = this.stateVal === 'writing', breath = Math.sin(t * 2.4) * 0.8;
      sctx.clearRect(0, 0, W, H);

      const candleFlick = 0.88 + 0.12 * Math.sin(t * 14);
      const audioGlow = isWriting ? this.volVal * 0.5 : 0;
      const lanternFlick = 0.9 + 0.1 * Math.cos(t * 8);
      const hearthFlick = 0.85 + 0.15 * Math.sin(t * 11);
      const lights = [
        [23.5, 66, 64, '255, 195, 90', (1.0 + audioGlow) * candleFlick],
        [135, 20, 85, '255, 185, 80', 0.85 * lanternFlick],
        [236, 64, 75, '240, 110, 50', 0.8 * hearthFlick]
      ];
      const amb = 'rgb(22, 20, 36)';

      // 1. Room
      const lRoom = drawLayer(ctx => ctx.drawImage(ROOM, 0, 0));
      applyLight(lRoom, amb, lights);
      sctx.drawImage(lRoom, 0, 0); release(lRoom);

      // 2. Characters
      const lChars = drawLayer(ctx => {
        // Scribe Stool & Body
        ctx.fillStyle = '#2c190f'; ctx.fillRect(24, 78, 16, 4); ctx.fillRect(26, 82, 3, 24); ctx.fillRect(35, 82, 3, 24);
        const torsoY = 56 + breath;
        ctx.fillStyle = '#143829';
        ctx.beginPath(); ctx.moveTo(22, 78); ctx.lineTo(24, torsoY + 8); ctx.lineTo(38, torsoY + 8); ctx.lineTo(41, 78); ctx.fill();
        ctx.fillStyle = '#2c7a5c'; ctx.fillRect(27, torsoY + 4, 3, 16); ctx.fillRect(33, torsoY + 6, 2, 14);
        ctx.fillStyle = '#d9a124'; ctx.fillRect(30, torsoY + 1, 3, 3);
        ctx.fillStyle = '#143829'; ctx.fillRect(19, torsoY + 4, 5, 14);
        ctx.fillStyle = '#e49e70'; ctx.fillRect(20, 72, 4, 3);

        if (!isWriting) {
          // STATE 1: FACE TOWARDS USER!
          const headX = 31, headY = 44 + breath * 0.7;
          ctx.fillStyle = '#0c2118'; ctx.beginPath(); ctx.arc(headX, headY - 1, 8, Math.PI, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#2c7a5c'; ctx.fillRect(headX - 8, headY - 2, 16, 2);
          ctx.fillStyle = '#fad7bb'; ctx.beginPath(); ctx.arc(headX, headY + 3, 6, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#544c43'; ctx.beginPath(); ctx.arc(headX, headY + 6, 4.5, 0, Math.PI); ctx.fill();

          if (this.isBlinking) {
            ctx.fillStyle = '#442614'; ctx.fillRect(headX - 4, headY + 2, 3, 1); ctx.fillRect(headX + 1, headY + 2, 3, 1);
          } else {
            ctx.strokeStyle = '#d9a124'; ctx.lineWidth = 1;
            ctx.strokeRect(headX - 5, headY + 1, 4, 3); ctx.strokeRect(headX + 1, headY + 1, 4, 3);
            ctx.fillStyle = '#d9a124'; ctx.fillRect(headX - 1, headY + 2, 2, 1);
            ctx.fillStyle = '#05050c'; ctx.fillRect(headX - 3.5, headY + 2, 1.8, 1.8); ctx.fillRect(headX + 2.5, headY + 2, 1.8, 1.8);
            ctx.fillStyle = '#ffffff'; ctx.fillRect(headX - 3.5, headY + 2, 0.9, 0.9); ctx.fillRect(headX + 2.5, headY + 2, 0.9, 0.9);
          }
          ctx.fillStyle = '#ab2d38'; ctx.fillRect(headX - 1.5, headY + 5.5, 3, 1);

          // Arm Poised Up
          const [elbow, hand] = reach([36, torsoY + 4], [48, 64 + breath * 0.5], 8, 9, 1);
          ctx.strokeStyle = '#143829'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(36, torsoY + 4); ctx.lineTo(elbow[0], elbow[1]); ctx.stroke();
          ctx.strokeStyle = '#2c7a5c'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(elbow[0], elbow[1]); ctx.lineTo(hand[0], hand[1]); ctx.stroke();
          ctx.fillStyle = '#fad7bb'; ctx.fillRect(hand[0] - 1.5, hand[1] - 1.5, 3, 3);

          ctx.save(); ctx.translate(hand[0], hand[1]); ctx.rotate(-0.55 + Math.sin(t * 3) * 0.05);
          ctx.fillStyle = '#fae584'; ctx.fillRect(-0.5, 0, 1.2, 4);
          ctx.strokeStyle = '#cad5ea'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -14); ctx.stroke();
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(0, -5); ctx.quadraticCurveTo(4, -10, 0, -16); ctx.quadraticCurveTo(-4, -10, 0, -5); ctx.fill();
          ctx.restore();
        } else {
          // STATE 2: HEAD DOWN WRITING!
          const headX = 35, headY = 47 + breath * 0.4;
          ctx.fillStyle = '#0c2118'; ctx.beginPath(); ctx.arc(headX, headY - 1, 8, Math.PI * 0.8, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#2c7a5c'; ctx.fillRect(headX - 6, headY - 1, 14, 2);
          ctx.fillStyle = '#fad7bb'; ctx.beginPath(); ctx.arc(headX + 2, headY + 3, 5.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#544c43'; ctx.beginPath(); ctx.moveTo(headX, headY + 5); ctx.lineTo(headX + 6, headY + 9); ctx.lineTo(headX + 2, headY + 9); ctx.fill();
          ctx.strokeStyle = '#fae584'; ctx.lineWidth = 1; ctx.strokeRect(headX + 3, headY + 2, 3, 2.5);
          ctx.fillStyle = '#05050c'; ctx.fillRect(headX + 4.5, headY + 3.5, 1.5, 1.2);

          const penX = 39 + ((t * 6) % 1) * 14, penY = 72 + (Math.sin(t * 36) > 0 ? 0.8 : -0.8) * this.volVal;
          const [elbow, hand] = reach([36, torsoY + 4], [penX, penY], 8, 9, 1);
          ctx.strokeStyle = '#143829'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(36, torsoY + 4); ctx.lineTo(elbow[0], elbow[1]); ctx.stroke();
          ctx.strokeStyle = '#2c7a5c'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(elbow[0], elbow[1]); ctx.lineTo(hand[0], hand[1]); ctx.stroke();
          ctx.fillStyle = '#fad7bb'; ctx.fillRect(hand[0] - 1.5, hand[1] - 1.5, 3, 3);

          ctx.save(); ctx.translate(hand[0], hand[1]); ctx.rotate(-1.2 + Math.sin(t * 24) * 0.1);
          ctx.fillStyle = '#fae584'; ctx.fillRect(-0.5, 0, 1.2, 4);
          ctx.strokeStyle = '#cad5ea'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -14); ctx.stroke();
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(0, -4); ctx.quadraticCurveTo(4, -9, 0, -15); ctx.quadraticCurveTo(-4, -9, 0, -4); ctx.fill();
          ctx.restore();
        }

        // Parchment & Candle
        ctx.fillStyle = '#fef1cb'; ctx.fillRect(36, 73, 26, 8);
        ctx.fillStyle = '#fad089'; ctx.fillRect(36, 73, 26, 1); ctx.fillRect(36, 80, 26, 1);
        ctx.fillStyle = '#2c190f';
        const lines = Math.min(4, Math.floor(this.inkLines));
        for (let i = 0; i < lines; i++) ctx.fillRect(39, 75 + i * 1.4, 20, 0.8);
        if (isWriting) ctx.fillRect(39, 75 + (lines % 4) * 1.4, Math.floor(((t * 6) % 1) * 20), 0.8);
        ctx.fillStyle = '#1c2138'; ctx.fillRect(64, 73, 5, 5); ctx.fillStyle = '#05050c'; ctx.fillRect(65, 72, 3, 1);
        ctx.fillStyle = '#d9a124'; ctx.fillRect(20, 75, 7, 2); ctx.fillStyle = '#ece4d8'; ctx.fillRect(22, 68, 3, 7);
        ctx.fillStyle = '#1a100a'; ctx.fillRect(23, 66.5, 1, 1.5);

        // Patrons (Barkeep, Dwarf, Ranger)
        // Barkeep
        const bkX = 110, bkY = 56, bkb = Math.sin(t * 2.1 + 1) * 0.7;
        ctx.fillStyle = '#d1c6b6'; ctx.fillRect(bkX - 8, bkY + 6 + bkb, 16, 14);
        ctx.fillStyle = '#61371b'; ctx.fillRect(bkX - 8, bkY + 6 + bkb, 4, 14); ctx.fillRect(bkX + 4, bkY + 6 + bkb, 4, 14);
        if (!isWriting) {
          ctx.fillStyle = '#fad7bb'; ctx.beginPath(); ctx.arc(bkX, bkY + bkb, 6.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.fillRect(bkX - 2, bkY - 5 + bkb, 4, 1.2);
          ctx.fillStyle = '#61371b'; ctx.fillRect(bkX - 4, bkY + 2 + bkb, 8, 2.5);
          ctx.fillStyle = '#05050c'; ctx.fillRect(bkX - 3, bkY - 1 + bkb, 1.5, 1.5); ctx.fillRect(bkX + 1.5, bkY - 1 + bkb, 1.5, 1.5);
          const mugX = bkX - 3 + Math.cos(t * 4) * 1.5, mugY = 71 + Math.sin(t * 4) * 1.0;
          ctx.fillStyle = '#844c24'; ctx.fillRect(mugX, mugY - 6, 6, 8);
          ctx.fillStyle = '#ece4d8'; ctx.fillRect(mugX + 2, mugY - 4, 4, 4);
        } else {
          ctx.fillStyle = '#fad7bb'; ctx.beginPath(); ctx.arc(bkX - 2, bkY + 2, 6.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.fillRect(bkX - 4, bkY - 3, 3, 1.2);
          ctx.fillStyle = '#61371b'; ctx.fillRect(bkX - 7, bkY + 4, 6, 2.5);
          ctx.fillStyle = '#05050c'; ctx.fillRect(bkX - 6, bkY + 1, 2, 2);
          ctx.fillStyle = '#fad7bb'; ctx.fillRect(bkX - 10, 72, 6, 4); ctx.fillRect(bkX + 4, 72, 6, 4);
          ctx.fillStyle = '#844c24'; ctx.fillRect(bkX + 12, 68, 6, 8);
        }

        // Dwarf
        const dwX = 154, dwY = 56, dwb = Math.sin(t * 1.8 + 2) * 0.7;
        ctx.fillStyle = '#2c190f'; ctx.fillRect(dwX - 7, 80, 14, 3); ctx.fillRect(dwX - 5, 83, 3, 23); ctx.fillRect(dwX + 2, 83, 3, 23);
        ctx.fillStyle = '#3b476e'; ctx.fillRect(dwX - 9, dwY + 8 + dwb, 18, 14);
        ctx.fillStyle = '#596996'; ctx.fillRect(dwX - 11, dwY + 6 + dwb, 5, 5); ctx.fillRect(dwX + 6, dwY + 6 + dwb, 5, 5);
        if (!isWriting) {
          ctx.fillStyle = '#596996'; ctx.beginPath(); ctx.arc(dwX, dwY - 2 + dwb, 7, Math.PI, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fae584'; ctx.fillRect(dwX - 6, dwY - 3 + dwb, 12, 2);
          ctx.fillStyle = '#ab2d38'; ctx.beginPath(); ctx.moveTo(dwX - 7, dwY + 2 + dwb); ctx.lineTo(dwX + 7, dwY + 2 + dwb); ctx.lineTo(dwX + 4, dwY + 18 + dwb); ctx.lineTo(dwX - 4, dwY + 18 + dwb); ctx.fill();
          ctx.fillStyle = '#fad7bb'; ctx.fillRect(dwX - 4, dwY - 1 + dwb, 8, 4);
          ctx.fillStyle = '#05050c'; ctx.fillRect(dwX - 3, dwY + dwb, 1.5, 1.5); ctx.fillRect(dwX + 1.5, dwY + dwb, 1.5, 1.5);
          ctx.fillStyle = '#844c24'; ctx.fillRect(dwX - 10, 68, 7, 8); ctx.fillStyle = '#ffffff'; ctx.fillRect(dwX - 11, 67, 9, 2);
        } else {
          const nod = Math.sin(t * 3.5) * 1.0;
          ctx.fillStyle = '#596996'; ctx.beginPath(); ctx.arc(dwX - 3, dwY - 1 + nod, 7, Math.PI * 0.9, Math.PI * 2.1); ctx.fill();
          ctx.fillStyle = '#ab2d38'; ctx.beginPath(); ctx.moveTo(dwX - 9, dwY + 3 + nod); ctx.lineTo(dwX + 4, dwY + 3 + nod); ctx.lineTo(dwX - 1, dwY + 18 + nod); ctx.lineTo(dwX - 8, dwY + 18 + nod); ctx.fill();
          ctx.fillStyle = '#fad7bb'; ctx.fillRect(dwX - 7, dwY + nod, 5, 3.5);
          ctx.fillStyle = '#05050c'; ctx.fillRect(dwX - 6.5, dwY + 0.5 + nod, 2, 2);
          ctx.fillStyle = '#844c24'; ctx.fillRect(dwX - 14, 69, 7, 7); ctx.fillStyle = '#fad7bb'; ctx.fillRect(dwX - 15, 67, 4, 3);
        }

        // Ranger
        const rnX = 196, rnY = 54, rnb = Math.sin(t * 1.5 + 3) * 0.6;
        ctx.fillStyle = '#1a2b30'; ctx.beginPath(); ctx.moveTo(rnX - 8, 78); ctx.lineTo(rnX - 7, rnY + 6 + rnb); ctx.lineTo(rnX + 7, rnY + 6 + rnb); ctx.lineTo(rnX + 9, 78); ctx.fill();
        ctx.fillStyle = '#141626'; ctx.beginPath(); ctx.arc(rnX, rnY + rnb, 7.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#05050c'; ctx.fillRect(rnX - 5, rnY - 2 + rnb, 10, 5);
        ctx.fillStyle = '#6fd1ab';
        if (!isWriting) {
          ctx.fillRect(rnX - 3.5, rnY - 1 + rnb, 1.5, 1); ctx.fillRect(rnX + 1.5, rnY - 1 + rnb, 1.5, 1);
          ctx.strokeStyle = '#844c24'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(rnX - 1, rnY + 3 + rnb); ctx.lineTo(rnX - 7, rnY + 7 + rnb); ctx.stroke();
          ctx.fillStyle = '#ea7462'; ctx.fillRect(rnX - 8.5, rnY + 4.5 + rnb, 2, 1.5);
        } else {
          ctx.fillRect(rnX - 5.5, rnY, 2, 1.2); ctx.fillRect(rnX - 1, rnY, 2, 1.2);
          ctx.strokeStyle = '#844c24'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(rnX - 3, 71); ctx.lineTo(rnX - 8, 68); ctx.stroke();
          ctx.fillStyle = '#ea7462'; ctx.fillRect(rnX - 9, 67, 2, 2);
        }
      });
      applyLight(lChars, amb, lights);
      applyRim(lChars, -1.2, 0, 135, 20, 60, '255, 210, 120', 0.35);
      sctx.drawImage(lChars, 0, 0); release(lChars);

      // 3. Bar Counter
      const lBar = drawLayer(ctx => ctx.drawImage(BAR, 0, 0));
      applyLight(lBar, amb, lights);
      applyRim(lBar, 0, 1.2, 23.5, 66, 50, '255, 220, 140', 0.45);
      sctx.drawImage(lBar, 0, 0); release(lBar);

      // 4. Glowing Fire & Lantern
      const cHeight = (5 + (isWriting ? this.volVal * 0.4 : 0) * 4) * candleFlick;
      sctx.fillStyle = '#f3aa57'; sctx.beginPath();
      sctx.moveTo(22, 66); sctx.quadraticCurveTo(21.5, 66 - cHeight * 0.5, 23.5, 66 - cHeight);
      sctx.quadraticCurveTo(25.5, 66 - cHeight * 0.5, 25, 66); sctx.fill();
      sctx.fillStyle = '#fffdd4'; sctx.fillRect(132, 13, 6, 8);
      const hGrad = sctx.createRadialGradient(238, 64, 0, 238, 64, 28);
      hGrad.addColorStop(0, `rgba(234, 116, 98, ${0.6 * hearthFlick})`); hGrad.addColorStop(1, 'rgba(84, 21, 28, 0)');
      sctx.fillStyle = hGrad; sctx.fillRect(210, 36, 30, 50);

      // 5. Crush
      const finalArt = crush();

      // 6. Speech Bubble Post-Crush
      if (this.activeComment) {
        const c = this.activeComment;
        actx.font = 'bold 8px monospace';
        const tw = actx.measureText(c.text).width, bw = tw + 12, bh = 14;
        let bx = c.x - bw / 2;
        if (bx < 8) bx = 8; if (bx + bw > W - 8) bx = W - 8 - bw;
        const by = c.y - bh - 6;

        actx.fillStyle = '#05050c'; actx.fillRect(bx + 1, by + 1, bw, bh);
        actx.fillStyle = '#fef1cb'; actx.fillRect(bx, by, bw, bh);
        actx.strokeStyle = '#61371b'; actx.lineWidth = 1; actx.strokeRect(bx, by, bw, bh);
        actx.fillStyle = '#fef1cb'; actx.beginPath(); actx.moveTo(c.x - 3, by + bh); actx.lineTo(c.x + 3, by + bh); actx.lineTo(c.x, by + bh + 4); actx.fill();
        actx.fillStyle = '#2c190f'; actx.textBaseline = 'middle'; actx.fillText(c.text, bx + 6, by + bh / 2 + 0.5);
      }

      // Blit to custom element canvas at 2x crisp scale
      this.viewCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.viewCtx.drawImage(finalArt, 0, 0, this.canvas.width, this.canvas.height);
    }
  }

  customElements.define('tavern-scribe', TavernScribeElement);

  // Animation Loop with ?film=1 stopped-clock support
  const q = new URLSearchParams(location.search);
  if (q.get('film') === '1') {
    let t = 0;
    const step = (fps = 60) => {
      const dt = 1 / fps; t += dt;
      for (const el of LIVE) el.advance(dt);
    };
    window.__film = {
      duration: 10,
      step,
      seek(to, fps = 60) { while (t < to) step(fps); }
    };
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
