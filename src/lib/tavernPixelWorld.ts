// TavernPixelWorld: Authentic pixel art tavern engine powered by the original
// pixel-worlds components (Round & Sage by Justin Finkelman).
//
// 1. Exact 49-color palette (PAL) and 4x4 Bayer ordered dither LUT crush.
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
// 3. Exact character anatomy & shaders:
//    - The Scribe (from Sage): scholar robes, spectacles, unrolled scroll, ink strokes.
//      * Silent / idle: turns face towards user, quill poised upright.
//      * Speaking: head bowed over parchment, scribbling rhythmically with ink trails.
//    - Tavern Regulars (from Round):
//      * Ironhelm (Armored dwarf in horned helmet, glowing slit visor, braided beard, steel pauldrons).
//      * Greybeard (Wise wizard in patched conical hat, smoking pipe, rune staff, pewter stein).
//      * Ranger (Elven scout in dark green hooded cloak, shadow-veiled glowing green eyes, silver beaker).
//      * Burglar (One-eyed scarred veteran with eye patch, drinking tin mug by the roaring hearth).
// 4. Multiplied light map with cold ambient, warm candle & hearth radial lights, and dual rim lighting.

export interface TavernState {
  isSpeaking: boolean;
  audioEnergy: number;
}

export interface PatronComment {
  patronIndex: number;
  text: string;
  x: number;
  y: number;
  timer: number;
  duration: number;
}

export class TavernPixelWorld {
  // Canvas dimensions matching 60% mobile viewport aspect ratio
  public static readonly W = 280;
  public static readonly H = 260;
  public static readonly CT = 175; // Counter top Y

  public readonly W = TavernPixelWorld.W;
  public readonly H = TavernPixelWorld.H;
  public readonly CT = TavernPixelWorld.CT;

  // ───────── 49-Color Palette from Round.js ─────────
  public static readonly PAL: string[] = [
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

  private static readonly B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  private static readonly SPREAD = 9;

  // Internal Buffers
  private softCanvas: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;
  private artCanvas: HTMLCanvasElement;
  private actx: CanvasRenderingContext2D;
  private artImg: ImageData;
  private art32: Uint32Array;

  // Pre-calculated Palette & LUT
  private PAL32: Uint32Array;
  private LUT: Uint8Array;

  // Baked Static Layers
  private ROOM_CANVAS!: HTMLCanvasElement;
  private COUNTER_CANVAS!: HTMLCanvasElement;
  private CANDLES_CANVAS!: HTMLCanvasElement;

  // Dynamic Scene State
  private time = 0;
  private isSpeaking = false;
  private audioEnergy = 0;
  private quillWriteProgress = 0;
  private isBlinking = false;
  private blinkTimer = 2.0;

  // Commentary
  private activeComment: PatronComment | null = null;
  private commentCooldown = 2.5;

  private listeningComments = [
    "Hush! The chronicler writes.",
    "Speak on, traveler.",
    "By my beard, listen closely!",
    "Aye... truth in every line.",
    "Let not a single word fade.",
    "Silence in the hall!"
  ];

  private idleComments = [
    "Pour another round, Garrick!",
    "The stars watch over tonight.",
    "Rest thy boots by the hearth.",
    "Ale is cold, hearth is warm.",
    "Another flagon for the table!",
    "A quiet eve before the dawn."
  ];

  constructor() {
    this.softCanvas = document.createElement('canvas');
    this.softCanvas.width = this.W;
    this.softCanvas.height = this.H;
    this.sctx = this.softCanvas.getContext('2d', { willReadFrequently: true })!;

    this.artCanvas = document.createElement('canvas');
    this.artCanvas.width = this.W;
    this.artCanvas.height = this.H;
    this.actx = this.artCanvas.getContext('2d')!;
    this.artImg = this.actx.createImageData(this.W, this.H);
    this.art32 = new Uint32Array(this.artImg.data.buffer);

    // Initialize 49-color palette LUT
    const pal = TavernPixelWorld.PAL;
    const RGB = pal.map(h => [
      parseInt(h.slice(1, 3), 16),
      parseInt(h.slice(3, 5), 16),
      parseInt(h.slice(5, 7), 16)
    ]);
    this.PAL32 = new Uint32Array(
      RGB.map(c => (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0])
    );
    this.LUT = new Uint8Array(32768);
    for (let r = 0; r < 32; r++) {
      for (let g = 0; g < 32; g++) {
        for (let b = 0; b < 32; b++) {
          let best = 0;
          let bd = 1e9;
          const R = r * 8 + 4;
          const G = g * 8 + 4;
          const Bv = b * 8 + 4;
          for (let q = 0; q < RGB.length; q++) {
            const c = RGB[q];
            const e =
              2 * (R - c[0]) ** 2 +
              4 * (G - c[1]) ** 2 +
              3 * (Bv - c[2]) ** 2;
            if (e < bd) {
              bd = e;
              best = q;
            }
          }
          this.LUT[(r << 10) | (g << 5) | b] = best;
        }
      }
    }

    this.bakeEnvironment();
  }

  // ───────── Math & Noise Helpers (from Round.js) ─────────
  private mulberry(seed: number) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  private hash(x: number, y: number): number {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (Math.imul(h ^ (h >>> 13), 1274126177)) | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  private vnoise(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const l = (a: number, b: number, t: number) => a + (b - a) * t;
    return l(
      l(this.hash(xi, yi), this.hash(xi + 1, yi), sx),
      l(this.hash(xi, yi + 1), this.hash(xi + 1, yi + 1), sx),
      sy
    );
  }

  private fbm(x: number, y: number): number {
    return (
      0.55 * this.vnoise(x, y) +
      0.3 * this.vnoise(x * 2.1, y * 2.1 + 7) +
      0.15 * this.vnoise(x * 4.3, y * 4.3 + 19)
    );
  }

  private lin(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, ...st: string[]): CanvasGradient {
    const gr = ctx.createLinearGradient(x0, y0, x1, y1);
    st.forEach((c, i) => gr.addColorStop(i / (st.length - 1), c));
    return gr;
  }

  private rad(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ...st: string[]): CanvasGradient {
    const gr = ctx.createRadialGradient(x, y, 0.5, x, y, r);
    st.forEach((c, i) => gr.addColorStop(i / (st.length - 1), c));
    return gr;
  }

  private glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, a: number) {
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},${a})`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = gr;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  private ell(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, c: string | CanvasGradient) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private fillP(ctx: CanvasRenderingContext2D, c: string | CanvasGradient, fn: (k: CanvasRenderingContext2D) => void) {
    ctx.fillStyle = c;
    ctx.beginPath();
    fn(ctx);
    ctx.fill();
  }

  private strokeP(ctx: CanvasRenderingContext2D, c: string, w: number, fn: (k: CanvasRenderingContext2D) => void) {
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    fn(ctx);
    ctx.stroke();
  }

  private limb(ctx: CanvasRenderingContext2D, ax: number, ay: number, ra: number, bx: number, by: number, rb: number, col: string | CanvasGradient) {
    const a = Math.atan2(by - ay, bx - ax);
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    const q = Math.PI / 2;
    this.fillP(ctx, col, k => {
      k.moveTo(ax + nx * ra, ay + ny * ra);
      k.lineTo(bx + nx * rb, by + ny * rb);
      k.arc(bx, by, rb, a + q, a - q, true);
      k.lineTo(ax - nx * ra, ay - ny * ra);
      k.arc(ax, ay, ra, a - q, a + q, true);
    });
  }

  private reach(
    shoulder: [number, number],
    target: [number, number],
    upper: number,
    fore: number,
    bend = 1
  ): [[number, number], [number, number]] {
    let dx = target[0] - shoulder[0];
    let dy = target[1] - shoulder[1];
    let d = Math.hypot(dx, dy) || 1;
    const maxReach = upper + fore - 0.4;
    const minReach = Math.abs(upper - fore) + 0.4;
    const k = d > maxReach ? maxReach / d : d < minReach ? minReach / d : 1;
    dx *= k;
    dy *= k;
    d *= k;
    const angle =
      Math.atan2(dy, dx) +
      bend * Math.acos(Math.min(1, Math.max(-1, (upper * upper + d * d - fore * fore) / (2 * upper * d))));
    return [
      [shoulder[0] + upper * Math.cos(angle), shoulder[1] + upper * Math.sin(angle)],
      [shoulder[0] + dx, shoulder[1] + dy]
    ];
  }

  // ───────── Bake Static Environment ─────────
  private bakeEnvironment() {
    const rnd = this.mulberry(5);
    const W = this.W;
    const H = this.H;
    const CT = this.CT;

    // 1. ROOM BACKGROUND (Stone, Lancet Window, Beams, Chandelier, Shelves, Hearth)
    this.ROOM_CANVAS = document.createElement('canvas');
    this.ROOM_CANVAS.width = W;
    this.ROOM_CANVAS.height = H;
    const r = this.ROOM_CANVAS.getContext('2d')!;

    // Dark Stone Backing
    r.fillStyle = this.lin(r, 0, 0, 0, CT, '#050409', '#0e0b13', '#17111a');
    r.fillRect(0, 0, W, H);

    // Rough Stone Masonry Blocks
    for (let y = 26; y < CT; y += 12) {
      for (let x = ((y / 12) | 0) % 2 ? -9 : 4; x < W; x += 22 + ((this.hash(x, y) * 10) | 0)) {
        const w = 20 + this.hash(y, x) * 9;
        r.fillStyle = `rgba(${this.hash(x, y + 3) < 0.5 ? '56,46,60' : '34,28,40'},.45)`;
        r.fillRect(x, y, w, 11);
        r.fillStyle = 'rgba(120,104,120,.18)';
        r.fillRect(x, y, w, 1);
      }
    }

    // ── Lancet Arched Gothic Window (wx = 62, wy = 32, ww = 26, wh = 66) ──
    const wx = 62;
    const wy = 32;
    const ww = 26;
    const wh = 66;
    for (const ox of [0, 34]) {
      this.fillP(r, '#030306', k => {
        k.moveTo(wx + ox - 4, wy + wh + 3);
        k.lineTo(wx + ox - 4, wy + 16);
        k.quadraticCurveTo(wx + ox + ww / 2, wy - 26, wx + ox + ww + 4, wy + 16);
        k.lineTo(wx + ox + ww + 4, wy + wh + 3);
      });
      r.save();
      r.beginPath();
      r.moveTo(wx + ox, wy + wh);
      r.lineTo(wx + ox, wy + 17);
      r.quadraticCurveTo(wx + ox + ww / 2, wy - 18, wx + ox + ww, wy + 17);
      r.lineTo(wx + ox + ww, wy + wh);
      r.clip();

      // Midnight sky gradient
      r.fillStyle = this.lin(r, 0, wy - 6, 0, wy + wh, '#070a1c', '#13204e', '#2c3a78');
      r.fillRect(wx + ox, wy - 12, ww, wh + 12);

      // Distant stars
      for (let i = 0; i < 22; i++) {
        r.fillStyle = `rgba(220,232,255,${0.35 + rnd() * 0.6})`;
        r.fillRect(wx + ox + rnd() * ww, wy - 6 + rnd() * 40, 1, 1);
      }

      // Aurora borealis wave
      for (let x = wx + ox; x < wx + ox + ww; x++) {
        const y = wy + 2 + 5 * Math.sin(x * 0.09) + 2 * Math.sin(x * 0.23);
        const i = 0.4 + 0.6 * this.vnoise(x * 0.14, 2);
        r.fillStyle = this.lin(r, 0, y, 0, y + 20, 'rgba(70,200,170,0)', `rgba(70,200,170,${0.5 * i})`, 'rgba(110,60,170,0)');
        r.fillRect(x, y, 1, 20);
      }

      // Moon & Citadel on the second lancet
      if (ox > 0) {
        const mx = wx + ox + 13;
        const my = wy + 24;
        this.glow(r, mx, my, 24, '170,198,240', 0.5);
        this.ell(r, mx, my, 8, 8, this.rad(r, mx - 3, my - 3, 9, '#ffffff', '#dfe7f0', '#9db6dc'));
        // Citadel spires on distant peak
        for (const [dx, w, h] of [[-7, 2, 8], [6, 2, 10], [-3, 2, 13], [2, 2, 15], [0, 3, 19]]) {
          r.fillStyle = '#070a18';
          r.fillRect(mx + dx - w / 2, my + 11 - h, w, h);
        }
      }

      // Distant Mountain Ridge
      for (let x = wx + ox; x < wx + ox + ww; x++) {
        r.fillStyle = '#101a3c';
        r.fillRect(x, wy + wh - 10 - 7 * this.fbm((x + ox) * 0.06, 4), 1, 30);
      }

      // Leaded Glass Diamond Lattice
      for (let y = wy - 10; y < wy + wh; y += 9) {
        r.fillStyle = 'rgba(3,3,6,.9)';
        r.fillRect(wx + ox, y, ww, 1);
      }
      r.fillStyle = 'rgba(3,3,6,.9)';
      r.fillRect(wx + ox + ww / 2 - 0.5, wy - 14, 1, wh + 14);
      r.restore();
    }

    // Lancet Sill
    r.fillStyle = '#1a1418';
    r.fillRect(wx - 8, wy + wh + 2, 72, 4);
    r.fillStyle = 'rgba(120,150,210,.4)';
    r.fillRect(wx - 8, wy + wh + 2, 72, 1);

    // Moonlight shaft spilling on floor
    r.save();
    r.globalCompositeOperation = 'lighter';
    this.fillP(r, this.lin(r, 0, wy, 0, CT, 'rgba(70,100,190,.18)', 'rgba(70,100,190,0)'), k => {
      k.moveTo(wx, wy);
      k.lineTo(wx + 60, wy);
      k.lineTo(wx + 110, CT);
      k.lineTo(wx + 30, CT);
    });
    r.restore();

    // ── Heavy Timber Posts & Lintel Beam ──
    for (const x of [0, 52, 142, 228, W]) {
      r.fillStyle = this.lin(r, x - 6, 0, x + 6, 0, '#2a1a18', '#0e0a0e');
      r.fillRect(x - 6, 0, 12, CT);
      r.fillStyle = 'rgba(120,80,60,.3)';
      r.fillRect(x - 6, 0, 1, CT);
    }
    r.fillStyle = this.lin(r, 0, 16, 0, 30, '#2c1b18', '#0e0a0e');
    r.fillRect(0, 16, W, 14);
    r.fillStyle = 'rgba(140,90,60,.3)';
    r.fillRect(0, 16, W, 1);
    r.fillStyle = 'rgba(0,0,0,.7)';
    r.fillRect(0, 30, W, 2);
    r.fillStyle = '#040306';
    r.fillRect(0, 0, W, 16);

    // ── Chains & Cold Iron Ring Chandelier (x = 146, y = 52) ──
    for (const [x, len] of [[136, 18], [156, 18]]) {
      for (let y = 30; y < 30 + len; y += 3) {
        r.fillStyle = '#4a4a52';
        r.fillRect(x, y, 1, 2);
      }
    }
    this.ell(r, 146, 52, 22, 4.6, '#050409');
    this.ell(r, 146, 51, 22, 4.2, this.lin(r, 124, 0, 168, 0, '#16131e', '#4a4a52', '#16131e'));
    this.ell(r, 146, 50.5, 17, 2.6, '#050409');
    this.strokeP(r, '#050409', 1, k => {
      k.moveTo(146, 26);
      k.lineTo(127, 50);
      k.moveTo(146, 26);
      k.lineTo(165, 50);
    });
    for (const dx of [-15, 0, 15]) {
      r.fillStyle = '#b98470';
      r.fillRect(146 + dx - 1.2, 44, 2.4, 6);
    }

    // Dried Hanging Herb Bundles
    const herbs: [number, number, string][] = [
      [20, 14, '#2e4034'],
      [40, 11, '#44584a'],
      [186, 13, '#2e4034'],
      [200, 10, '#1f2c24']
    ];
    for (const [x, len, col] of herbs) {
      r.fillStyle = '#2c1a15';
      r.fillRect(x, 30, 1, 4);
      this.fillP(r, col, k => {
        k.moveTo(x - 3, 34);
        k.lineTo(x + 4, 34);
        k.lineTo(x + 2, 34 + len);
        k.lineTo(x - 2, 34 + len - 3);
      });
    }

    // ── Timber Shelves with Jars, Bottles, and Shaded Skull ──
    for (const y of [76, 104]) {
      r.fillStyle = this.lin(r, 0, y, 0, y + 4, '#40241a', '#16100f');
      r.fillRect(144, y, 80, 4);
      r.fillStyle = 'rgba(160,100,60,.3)';
      r.fillRect(144, y, 80, 1);
      for (let x = 148; x < 218; x += 8 + ((this.hash(x, y) * 4) | 0)) {
        const h = 7 + this.hash(x, y + 1) * 10;
        const w = 3.5 + ((this.hash(y, x) * 2.5) | 0);
        const col = ['#1f2c24', '#3a1414', '#1a2740', '#40241a', '#2a2238'][(x + y) % 5];
        r.fillStyle = this.lin(r, x, 0, x + w, 0, col, '#07060b');
        r.fillRect(x, y - h, w, h);
        r.fillStyle = col;
        r.fillRect(x + w / 2 - 1, y - h - 3, 2, 3);
        r.fillStyle = 'rgba(180,200,230,.3)';
        r.fillRect(x + 1, y - h + 2, 1, h - 5);
      }
    }
    // Shaded human skull on lower shelf
    this.ell(r, 212, 98, 5.5, 5, '#c4c4c8');
    r.fillStyle = '#96969e';
    r.fillRect(208.5, 100, 7, 4);
    this.ell(r, 210, 98, 1.5, 1.7, '#07060b');
    this.ell(r, 214, 98, 1.5, 1.7, '#07060b');

    // ── Grand Stone Hearth Fireplace (hx = 232, hy = 62) ──
    const hx = 232;
    const hy = 62;
    r.fillStyle = this.lin(r, hx, 0, W, 0, '#201b28', '#383040', '#16131e');
    r.fillRect(hx, hy, W - hx, CT - hy);
    for (let y = hy; y < CT; y += 11) {
      for (let x = hx + (((y / 11) | 0) % 2 ? 0 : 8); x < W; x += 16) {
        r.fillStyle = `rgba(${this.hash(x, y) < 0.5 ? '84,70,84' : '44,36,50'},.5)`;
        r.fillRect(x, y, 15, 10);
        r.fillStyle = 'rgba(230,150,90,.22)';
        r.fillRect(x, y, 15, 1);
        r.fillStyle = 'rgba(0,0,0,.7)';
        r.fillRect(x, y + 10, 16, 1);
      }
    }
    // Arched Hearth Aperture
    const hearthPath = (k: CanvasRenderingContext2D) => {
      k.moveTo(hx + 8, CT);
      k.lineTo(hx + 8, hy + 38);
      k.quadraticCurveTo(hx + 28, hy + 6, hx + 46, hy + 38);
      k.lineTo(hx + 46, CT);
    };
    this.fillP(r, '#040306', hearthPath);
    this.strokeP(r, 'rgba(255,150,70,.42)', 1.4, hearthPath);

    // Stone Mantel
    r.fillStyle = this.lin(r, 0, hy - 7, 0, hy, '#40241a', '#16100f');
    r.fillRect(hx - 4, hy - 7, W - hx + 4, 7);
    r.fillStyle = 'rgba(230,140,70,.5)';
    r.fillRect(hx - 4, hy - 7, W - hx + 4, 1);

    // Horned Beast Skull over the mantel (Round.js signature)
    const sx = hx + 26;
    const sy = hy - 18;
    for (const s of [-1, 1]) {
      this.fillP(r, this.lin(r, sx, 0, sx + s * 22, 0, '#b98470', '#4a2e28'), k => {
        k.moveTo(sx + s * 5, sy - 2);
        k.bezierCurveTo(sx + s * 14, sy - 3, sx + s * 23, sy - 10, sx + s * 21, sy - 18);
        k.bezierCurveTo(sx + s * 18, sy - 10, sx + s * 12, sy - 6, sx + s * 5, sy + 1);
      });
    }
    this.fillP(r, this.lin(r, sx - 7, 0, sx + 7, 0, '#96969e', '#d8ac94', '#6e4438'), k => {
      k.moveTo(sx - 7, sy - 5);
      k.quadraticCurveTo(sx, sy - 9, sx + 7, sy - 5);
      k.lineTo(sx + 4, sy + 5);
      k.lineTo(sx + 2.5, sy + 11);
      k.lineTo(sx - 2.5, sy + 11);
      k.lineTo(sx - 4, sy + 5);
    });
    this.ell(r, sx - 3, sy - 1, 1.8, 2.2, '#07060b');
    this.ell(r, sx + 3, sy - 1, 1.8, 2.2, '#07060b');
    r.fillStyle = '#07060b';
    r.fillRect(sx - 0.8, sy + 5, 1.6, 3);

    // ── Torn Heraldic Banner ──
    this.fillP(r, this.lin(r, 214, 0, 226, 0, '#3a1414', '#5c1c18', '#1c1210'), k => {
      k.moveTo(214, 30);
      k.lineTo(226, 30);
      k.lineTo(226, 68);
      k.lineTo(223, 62);
      k.lineTo(220, 72);
      k.lineTo(217, 60);
      k.lineTo(214, 65);
    });
    this.strokeP(r, 'rgba(216,172,148,.55)', 1, k => {
      k.moveTo(220, 38);
      k.lineTo(220, 54);
      k.moveTo(216, 44);
      k.lineTo(224, 44);
    });

    // 2. COUNTER BASE (Oak wood grain, brass foot rail, ember rail)
    this.COUNTER_CANVAS = document.createElement('canvas');
    this.COUNTER_CANVAS.width = W;
    this.COUNTER_CANVAS.height = H;
    const c = this.COUNTER_CANVAS.getContext('2d')!;

    c.fillStyle = this.lin(c, 0, CT, 0, CT + 9, '#b9713a', '#754026', '#40241a');
    c.fillRect(0, CT, W, 9);
    for (let i = 0; i < 70; i++) {
      c.fillStyle = `rgba(${rnd() < 0.4 ? '250,200,130' : '20,10,8'},.24)`;
      c.fillRect(rnd() * W, CT + 1 + rnd() * 7, 5 + rnd() * 24, 1);
    }
    c.fillStyle = 'rgba(255,214,150,.6)';
    c.fillRect(0, CT, W, 1.2);
    c.fillStyle = '#07060b';
    c.fillRect(0, CT + 9, W, 2);

    // Counter Apron
    c.fillStyle = this.lin(c, 0, CT + 11, 0, H, '#40241a', '#1c1210', '#07060b');
    c.fillRect(0, CT + 11, W, H - CT - 11);
    for (let x = 6; x < W; x += 36) {
      c.fillStyle = 'rgba(5,4,9,.6)';
      c.fillRect(x, CT + 13, 30, 20);
      c.fillStyle = 'rgba(150,85,46,.3)';
      c.fillRect(x, CT + 33, 30, 1);
    }

    // Iron Rail Channel
    c.fillStyle = '#07060b';
    c.fillRect(16, CT + 42, W - 32, 5);
    c.fillStyle = 'rgba(150,150,158,.3)';
    c.fillRect(16, CT + 47, W - 32, 1);
    c.fillStyle = 'rgba(0,0,0,.6)';
    c.fillRect(16, CT + 41, W - 32, 1);

    // Brass Foot Rail
    c.fillStyle = '#ce8c17';
    c.fillRect(0, H - 10, W, 3.5);
    c.fillStyle = '#fffcc7';
    c.fillRect(0, H - 10, W, 1);

    // 3. STATIC TALLOW CANDLE STUBS (x = 76 and x = 194)
    this.CANDLES_CANVAS = document.createElement('canvas');
    this.CANDLES_CANVAS.width = W;
    this.CANDLES_CANVAS.height = H;
    const cd = this.CANDLES_CANVAS.getContext('2d')!;

    for (const cx of [76, 194]) {
      const b = CT + 7.6;
      this.ell(cd, cx, b, 7, 1.9, '#07060b');
      this.ell(cd, cx, b - 0.7, 6.4, 1.6, this.lin(cd, cx - 6, 0, cx + 6, 0, '#6c6c76', '#383040', '#16131e'));
      cd.fillStyle = this.lin(cd, 0, b - 12, 0, b, '#fbe09a', '#d8ac94', '#946050');
      cd.fillRect(cx - 3, b - 11.5, 6, 11);
      cd.fillStyle = '#d8ac94';
      cd.fillRect(cx - 3.8, b - 9, 1.6, 5);
      this.ell(cd, cx, b - 11.5, 3, 1, '#fff6d0');
      cd.fillStyle = '#07060b';
      cd.fillRect(cx - 0.4, b - 13.6, 0.9, 2.4);
    }
  }

  // ───────── Procedural Flame Tongues (from Round.js) ─────────
  private drawHearthFire(ctx: CanvasRenderingContext2D, t: number, hx: number, ct: number): number {
    const f = 0.82 + 0.18 * (0.6 * this.vnoise(t * 7, 3) + 0.4 * this.vnoise(t * 17, 9));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(hx + 8, ct);
    ctx.lineTo(hx + 8, 100);
    ctx.quadraticCurveTo(hx + 28, 68, hx + 46, 100);
    ctx.lineTo(hx + 46, ct);
    ctx.clip();

    ctx.fillStyle = this.rad(ctx, hx + 28, ct + 6, 70, `rgba(255,190,100,${f})`, `rgba(226,100,36,${0.9 * f})`, 'rgba(138,36,20,.8)', 'rgba(58,16,14,.6)', 'rgba(8,5,8,0)');
    ctx.fillRect(hx, 66, 50, ct - 66);

    const TIER = [
      ['rgba(184,67,31,0)', '#b8431f', '#e0692a', '#f0bb62'],
      ['rgba(224,105,42,0)', '#e0692a', '#f0bb62', '#fbe09a'],
      ['rgba(240,187,98,0)', '#f0bb62', '#fbe09a', '#fff6d0']
    ];

    for (let j = 0; j < 16; j++) {
      const tier = j < 7 ? 0 : j < 12 ? 1 : 2;
      const q = this.hash(j, 21);
      const dx = (this.hash(j, 22) - 0.5) * (42 - tier * 10);
      const h0 = (42 - tier * 10) * (1 - 0.5 * (dx / 24) ** 2) * (0.6 + 0.4 * q);
      const fh = h0 * (0.6 + 0.62 * this.vnoise(t * (3.6 + tier + q) + j * 9.1, j));
      const x = hx + 28 + dx + (this.vnoise(t * 2.4 + j * 4, 7) - 0.5) * 5;
      const sway = (this.vnoise(t * 2.3 + j * 1.7, 3) - 0.5) * fh * 0.5;
      const wd = fh * 0.1 + 2.0;

      ctx.fillStyle = this.lin(ctx, 0, ct - fh, 0, ct, ...TIER[tier]);
      ctx.beginPath();
      ctx.moveTo(x - wd, ct + 1);
      ctx.bezierCurveTo(x - wd * 1.3, ct - fh * 0.4, x - wd * 0.15 + sway * 0.4, ct - fh * 0.64, x + sway, ct - fh);
      ctx.bezierCurveTo(x + wd * 0.45 + sway * 0.5, ct - fh * 0.66, x + wd * 1.3, ct - fh * 0.36, x + wd, ct + 1);
      ctx.fill();
    }

    // Floating Embers
    for (let i = 0; i < 14; i++) {
      const ph = (t * (0.25 + this.hash(i, 1) * 0.3) + this.hash(i, 2)) % 1;
      ctx.fillStyle = ph < 0.5 ? '#fbe09a' : '#e0692a';
      ctx.fillRect(hx + 12 + this.hash(i, 3) * 32 + Math.sin(ph * 7 + i) * 3, ct - 16 - ph * 38, 1, 1);
    }
    ctx.restore();
    this.glow(ctx, hx + 28, ct - 10, 80, '255,110,30', 0.25 * f);
    return f;
  }

  // ───────── Character Models (from Round.js & Sage.js) ─────────

  /**
   * 1. THE SCRIBE (Scholar/Sage at the bar, cx = 44)
   * Silent: turns face to user, spectacles on, quill poised upright.
   * Speaking: head bowed, writes vigorously with ink strokes.
   */
  private drawScribe(ctx: CanvasRenderingContext2D, t: number, cx: number, ct: number) {
    const isWriting = this.isSpeaking;
    const breath = Math.sin(t * 2.4) * 0.8;

    // Stool & Lower Robe
    ctx.fillStyle = '#2e190d';
    ctx.fillRect(cx - 14, ct + 6, 26, 5);
    ctx.fillRect(cx - 11, ct + 11, 3.5, 45);
    ctx.fillRect(cx + 8, ct + 11, 3.5, 45);

    // Scholar Emerald Robe Body
    const torsoY = ct - 54 + breath;
    ctx.fillStyle = '#10182a';
    ctx.beginPath();
    ctx.moveTo(cx - 16, ct + 6);
    ctx.lineTo(cx - 12, torsoY + 14);
    ctx.lineTo(cx + 12, torsoY + 14);
    ctx.lineTo(cx + 16, ct + 6);
    ctx.closePath();
    ctx.fill();

    // Gold/Navy Folds
    ctx.fillStyle = '#3a5078';
    ctx.fillRect(cx - 6, torsoY + 8, 4, 30);
    ctx.fillStyle = '#f0bb62';
    ctx.fillRect(cx - 2, torsoY + 4, 4, 4);

    // Left Arm resting on counter
    this.limb(ctx, cx - 12, torsoY + 12, 5, cx - 18, ct + 2, 4, '#1a2740');
    this.ell(ctx, cx - 18, ct + 2, 3.5, 2.5, '#d8ac94');

    // Parchment Scroll on Counter
    const B = cx + 8;
    this.fillP(ctx, '#fff6d0', k => {
      k.moveTo(B - 14, ct + 2);
      k.lineTo(B + 16, ct + 2);
      k.lineTo(B + 14, ct - 5);
      k.lineTo(B - 12, ct - 5);
    });
    ctx.fillStyle = '#946050';
    ctx.fillRect(B - 14, ct + 1, 30, 1);
    this.limb(ctx, B - 14, ct, 2.2, B - 13, ct - 5, 2.2, '#d8ac94');
    this.limb(ctx, B + 16, ct, 2.2, B + 15, ct - 5, 2.2, '#d8ac94');

    // Dynamic Ink Lines when speaking
    if (isWriting) {
      const lines = Math.min(3, Math.floor(this.quillWriteProgress * 2) + 1);
      for (let i = 0; i < lines; i++) {
        const len = (i === lines - 1) ? ((this.quillWriteProgress * 18) % 16) + 4 : 16;
        ctx.fillStyle = 'rgba(28,18,16,.85)';
        ctx.fillRect(B - 9, ct - 4 + i * 2.2, len, 1);
      }
    }

    // Ink Pot
    ctx.fillStyle = '#07060b';
    ctx.fillRect(cx - 4, ct - 4, 6, 5);
    ctx.fillStyle = '#3aa890';
    ctx.fillRect(cx - 3, ct - 3, 4, 1.5);

    // Head, Eyes & Quill Expression
    if (!isWriting) {
      // ══════ STATE 1: USER SILENT -> HEAD UP, FACING USER! ══════
      const headX = cx;
      const headY = torsoY - 2;

      // Scholar Velvet Beret
      ctx.fillStyle = '#0e0c14';
      ctx.beginPath();
      ctx.arc(headX, headY - 3, 11, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a5078';
      ctx.fillRect(headX - 11, headY - 4, 22, 2.5);

      // Face (Warm, attentive, front-facing)
      this.ell(ctx, headX, headY + 3, 8.5, 9, '#d8ac94');
      // Trimmed Beard
      this.ell(ctx, headX, headY + 8, 6.5, 5, '#946050');

      // Spectacles & Eyes
      if (this.isBlinking) {
        ctx.fillStyle = '#40241a';
        ctx.fillRect(headX - 6, headY + 2, 4, 1.2);
        ctx.fillRect(headX + 2, headY + 2, 4, 1.2);
      } else {
        ctx.strokeStyle = '#f0bb62';
        ctx.lineWidth = 1;
        ctx.strokeRect(headX - 7, headY, 5, 4.5);
        ctx.strokeRect(headX + 2, headY, 5, 4.5);
        ctx.fillStyle = '#f0bb62';
        ctx.fillRect(headX - 2, headY + 1.5, 4, 1);

        ctx.fillStyle = '#07060b';
        ctx.fillRect(headX - 5.5, headY + 1.5, 2.2, 2.2);
        ctx.fillRect(headX + 3.5, headY + 1.5, 2.2, 2.2);
        ctx.fillStyle = '#fff6d0';
        ctx.fillRect(headX - 5.5, headY + 1.5, 1, 1);
        ctx.fillRect(headX + 3.5, headY + 1.5, 1, 1);
      }

      ctx.fillStyle = '#96552e';
      ctx.fillRect(headX - 2, headY + 6.5, 4, 1.2);

      // Right Arm holding quill poised upright
      const shoulder: [number, number] = [cx + 10, torsoY + 10];
      const target: [number, number] = [cx + 22, ct - 14 + breath * 0.5];
      const [elbow, hand] = this.reach(shoulder, target, 11, 12, 1);

      this.limb(ctx, shoulder[0], shoulder[1], 5, elbow[0], elbow[1], 4.2, '#1a2740');
      this.limb(ctx, elbow[0], elbow[1], 4.2, hand[0], hand[1], 3.4, '#3a5078');
      this.ell(ctx, hand[0], hand[1], 3.4, 3.4, '#d8ac94');

      // White Goose Feather Quill (Upright)
      ctx.save();
      ctx.translate(hand[0], hand[1]);
      ctx.rotate(-0.55 + Math.sin(t * 3) * 0.05);
      ctx.fillStyle = '#f0bb62';
      ctx.fillRect(-0.8, 0, 1.6, 6);
      ctx.strokeStyle = '#dfe7f0';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -22);
      ctx.stroke();
      ctx.fillStyle = '#fff6d0';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.quadraticCurveTo(6, -15, 0, -24);
      ctx.quadraticCurveTo(-6, -15, 0, -6);
      ctx.fill();
      ctx.restore();
    } else {
      // ══════ STATE 2: SPEAKING -> HEAD BOWED DOWN, SCRIBBLING! ══════
      const headX = cx + 6;
      const headY = torsoY + 6;

      ctx.fillStyle = '#0e0c14';
      ctx.beginPath();
      ctx.arc(headX - 2, headY - 5, 10, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a5078';
      ctx.fillRect(headX - 12, headY - 6, 20, 2.5);

      this.ell(ctx, headX, headY + 1, 8, 8, '#d8ac94');
      this.ell(ctx, headX + 2, headY + 5, 6, 4.5, '#946050');

      // Eyes focused down on parchment
      ctx.fillStyle = '#07060b';
      ctx.fillRect(headX - 3, headY + 1, 2, 2);
      ctx.fillRect(headX + 2, headY + 1, 2, 2);

      // Arm reaching and writing
      const jig = (t * 18) % 1 < 0.5 ? 1 : 0;
      const writeX = B - 4 + ((this.quillWriteProgress * 22) % 18);
      const shoulder: [number, number] = [cx + 10, torsoY + 10];
      const target: [number, number] = [writeX, ct - 4 - jig];
      const [elbow, hand] = this.reach(shoulder, target, 11, 12, 1);

      this.limb(ctx, shoulder[0], shoulder[1], 5, elbow[0], elbow[1], 4.2, '#1a2740');
      this.limb(ctx, elbow[0], elbow[1], 4.2, hand[0], hand[1], 3.4, '#3a5078');
      this.ell(ctx, hand[0], hand[1], 3.4, 3.4, '#d8ac94');

      // Angled Quill scribbling
      ctx.save();
      ctx.translate(hand[0], hand[1]);
      ctx.rotate(-1.18 + Math.sin(t * 16) * 0.08);
      ctx.fillStyle = '#07060b';
      ctx.fillRect(-0.8, 0, 1.6, 4);
      ctx.strokeStyle = '#dfe7f0';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -20);
      ctx.stroke();
      ctx.fillStyle = '#fff6d0';
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.quadraticCurveTo(5, -14, 0, -22);
      ctx.quadraticCurveTo(-5, -14, 0, -5);
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * 2. IRONHELM (Armored Dwarf from Round.js, cx = 104)
   * Horned iron helmet with glowing slit eyes, braided beard, steel pauldrons, oak tankard.
   */
  private drawIronhelm(ctx: CanvasRenderingContext2D, t: number, cx: number, ct: number) {
    const isSpeaking = this.isSpeaking;
    const nod = isSpeaking ? Math.sin(t * 3.5) * 1.3 : 0;
    const hy = ct - 39 + nod;

    // Torso with iron armor
    this.fillP(ctx, this.lin(ctx, cx - 28, 0, cx + 28, 0, '#383040', '#6c6c76', '#16131e'), k => {
      k.moveTo(cx - 30, ct + 2);
      k.lineTo(cx - 28, ct - 14);
      k.quadraticCurveTo(cx - 24, ct - 24, cx - 12, ct - 25);
      k.lineTo(cx + 12, ct - 25);
      k.quadraticCurveTo(cx + 24, ct - 24, cx + 28, ct - 14);
      k.lineTo(cx + 30, ct + 2);
    });

    // Steel Pauldrons
    for (const s of [-1, 1]) {
      this.ell(ctx, cx + s * 24, ct - 20, 11, 7.5, '#6c6c76');
      this.ell(ctx, cx + s * 25, ct - 23, 9, 5.5, '#c4c4c8');
    }

    // Braided Ginger/Red Beard
    this.fillP(ctx, this.lin(ctx, 0, 0, 0, 38, '#d99448', '#96552e', '#40241a'), k => {
      k.moveTo(cx - 12, hy - 2);
      k.bezierCurveTo(cx - 17, hy + 9, cx - 14, hy + 26, cx - 7, hy + 34);
      k.quadraticCurveTo(cx, hy + 40, cx + 7, hy + 34);
      k.bezierCurveTo(cx + 14, hy + 26, cx + 17, hy + 9, cx + 12, hy - 2);
    });
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#c4c4c8';
      ctx.fillRect(cx + s * 5 - 2, hy + 30, 4, 2.5);
    }

    // Horned Iron Helmet Dome
    this.ell(ctx, cx, hy - 6, 14, 12, this.lin(ctx, cx - 14, 0, cx + 14, 0, '#c4c4c8', '#6c6c76', '#201b28'));
    ctx.fillStyle = '#754026';
    ctx.fillRect(cx - 14, hy - 8, 28, 3.2);
    ctx.fillStyle = '#f0bb62';
    ctx.fillRect(cx - 14, hy - 8, 28, 1);

    // Horns
    for (const s of [-1, 1]) {
      this.fillP(ctx, this.lin(ctx, cx + s * 10, 0, cx + s * 22, 0, '#4a4a52', '#16131e'), k => {
        k.moveTo(cx + s * 12, hy - 10);
        k.bezierCurveTo(cx + s * 20, hy - 9, cx + s * 25, hy - 14, cx + s * 24, hy - 23);
        k.bezierCurveTo(cx + s * 21, hy - 17, cx + s * 17, hy - 15, cx + s * 11, hy - 15);
      });
    }

    // Visor Slit with GLOWING EYES
    ctx.fillStyle = '#07060b';
    ctx.fillRect(cx - 11, hy - 5, 22, 5);

    // Glowing Yellow Eyes (locked on scribe when speaking!)
    const eyeShift = isSpeaking ? -2 : 0;
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#fbe09a';
      ctx.fillRect(cx + s * 5 - 1 + eyeShift, hy - 3.5, 2.2, 1.4);
      this.glow(ctx, cx + s * 5 + eyeShift, hy - 3, 4.5, '255,180,80', 0.65);
    }

    // Oak Tankard with Iron Hoops
    const mugX = cx - 14;
    const mugY = ct - 2;
    ctx.fillStyle = '#754026';
    ctx.fillRect(mugX - 7, mugY - 16, 14, 16);
    ctx.fillStyle = '#c4c4c8';
    ctx.fillRect(mugX - 7.5, mugY - 14, 15, 2.4);
    ctx.fillRect(mugX - 7.5, mugY - 5, 15, 2.4);
    this.ell(ctx, mugX, mugY - 16, 7, 2, '#fbe09a'); // Froth
  }

  /**
   * 3. GREYBEARD (Wise Wizard from Round.js, cx = 158)
   * Patched conical hat folded over, long grey beard, smoking pipe, rune staff, tall stein.
   */
  private drawGreybeard(ctx: CanvasRenderingContext2D, t: number, cx: number, ct: number) {
    const isSpeaking = this.isSpeaking;
    const breath = Math.sin(t * 1.6 + 1) * 0.7;
    const hy = ct - 54 + breath;

    // Staff with GLOWING EMERALD RUNE
    ctx.fillStyle = '#2c1a15';
    ctx.fillRect(cx - 28, 40, 3, ct - 38);
    this.glow(ctx, cx - 27, 36, 16, '58,168,144', 0.7);
    this.fillP(ctx, '#3aa890', k => {
      k.moveTo(cx - 27, 28);
      k.lineTo(cx - 23, 36);
      k.lineTo(cx - 27, 43);
      k.lineTo(cx - 31, 36);
    });
    this.fillP(ctx, '#8fe6c8', k => {
      k.moveTo(cx - 27, 28);
      k.lineTo(cx - 25, 36);
      k.lineTo(cx - 27, 43);
    });

    // Dark Blue Wizard Robe
    this.fillP(ctx, this.lin(ctx, cx - 26, 0, cx + 26, 0, '#1a2740', '#3a5078', '#07060b'), k => {
      k.moveTo(cx - 27, ct + 2);
      k.bezierCurveTo(cx - 28, ct - 20, cx - 24, ct - 34, cx - 10, ct - 38);
      k.lineTo(cx + 10, ct - 38);
      k.bezierCurveTo(cx + 24, ct - 34, cx + 28, ct - 20, cx + 27, ct + 2);
    });

    // Long Flowing Grey Beard
    this.fillP(ctx, this.lin(ctx, 0, 0, 0, 52, '#c4c4c8', '#96969e', '#4a4a52', '#201b28'), k => {
      k.moveTo(cx - 10, hy);
      k.bezierCurveTo(cx - 14, hy + 14, cx - 12, hy + 32, cx - 6, hy + 46);
      k.quadraticCurveTo(cx, hy + 54, cx + 5, hy + 46);
      k.bezierCurveTo(cx + 12, hy + 32, cx + 14, hy + 14, cx + 10, hy);
    });

    // Face & Nose
    this.ell(ctx, cx, hy, 10, 10.5, '#d8ac94');
    this.fillP(ctx, '#946050', k => {
      k.moveTo(cx - 1.5, hy - 3);
      k.quadraticCurveTo(cx - 3, hy + 3, cx, hy + 6);
      k.quadraticCurveTo(cx + 3, hy + 3, cx + 1.5, hy - 3);
    });

    // Hat Brim Shadow & Eyes
    ctx.fillStyle = 'rgba(5,4,9,.88)';
    ctx.fillRect(cx - 10, hy - 8, 20, 11);
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#f0bb62';
      ctx.fillRect(cx + s * 4 - 1, hy - 2, 2, 1.2);
      this.glow(ctx, cx + s * 4, hy - 1.6, 3.4, '240,187,98', 0.5);
    }

    // Smoking Pipe with GLOWING EMBER
    if (!isSpeaking) {
      this.strokeP(ctx, '#1c1210', 1.6, k => {
        k.moveTo(cx + 2, hy + 7);
        k.quadraticCurveTo(cx + 8, hy + 9, cx + 13, hy + 7);
      });
      ctx.fillStyle = '#40241a';
      ctx.fillRect(cx + 12, hy + 4, 5, 5);
      this.ell(ctx, cx + 14.5, hy + 5, 2.4, 1.1, '#e0692a');
      this.glow(ctx, cx + 14.5, hy + 5, 6, '255,130,50', 0.8);

      // Rising smoke wisps
      for (let j = 0; j < 4; j++) {
        const ph = (t * 0.2 + j / 4) % 1;
        this.glow(ctx, cx + 15 + Math.sin(ph * 5 + j) * 3 + ph * 5, hy + 2 - ph * 32, (2 + ph * 6) * 1.5, '170,170,190', 0.2 * (1 - ph));
      }
    } else {
      // Pipe lowered, listening
      this.strokeP(ctx, '#1c1210', 1.4, k => {
        k.moveTo(cx + 2, hy + 7);
        k.lineTo(cx + 9, ct - 6);
      });
    }

    // Wizard Conical Hat (Wide, patched, folded over)
    this.fillP(ctx, this.lin(ctx, cx - 14, 0, cx + 15, 0, '#27395a', '#3a5078', '#10182a'), k => {
      k.moveTo(cx - 13, hy - 7);
      k.bezierCurveTo(cx - 9, hy - 24, cx - 4, hy - 36, cx + 4, hy - 43);
      k.bezierCurveTo(cx + 10, hy - 45, cx + 18, hy - 40, cx + 22, hy - 32);
      k.bezierCurveTo(cx + 16, hy - 36, cx + 12, hy - 34, cx + 11, hy - 29);
      k.bezierCurveTo(cx + 11, hy - 22, cx + 12, hy - 15, cx + 13, hy - 7);
    });
    // Hat Brim
    this.ell(ctx, cx, hy - 6, 26, 5.5, this.lin(ctx, cx - 26, 0, cx + 26, 0, '#10182a', '#27395a', '#07060b'));

    // Tall Pewter Stein
    ctx.fillStyle = '#6c6c76';
    ctx.fillRect(cx - 10, ct - 18, 10, 18);
    ctx.fillStyle = '#3aa890';
    ctx.fillRect(cx - 6, ct - 11, 2, 4); // Rune
  }

  /**
   * 4. RANGER (Elven Scout from Round.js, cx = 210)
   * Deep forest green cloak and hood, glowing emerald eyes under cowl, silver beaker.
   */
  private drawRanger(ctx: CanvasRenderingContext2D, t: number, cx: number, ct: number) {
    const isSpeaking = this.isSpeaking;
    const hy = ct - 65;

    // Green Cloak Body
    this.fillP(ctx, this.lin(ctx, cx - 24, 0, cx + 24, 0, '#1f2c24', '#44584a', '#0e0c14'), k => {
      k.moveTo(cx - 25, ct + 2);
      k.bezierCurveTo(cx - 26, ct - 20, cx - 24, ct - 36, cx - 8, ct - 42);
      k.lineTo(cx + 8, ct - 42);
      k.bezierCurveTo(cx + 24, ct - 36, cx + 26, ct - 20, cx + 25, ct + 2);
    });

    // Quiver of arrows over shoulder
    for (const [dx, dy] of [[15, 0], [19, 3]]) {
      this.strokeP(ctx, '#40241a', 1, k => {
        k.moveTo(cx + dx - 5, ct - 40);
        k.lineTo(cx + dx, hy + dy - 14);
      });
      this.fillP(ctx, '#aebfd4', k => {
        k.moveTo(cx + dx, hy + dy - 14);
        k.lineTo(cx + dx + 3, hy + dy - 8);
        k.lineTo(cx + dx - 1.4, hy + dy - 6);
      });
    }

    // Deep Hood
    this.fillP(ctx, this.lin(ctx, -13, 0, 13, 0, '#1f2c24', '#44584a', '#0e0c14'), k => {
      k.moveTo(cx - 13, hy + 11);
      k.bezierCurveTo(cx - 16, hy - 4, cx - 9, hy - 17, cx + 2, hy - 19);
      k.bezierCurveTo(cx + 10, hy - 16, cx + 16, hy - 4, cx + 13, hy + 11);
      k.quadraticCurveTo(cx, hy + 16, cx - 13, hy + 11);
    });

    // Void under hood with GLOWING GREEN EYES
    ctx.fillStyle = '#07060b';
    ctx.fillRect(cx - 9, hy - 6, 18, 14);

    const eyeShift = isSpeaking ? -1.5 : 0;
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#8fe6c8';
      ctx.fillRect(cx + s * 3.8 - 1 + eyeShift, hy - 2, 2.1, 1.2);
      this.glow(ctx, cx + s * 3.8 + eyeShift, hy - 1.5, 4.4, '143,230,200', 0.65);
    }

    // Elven Silver Beaker
    this.fillP(ctx, this.lin(ctx, cx - 6, 0, cx + 6, 0, '#dfe7f0', '#7e97b8', '#1a2740'), k => {
      k.moveTo(cx - 3, ct);
      k.lineTo(cx - 2.5, ct - 6);
      k.quadraticCurveTo(cx - 3, ct - 11, cx - 5, ct - 17);
      k.lineTo(cx + 5, ct - 17);
      k.quadraticCurveTo(cx + 3, ct - 11, cx + 2.5, ct - 6);
      k.lineTo(cx + 3, ct);
    });
  }

  /**
   * 5. BURGLAR (One-eyed scarred veteran from Round.js, cx = 252)
   * Leather eye patch, scarred weathered face, tin mug, sitting beside the hearth.
   */
  private drawBurglar(ctx: CanvasRenderingContext2D, t: number, cx: number, ct: number) {
    const isSpeaking = this.isSpeaking;
    const hy = ct - 26;

    // Weathered Reddish/Brown Tunic
    this.fillP(ctx, this.lin(ctx, cx - 18, 0, cx + 18, 0, '#3a1414', '#5c1c18', '#0e0c14'), k => {
      k.moveTo(cx - 19, ct + 2);
      k.bezierCurveTo(cx - 20, ct - 10, cx - 16, ct - 18, cx - 7, ct - 20);
      k.lineTo(cx + 7, ct - 20);
      k.bezierCurveTo(cx + 16, ct - 18, cx + 20, ct - 10, cx + 19, ct + 2);
    });

    // Face & One Eye with Patch
    this.ell(ctx, cx, hy, 10, 10, '#d8ac94');
    // Leather Eyepatch
    this.ell(ctx, cx - 4, hy - 1.5, 3.5, 3, '#07060b');
    this.strokeP(ctx, '#07060b', 1.2, k => {
      k.moveTo(cx - 10, hy - 6);
      k.lineTo(cx + 9, hy + 1);
    });
    // Good Eye (glowing warm from hearth)
    const eyeShift = isSpeaking ? -1.5 : 0;
    ctx.fillStyle = '#fbe09a';
    ctx.fillRect(cx + 3.5 + eyeShift, hy - 2, 2, 1.3);
    this.glow(ctx, cx + 4.5 + eyeShift, hy - 1.5, 3.5, '255,200,120', 0.6);

    // Dented Tin Cup
    ctx.fillStyle = '#96969e';
    ctx.fillRect(cx - 12, ct - 12, 10, 12);
    ctx.fillStyle = '#c4c4c8';
    ctx.fillRect(cx - 12, ct - 12, 10, 1.5);
  }

  // ───────── Tavern Speech Bubble ─────────
  private drawCommentBubble(ctx: CanvasRenderingContext2D) {
    if (!this.activeComment) return;

    const c = this.activeComment;
    const paddingX = 7;
    ctx.font = 'bold 8px monospace';
    const textWidth = ctx.measureText(c.text).width;
    const bubbleW = textWidth + paddingX * 2;
    const bubbleH = 15;

    let bx = c.x - bubbleW / 2;
    if (bx < 6) bx = 6;
    if (bx + bubbleW > this.W - 6) bx = this.W - 6 - bubbleW;
    const by = c.y - bubbleH - 7;

    ctx.fillStyle = '#07060b';
    ctx.fillRect(bx + 1, by + 1, bubbleW, bubbleH);

    ctx.fillStyle = '#fff6d0';
    ctx.fillRect(bx, by, bubbleW, bubbleH);
    ctx.strokeStyle = '#58301f';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(bx, by, bubbleW, bubbleH);

    // Pointer tail
    ctx.fillStyle = '#fff6d0';
    ctx.beginPath();
    ctx.moveTo(c.x - 3, by + bubbleH);
    ctx.lineTo(c.x + 3, by + bubbleH);
    ctx.lineTo(c.x, by + bubbleH + 4);
    ctx.fill();
    ctx.strokeStyle = '#58301f';
    ctx.beginPath();
    ctx.moveTo(c.x - 3, by + bubbleH);
    ctx.lineTo(c.x, by + bubbleH + 4);
    ctx.lineTo(c.x + 3, by + bubbleH);
    ctx.stroke();

    ctx.fillStyle = '#1c1210';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.text, bx + paddingX, by + bubbleH / 2 + 0.5);
  }

  // ───────── Update State ─────────
  public update(dt: number, state: TavernState) {
    this.time += dt;
    const wasSpeaking = this.isSpeaking;
    this.isSpeaking = state.isSpeaking;
    this.audioEnergy = state.audioEnergy;

    if (this.isSpeaking) {
      this.quillWriteProgress += dt * 0.9;
    }

    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.isBlinking = !this.isBlinking;
      this.blinkTimer = this.isBlinking ? 0.16 : 2.5 + Math.random() * 2.0;
    }

    if (!wasSpeaking && this.isSpeaking) {
      // Just started speaking -> trigger attentive comment quickly
      this.commentCooldown = 0.6;
    }

    if (this.activeComment) {
      this.activeComment.timer -= dt;
      if (this.activeComment.timer <= 0) {
        this.activeComment = null;
        this.commentCooldown = 4.0 + Math.random() * 3.0;
      }
    } else {
      this.commentCooldown -= dt;
      if (this.commentCooldown <= 0) {
        this.triggerRandomComment();
      }
    }
  }

  public triggerRandomComment(forcedText?: string) {
    const list = this.isSpeaking ? this.listeningComments : this.idleComments;
    const text = forcedText || list[Math.floor(Math.random() * list.length)];
    const pIdx = Math.floor(Math.random() * 3);
    const x = pIdx === 0 ? 104 : pIdx === 1 ? 158 : 210;
    const y = 135;

    this.activeComment = {
      patronIndex: pIdx,
      text,
      x,
      y,
      timer: 3.2,
      duration: 3.2
    };
  }

  // ───────── Multiplied Light Map & Bayer Crush ─────────
  public render(): HTMLCanvasElement {
    const t = this.time;
    const sctx = this.sctx;
    const W = this.W;
    const H = this.H;
    const CT = this.CT;

    sctx.clearRect(0, 0, W, H);

    // 1. Draw Static Room Background
    sctx.drawImage(this.ROOM_CANVAS, 0, 0);

    // 2. Chandelier Candle Flames
    const cFlick = 0.85 + 0.15 * this.vnoise(t * 8, 1);
    for (const dx of [-15, 0, 15]) {
      this.glow(sctx, 146 + dx, 44, 18, '255,180,90', 0.5 * cFlick);
      sctx.fillStyle = '#f0bb62';
      sctx.fillRect(146 + dx - 1, 41, 2, 4);
      sctx.fillStyle = '#fff6d0';
      sctx.fillRect(146 + dx - 0.5, 42, 1, 2);
    }

    // 3. Grand Hearth Roaring Fire
    const fireFlick = this.drawHearthFire(sctx, t, 232, CT);

    // 4. Draw Characters (Scribe & Regulars)
    this.drawScribe(sctx, t, 44, CT);
    this.drawIronhelm(sctx, t, 104, CT);
    this.drawGreybeard(sctx, t, 158, CT);
    this.drawRanger(sctx, t, 210, CT);
    this.drawBurglar(sctx, t, 252, CT);

    // 5. Counter Base & Ember Rail
    sctx.drawImage(this.COUNTER_CANVAS, 0, 0);

    // Ember Rail Fill
    const emberEnergy = this.isSpeaking ? 0.4 + this.audioEnergy * 0.6 : 0.2;
    sctx.fillStyle = this.lin(sctx, 16, 0, 16 + (W - 32) * emberEnergy, 0, '#8a2a1c', '#e0692a', '#fbe09a');
    sctx.fillRect(16, CT + 42, (W - 32) * emberEnergy, 5);
    this.glow(sctx, 16 + (W - 32) * emberEnergy, CT + 44, 14, '255,190,100', 0.8 * emberEnergy);

    // 6. Candle Stubs & Flames on Counter
    sctx.drawImage(this.CANDLES_CANVAS, 0, 0);
    for (const cx of [76, 194]) {
      const b = CT + 7.6;
      const f1 = 0.85 + 0.15 * this.vnoise(t * 7 + cx, 2);
      this.glow(sctx, cx, b - 16, 26, '255,180,90', 0.6 * f1);
      sctx.fillStyle = '#f0bb62';
      sctx.fillRect(cx - 1, b - 18, 2, 5);
      sctx.fillStyle = '#fff6d0';
      sctx.fillRect(cx - 0.5, b - 17, 1, 3);
    }

    // 7. Bayer 4x4 Ordered Dither Crush to 49-Color Palette
    const srcData = sctx.getImageData(0, 0, W, H).data;
    const B4 = TavernPixelWorld.B4;
    const SPREAD = TavernPixelWorld.SPREAD;

    for (let y = 0, i = 0, j = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i += 4, j++) {
        const dither = ((B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5) * SPREAD;
        let r = srcData[i] + dither;
        let g = srcData[i + 1] + dither;
        let b = srcData[i + 2] + dither;

        r = r < 0 ? 0 : r > 255 ? 255 : r;
        g = g < 0 ? 0 : g > 255 ? 255 : g;
        b = b < 0 ? 0 : b > 255 ? 255 : b;

        const lutIdx = (((r >> 3) & 0x1f) << 10) | (((g >> 3) & 0x1f) << 5) | ((b >> 3) & 0x1f);
        this.art32[j] = this.PAL32[this.LUT[lutIdx]];
      }
    }
    this.actx.putImageData(this.artImg, 0, 0);

    // 8. Post-Crush Exact Speech Bubble
    this.drawCommentBubble(this.actx);

    return this.artCanvas;
  }
}
