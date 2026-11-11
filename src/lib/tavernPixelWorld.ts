// TavernPixelWorld: Living pixel-art tavern engine strictly built to the OG
// pixel-worlds specifications (SKILL.md & kit.js).
//
// 1. Paint, Light, Crush 3-step pipeline:
//    - Smooth daylight painting on isolated layers.
//    - Multiplied light map: cold night ambient + warm point lights (candle, lantern, hearth).
//    - Directional rim highlights (k.rim) on surfaces facing light sources.
//    - Glowing elements (flames, embers, specular glints) drawn un-dimmed.
//    - Bayer 4x4 ordered dither crush to 56-color palette.
//    - Post-crush lettering in the art grid via 5x7 bitmap font (k.ptext).
// 2. The Pixel Rules:
//    - Rounded, chunky, expressive character silhouettes (silhouette-first).
//    - Stepped outlines in art pixels.
//    - Whole-pixel motion (rounded coords, no sub-pixel crawl).
//    - Fixed-length limbs via 2-bone inverse kinematics (k.reach).
// 3. The Scribe & Patrons:
//    - Scribe (left): face lifted to user with spectacles & upright quill when silent;
//      head bowed, scribbling rhythmically with ink trails when speaking.
//    - Barkeep Garrick (middle-left): wipes mug when idle; sets mug down, tilts head to listen when speaking.
//    - Warrior Brogun (middle-right): holds stein when idle; sets down and leans in to listen when speaking.
//    - Hearth & Sleeping Cat (right): roaring stone hearth with sleeping ginger cat on the rug.

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
  // Canvas dimensions optimized for 60% mobile viewport
  public static readonly W = 200;
  public static readonly H = 220;
  public static readonly BAR_Y = 145;

  public readonly W = TavernPixelWorld.W;
  public readonly H = TavernPixelWorld.H;
  public readonly BAR_Y = TavernPixelWorld.BAR_Y;

  // ───────── 56-Color Authentic Pixel-Worlds Palette ─────────
  public static readonly PAL: string[] = [
    '#05050e', '#0b0c1a', '#121426', '#1a1d36', '#262a4a', '#373c64', '#4e5684', '#6d78a8', '#94a0cc', '#c2cef0', '#ffffff',
    '#1c1008', '#2e190d', '#452513', '#61351b', '#824924', '#a65f2f', '#cc7a3d', '#ed974e', '#f8b66e', '#fcd598', '#fff1c7',
    '#0a1f16', '#123324', '#1c4d37', '#2a6e4f', '#3c966c', '#57be8d', '#84e1b3', '#c6f5dd',
    '#28080c', '#440e15', '#6b1721', '#96222e', '#c43333', '#e8584f', '#f48773', '#fbc0b0',
    '#181614', '#2b2723', '#443e38', '#635b52', '#877c70', '#b0a394', '#d8cebf', '#f5eee4',
    '#3e1e12', '#61301d', '#8c472a', '#bc653d', '#e08759', '#f2ae85', '#fad0b1',
    '#142328', '#20373e', '#32525c', '#4d7582', '#729fae', '#a3cad6', '#d6edf3',
    '#6b4507', '#9c660e', '#ce8c17', '#f2b227', '#f8ce53', '#fde789', '#fffcc7'
  ];

  private static readonly B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  private static readonly SPREAD = 8;

  // 5x7 Pixel Font from kit.js
  private static readonly FONT: Record<string, string[]> = {
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
    '"': ['#.#', '#.#', '...', '...', '...', '...', '...'],
    ' ': ['...', '...', '...', '...', '...', '...', '...']
  };

  // Internal Buffers & Canvases
  private softCanvas: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;
  private artCanvas: HTMLCanvasElement;
  private actx: CanvasRenderingContext2D;
  private artImg: ImageData;
  private art32: Uint32Array;

  // Layer scratch pool (from kit.js)
  private POOL: HTMLCanvasElement[] = [];

  // Palette LUT
  private PAL32: Uint32Array;
  private LUT: Uint8Array;

  // Static Baked Scenery
  private ROOM_CANVAS!: HTMLCanvasElement;
  private BAR_CANVAS!: HTMLCanvasElement;

  // Animation & Audio State
  private time = 0;
  private isSpeaking = false;
  private audioEnergy = 0;
  private quillWriteProgress = 0;
  private isBlinking = false;
  private blinkTimer = 2.0;

  // Commentary
  private activeComment: PatronComment | null = null;
  private commentCooldown = 2.0;

  private listeningLines = [
    "Hush... the scribe writes.",
    "Speak on, traveler.",
    "Aye, don't miss a word!",
    "Truth in every line.",
    "Silence in the tavern!"
  ];

  private idleLines = [
    "Pour another flagon, Garrick!",
    "He'll record thy tale anon.",
    "Rest thy boots by the fire.",
    "A fine eve in the valley.",
    "Cold ale and warm hearth."
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

    // Initialize Palette LUT
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

    this.bakeStaticScenery();
  }

  // ───────── Scratch Canvas Pool & Layer Helpers (kit.js) ─────────
  private scratch(): HTMLCanvasElement {
    const c = this.POOL.pop() || Object.assign(document.createElement('canvas'), { width: this.W, height: this.H });
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, this.W, this.H);
    return c;
  }

  private release(...cs: HTMLCanvasElement[]) {
    for (const c of cs) if (c) this.POOL.push(c);
  }

  private drawLayer(fn: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
    const L = this.scratch();
    const ctx = L.getContext('2d')!;
    ctx.save();
    fn(ctx);
    ctx.restore();
    return L;
  }

  // ───────── Lighting Engine (kit.js) ─────────
  private applyLight(
    L: HTMLCanvasElement,
    amb: string,
    lights: [number, number, number, string, number][]
  ) {
    const k = L.getContext('2d')!;
    const M = this.scratch();
    const m = M.getContext('2d')!;

    m.fillStyle = amb;
    m.fillRect(0, 0, this.W, this.H);
    m.globalCompositeOperation = 'lighter';

    for (const [x, y, r, rgb, a] of lights) {
      const s = Math.min(1.2, Math.max(0, a));
      if (s <= 0) continue;
      const gr = m.createRadialGradient(x, y, 2, x, y, r);
      gr.addColorStop(0, `rgba(${rgb},${s})`);
      gr.addColorStop(0.42, `rgba(${rgb},${s * 0.55})`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      m.fillStyle = gr;
      m.fillRect(0, 0, this.W, this.H);
    }

    m.globalCompositeOperation = 'destination-in';
    m.drawImage(L, 0, 0);

    k.globalCompositeOperation = 'multiply';
    k.drawImage(M, 0, 0);
    k.globalCompositeOperation = 'source-over';
    this.release(M);
  }

  private applyRim(
    L: HTMLCanvasElement,
    dx: number,
    dy: number,
    x: number,
    y: number,
    r: number,
    rgb: string,
    a: number
  ) {
    if (a <= 0) return;
    const k = L.getContext('2d')!;
    const R = this.scratch();
    const q = R.getContext('2d')!;

    q.drawImage(L, 0, 0);
    q.globalCompositeOperation = 'source-in';
    const gr = q.createRadialGradient(x, y, 2, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},${a})`);
    gr.addColorStop(0.5, `rgba(${rgb},${a * 0.6})`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    q.fillStyle = gr;
    q.fillRect(0, 0, this.W, this.H);

    q.globalCompositeOperation = 'destination-out';
    q.drawImage(L, dx, dy);

    k.globalCompositeOperation = 'source-atop';
    k.drawImage(R, 0, 0);
    k.globalCompositeOperation = 'source-over';
    this.release(R);
  }

  // ───────── Kinematics & Primitives (kit.js) ─────────
  private reach(
    shoulder: [number, number],
    target: [number, number],
    upper = 10,
    fore = 12,
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

  private limb(
    ctx: CanvasRenderingContext2D,
    ax: number,
    ay: number,
    ra: number,
    bx: number,
    by: number,
    rb: number,
    col: string
  ) {
    const a = Math.atan2(by - ay, bx - ax);
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    const q = Math.PI / 2;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(ax + nx * ra, ay + ny * ra);
    ctx.lineTo(bx + nx * rb, by + ny * rb);
    ctx.arc(bx, by, rb, a + q, a - q, true);
    ctx.lineTo(ax - nx * ra, ay - ny * ra);
    ctx.arc(ax, ay, ra, a - q, a + q, true);
    ctx.closePath();
    ctx.fill();
  }

  // ───────── 5x7 Pixel Font Renderer (kit.js ptext) ─────────
  private ptext(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, color: string) {
    const glyphs = [...str.toUpperCase()].map(ch => TavernPixelWorld.FONT[ch] || TavernPixelWorld.FONT[' ']);
    let curX = x;
    ctx.fillStyle = color;
    for (const gl of glyphs) {
      const w = gl[0].length;
      for (let r = 0; r < 7; r++) {
        for (let q = 0; q < w; q++) {
          if (gl[r][q] === '#') {
            ctx.fillRect(curX + q, y + r, 1, 1);
          }
        }
      }
      curX += w + 1;
    }
  }

  private ptextWidth(str: string): number {
    return [...str.toUpperCase()].reduce((acc, ch) => {
      const gl = TavernPixelWorld.FONT[ch] || TavernPixelWorld.FONT[' '];
      return acc + gl[0].length + 1;
    }, -1);
  }

  // ───────── Bake Static Scenery ─────────
  private bakeStaticScenery() {
    const W = this.W;
    const H = this.H;
    const BAR_Y = this.BAR_Y;

    // 1. TAVERN ROOM BACKGROUND
    this.ROOM_CANVAS = document.createElement('canvas');
    this.ROOM_CANVAS.width = W;
    this.ROOM_CANVAS.height = H;
    const r = this.ROOM_CANVAS.getContext('2d')!;

    // Warm Timber Wall Shading
    const wg = r.createLinearGradient(0, 0, 0, BAR_Y);
    wg.addColorStop(0, '#3e1e12');
    wg.addColorStop(0.6, '#2e190d');
    wg.addColorStop(1, '#1c1008');
    r.fillStyle = wg;
    r.fillRect(0, 0, W, BAR_Y);

    // Horizontal Timber Planks
    for (let y = 16; y < BAR_Y; y += 14) {
      r.fillStyle = '#1c1008';
      r.fillRect(0, y, W, 1.5);
      r.fillStyle = '#61351b';
      r.fillRect(0, y + 1.5, W, 0.8);
    }

    // Heavy Ceiling Beams
    r.fillStyle = '#1c1008';
    r.fillRect(0, 0, W, 16);
    r.fillStyle = '#452513';
    r.fillRect(0, 16, W, 3);
    for (const bx of [24, 76, 128, 178]) {
      r.fillStyle = '#2e190d';
      r.fillRect(bx - 3, 0, 7, BAR_Y);
      r.fillStyle = '#1c1008';
      r.fillRect(bx - 3, 0, 1.2, BAR_Y);
    }

    // Arched Night Window on Left (x: 16 to 62, y: 24 to 86)
    const wx = 16, wy = 24, ww = 46, wh = 62;
    r.fillStyle = '#07060b';
    r.beginPath();
    r.arc(wx + ww / 2, wy + 20, ww / 2 + 3, Math.PI, Math.PI * 2);
    r.rect(wx - 3, wy + 20, ww + 6, wh - 17);
    r.fill();

    r.save();
    r.beginPath();
    r.arc(wx + ww / 2, wy + 20, ww / 2, Math.PI, Math.PI * 2);
    r.rect(wx, wy + 20, ww, wh - 20);
    r.clip();

    // Night Sky
    const skyGrad = r.createLinearGradient(0, wy, 0, wy + wh);
    skyGrad.addColorStop(0, '#0c0d18');
    skyGrad.addColorStop(0.7, '#141626');
    skyGrad.addColorStop(1, '#262a4a');
    r.fillStyle = skyGrad;
    r.fillRect(wx, wy, 0 + ww, wh);

    // Crescent Moon
    r.fillStyle = '#fffcc7';
    r.beginPath();
    r.arc(wx + 22, wy + 22, 9, 0, Math.PI * 2);
    r.fill();
    r.fillStyle = '#0c0d18';
    r.beginPath();
    r.arc(wx + 25, wy + 20, 8, 0, Math.PI * 2);
    r.fill();

    // Stars
    r.fillStyle = '#c2cef0';
    const stars = [[8, 12], [32, 10], [14, 38], [38, 32], [26, 44]];
    for (const [sx, sy] of stars) {
      r.fillRect(wx + sx, wy + sy, 1.5, 1.5);
    }

    // Leaded Window Panes
    r.strokeStyle = '#1c1008';
    r.lineWidth = 1.2;
    r.beginPath();
    r.moveTo(wx + ww / 2, wy);
    r.lineTo(wx + ww / 2, wy + wh);
    r.moveTo(wx, wy + 30);
    r.lineTo(wx + ww, wy + 30);
    r.stroke();
    r.restore();

    // Window Sill
    r.fillStyle = '#61351b';
    r.fillRect(wx - 5, wy + wh, ww + 10, 4);

    // Shelves with Bottles (x: 74 to 142)
    for (const sy of [54, 88]) {
      r.fillStyle = '#452513';
      r.fillRect(72, sy, 70, 3.5);
      r.fillStyle = '#1c1008';
      r.fillRect(72, sy + 3.5, 70, 1.5);

      // Glassware & Flasks
      const bottles: [number, number, string][] = [
        [78, 11, '#1c4d37'], [86, 14, '#96222e'], [95, 9, '#ce8c17'],
        [106, 15, '#20373e'], [116, 12, '#824924'], [126, 10, '#3c966c'], [134, 14, '#6b1721']
      ];
      for (const [bx, bh, col] of bottles) {
        r.fillStyle = col;
        r.fillRect(bx, sy - bh, 6, bh);
        r.fillStyle = '#fff1c7';
        r.fillRect(bx + 1, sy - bh, 1.5, bh - 2);
        r.fillStyle = '#ce8c17';
        r.fillRect(bx + 1.5, sy - bh - 2, 3, 2);
      }
    }

    // Stone Hearth Arch on Right (x: 154 to 200, y: 74 to BAR_Y)
    const hx = 154, hy = 74;
    r.fillStyle = '#2b2723';
    r.fillRect(hx, hy, W - hx, BAR_Y - hy);
    for (let sy = hy; sy < BAR_Y; sy += 10) {
      r.fillStyle = '#181614';
      r.fillRect(hx, sy, W - hx, 1.5);
    }
    // Arched Hearth Opening
    r.fillStyle = '#05050e';
    r.beginPath();
    r.arc(hx + 24, hy + 32, 19, Math.PI, Math.PI * 2);
    r.rect(hx + 5, hy + 32, 38, BAR_Y - (hy + 32));
    r.fill();

    // Stone Mantel
    r.fillStyle = '#443e38';
    r.fillRect(hx - 4, hy - 4, W - hx + 4, 6);
    r.fillStyle = '#635b52';
    r.fillRect(hx - 4, hy - 4, W - hx + 4, 1.5);

    // 2. COUNTER & APRON
    this.BAR_CANVAS = document.createElement('canvas');
    this.BAR_CANVAS.width = W;
    this.BAR_CANVAS.height = H;
    const b = this.BAR_CANVAS.getContext('2d')!;

    // Polished Oak Bar Top
    const cg = b.createLinearGradient(0, BAR_Y, 0, BAR_Y + 14);
    cg.addColorStop(0, '#f2ae85');
    cg.addColorStop(0.3, '#a65f2f');
    cg.addColorStop(0.8, '#61351b');
    cg.addColorStop(1, '#2e190d');
    b.fillStyle = cg;
    b.fillRect(0, BAR_Y, W, 14);

    // Highlight Edge
    b.fillStyle = '#fff1c7';
    b.fillRect(0, BAR_Y, W, 1.2);
    b.fillStyle = '#1c1008';
    b.fillRect(0, BAR_Y + 14, W, 2);

    // Bar Front Apron
    const ag = b.createLinearGradient(0, BAR_Y + 16, 0, H);
    ag.addColorStop(0, '#452513');
    ag.addColorStop(0.5, '#2e190d');
    ag.addColorStop(1, '#1c1008');
    b.fillStyle = ag;
    b.fillRect(0, BAR_Y + 16, W, H - (BAR_Y + 16));

    // Vertical Wood Paneling Grooves
    for (let x = 12; x < W; x += 18) {
      b.fillStyle = '#0b0c1a';
      b.fillRect(x, BAR_Y + 16, 1.8, H - (BAR_Y + 16));
    }

    // Iron Ember Rail
    b.fillStyle = '#07060b';
    b.fillRect(14, BAR_Y + 36, W - 28, 5);
    b.fillStyle = 'rgba(150,150,158,.3)';
    b.fillRect(14, BAR_Y + 41, W - 28, 1);

    // Polished Brass Foot Rail
    b.fillStyle = '#ce8c17';
    b.fillRect(0, H - 10, W, 3.5);
    b.fillStyle = '#fffcc7';
    b.fillRect(0, H - 10, W, 1);
  }

  // ───────── Character Rendering (Rounded Pixel Art) ─────────

  /**
   * 1. THE SCRIBE (Scholar/Sage, x = 38)
   * Idle: face to user with round spectacles, quill poised upright.
   * Speaking: head down, scribbling rhythmically with ink trails.
   */
  private drawScribe(ctx: CanvasRenderingContext2D, t: number) {
    const isWriting = this.isSpeaking;
    const breath = Math.sin(t * 2.4) * 0.8;
    const cx = 38;

    // Wooden Stool
    ctx.fillStyle = '#2e190d';
    ctx.fillRect(cx - 13, this.BAR_Y + 6, 26, 4);
    ctx.fillRect(cx - 10, this.BAR_Y + 10, 3.5, 45);
    ctx.fillRect(cx + 7, this.BAR_Y + 10, 3.5, 45);

    // Emerald Robe Torso
    const torsoY = this.BAR_Y - 44 + breath;
    ctx.fillStyle = '#123324';
    ctx.beginPath();
    ctx.moveTo(cx - 14, this.BAR_Y + 6);
    ctx.lineTo(cx - 11, torsoY + 10);
    ctx.lineTo(cx + 11, torsoY + 10);
    ctx.lineTo(cx + 14, this.BAR_Y + 6);
    ctx.closePath();
    ctx.fill();

    // Robe Gold Trims
    ctx.fillStyle = '#2a6e4f';
    ctx.fillRect(cx - 4, torsoY + 8, 3, 24);
    ctx.fillStyle = '#f8ce53';
    ctx.fillRect(cx - 1, torsoY + 4, 3, 3);

    // Left Arm resting on counter
    ctx.fillStyle = '#123324';
    ctx.fillRect(cx - 13, torsoY + 10, 5, 20);
    ctx.fillStyle = '#fad0b1';
    ctx.fillRect(cx - 12, this.BAR_Y + 2, 4.5, 3.5);

    // Parchment Scroll on Counter
    const B = cx + 8;
    ctx.fillStyle = '#fff1c7';
    ctx.fillRect(B - 14, this.BAR_Y + 2, 28, 6);
    ctx.fillStyle = '#824924';
    ctx.fillRect(B - 14, this.BAR_Y + 1, 28, 1);
    this.limb(ctx, B - 14, this.BAR_Y + 1, 2, B - 13, this.BAR_Y + 7, 2, '#fad0b1');
    this.limb(ctx, B + 14, this.BAR_Y + 1, 2, B + 13, this.BAR_Y + 7, 2, '#fad0b1');

    // Dynamic Ink Lines when speaking
    if (isWriting) {
      const lines = Math.min(3, Math.floor(this.quillWriteProgress * 2) + 1);
      for (let i = 0; i < lines; i++) {
        const len = (i === lines - 1) ? ((this.quillWriteProgress * 16) % 14) + 4 : 14;
        ctx.fillStyle = '#2e190d';
        ctx.fillRect(B - 8, this.BAR_Y + 3 + i * 1.8, len, 1);
      }
    }

    // Ink Pot
    ctx.fillStyle = '#05050e';
    ctx.fillRect(cx - 7, this.BAR_Y - 2, 5, 5);
    ctx.fillStyle = '#3c966c';
    ctx.fillRect(cx - 6, this.BAR_Y - 1, 3, 1.5);

    // Head, Eyes, Quill
    if (!isWriting) {
      // ══════ STATE 1: IDLE / SILENT -> FACE TO USER! ══════
      const headX = cx;
      const headY = torsoY - 2;

      // Scholar Velvet Beret
      ctx.fillStyle = '#0a1f16';
      ctx.beginPath();
      ctx.arc(headX, headY - 2, 10, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3c966c';
      ctx.fillRect(headX - 10, headY - 3, 20, 2.5);

      // Face (Warm, attentive, rounded)
      ctx.fillStyle = '#fad0b1';
      ctx.beginPath();
      ctx.arc(headX, headY + 3, 7.5, 0, Math.PI * 2);
      ctx.fill();

      // Trimmed Beard
      ctx.fillStyle = '#635b52';
      ctx.beginPath();
      ctx.arc(headX, headY + 7, 5.5, 0, Math.PI);
      ctx.fill();

      // Round Spectacles & Eyes looking directly at user
      if (this.isBlinking) {
        ctx.fillStyle = '#452513';
        ctx.fillRect(headX - 5, headY + 2, 3.5, 1.2);
        ctx.fillRect(headX + 2, headY + 2, 3.5, 1.2);
      } else {
        ctx.strokeStyle = '#f8ce53';
        ctx.lineWidth = 1;
        ctx.strokeRect(headX - 6, headY, 4.5, 4);
        ctx.strokeRect(headX + 2, headY, 4.5, 4);
        ctx.fillStyle = '#f8ce53';
        ctx.fillRect(headX - 1.5, headY + 1.5, 3.5, 1);

        ctx.fillStyle = '#05050e';
        ctx.fillRect(headX - 4.5, headY + 1.5, 2, 2);
        ctx.fillRect(headX + 3.5, headY + 1.5, 2, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(headX - 4.5, headY + 1.5, 1, 1);
        ctx.fillRect(headX + 3.5, headY + 1.5, 1, 1);
      }

      ctx.fillStyle = '#96222e';
      ctx.fillRect(headX - 1.5, headY + 5.5, 3, 1.2);

      // Arm with upright feather quill
      const shoulder: [number, number] = [cx + 9, torsoY + 8];
      const target: [number, number] = [cx + 19, this.BAR_Y - 10 + breath * 0.4];
      const [elbow, hand] = this.reach(shoulder, target, 9, 10, 1);

      this.limb(ctx, shoulder[0], shoulder[1], 4.2, elbow[0], elbow[1], 3.6, '#123324');
      this.limb(ctx, elbow[0], elbow[1], 3.6, hand[0], hand[1], 3, '#2a6e4f');
      ctx.fillStyle = '#fad0b1';
      ctx.fillRect(hand[0] - 1.5, hand[1] - 1.5, 3.5, 3.5);

      // Feather Quill (Upright)
      ctx.save();
      ctx.translate(hand[0], hand[1]);
      ctx.rotate(-0.55 + Math.sin(t * 3) * 0.05);
      ctx.fillStyle = '#f8ce53';
      ctx.fillRect(-0.6, 0, 1.4, 5);
      ctx.strokeStyle = '#c2cef0';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -18);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.quadraticCurveTo(5, -12, 0, -20);
      ctx.quadraticCurveTo(-5, -12, 0, -5);
      ctx.fill();
      ctx.restore();
    } else {
      // ══════ STATE 2: SPEAKING -> HEAD BOWED DOWN, SCRIBBLING! ══════
      const headX = cx + 5;
      const headY = torsoY + 6;

      ctx.fillStyle = '#0a1f16';
      ctx.beginPath();
      ctx.arc(headX - 2, headY - 4, 9, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3c966c';
      ctx.fillRect(headX - 10, headY - 5, 18, 2.2);

      ctx.fillStyle = '#fad0b1';
      ctx.beginPath();
      ctx.arc(headX, headY + 1, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#635b52';
      ctx.beginPath();
      ctx.arc(headX + 1.5, headY + 4, 5, 0, Math.PI);
      ctx.fill();

      // Eyes focused down on paper
      ctx.fillStyle = '#05050e';
      ctx.fillRect(headX - 2.5, headY + 1, 1.8, 1.8);
      ctx.fillRect(headX + 2, headY + 1, 1.8, 1.8);

      // Scribbling Arm reaching to scroll
      const jig = (t * 16) % 1 < 0.5 ? 1 : 0;
      const writeX = B - 4 + ((this.quillWriteProgress * 18) % 16);
      const shoulder: [number, number] = [cx + 9, torsoY + 8];
      const target: [number, number] = [writeX, this.BAR_Y + 1 - jig];
      const [elbow, hand] = this.reach(shoulder, target, 9, 10, 1);

      this.limb(ctx, shoulder[0], shoulder[1], 4.2, elbow[0], elbow[1], 3.6, '#123324');
      this.limb(ctx, elbow[0], elbow[1], 3.6, hand[0], hand[1], 3, '#2a6e4f');
      ctx.fillStyle = '#fad0b1';
      ctx.fillRect(hand[0] - 1.5, hand[1] - 1.5, 3.5, 3.5);

      // Angled Quill scribbling
      ctx.save();
      ctx.translate(hand[0], hand[1]);
      ctx.rotate(-1.18 + Math.sin(t * 16) * 0.08);
      ctx.fillStyle = '#05050e';
      ctx.fillRect(-0.6, 0, 1.4, 4);
      ctx.strokeStyle = '#c2cef0';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -17);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.quadraticCurveTo(4.5, -11, 0, -18);
      ctx.quadraticCurveTo(-4.5, -11, 0, -5);
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * 2. BARKEEP GARRICK (Middle-Left, x = 96)
   * Idle: wipes an ale tankard with a rag in circular rhythm.
   * Speaking: sets mug down, tilts head to listen attentively.
   */
  private drawBarkeep(ctx: CanvasRenderingContext2D, t: number) {
    const isSpeaking = this.isSpeaking;
    const bkX = 96;
    const bkY = 120;
    const bkb = Math.sin(t * 1.8) * 0.7;

    // Torso with brown tunic & white apron
    ctx.fillStyle = '#61351b';
    ctx.beginPath();
    ctx.arc(bkX, bkY + 10 + bkb, 12.5, Math.PI, Math.PI * 2);
    ctx.rect(bkX - 12.5, bkY + 10 + bkb, 25, 14);
    ctx.fill();

    ctx.fillStyle = '#f5eee4'; // Apron
    ctx.fillRect(bkX - 7.5, bkY + 8 + bkb, 15, 16);
    ctx.fillStyle = '#61351b';
    ctx.fillRect(bkX - 8.5, bkY + 14 + bkb, 17, 2);

    if (!isSpeaking) {
      // Idle: Wiping a mug
      ctx.fillStyle = '#fad0b1';
      ctx.beginPath();
      ctx.arc(bkX, bkY + bkb, 7.5, 0, Math.PI * 2);
      ctx.fill();

      // Hair & Walrus Mustache
      ctx.fillStyle = '#61351b';
      ctx.fillRect(bkX - 7.5, bkY - 7 + bkb, 15, 3.5);
      ctx.fillRect(bkX - 6, bkY + 2.5 + bkb, 12, 3);
      // Eyes looking down at mug
      ctx.fillStyle = '#05050e';
      ctx.fillRect(bkX - 4, bkY - 1 + bkb, 2, 2);
      ctx.fillRect(bkX + 2, bkY - 1 + bkb, 2, 2);

      // Mug wipe circle
      const wipeAngle = t * 4;
      const mugX = bkX - 3 + Math.cos(wipeAngle) * 2.5;
      const mugY = 142 + Math.sin(wipeAngle) * 1.5;

      ctx.fillStyle = '#a65f2f';
      ctx.fillRect(mugX, mugY - 7, 7, 8);
      ctx.fillStyle = '#ce8c17';
      ctx.fillRect(mugX, mugY - 6, 7, 1.2);
      ctx.fillStyle = '#f5eee4'; // Cloth
      ctx.fillRect(mugX + 2, mugY - 4, 4, 4);

      // Arms
      ctx.fillStyle = '#fad0b1';
      ctx.fillRect(bkX - 10, bkY + 11 + bkb, 5, 7);
      ctx.fillRect(bkX + 5, bkY + 11 + bkb, 5, 7);
    } else {
      // Speaking: Head tilted, set mug down, listening intently
      ctx.fillStyle = '#fad0b1';
      ctx.beginPath();
      ctx.arc(bkX - 2, bkY + 1 + bkb, 7.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#61351b';
      ctx.fillRect(bkX - 9, bkY - 6 + bkb, 15, 3.5);
      ctx.fillRect(bkX - 7, bkY + 3 + bkb, 11, 3);

      // Eye looking left at scribe
      ctx.fillStyle = '#05050e';
      ctx.fillRect(bkX - 5.5, bkY + 1 + bkb, 2.2, 2.2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bkX - 5, bkY + 1 + bkb, 1, 1);

      // Hands leaning on counter
      ctx.fillStyle = '#fad0b1';
      ctx.fillRect(bkX - 10, this.BAR_Y - 2, 6, 4);
      ctx.fillRect(bkX + 4, this.BAR_Y - 2, 6, 4);

      // Mug resting on counter
      ctx.fillStyle = '#a65f2f';
      ctx.fillRect(bkX + 12, this.BAR_Y - 6, 6, 8);
      ctx.fillStyle = '#ce8c17';
      ctx.fillRect(bkX + 12, this.BAR_Y - 5, 6, 1.2);
    }
  }

  /**
   * 3. WARRIOR BROGUN (Middle-Right, x = 138)
   * Idle: holds stein.
   * Speaking: sets down, leans in, nods attentively.
   */
  private drawWarrior(ctx: CanvasRenderingContext2D, t: number) {
    const isSpeaking = this.isSpeaking;
    const dwX = 138;
    const dwY = 124;
    const nod = isSpeaking ? Math.sin(t * 3.5) * 1.2 : 0;
    const dwb = Math.sin(t * 1.8 + 2) * 0.7;

    // Studded Armor Body
    ctx.fillStyle = '#262a4a';
    ctx.fillRect(dwX - 9, dwY + 8 + dwb + nod, 18, 16);
    ctx.fillStyle = '#6d78a8'; // Pauldrons
    ctx.fillRect(dwX - 11, dwY + 6 + dwb + nod, 5, 5.5);
    ctx.fillRect(dwX + 6, dwY + 6 + dwb + nod, 5, 5.5);

    // Braided Ginger Beard
    ctx.fillStyle = '#c43333';
    ctx.beginPath();
    ctx.moveTo(dwX - 7, dwY + 3 + dwb + nod);
    ctx.lineTo(dwX + 7, dwY + 3 + dwb + nod);
    ctx.lineTo(dwX + 3, dwY + 20 + dwb + nod);
    ctx.lineTo(dwX - 3, dwY + 20 + dwb + nod);
    ctx.fill();

    if (!isSpeaking) {
      // Iron Helm Dome
      ctx.fillStyle = '#6d78a8';
      ctx.beginPath();
      ctx.arc(dwX, dwY - 2 + dwb, 7.5, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f8ce53';
      ctx.fillRect(dwX - 6, dwY - 3 + dwb, 12, 2.2);

      // Face & Eyes
      ctx.fillStyle = '#fad0b1';
      ctx.fillRect(dwX - 3.5, dwY - 1 + dwb, 7, 4);
      ctx.fillStyle = '#05050e';
      ctx.fillRect(dwX - 3, dwY + dwb, 1.8, 1.8);
      ctx.fillRect(dwX + 1.2, dwY + dwb, 1.8, 1.8);

      // Pewter Stein
      ctx.fillStyle = '#6d78a8';
      ctx.fillRect(dwX - 9, this.BAR_Y - 7, 7, 8);
      ctx.fillStyle = '#ffffff'; // Foam
      ctx.fillRect(dwX - 10, this.BAR_Y - 9, 9, 2.5);
    } else {
      // Leaning & looking left at scribe
      ctx.fillStyle = '#6d78a8';
      ctx.beginPath();
      ctx.arc(dwX - 3, dwY - 1 + nod, 7.5, Math.PI * 0.9, Math.PI * 2.1);
      ctx.fill();

      ctx.fillStyle = '#fad0b1';
      ctx.fillRect(dwX - 7, dwY + nod, 5, 4);
      ctx.fillStyle = '#05050e';
      ctx.fillRect(dwX - 6, dwY + 1 + nod, 2, 2);

      // Stein set down
      ctx.fillStyle = '#6d78a8';
      ctx.fillRect(dwX - 13, this.BAR_Y - 6, 7, 7);
      ctx.fillStyle = '#fad0b1'; // Hand resting
      ctx.fillRect(dwX - 14, this.BAR_Y - 8, 4, 3.5);
    }
  }

  /**
   * 4. SLEEPING GINGER CAT on the hearth rug
   */
  private drawHearthCat(ctx: CanvasRenderingContext2D, t: number) {
    const cx = 176;
    const cy = this.BAR_Y + 1;
    const purr = Math.sin(t * 2) * 0.6;

    // Cozy Hearth Rug
    ctx.fillStyle = '#440e15';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, 13, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#96222e';
    ctx.fillRect(cx - 10, cy + 1, 20, 1.2);

    // Curled Ginger Cat Body
    ctx.fillStyle = '#ed974e';
    ctx.beginPath();
    ctx.arc(cx - 2, cy - 1 + purr, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 3, cy - 2 + purr, 4, 0, Math.PI * 2);
    ctx.fill();

    // Cat Ears & Closed Eyes
    ctx.fillStyle = '#cc7a3d';
    ctx.beginPath();
    ctx.moveTo(cx + 3, cy - 6 + purr);
    ctx.lineTo(cx + 6, cy - 4 + purr);
    ctx.lineTo(cx + 2, cy - 3 + purr);
    ctx.fill();
    ctx.fillStyle = '#452513';
    ctx.fillRect(cx + 4, cy - 2 + purr, 2, 0.8); // Sleeping eye
  }

  // ───────── Post-Crush Exact Speech Bubble (kit.js ptext) ─────────
  private drawCommentBubble(ctx: CanvasRenderingContext2D) {
    if (!this.activeComment) return;

    const c = this.activeComment;
    const paddingX = 5;
    const textW = this.ptextWidth(c.text);
    const bubbleW = textW + paddingX * 2;
    const bubbleH = 13;

    let bx = c.x - bubbleW / 2;
    if (bx < 6) bx = 6;
    if (bx + bubbleW > this.W - 6) bx = this.W - 6 - bubbleW;
    const by = c.y - bubbleH - 6;

    // Hard Shadow
    ctx.fillStyle = '#05050e';
    ctx.fillRect(bx + 1, by + 1, bubbleW, bubbleH);

    // Parchment Body
    ctx.fillStyle = '#fff1c7';
    ctx.fillRect(bx, by, bubbleW, bubbleH);
    ctx.strokeStyle = '#61351b';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bubbleW, bubbleH);

    // Tail
    ctx.fillStyle = '#fff1c7';
    ctx.beginPath();
    ctx.moveTo(c.x - 2.5, by + bubbleH);
    ctx.lineTo(c.x + 2.5, by + bubbleH);
    ctx.lineTo(c.x, by + bubbleH + 4);
    ctx.fill();
    ctx.strokeStyle = '#61351b';
    ctx.beginPath();
    ctx.moveTo(c.x - 2.5, by + bubbleH);
    ctx.lineTo(c.x, by + bubbleH + 4);
    ctx.lineTo(c.x + 2.5, by + bubbleH);
    ctx.stroke();

    // Render using kit.js 5x7 Pixel Font
    this.ptext(ctx, c.text, bx + paddingX, by + 3.5, '#2e190d');
  }

  // ───────── State Updates ─────────
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
      this.commentCooldown = 0.6; // React quickly when voice starts
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
    const list = this.isSpeaking ? this.listeningLines : this.idleLines;
    const text = forcedText || list[Math.floor(Math.random() * list.length)];
    const pIdx = Math.floor(Math.random() * 2);
    const x = pIdx === 0 ? 96 : 138;
    const y = 114;

    this.activeComment = {
      patronIndex: pIdx,
      text,
      x,
      y,
      timer: 3.2,
      duration: 3.2
    };
  }

  // ───────── Render: Paint, Light, Crush Pipeline (SKILL.md) ─────────
  public render(): HTMLCanvasElement {
    const t = this.time;
    const sctx = this.sctx;
    const W = this.W;
    const H = this.H;

    sctx.clearRect(0, 0, W, H);

    // Candle and Fire Flickers
    const candleFlick = 0.88 + 0.12 * Math.sin(t * 9 + Math.cos(t * 14));
    const lanternFlick = 0.92 + 0.08 * Math.sin(t * 6 + 1);
    const hearthFlick = 0.85 + 0.15 * Math.sin(t * 7 + 2);

    // Multiplied Lighting Parameters (Night Ambient + 3 Point Lights)
    const amb = 'rgb(46, 40, 72)';
    const lights: [number, number, number, string, number][] = [
      [36, 138, 55, '255, 195, 120', candleFlick * (this.isSpeaking ? 1.15 : 0.95)],
      [104, 38, 95, '255, 210, 140', lanternFlick * 0.9],
      [176, 135, 75, '255, 130, 50', hearthFlick * 0.95]
    ];

    // 1. LAYER: Room Background
    const lRoom = this.drawLayer(ctx => ctx.drawImage(this.ROOM_CANVAS, 0, 0));
    this.applyLight(lRoom, amb, lights);
    sctx.drawImage(lRoom, 0, 0);
    this.release(lRoom);

    // 2. LAYER: Characters (Scribe, Barkeep, Warrior, Cat)
    const lChars = this.drawLayer(ctx => {
      this.drawScribe(ctx, t);
      this.drawBarkeep(ctx, t);
      this.drawWarrior(ctx, t);
      this.drawHearthCat(ctx, t);
    });
    this.applyLight(lChars, amb, lights);
    // Directional rim highlights (fire rim on right, candle rim on left)
    this.applyRim(lChars, -1.2, 0, 176, 135, 80, '255, 200, 120', 0.45);
    this.applyRim(lChars, 1.2, 0, 36, 138, 60, '255, 225, 140', 0.45);
    sctx.drawImage(lChars, 0, 0);
    this.release(lChars);

    // 3. LAYER: Bar Counter & Rail
    const lBar = this.drawLayer(ctx => ctx.drawImage(this.BAR_CANVAS, 0, 0));
    this.applyLight(lBar, amb, lights);
    this.applyRim(lBar, 0, 1.2, 104, 38, 85, '255, 230, 150', 0.4);
    sctx.drawImage(lBar, 0, 0);
    this.release(lBar);

    // 4. UN-DIMMED GLOWING FLAMES (Drawn after light so they stay brilliant)
    // Scribe Desk Candle
    const cHeight = (5 + (this.isSpeaking ? this.audioEnergy * 0.4 : 0) * 4) * candleFlick;
    sctx.fillStyle = '#f8ce53';
    sctx.beginPath();
    sctx.moveTo(33, 142);
    sctx.quadraticCurveTo(31, 142 - cHeight * 0.5, 34, 142 - cHeight);
    sctx.quadraticCurveTo(37, 142 - cHeight * 0.5, 35, 142);
    sctx.fill();
    sctx.fillStyle = '#fffcc7';
    sctx.fillRect(33.5, 142 - cHeight * 0.6, 1, cHeight * 0.5);

    // Hanging Iron Lantern in Rafters
    sctx.fillStyle = '#fffcc7';
    sctx.fillRect(102, 28, 4, 6);

    // Hearth Roaring Fireplace Tongues
    const hGrad = sctx.createRadialGradient(176, 130, 0, 176, 130, 26);
    hGrad.addColorStop(0, `rgba(244, 135, 115, ${0.75 * hearthFlick})`);
    hGrad.addColorStop(1, 'rgba(68, 14, 21, 0)');
    sctx.fillStyle = hGrad;
    sctx.fillRect(156, 105, 40, 42);

    for (let f = 0; f < 3; f++) {
      const fh = (10 + Math.sin(t * 8 + f * 2) * 4) * hearthFlick;
      sctx.fillStyle = f === 0 ? '#f48773' : f === 1 ? '#ed974e' : '#f8ce53';
      sctx.beginPath();
      sctx.moveTo(168 + f * 5, 144);
      sctx.lineTo(171 + f * 5, 144 - fh);
      sctx.lineTo(174 + f * 5, 144);
      sctx.fill();
    }

    // Ember Rail Fill
    const emberEnergy = this.isSpeaking ? 0.4 + this.audioEnergy * 0.6 : 0.2;
    sctx.fillStyle = '#ed974e';
    sctx.fillRect(14, this.BAR_Y + 36, (W - 28) * emberEnergy, 5);

    // 5. CRUSH: Bayer 4x4 Ordered Dither to 56 Colors
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

    // 6. POST-CRUSH LETTERING: Speech Bubble in Exact 5x7 Art Grid (kit.js ptext)
    this.drawCommentBubble(this.actx);

    return this.artCanvas;
  }
}
