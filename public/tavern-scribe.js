// TavernScribe: A living pixel world custom element built strictly to the OG
// pixel-worlds style (SKILL.md & kit.js).
//
// 1. Paint, Light, Crush 3-step pipeline:
//    - Smooth daylight painting on isolated layers.
//    - Multiplied light map: cold night ambient + warm candle, lantern, hearth.
//    - Directional rim highlights (k.rim) on surfaces facing light sources.
//    - Bayer 4x4 ordered dither crush to 56-color palette.
//    - Post-crush lettering in the art grid via 5x7 bitmap font (k.ptext).
// 2. Chunky, rounded, expressive character silhouettes (silhouette-first).
// 3. Scribe turns face to user when silent; bows head and writes with ink trails when speaking.
// 4. Patrons stop and listen attentively when user speaks.

(() => {
  'use strict';

  const W = 200, H = 220, BAR_Y = 145;
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

  const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], SPREAD = 8;
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

  // 5x7 Pixel Font from kit.js
  const FONT = {
    A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
    D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
    H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
    J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
    K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
    O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
    R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
    X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
    Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
    Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
    '.': ['.', '.', '.', '.', '.', '.', '#'],
    ',': ['.', '.', '.', '.', '.', '.#', '#.'],
    '!': ['#', '#', '#', '#', '#', '.', '#'],
    '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
    "'": ['#', '#', '.', '.', '.', '.', '.'],
    ' ': ['...', '...', '...', '...', '...', '...', '...']
  };

  const soft = mk(W, H), sctx = soft.getContext('2d', { willReadFrequently: true });
  const art = mk(W, H), actx = art.getContext('2d'), artImg = actx.createImageData(W, H), art32 = new Uint32Array(artImg.data.buffer);
  const POOL = [];
  const scratch = () => POOL.pop() || mk(W, H);
  const release = (...cs) => { for (const c of cs) if (c) POOL.push(c); };

  const drawLayer = fn => {
    const L = scratch(), ctx = L.getContext('2d');
    ctx.save(); fn(ctx); ctx.restore();
    return L;
  };

  const applyLight = (L, amb, lights) => {
    const k = L.getContext('2d'), M = scratch(), m = M.getContext('2d');
    m.fillStyle = amb; m.fillRect(0, 0, W, H); m.globalCompositeOperation = 'lighter';
    for (const [x, y, r, rgb, a] of lights) {
      const s = Math.min(1.2, Math.max(0, a));
      if (s <= 0) continue;
      const gr = m.createRadialGradient(x, y, 2, x, y, r);
      gr.addColorStop(0, `rgba(${rgb},${s})`);
      gr.addColorStop(0.42, `rgba(${rgb},${s * 0.55})`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      m.fillStyle = gr; m.fillRect(0, 0, W, H);
    }
    m.globalCompositeOperation = 'destination-in'; m.drawImage(L, 0, 0);
    k.globalCompositeOperation = 'multiply'; k.drawImage(M, 0, 0); k.globalCompositeOperation = 'source-over';
    release(M);
  };

  const applyRim = (L, dx, dy, x, y, r, rgb, a) => {
    if (a <= 0) return;
    const k = L.getContext('2d'), R = scratch(), q = R.getContext('2d');
    q.drawImage(L, 0, 0); q.globalCompositeOperation = 'source-in';
    const gr = q.createRadialGradient(x, y, 2, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},${a})`);
    gr.addColorStop(0.5, `rgba(${rgb},${a * 0.6})`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    q.fillStyle = gr; q.fillRect(0, 0, W, H);
    q.globalCompositeOperation = 'destination-out'; q.drawImage(L, dx, dy);
    k.globalCompositeOperation = 'source-atop'; k.drawImage(R, 0, 0); k.globalCompositeOperation = 'source-over';
    release(R);
  };

  const reach = (S, T, U = 9, F = 10, bend = 1) => {
    let dx = T[0] - S[0], dy = T[1] - S[1], d = Math.hypot(dx, dy) || 1;
    const m = U + F - 0.4, lo = Math.abs(U - F) + 0.4, k = d > m ? m / d : d < lo ? lo / d : 1;
    dx *= k; dy *= k; d *= k;
    const e = Math.atan2(dy, dx) + bend * Math.acos(Math.min(1, Math.max(-1, (U * U + d * d - F * F) / (2 * U * d))));
    return [[S[0] + U * Math.cos(e), S[1] + U * Math.sin(e)], [S[0] + dx, S[1] + dy]];
  };

  const limb = (ctx, ax, ay, ra, bx, by, rb, col) => {
    const a = Math.atan2(by - ay, bx - ax), nx = -Math.sin(a), ny = Math.cos(a), q = Math.PI / 2;
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(ax + nx * ra, ay + ny * ra); ctx.lineTo(bx + nx * rb, by + ny * rb);
    ctx.arc(bx, by, rb, a + q, a - q, true); ctx.lineTo(ax - nx * ra, ay - ny * ra);
    ctx.arc(ax, ay, ra, a - q, a + q, true); ctx.closePath(); ctx.fill();
  };

  const ptext = (ctx, str, x, y, color) => {
    const glyphs = [...str.toUpperCase()].map(ch => FONT[ch] || FONT[' ']);
    let curX = x; ctx.fillStyle = color;
    for (const gl of glyphs) {
      const w = gl[0].length;
      for (let r = 0; r < 7; r++) for (let q = 0; q < w; q++) if (gl[r][q] === '#') ctx.fillRect(curX + q, y + r, 1, 1);
      curX += w + 1;
    }
  };
  const ptextWidth = str => [...str.toUpperCase()].reduce((acc, ch) => acc + (FONT[ch] || FONT[' '])[0].length + 1, -1);

  // Static Scenery
  const ROOM = mk(W, H), BAR = mk(W, H);
  {
    const r = ROOM.getContext('2d');
    const wg = r.createLinearGradient(0, 0, 0, BAR_Y);
    wg.addColorStop(0, '#3e1e12'); wg.addColorStop(0.6, '#2e190d'); wg.addColorStop(1, '#1c1008');
    r.fillStyle = wg; r.fillRect(0, 0, W, BAR_Y);
    for (let y = 16; y < BAR_Y; y += 14) {
      r.fillStyle = '#1c1008'; r.fillRect(0, y, W, 1.5);
      r.fillStyle = '#61351b'; r.fillRect(0, y + 1.5, W, 0.8);
    }
    r.fillStyle = '#1c1008'; r.fillRect(0, 0, W, 16);
    r.fillStyle = '#452513'; r.fillRect(0, 16, W, 3);
    for (const bx of [24, 76, 128, 178]) {
      r.fillStyle = '#2e190d'; r.fillRect(bx - 3, 0, 7, BAR_Y);
    }
    // Arched Night Window
    r.fillStyle = '#07060b'; r.beginPath(); r.arc(39, 44, 26, Math.PI, Math.PI * 2); r.rect(13, 44, 52, 42); r.fill();
    r.save(); r.beginPath(); r.arc(39, 44, 23, Math.PI, Math.PI * 2); r.rect(16, 44, 46, 42); r.clip();
    const sky = r.createLinearGradient(0, 24, 0, 86);
    sky.addColorStop(0, '#0c0d18'); sky.addColorStop(0.7, '#141626'); sky.addColorStop(1, '#262a4a');
    r.fillStyle = sky; r.fillRect(16, 24, 46, 62);
    r.fillStyle = '#fffcc7'; r.beginPath(); r.arc(38, 46, 9, 0, Math.PI * 2); r.fill();
    r.fillStyle = '#0c0d18'; r.beginPath(); r.arc(41, 44, 8, 0, Math.PI * 2); r.fill();
    r.fillStyle = '#c2cef0'; for (const [sx, sy] of [[24, 36], [48, 34], [30, 62], [54, 56]]) r.fillRect(sx, sy, 1.5, 1.5);
    r.strokeStyle = '#1c1008'; r.lineWidth = 1.2;
    r.beginPath(); r.moveTo(39, 24); r.lineTo(39, 86); r.moveTo(16, 54); r.lineTo(62, 54); r.stroke();
    r.restore();
    r.fillStyle = '#61351b'; r.fillRect(11, 86, 56, 4);

    // Shelves with bottles
    for (const sy of [54, 88]) {
      r.fillStyle = '#452513'; r.fillRect(72, sy, 70, 3.5);
      const bottles = [[78, 11, '#1c4d37'], [86, 14, '#96222e'], [95, 9, '#ce8c17'], [106, 15, '#20373e'], [116, 12, '#824924'], [126, 10, '#3c966c']];
      for (const [bx, bh, col] of bottles) {
        r.fillStyle = col; r.fillRect(bx, sy - bh, 6, bh);
        r.fillStyle = '#fff1c7'; r.fillRect(bx + 1, sy - bh, 1.5, bh - 2);
      }
    }
    // Stone Hearth Arch
    const hx = 154, hy = 74;
    r.fillStyle = '#2b2723'; r.fillRect(hx, hy, W - hx, BAR_Y - hy);
    r.fillStyle = '#05050e'; r.beginPath(); r.arc(hx + 24, hy + 32, 19, Math.PI, Math.PI * 2); r.rect(hx + 5, hy + 32, 38, BAR_Y - (hy + 32)); r.fill();
    r.fillStyle = '#443e38'; r.fillRect(hx - 4, hy - 4, W - hx + 4, 6);

    // Bar Counter
    const b = BAR.getContext('2d');
    const cg = b.createLinearGradient(0, BAR_Y, 0, BAR_Y + 14);
    cg.addColorStop(0, '#f2ae85'); cg.addColorStop(0.3, '#a65f2f'); cg.addColorStop(0.8, '#61351b'); cg.addColorStop(1, '#2e190d');
    b.fillStyle = cg; b.fillRect(0, BAR_Y, W, 14);
    b.fillStyle = '#fff1c7'; b.fillRect(0, BAR_Y, W, 1.2);
    const ag = b.createLinearGradient(0, BAR_Y + 16, 0, H);
    ag.addColorStop(0, '#452513'); ag.addColorStop(0.5, '#2e190d'); ag.addColorStop(1, '#1c1008');
    b.fillStyle = ag; b.fillRect(0, BAR_Y + 16, W, H - (BAR_Y + 16));
    for (let x = 12; x < W; x += 18) { b.fillStyle = '#0b0c1a'; b.fillRect(x, BAR_Y + 16, 1.8, H - (BAR_Y + 16)); }
    b.fillStyle = '#ce8c17'; b.fillRect(0, H - 10, W, 3.5);
  }

  function crush() {
    const d = sctx.getImageData(0, 0, W, H).data;
    for (let y = 0, i = 0, j = 0; y < H; y++) for (let x = 0; x < W; x++, i += 4, j++) {
      const nz = ((B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5) * SPREAD;
      let r = d[i] + nz, g = d[i + 1] + nz, b = d[i + 2] + nz;
      r = r < 0 ? 0 : r > 255 ? 255 : r; g = g < 0 ? 0 : g > 255 ? 255 : g; b = b < 0 ? 0 : b > 255 ? 255 : b;
      art32[j] = PAL32[LUT[(((r >> 3) & 0x1f) << 10) | (((g >> 3) & 0x1f) << 5) | ((b >> 3) & 0x1f)]];
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
      this.commentTimer = 2.5;
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

      const candleFlick = 0.88 + 0.12 * Math.sin(t * 9);
      const hearthFlick = 0.85 + 0.15 * Math.sin(t * 7);
      const amb = 'rgb(46, 40, 72)';
      const lights = [
        [36, 138, 55, '255, 195, 120', candleFlick * (isWriting ? 1.15 : 0.95)],
        [104, 38, 95, '255, 210, 140', 0.9],
        [176, 135, 75, '255, 130, 50', hearthFlick * 0.95]
      ];

      sctx.clearRect(0, 0, W, H);

      // Layer 1: Room
      const lRoom = drawLayer(ctx => ctx.drawImage(ROOM, 0, 0));
      applyLight(lRoom, amb, lights);
      sctx.drawImage(lRoom, 0, 0); release(lRoom);

      // Layer 2: Characters
      const lChars = drawLayer(ctx => {
        const cx = 38, breath = Math.sin(t * 2.4) * 0.8;
        const torsoY = BAR_Y - 44 + breath;

        // Scribe Torso
        ctx.fillStyle = '#123324';
        ctx.beginPath(); ctx.moveTo(cx - 14, BAR_Y + 6); ctx.lineTo(cx - 11, torsoY + 10); ctx.lineTo(cx + 11, torsoY + 10); ctx.lineTo(cx + 14, BAR_Y + 6); ctx.fill();
        ctx.fillStyle = '#2a6e4f'; ctx.fillRect(cx - 4, torsoY + 8, 3, 24);
        ctx.fillStyle = '#123324'; ctx.fillRect(cx - 13, torsoY + 10, 5, 20);
        ctx.fillStyle = '#fad0b1'; ctx.fillRect(cx - 12, BAR_Y + 2, 4.5, 3.5);

        // Parchment Scroll
        ctx.fillStyle = '#fff1c7'; ctx.fillRect(cx - 6, BAR_Y + 2, 28, 6);
        ctx.fillStyle = '#824924'; ctx.fillRect(cx - 6, BAR_Y + 1, 28, 1);
        if (isWriting) {
          for (let i = 0; i < 3; i++) {
            ctx.fillStyle = '#2e190d'; ctx.fillRect(cx - 2, BAR_Y + 3 + i * 1.8, 14, 1);
          }
        }

        if (!isWriting) {
          // Head Facing User
          ctx.fillStyle = '#0a1f16'; ctx.beginPath(); ctx.arc(cx, torsoY - 4, 10, Math.PI, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#3c966c'; ctx.fillRect(cx - 10, torsoY - 5, 20, 2.5);
          ctx.fillStyle = '#fad0b1'; ctx.beginPath(); ctx.arc(cx, torsoY + 1, 7.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#635b52'; ctx.beginPath(); ctx.arc(cx, torsoY + 5, 5.5, 0, Math.PI); ctx.fill();
          // Spectacles
          ctx.strokeStyle = '#f8ce53'; ctx.lineWidth = 1;
          ctx.strokeRect(cx - 6, torsoY - 2, 4.5, 4); ctx.strokeRect(cx + 2, torsoY - 2, 4.5, 4);
          ctx.fillStyle = '#05050e'; ctx.fillRect(cx - 4.5, torsoY - 0.5, 2, 2); ctx.fillRect(cx + 3.5, torsoY - 0.5, 2, 2);
          // Upright Quill
          const [elb, hd] = reach([cx + 9, torsoY + 8], [cx + 19, BAR_Y - 10]);
          limb(ctx, cx + 9, torsoY + 8, 4.2, elb[0], elb[1], 3.6, '#123324');
          limb(ctx, elb[0], elb[1], 3.6, hd[0], hd[1], 3, '#2a6e4f');
          ctx.fillStyle = '#fad0b1'; ctx.fillRect(hd[0] - 1.5, hd[1] - 1.5, 3.5, 3.5);
          ctx.strokeStyle = '#c2cef0'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(hd[0], hd[1]); ctx.lineTo(hd[0] + 5, hd[1] - 18); ctx.stroke();
        } else {
          // Head Bowed Down Writing
          const headX = cx + 5, headY = torsoY + 6;
          ctx.fillStyle = '#0a1f16'; ctx.beginPath(); ctx.arc(headX - 2, headY - 4, 9, Math.PI, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#3c966c'; ctx.fillRect(headX - 10, headY - 5, 18, 2.2);
          ctx.fillStyle = '#fad0b1'; ctx.beginPath(); ctx.arc(headX, headY + 1, 7, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#635b52'; ctx.beginPath(); ctx.arc(headX + 1.5, headY + 4, 5, 0, Math.PI); ctx.fill();
          ctx.fillStyle = '#05050e'; ctx.fillRect(headX - 2.5, headY + 1, 1.8, 1.8); ctx.fillRect(headX + 2, headY + 1, 1.8, 1.8);
          // Scribbling Quill
          const writeX = cx + 6 + ((this.quillProgress * 18) % 16);
          const [elb, hd] = reach([cx + 9, torsoY + 8], [writeX, BAR_Y + 1]);
          limb(ctx, cx + 9, torsoY + 8, 4.2, elb[0], elb[1], 3.6, '#123324');
          limb(ctx, elb[0], elb[1], 3.6, hd[0], hd[1], 3, '#2a6e4f');
          ctx.fillStyle = '#fad0b1'; ctx.fillRect(hd[0] - 1.5, hd[1] - 1.5, 3.5, 3.5);
          ctx.strokeStyle = '#c2cef0'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(hd[0], hd[1]); ctx.lineTo(hd[0] + 8, hd[1] - 16); ctx.stroke();
        }

        // Barkeep Garrick (x = 96)
        ctx.fillStyle = '#61351b'; ctx.beginPath(); ctx.arc(96, 130, 12, Math.PI, Math.PI * 2); ctx.rect(84, 130, 24, 14); ctx.fill();
        ctx.fillStyle = '#f5eee4'; ctx.fillRect(89, 128, 14, 16);
        ctx.fillStyle = '#fad0b1'; ctx.beginPath(); ctx.arc(isWriting ? 94 : 96, 120, 7.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#61351b'; ctx.fillRect(89, 114, 14, 3);
        ctx.fillStyle = '#05050e'; ctx.fillRect(isWriting ? 90 : 92, 119, 2, 2);

        // Warrior Brogun (x = 138)
        const nod = isWriting ? Math.sin(t * 3.5) * 1.2 : 0;
        ctx.fillStyle = '#262a4a'; ctx.fillRect(129, 132 + nod, 18, 16);
        ctx.fillStyle = '#6d78a8'; ctx.fillRect(127, 130 + nod, 5, 5.5); ctx.fillRect(144, 130 + nod, 5, 5.5);
        ctx.fillStyle = '#c43333'; ctx.beginPath(); ctx.moveTo(131, 127 + nod); ctx.lineTo(145, 127 + nod); ctx.lineTo(141, 144 + nod); ctx.lineTo(135, 144 + nod); ctx.fill();
        ctx.fillStyle = '#6d78a8'; ctx.beginPath(); ctx.arc(isWriting ? 135 : 138, 122 + nod, 7.5, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fad0b1'; ctx.fillRect(isWriting ? 131 : 134, 123 + nod, 7, 4);
        ctx.fillStyle = '#05050e'; ctx.fillRect(isWriting ? 132 : 135, 124 + nod, 1.8, 1.8);
      });
      applyLight(lChars, amb, lights);
      applyRim(lChars, -1.2, 0, 176, 135, 80, '255, 200, 120', 0.45);
      applyRim(lChars, 1.2, 0, 36, 138, 60, '255, 225, 140', 0.45);
      sctx.drawImage(lChars, 0, 0); release(lChars);

      // Layer 3: Bar Top
      const lBar = drawLayer(ctx => ctx.drawImage(BAR, 0, 0));
      applyLight(lBar, amb, lights);
      sctx.drawImage(lBar, 0, 0); release(lBar);

      // Flames & Glowing Props
      const cHeight = (5 + (isWriting ? this.volVal * 0.4 : 0) * 4) * candleFlick;
      sctx.fillStyle = '#f8ce53'; sctx.beginPath();
      sctx.moveTo(33, 142); sctx.quadraticCurveTo(31, 142 - cHeight * 0.5, 34, 142 - cHeight); sctx.quadraticCurveTo(37, 142 - cHeight * 0.5, 35, 142); sctx.fill();
      sctx.fillStyle = '#fffcc7'; sctx.fillRect(102, 28, 4, 6);

      // Hearth Fire
      const hGrad = sctx.createRadialGradient(176, 130, 0, 176, 130, 26);
      hGrad.addColorStop(0, `rgba(244, 135, 115, ${0.75 * hearthFlick})`); hGrad.addColorStop(1, 'rgba(68, 14, 21, 0)');
      sctx.fillStyle = hGrad; sctx.fillRect(156, 105, 40, 42);

      crush();

      // Post-Crush Speech Bubble
      if (this.activeComment) {
        const c = this.activeComment;
        const textW = ptextWidth(c.text), bw = textW + 10, bh = 13;
        let bx = c.x - bw / 2; if (bx < 6) bx = 6; if (bx + bw > W - 6) bx = W - 6 - bw;
        const by = c.y - bh - 6;
        actx.fillStyle = '#05050e'; actx.fillRect(bx + 1, by + 1, bw, bh);
        actx.fillStyle = '#fff1c7'; actx.fillRect(bx, by, bw, bh);
        actx.strokeStyle = '#61351b'; actx.lineWidth = 1; actx.strokeRect(bx, by, bw, bh);
        ptext(actx, c.text, bx + 5, by + 3.5, '#2e190d');
      }

      this.viewCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.viewCtx.drawImage(art, 0, 0, this.canvas.width, this.canvas.height);
    }
  }

  customElements.define('tavern-scribe', TavernScribeElement);

  let last = performance.now();
  requestAnimationFrame(function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const el of LIVE) el.advance(dt);
    requestAnimationFrame(loop);
  });
})();
