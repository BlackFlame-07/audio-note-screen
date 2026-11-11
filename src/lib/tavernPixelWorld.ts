/**
 * Pixel Worlds: The Tavern Scribe & Listening Patrons (Cinematic 60% Focus Edition)
 * Pure Canvas2D + Multi-layer Dynamic Lighting + 4x4 Bayer Ordered Dither Palette Crush.
 * 
 * Viewport: 200 x 230 (Pixel-perfect fit for 60% mobile screen height with zero cropping).
 * Scene Layout:
 * - Upper Third (y: 0 to 75):
 *   * Heavy oak ceiling beams & rafters
 *   * Grand Gothic arched window on upper left with glowing silver crescent moon & stars
 *   * Hanging 3-candle forged iron chandelier in center casting warm radiant golden light rays
 * - Middle Third (y: 75 to 145):
 *   * Carved wooden shelves with potion bottles, flagons, hanging steins, and mead cask
 *   * Roaring stone fireplace on the right with dancing orange flames and sleeping ginger cat
 * - Bar Counter Level (y: 135 to 195):
 *   * Left (x: 10 to 62): The Scribe sitting on high wooden stool by his desk:
 *     - When user stops speaking: stops writing, lifts head, turns face FRONT towards user!
 *     - When user speaks: lowers head over parchment, feather quill scribbles across scroll lines.
 *   * Center-Right (x: 70 to 195):
 *     - Barkeep Garrick (x: 72 to 105): friendly mustache, wiping ale flagon / leaning on counter.
 *     - Dwarf Warrior Brogun (x: 110 to 150): horned helmet, braided fiery beard, foaming tankard.
 *     - Ranger Vesper (x: 155 to 195): deep traveler hood, smoking pipe, listening with keen eyes.
 *     - Dynamic speech bubbles popping up with witty tavern commentary!
 * - Lower Third (y: 190 to 230):
 *   * Polished walnut bar counter front apron with brass foot rail.
 */

export interface TavernState {
  isSpeaking: boolean;
  audioEnergy: number; // 0..1
  statusText?: string;
}

export interface PatronComment {
  patronIndex: number; // 0: Barkeep, 1: Dwarf, 2: Ranger
  text: string;
  x: number;
  y: number;
  timer: number;
  duration: number;
}

export class TavernPixelWorld {
  public static readonly W = 200;
  public static readonly H = 230;
  public static readonly BAR_Y = 148; // top edge of polished wood counter

  // 64-color warm fantasy tavern palette
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

  private readonly W = TavernPixelWorld.W;
  private readonly H = TavernPixelWorld.H;
  private readonly BAR_Y = TavernPixelWorld.BAR_Y;

  // Canvases
  private softCanvas: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;
  private artCanvas: HTMLCanvasElement;
  private actx: CanvasRenderingContext2D;
  private artImg: ImageData;
  private art32: Uint32Array;

  // Scratch pool
  private pool: HTMLCanvasElement[] = [];

  // Pre-baked environment
  private roomBg!: HTMLCanvasElement;
  private barSurface!: HTMLCanvasElement;

  // Crush LUT and Bayer matrix
  private B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  private PAL32!: Uint32Array;
  private LUT!: Uint8Array;
  private spread = 6.5;

  // State
  private time = 0;
  private isSpeaking = false;
  private audioEnergy = 0.05;
  private quillWriteProgress = 0;
  private blinkTimer = 2.5;
  private isBlinking = false;
  private inkLinesCount = 0;

  // Commentary
  private activeComment: PatronComment | null = null;
  private commentCooldown = 2.0;

  private barkeepComments = [
    "Pour another for that!",
    "Speak on, traveler!",
    "Aye, an honest day's toil.",
    "The tavern keeps thy secrets.",
    "Rest thy boots by the fire."
  ];

  private dwarfComments = [
    "Write that down, scribe!",
    "A fierce battle today!",
    "Drink deep, brave soul!",
    "By my beard, well fought!",
    "Hear, hear! To the victor!"
  ];

  private rangerComments = [
    "The stars bore witness.",
    "A heavy burden, friend.",
    "Silence... let him speak.",
    "Peace find thee at dusk.",
    "The shadows listen closely."
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

    this.initPaletteLUT();
    this.bakeEnvironment();
  }

  // ───────── Crush Palette LUT ─────────
  private initPaletteLUT() {
    const pal = TavernPixelWorld.PAL;
    const RGB = pal.map((h) => [
      parseInt(h.slice(1, 3), 16),
      parseInt(h.slice(3, 5), 16),
      parseInt(h.slice(5, 7), 16)
    ]);

    const u32 = (h: string) =>
      (255 << 24) |
      (parseInt(h.slice(5, 7), 16) << 16) |
      (parseInt(h.slice(3, 5), 16) << 8) |
      parseInt(h.slice(1, 3), 16);

    this.PAL32 = new Uint32Array(pal.map(u32));
    this.LUT = new Uint8Array(32768);

    for (let r = 0; r < 32; r++) {
      for (let g = 0; g < 32; g++) {
        for (let b = 0; b < 32; b++) {
          let best = 0;
          let bestDist = 1e9;
          const Rr = r * 8 + 4;
          const Gg = g * 8 + 4;
          const Bb = b * 8 + 4;
          for (let q = 0; q < RGB.length; q++) {
            const c = RGB[q];
            const dist = 2 * (Rr - c[0]) ** 2 + 4 * (Gg - c[1]) ** 2 + 3 * (Bb - c[2]) ** 2;
            if (dist < bestDist) {
              bestDist = dist;
              best = q;
            }
          }
          this.LUT[(r << 10) | (g << 5) | b] = best;
        }
      }
    }
  }

  private getScratch(): HTMLCanvasElement {
    const c = this.pool.pop() || document.createElement('canvas');
    c.width = this.W;
    c.height = this.H;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.clearRect(0, 0, this.W, this.H);
    return c;
  }

  private release(...canvases: (HTMLCanvasElement | null | undefined)[]) {
    for (const c of canvases) {
      if (c) this.pool.push(c);
    }
  }

  private drawLayer(drawFn: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
    const L = this.getScratch();
    const ctx = L.getContext('2d')!;
    ctx.save();
    drawFn(ctx);
    ctx.restore();
    return L;
  }

  private applyLight(
    L: HTMLCanvasElement,
    amb: string,
    lights: Array<[number, number, number, string, number]>
  ): HTMLCanvasElement {
    const k = L.getContext('2d')!;
    const M = this.getScratch();
    const m = M.getContext('2d')!;

    m.fillStyle = amb;
    m.fillRect(0, 0, this.W, this.H);
    m.globalCompositeOperation = 'lighter';

    for (const [x, y, r, rgb, a] of lights) {
      const s = Math.min(1.3, Math.max(0, a));
      if (s <= 0) continue;
      const gr = m.createRadialGradient(x, y, 2, x, y, r);
      gr.addColorStop(0, `rgba(${rgb},${s})`);
      gr.addColorStop(0.4, `rgba(${rgb},${s * 0.65})`);
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
    return L;
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
    const R = this.getScratch();
    const q = R.getContext('2d')!;

    q.drawImage(L, 0, 0);
    q.globalCompositeOperation = 'source-in';
    const gr = q.createRadialGradient(x, y, 2, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},${a})`);
    gr.addColorStop(0.5, `rgba(${rgb},${a * 0.5})`);
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

  private crush(): HTMLCanvasElement {
    const d = this.sctx.getImageData(0, 0, this.W, this.H).data;
    const W = this.W;
    const H = this.H;
    const B4 = this.B4;
    const spread = this.spread;
    const LUT = this.LUT;
    const PAL32 = this.PAL32;
    const art32 = this.art32;

    for (let y = 0, i = 0, j = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i += 4, j++) {
        const dither = ((B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5) * spread;
        let r = d[i] + dither;
        let g = d[i + 1] + dither;
        let b = d[i + 2] + dither;

        r = r < 0 ? 0 : r > 255 ? 255 : r;
        g = g < 0 ? 0 : g > 255 ? 255 : g;
        b = b < 0 ? 0 : b > 255 ? 255 : b;

        art32[j] = PAL32[LUT[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)]];
      }
    }
    this.actx.putImageData(this.artImg, 0, 0);
    return this.artCanvas;
  }

  // ───────── Pre-bake Environment ─────────
  private bakeEnvironment() {
    this.roomBg = document.createElement('canvas');
    this.roomBg.width = this.W;
    this.roomBg.height = this.H;
    const ctx = this.roomBg.getContext('2d')!;

    // Rich warm oak wood wall
    const wallGrad = ctx.createLinearGradient(0, 0, 0, this.BAR_Y);
    wallGrad.addColorStop(0, '#452513');
    wallGrad.addColorStop(0.5, '#3e1e12');
    wallGrad.addColorStop(1, '#24130a');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, this.W, this.BAR_Y);

    // Stone vaulted ceiling band
    ctx.fillStyle = '#2b2723';
    ctx.fillRect(0, 0, this.W, 16);
    ctx.fillStyle = '#443e38';
    ctx.fillRect(0, 16, this.W, 2);

    // Rafter beams
    for (const bx of [16, 68, 128, 178]) {
      ctx.fillStyle = '#1c1008';
      ctx.fillRect(bx, 0, 8, this.BAR_Y);
      ctx.fillStyle = '#61351b';
      ctx.fillRect(bx + 1, 0, 1.5, this.BAR_Y);
      ctx.fillStyle = '#0b0c1a';
      ctx.fillRect(bx + 6.5, 0, 1.5, this.BAR_Y);
    }

    // Plank seams
    for (let y = 26; y < this.BAR_Y; y += 18) {
      ctx.fillStyle = 'rgba(11, 12, 26, 0.6)';
      ctx.fillRect(0, y, this.W, 1.5);
      ctx.fillStyle = 'rgba(166, 95, 47, 0.25)';
      ctx.fillRect(0, y + 1.5, this.W, 1.0);
    }

    // ───── GOTHIC MOONLIT WINDOW (Upper Left, x: 12 to 46, y: 22 to 74) ─────
    ctx.fillStyle = '#181614';
    ctx.beginPath();
    ctx.arc(29, 38, 16, Math.PI, Math.PI * 2);
    ctx.rect(13, 38, 32, 36);
    ctx.fill();
    ctx.strokeStyle = '#443e38';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Sky
    const skyGrad = ctx.createLinearGradient(13, 22, 13, 74);
    skyGrad.addColorStop(0, '#0b0c1a');
    skyGrad.addColorStop(0.7, '#1a1d36');
    skyGrad.addColorStop(1, '#262a4a');
    ctx.fillStyle = skyGrad;
    ctx.beginPath();
    ctx.arc(29, 38, 14, Math.PI, Math.PI * 2);
    ctx.rect(15, 38, 28, 34);
    ctx.fill();

    // Crescent Moon
    ctx.fillStyle = '#fffcc7';
    ctx.beginPath();
    ctx.arc(33, 34, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1d36';
    ctx.beginPath();
    ctx.arc(35, 33, 5, 0, Math.PI * 2);
    ctx.fill();

    // Stars
    for (const [sx, sy] of [[20, 30], [26, 26], [38, 28], [22, 48], [39, 44], [28, 60]]) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx, sy, 1, 1);
    }

    // Diamond leaded window panes
    ctx.strokeStyle = 'rgba(18, 20, 38, 0.6)';
    ctx.lineWidth = 1;
    for (let d = -12; d < 40; d += 8) {
      ctx.beginPath();
      ctx.moveTo(15 + d, 22);
      ctx.lineTo(15 + d + 28, 74);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(43 - d, 22);
      ctx.lineTo(43 - d - 28, 74);
      ctx.stroke();
    }

    // ───── TAVERN SHELVES (Center, x: 58 to 154) ─────
    for (const sy of [44, 76, 110]) {
      ctx.fillStyle = '#61351b';
      ctx.fillRect(58, sy, 96, 4);
      ctx.fillStyle = '#824924';
      ctx.fillRect(58, sy, 96, 1.2);
      ctx.fillStyle = '#1c1008';
      ctx.fillRect(58, sy + 4, 96, 2.5);

      // Iron brackets
      ctx.fillStyle = '#121426';
      ctx.fillRect(66, sy + 4, 3, 5);
      ctx.fillRect(146, sy + 4, 3, 5);

      // Cask on lowest shelf
      if (sy === 110) {
        ctx.fillStyle = '#824924';
        ctx.beginPath();
        ctx.arc(68, 98, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#452513';
        ctx.fillRect(60, 89, 16, 18);
        ctx.fillStyle = '#ce8c17';
        ctx.fillRect(60, 92, 16, 1.5);
        ctx.fillRect(60, 103, 16, 1.5);
        ctx.fillStyle = '#f8ce53';
        ctx.fillRect(67, 100, 3, 3);
      }

      // Bottles on shelves
      const bcols = ['#2a6e4f', '#96222e', '#ce8c17', '#373c64', '#a65f2f', '#4d7582'];
      for (let bx = 62; bx < 150; bx += 8) {
        if (sy === 110 && bx < 84) continue;
        const col = bcols[(bx / 8) % bcols.length];
        const h = 7 + ((bx * 3) % 7);
        ctx.fillStyle = col;
        ctx.fillRect(bx, sy - h, 5, h);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(bx + 1, sy - h + 1, 1.2, h - 2);
        ctx.fillStyle = '#824924';
        ctx.fillRect(bx + 1.5, sy - h - 3, 2, 3);
      }
    }

    // ───── ROARING STONE FIREPLACE (Right Wall, x: 158 to 200) ─────
    ctx.fillStyle = '#2b2723';
    ctx.fillRect(158, 22, 42, this.BAR_Y - 22);
    // Stone lines
    ctx.strokeStyle = '#443e38';
    ctx.lineWidth = 1;
    for (let sy = 28; sy < this.BAR_Y; sy += 14) {
      ctx.beginPath();
      ctx.moveTo(158, sy);
      ctx.lineTo(200, sy);
      ctx.stroke();
    }

    // Mantle
    ctx.fillStyle = '#61351b';
    ctx.fillRect(156, 74, 44, 5);
    ctx.fillStyle = '#f8b66e';
    ctx.fillRect(156, 74, 44, 1);

    // Fire Arch
    ctx.fillStyle = '#05050e';
    ctx.beginPath();
    ctx.arc(179, 98, 15, Math.PI, Math.PI * 2);
    ctx.rect(164, 98, 30, 44);
    ctx.fill();
    ctx.strokeStyle = '#635b52';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Logs
    ctx.fillStyle = '#452513';
    ctx.fillRect(168, 138, 22, 5);

    // Rug & Sleeping Cat
    ctx.fillStyle = '#6b1721';
    ctx.beginPath();
    ctx.ellipse(179, 145, 14, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ed974e';
    ctx.beginPath();
    ctx.ellipse(180, 144, 4, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // ───── POLISHED BAR COUNTER (Foreground) ─────
    this.barSurface = document.createElement('canvas');
    this.barSurface.width = this.W;
    this.barSurface.height = this.H;
    const bctx = this.barSurface.getContext('2d')!;

    // Polished top
    const barGrad = bctx.createLinearGradient(0, this.BAR_Y, 0, this.BAR_Y + 18);
    barGrad.addColorStop(0, '#cc7a3d');
    barGrad.addColorStop(0.12, '#a65f2f');
    barGrad.addColorStop(0.65, '#824924');
    barGrad.addColorStop(1, '#61351b');
    bctx.fillStyle = barGrad;
    bctx.fillRect(0, this.BAR_Y, this.W, 18);

    // Amber highlight strip
    bctx.fillStyle = '#fcd598';
    bctx.fillRect(0, this.BAR_Y, this.W, 1.5);
    bctx.fillStyle = 'rgba(255, 252, 199, 0.7)';
    bctx.fillRect(0, this.BAR_Y + 1.5, this.W, 0.8);
    bctx.fillStyle = '#1c1008';
    bctx.fillRect(0, this.BAR_Y + 18, this.W, 2.5);

    // Front apron
    const ag = bctx.createLinearGradient(0, this.BAR_Y + 20, 0, this.H);
    ag.addColorStop(0, '#452513');
    ag.addColorStop(0.7, '#2e190d');
    ag.addColorStop(1, '#1c1008');
    bctx.fillStyle = ag;
    bctx.fillRect(0, this.BAR_Y + 20, this.W, this.H - (this.BAR_Y + 20));

    for (let x = 12; x < this.W; x += 18) {
      bctx.fillStyle = '#0b0c1a';
      bctx.fillRect(x, this.BAR_Y + 20, 1.8, this.H - (this.BAR_Y + 20));
    }

    // Polished Brass Foot Rail
    bctx.fillStyle = '#ce8c17';
    bctx.fillRect(0, 218, this.W, 3.5);
    bctx.fillStyle = '#fffcc7';
    bctx.fillRect(0, 218, this.W, 1);
    for (let rx = 24; rx < this.W; rx += 48) {
      bctx.fillStyle = '#6b4507';
      bctx.fillRect(rx - 2, 217, 5, 5);
    }
  }

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

  /**
   * Draw The Scribe (Sitting by bar on the left, x: 12 to 58, y: 110 to 165)
   */
  private drawScribe(ctx: CanvasRenderingContext2D, t: number) {
    const isWriting = this.isSpeaking;
    const breath = Math.sin(t * 2.4) * 0.9;

    // Wooden Stool
    ctx.fillStyle = '#2e190d';
    ctx.fillRect(24, 150, 20, 5);
    ctx.fillRect(26, 155, 3.5, 48);
    ctx.fillRect(39, 155, 3.5, 48);
    ctx.fillStyle = '#61351b';
    ctx.fillRect(23, 149, 22, 2);

    // Emerald Robe Body
    const torsoY = 120 + breath;
    ctx.fillStyle = '#123324';
    ctx.beginPath();
    ctx.moveTo(22, 150);
    ctx.lineTo(26, torsoY + 12);
    ctx.lineTo(44, torsoY + 12);
    ctx.lineTo(48, 150);
    ctx.closePath();
    ctx.fill();

    // Gold trim & folds
    ctx.fillStyle = '#2a6e4f';
    ctx.fillRect(30, torsoY + 6, 4, 24);
    ctx.fillRect(38, torsoY + 8, 3, 22);
    ctx.fillStyle = '#f8ce53';
    ctx.fillRect(34, torsoY + 2, 4, 4);

    // Left Arm resting on counter
    ctx.fillStyle = '#123324';
    ctx.fillRect(18, torsoY + 6, 6, 20);
    ctx.fillStyle = '#fad0b1';
    ctx.fillRect(20, 144, 5, 4);

    // ───── HEAD & EXPRESSION LOGIC ─────
    if (!isWriting) {
      // ══════ STATE 1: SILENT / USER STOPPED -> FACING DIRECTLY TO USER! ══════
      const headX = 35;
      const headY = 104 + breath * 0.7;

      // Emerald Beret / Scholar Cap
      ctx.fillStyle = '#0a1f16';
      ctx.beginPath();
      ctx.arc(headX, headY - 1, 10, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3c966c';
      ctx.fillRect(headX - 10, headY - 2, 20, 2.5);

      // Face (Front view, warm and attentive)
      ctx.fillStyle = '#fad0b1';
      ctx.beginPath();
      ctx.arc(headX, headY + 4, 8, 0, Math.PI * 2);
      ctx.fill();

      // Trimmed Beard
      ctx.fillStyle = '#635b52';
      ctx.beginPath();
      ctx.arc(headX, headY + 8, 6, 0, Math.PI);
      ctx.fill();

      // Spectacles & Eyes looking right at user
      if (this.isBlinking) {
        ctx.fillStyle = '#452513';
        ctx.fillRect(headX - 5, headY + 3, 4, 1.2);
        ctx.fillRect(headX + 2, headY + 3, 4, 1.2);
      } else {
        ctx.strokeStyle = '#f8ce53';
        ctx.lineWidth = 1;
        ctx.strokeRect(headX - 6, headY + 1, 5, 4);
        ctx.strokeRect(headX + 2, headY + 1, 5, 4);
        ctx.fillStyle = '#f8ce53';
        ctx.fillRect(headX - 1, headY + 2.5, 3, 1);

        ctx.fillStyle = '#05050e';
        ctx.fillRect(headX - 4.5, headY + 2.5, 2.2, 2.2);
        ctx.fillRect(headX + 3.5, headY + 2.5, 2.2, 2.2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(headX - 4.5, headY + 2.5, 1, 1);
        ctx.fillRect(headX + 3.5, headY + 2.5, 1, 1);
      }

      ctx.fillStyle = '#96222e';
      ctx.fillRect(headX - 2, headY + 7, 4, 1.2); // smile

      // Arm poised upright holding feather quill
      const shoulder: [number, number] = [42, torsoY + 6];
      const target: [number, number] = [54, 130 + breath * 0.5];
      const [elbow, hand] = this.reach(shoulder, target, 10, 11, 1);

      ctx.strokeStyle = '#123324';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(shoulder[0], shoulder[1]);
      ctx.lineTo(elbow[0], elbow[1]);
      ctx.stroke();

      ctx.strokeStyle = '#2a6e4f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(elbow[0], elbow[1]);
      ctx.lineTo(hand[0], hand[1]);
      ctx.stroke();

      ctx.fillStyle = '#fad0b1';
      ctx.fillRect(hand[0] - 2, hand[1] - 2, 4, 4);

      // Upright Feather Quill
      ctx.save();
      ctx.translate(hand[0], hand[1]);
      ctx.rotate(-0.55 + Math.sin(t * 3) * 0.05);
      ctx.fillStyle = '#f8ce53';
      ctx.fillRect(-0.6, 0, 1.4, 5);
      ctx.strokeStyle = '#c2cef0';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -18);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.quadraticCurveTo(5, -13, 0, -20);
      ctx.quadraticCurveTo(-5, -13, 0, -6);
      ctx.fill();
      ctx.restore();
    } else {
      // ══════ STATE 2: SPEAKING -> HEAD DOWN, SCRIBBLING! ══════
      const headX = 40;
      const headY = 108 + breath * 0.4;

      ctx.fillStyle = '#0a1f16';
      ctx.beginPath();
      ctx.arc(headX, headY - 1, 10, Math.PI * 0.8, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3c966c';
      ctx.fillRect(headX - 8, headY - 1, 18, 2.5);

      ctx.fillStyle = '#fad0b1';
      ctx.beginPath();
      ctx.arc(headX + 3, headY + 4, 7.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#635b52';
      ctx.beginPath();
      ctx.moveTo(headX, headY + 7);
      ctx.lineTo(headX + 8, headY + 12);
      ctx.lineTo(headX + 2, headY + 12);
      ctx.fill();

      ctx.strokeStyle = '#f8ce53';
      ctx.lineWidth = 1;
      ctx.strokeRect(headX + 4, headY + 3, 4, 3);
      ctx.fillStyle = '#05050e';
      ctx.fillRect(headX + 6, headY + 4.5, 2, 1.5);

      // Kinematic Writing Arm
      const writePhase = (t * 7) % 1;
      const writeJig = (Math.sin(t * 36) > 0 ? 1 : -1) * this.audioEnergy;
      const penX = 44 + writePhase * 18;
      const penY = 143 + writeJig;

      const shoulder: [number, number] = [42, torsoY + 6];
      const target: [number, number] = [penX, penY];
      const [elbow, hand] = this.reach(shoulder, target, 10, 11, 1);

      ctx.strokeStyle = '#123324';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(shoulder[0], shoulder[1]);
      ctx.lineTo(elbow[0], elbow[1]);
      ctx.stroke();

      ctx.strokeStyle = '#2a6e4f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(elbow[0], elbow[1]);
      ctx.lineTo(hand[0], hand[1]);
      ctx.stroke();

      ctx.fillStyle = '#fad0b1';
      ctx.fillRect(hand[0] - 2, hand[1] - 2, 4, 4);

      // Angled scratching quill
      ctx.save();
      ctx.translate(hand[0], hand[1]);
      ctx.rotate(-1.25 + Math.sin(t * 26) * 0.1);
      ctx.fillStyle = '#f8ce53';
      ctx.fillRect(-0.6, 0, 1.4, 5);
      ctx.strokeStyle = '#c2cef0';
      ctx.lineWidth = 1.4;
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
    }

    // Parchment Scroll on Counter
    ctx.fillStyle = '#fff1c7';
    ctx.fillRect(40, 144, 32, 11);
    ctx.fillStyle = '#fcd598';
    ctx.fillRect(40, 144, 32, 1.5);
    ctx.fillRect(40, 154, 32, 1.5);

    ctx.fillStyle = '#2e190d';
    const linesToDraw = Math.min(4, Math.floor(this.inkLinesCount));
    for (let i = 0; i < linesToDraw; i++) {
      ctx.fillRect(43, 147 + i * 2, 25, 1);
    }
    if (isWriting) {
      const curLineY = 147 + (linesToDraw % 4) * 2;
      const curWidth = Math.floor(((t * 7) % 1) * 25);
      ctx.fillRect(43, curLineY, curWidth, 1);
    }

    // Desk Props: Candlestick & Inkwell
    ctx.fillStyle = '#ce8c17';
    ctx.fillRect(20, 146, 9, 3);
    ctx.fillStyle = '#f5eee4';
    ctx.fillRect(23, 136, 4, 10);
    ctx.fillStyle = '#fcd598';
    ctx.fillRect(23, 138, 1.5, 8);
    ctx.fillStyle = '#1c1008';
    ctx.fillRect(24.5, 134, 1.2, 2);

    ctx.fillStyle = '#1a1d36';
    ctx.fillRect(74, 144, 6, 6);
    ctx.fillStyle = '#05050e';
    ctx.fillRect(75, 143, 4, 1.5);
  }

  /**
   * Draw Tavern Patrons at the Counter:
   * 1. Barkeep Garrick (x: 82 to 110, y: 122 to 154)
   * 2. Dwarf Warrior Brogun (x: 118 to 152, y: 122 to 164)
   * 3. Ranger Vesper (x: 158 to 192, y: 120 to 158)
   */
  private drawPatrons(ctx: CanvasRenderingContext2D, t: number) {
    const isSpeaking = this.isSpeaking;

    // ──────────────── 1. BARKEEP GARRICK ────────────────
    const bkX = 94;
    const bkY = 124;
    const bkb = Math.sin(t * 2.1 + 1) * 0.8;

    ctx.fillStyle = '#f5eee4';
    ctx.fillRect(bkX - 9, bkY + 8 + bkb, 18, 18);
    ctx.fillStyle = '#824924';
    ctx.fillRect(bkX - 9, bkY + 8 + bkb, 4.5, 18);
    ctx.fillRect(bkX + 4.5, bkY + 8 + bkb, 4.5, 18);

    if (!isSpeaking) {
      ctx.fillStyle = '#fad0b1';
      ctx.beginPath();
      ctx.arc(bkX, bkY + bkb, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bkX - 3, bkY - 5 + bkb, 6, 1.5);
      ctx.fillStyle = '#61351b';
      ctx.fillRect(bkX - 5, bkY + 2 + bkb, 10, 3.5);
      ctx.fillStyle = '#05050e';
      ctx.fillRect(bkX - 4, bkY - 1 + bkb, 2, 2);
      ctx.fillRect(bkX + 2, bkY - 1 + bkb, 2, 2);

      const wipeAngle = t * 4;
      const mugX = bkX - 3 + Math.cos(wipeAngle) * 2;
      const mugY = 142 + Math.sin(wipeAngle) * 1.5;

      ctx.fillStyle = '#a65f2f';
      ctx.fillRect(mugX, mugY - 8, 7, 9);
      ctx.fillStyle = '#ce8c17';
      ctx.fillRect(mugX, mugY - 7, 7, 1.5);
      ctx.fillRect(mugX, mugY - 2, 7, 1.5);
      ctx.fillStyle = '#f5eee4';
      ctx.fillRect(mugX + 2, mugY - 5, 4, 4);

      ctx.fillStyle = '#fad0b1';
      ctx.fillRect(bkX - 11, bkY + 12, 5, 8);
      ctx.fillRect(bkX + 6, bkY + 12, 5, 8);
    } else {
      ctx.fillStyle = '#fad0b1';
      ctx.beginPath();
      ctx.arc(bkX - 3, bkY + 2, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bkX - 5, bkY - 4, 4, 1.5);
      ctx.fillStyle = '#61351b';
      ctx.fillRect(bkX - 7, bkY + 4, 7, 3.5);
      ctx.fillStyle = '#05050e';
      ctx.fillRect(bkX - 6, bkY + 1, 2.5, 2.5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bkX - 5.5, bkY + 1, 1, 1);

      ctx.fillStyle = '#fad0b1';
      ctx.fillRect(bkX - 11, 142, 7, 5);
      ctx.fillRect(bkX + 4, 142, 7, 5);

      ctx.fillStyle = '#a65f2f';
      ctx.fillRect(bkX + 13, 138, 7, 9);
      ctx.fillStyle = '#ce8c17';
      ctx.fillRect(bkX + 13, 139, 7, 1.5);
    }

    // ──────────────── 2. DWARF WARRIOR BROGUN ────────────────
    const dwX = 135;
    const dwY = 124;
    const dwb = Math.sin(t * 1.8 + 2) * 0.8;

    ctx.fillStyle = '#262a4a';
    ctx.fillRect(dwX - 10, dwY + 9 + dwb, 20, 18);
    ctx.fillStyle = '#6d78a8';
    ctx.fillRect(dwX - 12, dwY + 7 + dwb, 5.5, 6);
    ctx.fillRect(dwX + 6.5, dwY + 7 + dwb, 5.5, 6);

    if (!isSpeaking) {
      const drinkCycle = (t * 0.6) % 3;
      const isDrinking = drinkCycle > 2.0;

      ctx.fillStyle = '#6d78a8';
      ctx.beginPath();
      ctx.arc(dwX, dwY - 2 + dwb, 8.5, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f8ce53';
      ctx.fillRect(dwX - 7, dwY - 3 + dwb, 14, 2.5);

      ctx.fillStyle = '#c43333';
      ctx.beginPath();
      ctx.moveTo(dwX - 8, dwY + 3 + dwb);
      ctx.lineTo(dwX + 8, dwY + 3 + dwb);
      ctx.lineTo(dwX + 4, dwY + 22 + dwb);
      ctx.lineTo(dwX - 4, dwY + 22 + dwb);
      ctx.fill();

      if (isDrinking) {
        ctx.fillStyle = '#a65f2f';
        ctx.fillRect(dwX - 2, dwY + dwb, 8, 8);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(dwX - 3, dwY - 1 + dwb, 9, 3);
      } else {
        ctx.fillStyle = '#fad0b1';
        ctx.fillRect(dwX - 4, dwY - 1 + dwb, 8, 4.5);
        ctx.fillStyle = '#05050e';
        ctx.fillRect(dwX - 3.5, dwY + dwb, 2, 2);
        ctx.fillRect(dwX + 1.5, dwY + dwb, 2, 2);

        ctx.fillStyle = '#a65f2f';
        ctx.fillRect(dwX - 11, 138, 8, 9);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(dwX - 12, 136, 10, 3);
      }
    } else {
      const nod = Math.sin(t * 3.5) * 1.2;
      ctx.fillStyle = '#6d78a8';
      ctx.beginPath();
      ctx.arc(dwX - 4, dwY - 1 + nod, 8.5, Math.PI * 0.9, Math.PI * 2.1);
      ctx.fill();
      ctx.fillStyle = '#c43333';
      ctx.beginPath();
      ctx.moveTo(dwX - 10, dwY + 4 + nod);
      ctx.lineTo(dwX + 4, dwY + 4 + nod);
      ctx.lineTo(dwX - 1, dwY + 22 + nod);
      ctx.lineTo(dwX - 9, dwY + 22 + nod);
      ctx.fill();

      ctx.fillStyle = '#fad0b1';
      ctx.fillRect(dwX - 8, dwY + nod, 5.5, 4.5);
      ctx.fillStyle = '#05050e';
      ctx.fillRect(dwX - 7, dwY + 1 + nod, 2.5, 2.5);

      ctx.fillStyle = '#a65f2f';
      ctx.fillRect(dwX - 15, 139, 8, 8);
      ctx.fillStyle = '#fad0b1';
      ctx.fillRect(dwX - 16, 137, 4.5, 4);
    }

    // ──────────────── 3. RANGER VESPER ────────────────
    const rnX = 175;
    const rnY = 122;
    const rnb = Math.sin(t * 1.5 + 3) * 0.7;

    ctx.fillStyle = '#142328';
    ctx.beginPath();
    ctx.moveTo(rnX - 9, 150);
    ctx.lineTo(rnX - 8, rnY + 8 + rnb);
    ctx.lineTo(rnX + 8, rnY + 8 + rnb);
    ctx.lineTo(rnX + 10, 150);
    ctx.fill();

    ctx.fillStyle = '#0b0c1a';
    ctx.beginPath();
    ctx.arc(rnX, rnY + rnb, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#05050e';
    ctx.fillRect(rnX - 5, rnY - 2 + rnb, 10, 5);
    ctx.fillStyle = '#57be8d';

    if (!isSpeaking) {
      ctx.fillRect(rnX - 4, rnY - 1 + rnb, 1.8, 1.4);
      ctx.fillRect(rnX + 2, rnY - 1 + rnb, 1.8, 1.4);
      ctx.strokeStyle = '#824924';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(rnX - 1, rnY + 4 + rnb);
      ctx.lineTo(rnX - 8, rnY + 8 + rnb);
      ctx.stroke();
      ctx.fillStyle = '#e8584f';
      ctx.fillRect(rnX - 9.5, rnY + 5.5 + rnb, 2.5, 2);

      const smokeCycle = (t * 0.4) % 1;
      const smokeY = rnY + 4 - smokeCycle * 32;
      const smokeX = rnX - 9 + Math.sin(t * 2) * 3;
      const smokeAlpha = Math.sin(smokeCycle * Math.PI) * 0.55;
      if (smokeAlpha > 0.05) {
        ctx.fillStyle = `rgba(194, 206, 240, ${smokeAlpha})`;
        ctx.beginPath();
        ctx.arc(smokeX, smokeY, 2 + smokeCycle * 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillRect(rnX - 5.5, rnY, 2.2, 1.4);
      ctx.fillRect(rnX - 1, rnY, 2.2, 1.4);
      ctx.strokeStyle = '#824924';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(rnX - 3, 142);
      ctx.lineTo(rnX - 9, 138);
      ctx.stroke();
      ctx.fillStyle = '#e8584f';
      ctx.fillRect(rnX - 10, 137, 2.5, 2.5);
    }
  }

  /**
   * Draw Hanging Chandelier, Flames, and Radiant Light Sources
   */
  private drawGlowingLights(ctx: CanvasRenderingContext2D, t: number) {
    // 1. Hanging Chandelier (Center, x: 105, y: 34)
    const chFlick = 0.9 + 0.1 * Math.cos(t * 8);

    ctx.strokeStyle = '#1a1d36';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(105, 0);
    ctx.lineTo(105, 20);
    ctx.moveTo(105, 20);
    ctx.lineTo(88, 34);
    ctx.moveTo(105, 20);
    ctx.lineTo(122, 34);
    ctx.stroke();

    ctx.fillStyle = '#181614';
    ctx.fillRect(84, 34, 42, 3);
    for (const cx of [90, 105, 120]) {
      ctx.fillStyle = '#ce8c17';
      ctx.fillRect(cx - 2.5, 33, 5, 2);
      ctx.fillStyle = '#f5eee4';
      ctx.fillRect(cx - 1.5, 27, 3, 6);
      ctx.fillStyle = '#1c1008';
      ctx.fillRect(cx - 0.5, 25, 1, 2);

      const cHeight = 5 * (0.85 + 0.15 * Math.sin(t * 12 + cx));
      ctx.fillStyle = '#f8b66e';
      ctx.beginPath();
      ctx.moveTo(cx - 1.5, 25);
      ctx.quadraticCurveTo(cx - 1.5, 25 - cHeight * 0.5, cx, 25 - cHeight);
      ctx.quadraticCurveTo(cx + 1.5, 25 - cHeight * 0.5, cx + 1.5, 25);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 0.5, 24, 1, 1.5);
    }

    // Chandelier light glow
    const chGrad = ctx.createRadialGradient(105, 32, 0, 105, 32, 65);
    chGrad.addColorStop(0, `rgba(255, 235, 140, ${0.45 * chFlick})`);
    chGrad.addColorStop(0.5, `rgba(248, 182, 110, ${0.2 * chFlick})`);
    chGrad.addColorStop(1, 'rgba(237, 151, 78, 0)');
    ctx.fillStyle = chGrad;
    ctx.fillRect(50, 0, 110, 85);

    // 2. Scribe Desk Candle (x: 25, y: 134)
    const candleFlick = 0.88 + 0.12 * Math.sin(t * 14);
    const audioBoost = this.isSpeaking ? this.audioEnergy * 0.5 : 0;
    const scHeight = (6 + audioBoost * 5) * candleFlick;

    const cGrad = ctx.createRadialGradient(25, 133, 0, 25, 133, 20);
    cGrad.addColorStop(0, 'rgba(255, 230, 130, 0.55)');
    cGrad.addColorStop(1, 'rgba(248, 182, 110, 0)');
    ctx.fillStyle = cGrad;
    ctx.fillRect(10, 116, 32, 34);

    ctx.fillStyle = '#f8b66e';
    ctx.beginPath();
    ctx.moveTo(23.5, 134);
    ctx.quadraticCurveTo(23, 134 - scHeight * 0.5, 25, 134 - scHeight);
    ctx.quadraticCurveTo(27, 134 - scHeight * 0.5, 26.5, 134);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(25, 132.5, 1, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // 3. Fireplace Flames (x: 179, y: 130)
    const fireFlick = 0.85 + 0.15 * Math.sin(t * 11);
    const fGrad = ctx.createRadialGradient(179, 128, 0, 179, 128, 40);
    fGrad.addColorStop(0, `rgba(244, 135, 115, ${0.7 * fireFlick})`);
    fGrad.addColorStop(0.4, `rgba(232, 88, 79, ${0.45 * fireFlick})`);
    fGrad.addColorStop(1, 'rgba(107, 23, 33, 0)');
    ctx.fillStyle = fGrad;
    ctx.fillRect(145, 95, 55, 55);

    for (let i = 0; i < 4; i++) {
      const flPhase = (t * 6 + i * 1.3) % (Math.PI * 2);
      const flX = 172 + i * 4.5 + Math.sin(flPhase) * 1.5;
      const flH = 10 + Math.sin(flPhase * 1.5) * 4;
      ctx.fillStyle = (i % 2 === 0) ? '#fde789' : '#e8584f';
      ctx.beginPath();
      ctx.moveTo(flX - 2, 138);
      ctx.quadraticCurveTo(flX - 1.5, 138 - flH * 0.5, flX, 138 - flH);
      ctx.quadraticCurveTo(flX + 1.5, 138 - flH * 0.5, flX + 2, 138);
      ctx.fill();
    }
  }

  /**
   * Draw Dynamic Tavern Speech Bubble
   */
  private drawCommentBubble(ctx: CanvasRenderingContext2D) {
    if (!this.activeComment) return;

    const c = this.activeComment;
    const paddingX = 6;
    ctx.font = 'bold 8px monospace';
    const textWidth = ctx.measureText(c.text).width;
    const bubbleW = textWidth + paddingX * 2;
    const bubbleH = 15;

    let bx = c.x - bubbleW / 2;
    if (bx < 6) bx = 6;
    if (bx + bubbleW > this.W - 6) bx = this.W - 6 - bubbleW;
    const by = c.y - bubbleH - 7;

    ctx.fillStyle = '#05050e';
    ctx.fillRect(bx + 1, by + 1, bubbleW, bubbleH);

    ctx.fillStyle = '#fff1c7';
    ctx.fillRect(bx, by, bubbleW, bubbleH);
    ctx.strokeStyle = '#61351b';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(bx, by, bubbleW, bubbleH);

    ctx.fillStyle = '#fff1c7';
    ctx.beginPath();
    ctx.moveTo(c.x - 3, by + bubbleH);
    ctx.lineTo(c.x + 3, by + bubbleH);
    ctx.lineTo(c.x, by + bubbleH + 4);
    ctx.fill();
    ctx.strokeStyle = '#61351b';
    ctx.beginPath();
    ctx.moveTo(c.x - 3, by + bubbleH);
    ctx.lineTo(c.x, by + bubbleH + 4);
    ctx.lineTo(c.x + 3, by + bubbleH);
    ctx.stroke();

    ctx.fillStyle = '#2e190d';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.text, bx + paddingX, by + bubbleH / 2 + 0.5);
  }

  // ───────── Update & Render ─────────
  public update(dt: number, state: TavernState) {
    this.time += dt;
    const wasSpeaking = this.isSpeaking;
    this.isSpeaking = state.isSpeaking;
    this.audioEnergy = state.audioEnergy;

    if (this.isSpeaking) {
      this.quillWriteProgress += dt * 0.8;
      this.inkLinesCount = Math.min(4, this.quillWriteProgress);
    }

    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.isBlinking = !this.isBlinking;
      this.blinkTimer = this.isBlinking ? 0.16 : 2.5 + Math.random() * 2.0;
    }

    if (!wasSpeaking && this.isSpeaking) {
      this.commentCooldown = 0.8;
    }

    if (this.activeComment) {
      this.activeComment.timer -= dt;
      if (this.activeComment.timer <= 0) {
        this.activeComment = null;
        this.commentCooldown = 3.5 + Math.random() * 2.5;
      }
    } else {
      this.commentCooldown -= dt;
      if (this.commentCooldown <= 0) {
        this.triggerRandomComment();
      }
    }
  }

  public triggerRandomComment(forcedText?: string) {
    const pIdx = Math.floor(Math.random() * 3);
    let text = forcedText;
    let x = 94;
    let y = 114;

    if (pIdx === 0) {
      x = 94;
      y = 114;
      if (!text) text = this.barkeepComments[Math.floor(Math.random() * this.barkeepComments.length)];
    } else if (pIdx === 1) {
      x = 135;
      y = 114;
      if (!text) text = this.dwarfComments[Math.floor(Math.random() * this.dwarfComments.length)];
    } else {
      x = 175;
      y = 110;
      if (!text) text = this.rangerComments[Math.floor(Math.random() * this.rangerComments.length)];
    }

    this.activeComment = {
      patronIndex: pIdx,
      text: text!,
      x,
      y,
      timer: 3.2,
      duration: 3.2
    };
  }

  public render(): HTMLCanvasElement {
    const t = this.time;
    const sctx = this.sctx;
    sctx.clearRect(0, 0, this.W, this.H);

    // Warm, luminous night ambient
    const amb = 'rgb(62, 52, 82)';

    const candleFlick = 0.88 + 0.12 * Math.sin(t * 14);
    const audioGlow = this.isSpeaking ? this.audioEnergy * 0.5 : 0;
    const chandelierFlick = 0.9 + 0.1 * Math.cos(t * 8);
    const fireFlick = 0.85 + 0.15 * Math.sin(t * 11);

    const lights: Array<[number, number, number, string, number]> = [
      [25, 133, 75, '255, 215, 120', (1.15 + audioGlow) * candleFlick], // Scribe candle
      [105, 34, 110, '255, 225, 135', 1.05 * chandelierFlick], // Chandelier
      [179, 130, 95, '255, 125, 50', 1.15 * fireFlick], // Fireplace
      [29, 38, 50, '150, 180, 250', 0.7] // Moonlight
    ];

    // Layer 1: Background Room, Rafters, Gothic Window, Hearth
    const lRoom = this.drawLayer((ctx) => {
      ctx.drawImage(this.roomBg, 0, 0);
    });
    this.applyLight(lRoom, amb, lights);
    sctx.drawImage(lRoom, 0, 0);
    this.release(lRoom);

    // Layer 2: Characters (Scribe & Listening Patrons)
    const lChars = this.drawLayer((ctx) => {
      this.drawScribe(ctx, t);
      this.drawPatrons(ctx, t);
    });
    this.applyLight(lChars, amb, lights);
    this.applyRim(lChars, -1.2, 0, 105, 34, 85, '255, 230, 150', 0.45);
    sctx.drawImage(lChars, 0, 0);
    this.release(lChars);

    // Layer 3: Bar Counter & Stools (Foreground)
    const lBar = this.drawLayer((ctx) => {
      ctx.drawImage(this.barSurface, 0, 0);
    });
    this.applyLight(lBar, amb, lights);
    this.applyRim(lBar, 0, 1.2, 105, 34, 75, '255, 235, 160', 0.5);
    sctx.drawImage(lBar, 0, 0);
    this.release(lBar);

    // Layer 4: Glowing Lights
    this.drawGlowingLights(sctx, t);

    // ───────── CRUSH TO PALETTE ─────────
    const finalCanvas = this.crush();

    // ───────── POST-CRUSH LETTERING & SPEECH BUBBLES ─────────
    this.drawCommentBubble(this.actx);

    return finalCanvas;
  }
}
