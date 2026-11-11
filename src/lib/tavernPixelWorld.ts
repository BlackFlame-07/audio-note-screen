/**
 * Pixel Worlds: The Tavern Scribe & Listening Patrons
 * Pure Canvas2D + Multi-layer Dynamic Lighting + 4x4 Bayer Ordered Dither Palette Crush.
 * 
 * Scene: Cozy fantasy tavern bar at night time.
 * - Scribe sitting at the bar counter to the left:
 *   * When user stops speaking: lifts head, stops writing, turns face directly toward the user, blinking and listening.
 *   * When user starts speaking: lowers head down to parchment, quill vigorously scratches across the page.
 * - Patrons at the bar counter (Barkeep Garrick, Dwarf Warrior Brogun, Ranger Vesper):
 *   * When idle: drinking ale, wiping mugs, chatting, puffing pipe smoke.
 *   * When user speaks: immediately stop talking, freeze actions, lean in, and listen attentively.
 *   * Periodically trigger delightful pixel-art speech bubbles with tavern commentary!
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
  timer: number; // seconds remaining
  duration: number;
}

export class TavernPixelWorld {
  public static readonly W = 240;
  public static readonly H = 110;
  public static readonly BAR_Y = 76; // top edge of polished wood counter

  // 56-color cozy night tavern palette
  public static readonly PAL: string[] = [
    '#05050c', '#0c0d18', '#141626', '#1c2138', '#283050', '#3b476e', '#596996', '#879bc4', '#cad5ea', '#ffffff',
    '#1a100a', '#2c190f', '#442614', '#61371b', '#844c24', '#ab6630', '#d4843d', '#f3aa57', '#fad089', '#fef1cb',
    '#0c2118', '#143829', '#1d543e', '#2c7a5c', '#42a780', '#6fd1ab', '#b2ebd4',
    '#300d11', '#54151c', '#7e2029', '#ab2d38', '#d64545', '#ea7462', '#f6a99b',
    '#201d1a', '#36302a', '#544c43', '#796e62', '#a69989', '#d1c6b6', '#ece4d8',
    '#4a2618', '#733e24', '#a65d35', '#d68752', '#f2b585', '#fad7bb',
    '#1a2b30', '#2a444c', '#3f6773', '#6093a1', '#8ec5d1',
    '#704d0a', '#a37413', '#d9a124', '#f7cb48', '#fae584', '#fffdd4'
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

  // Pre-baked static background and bar
  private roomBg!: HTMLCanvasElement;
  private barSurface!: HTMLCanvasElement;

  // Crush LUT and Bayer matrix
  private B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  private PAL32!: Uint32Array;
  private LUT!: Uint8Array;
  private spread = 8; // gentle dither spread

  // State
  private time = 0;
  private isSpeaking = false;
  private audioEnergy = 0.05;
  private quillWriteProgress = 0;
  private blinkTimer = 2.5;
  private isBlinking = false;
  private inkLinesCount = 0;

  // Patrons commentary system
  private activeComment: PatronComment | null = null;
  private commentCooldown = 3.0; // time before next comment

  // Script comments pool
  private barkeepComments = [
    "Pour another for that...",
    "By the hearth, speak on!",
    "Aye, an honest day's toil.",
    "The tavern keeps thy secrets.",
    "Rest thy boots here, friend."
  ];

  private dwarfComments = [
    "Write that down, scribe!",
    "A fierce battle today!",
    "Drink deep, brave soul!",
    "By my beard, well fought!",
    "No goblin can take that win!"
  ];

  private rangerComments = [
    "The stars bore witness.",
    "A heavy burden, traveler.",
    "Carry on into the night.",
    "Silence... let him speak.",
    "Peace find thee at dusk."
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

  // ───────── Crush LUT Generation ─────────
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
            // Human perceptual weight: Red * 2, Green * 4, Blue * 3
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

  // ───────── Scratch Layers & Compositing ─────────
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

  // Multiply by Light map
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
      const s = Math.min(1, Math.max(0, a));
      if (s <= 0) continue;
      const gr = m.createRadialGradient(x, y, 1, x, y, r);
      gr.addColorStop(0, `rgba(${rgb},${s})`);
      gr.addColorStop(0.35, `rgba(${rgb},${s * 0.55})`);
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

  // Rim lighting
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

  // Crush smooth canvas into 4x4 Bayer dithered retro pixels
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

  // ───────── Pre-baking Environment ─────────
  private bakeEnvironment() {
    // 1. Room Background: Timber walls, stone fireplace on right, shelves of potions/ale
    this.roomBg = document.createElement('canvas');
    this.roomBg.width = this.W;
    this.roomBg.height = this.H;
    const ctx = this.roomBg.getContext('2d')!;

    // Dark rustic wood planks wall
    const wallGrad = ctx.createLinearGradient(0, 0, 0, this.BAR_Y);
    wallGrad.addColorStop(0, '#2c190f');
    wallGrad.addColorStop(0.7, '#1a100a');
    wallGrad.addColorStop(1, '#0c0d18');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, this.W, this.BAR_Y);

    // Horizontal timber plank grooves
    for (let y = 14; y < this.BAR_Y; y += 14) {
      ctx.fillStyle = 'rgba(10, 6, 12, 0.65)';
      ctx.fillRect(0, y, this.W, 1.5);
      ctx.fillStyle = 'rgba(132, 76, 36, 0.2)';
      ctx.fillRect(0, y + 1.5, this.W, 0.8);
    }

    // Heavy vertical timber support beams
    for (const bx of [16, 76, 134, 192]) {
      ctx.fillStyle = '#1e1109';
      ctx.fillRect(bx, 0, 8, this.BAR_Y);
      ctx.fillStyle = 'rgba(171, 102, 48, 0.25)';
      ctx.fillRect(bx + 1, 0, 1.5, this.BAR_Y);
      ctx.fillStyle = 'rgba(5, 5, 12, 0.5)';
      ctx.fillRect(bx + 7, 0, 1.5, this.BAR_Y);
    }

    // Shelves behind the bar (x: 84 to 184)
    for (const sy of [24, 44, 62]) {
      ctx.fillStyle = '#442614';
      ctx.fillRect(86, sy, 98, 3);
      ctx.fillStyle = '#61371b';
      ctx.fillRect(86, sy, 98, 1);
      ctx.fillStyle = 'rgba(5, 5, 12, 0.7)';
      ctx.fillRect(86, sy + 3, 98, 2);

      // Shelf brackets
      ctx.fillStyle = '#1c2138';
      ctx.fillRect(92, sy + 3, 2, 4);
      ctx.fillRect(178, sy + 3, 2, 4);

      // Bottles and steins on shelf
      const bottleColors = ['#1d543e', '#7e2029', '#d9a124', '#3b476e', '#844c24'];
      for (let bx = 90; bx < 180; bx += 8) {
        if ((bx * 7) % 11 < 8) {
          const col = bottleColors[(bx / 8) % bottleColors.length];
          const h = 6 + ((bx * 3) % 5);
          ctx.fillStyle = col;
          ctx.fillRect(bx, sy - h, 4, h);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.fillRect(bx + 1, sy - h + 1, 1, h - 2);
          // Cork/neck
          ctx.fillStyle = '#ab6630';
          ctx.fillRect(bx + 1, sy - h - 2, 2, 2);
        }
      }
    }

    // Tavern Signboard / Slate above bar
    ctx.fillStyle = '#141626';
    ctx.fillRect(28, 18, 42, 16);
    ctx.strokeStyle = '#61371b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(28, 18, 42, 16);
    ctx.fillStyle = 'rgba(236, 228, 216, 0.55)';
    // Chalk lines
    ctx.fillRect(32, 23, 22, 1.2);
    ctx.fillRect(32, 27, 34, 1.2);
    ctx.fillRect(32, 31, 18, 1.2);

    // Stone Arch / Hearth outline on far right (x: 216 to 240)
    ctx.fillStyle = '#201d1a';
    ctx.beginPath();
    ctx.arc(238, 42, 24, Math.PI * 0.5, Math.PI * 1.5);
    ctx.fill();
    ctx.strokeStyle = '#36302a';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 2. The Bar Counter & Stools Surface
    this.barSurface = document.createElement('canvas');
    this.barSurface.width = this.W;
    this.barSurface.height = this.H;
    const bctx = this.barSurface.getContext('2d')!;

    // Polished dark mahogany counter top
    const barGrad = bctx.createLinearGradient(0, this.BAR_Y, 0, this.BAR_Y + 14);
    barGrad.addColorStop(0, '#ab6630');
    barGrad.addColorStop(0.15, '#844c24');
    barGrad.addColorStop(0.7, '#61371b');
    barGrad.addColorStop(1, '#442614');
    bctx.fillStyle = barGrad;
    bctx.fillRect(0, this.BAR_Y, this.W, 14);

    // Highlight sheen along top edge
    bctx.fillStyle = '#f3aa57';
    bctx.fillRect(0, this.BAR_Y, this.W, 1.2);
    bctx.fillStyle = 'rgba(254, 241, 203, 0.4)';
    bctx.fillRect(0, this.BAR_Y + 1.2, this.W, 0.8);

    // Counter shadow line underneath
    bctx.fillStyle = '#1a100a';
    bctx.fillRect(0, this.BAR_Y + 14, this.W, 2);

    // Vertical timber front apron
    const frontGrad = bctx.createLinearGradient(0, this.BAR_Y + 16, 0, this.H);
    frontGrad.addColorStop(0, '#361e12');
    frontGrad.addColorStop(1, '#1a100a');
    bctx.fillStyle = frontGrad;
    bctx.fillRect(0, this.BAR_Y + 16, this.W, this.H - (this.BAR_Y + 16));

    // Vertical plank grooves on front of bar
    for (let x = 12; x < this.W; x += 18) {
      bctx.fillStyle = '#0c0d18';
      bctx.fillRect(x, this.BAR_Y + 16, 1.5, this.H - (this.BAR_Y + 16));
    }

    // Heavy brass foot rail at bottom (y: 104)
    bctx.fillStyle = '#d9a124';
    bctx.fillRect(0, 104, this.W, 2.5);
    bctx.fillStyle = '#fae584';
    bctx.fillRect(0, 104, this.W, 0.8);
    for (let rx = 24; rx < this.W; rx += 52) {
      bctx.fillStyle = '#704d0a';
      bctx.fillRect(rx - 2, 103, 4, 4);
    }
  }

  // ───────── Character Kinematics & Drawing ─────────

  // Two-bone kinematic reach (returns [elbow, hand])
  private reach(
    shoulder: [number, number],
    target: [number, number],
    upper = 9,
    fore = 11,
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
   * Draw The Scribe (Sitting by the bar counter to the left, x: 14 to 62)
   */
  private drawScribe(ctx: CanvasRenderingContext2D, t: number) {
    const isWriting = this.isSpeaking;
    const breath = Math.sin(t * 2.4) * 0.8;
    const R = Math.round;

    // Scribe stool
    ctx.fillStyle = '#2c190f';
    ctx.fillRect(24, 78, 16, 4);
    ctx.fillRect(26, 82, 3, 24);
    ctx.fillRect(35, 82, 3, 24);
    ctx.fillStyle = '#442614';
    ctx.fillRect(23, 77, 18, 2);

    // Scholar Body & Robe (Deep emerald scholar vestments)
    const torsoY = 56 + breath;
    ctx.fillStyle = '#143829';
    ctx.beginPath();
    ctx.moveTo(22, 78);
    ctx.lineTo(24, torsoY + 8);
    ctx.lineTo(38, torsoY + 8);
    ctx.lineTo(41, 78);
    ctx.closePath();
    ctx.fill();

    // Emerald robe fold highlights
    ctx.fillStyle = '#2c7a5c';
    ctx.fillRect(27, torsoY + 4, 3, 16);
    ctx.fillRect(33, torsoY + 6, 2, 14);

    // Brass scholar brooch / neck clasp
    ctx.fillStyle = '#d9a124';
    ctx.fillRect(30, torsoY + 1, 3, 3);
    ctx.fillStyle = '#fae584';
    ctx.fillRect(31, torsoY + 1.5, 1, 1);

    // Left Arm (Resting on counter edge)
    ctx.fillStyle = '#143829';
    ctx.fillRect(19, torsoY + 4, 5, 14);
    ctx.fillStyle = '#e49e70';
    ctx.fillRect(20, 72, 4, 3); // Left hand resting

    // ───── HEAD & FACE LOGIC ─────
    if (!isWriting) {
      // ══════ STATE 1: USER STOPPED SPEAKING -> FACE TOWARDS USER! ══════
      // The scribe lifts his head, turns his face front/toward the camera, making eye contact!
      const headX = 31;
      const headY = 44 + breath * 0.7;

      // Scholar Cap / Hood
      ctx.fillStyle = '#0c2118';
      ctx.beginPath();
      ctx.arc(headX, headY - 1, 8, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2c7a5c';
      ctx.fillRect(headX - 8, headY - 2, 16, 2);

      // Face (Front / 3/4 View)
      ctx.fillStyle = '#fad7bb';
      ctx.beginPath();
      ctx.arc(headX, headY + 3, 6, 0, Math.PI * 2);
      ctx.fill();

      // Neat trimmed scholar beard
      ctx.fillStyle = '#544c43';
      ctx.beginPath();
      ctx.arc(headX, headY + 6, 4.5, 0, Math.PI);
      ctx.fill();

      // Glasses & Inquisitive Attentive Eyes
      if (this.isBlinking) {
        // Blink: thin horizontal slit
        ctx.fillStyle = '#442614';
        ctx.fillRect(headX - 4, headY + 2, 3, 1);
        ctx.fillRect(headX + 1, headY + 2, 3, 1);
      } else {
        // Spectacles wire frames
        ctx.strokeStyle = '#d9a124';
        ctx.lineWidth = 1;
        ctx.strokeRect(headX - 5, headY + 1, 4, 3);
        ctx.strokeRect(headX + 1, headY + 1, 4, 3);
        ctx.fillStyle = '#d9a124';
        ctx.fillRect(headX - 1, headY + 2, 2, 1);

        // Warm dark eyes looking straight at the user!
        ctx.fillStyle = '#05050c';
        ctx.fillRect(headX - 3.5, headY + 2, 1.8, 1.8);
        ctx.fillRect(headX + 2.5, headY + 2, 1.8, 1.8);
        // Specular eye glint
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(headX - 3.5, headY + 2, 0.9, 0.9);
        ctx.fillRect(headX + 2.5, headY + 2, 0.9, 0.9);
      }

      // Mouth: gentle, attentive smile
      ctx.fillStyle = '#ab2d38';
      ctx.fillRect(headX - 1.5, headY + 5.5, 3, 1);

      // Right Arm (Held poised, quill tip up in the air)
      const shoulder: [number, number] = [36, torsoY + 4];
      const target: [number, number] = [48, 64 + breath * 0.5];
      const [elbow, hand] = this.reach(shoulder, target, 8, 9, 1);

      // Upper arm
      ctx.strokeStyle = '#143829';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(shoulder[0], shoulder[1]);
      ctx.lineTo(elbow[0], elbow[1]);
      ctx.stroke();

      // Forearm with green sleeve
      ctx.strokeStyle = '#2c7a5c';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(elbow[0], elbow[1]);
      ctx.lineTo(hand[0], hand[1]);
      ctx.stroke();

      // Hand holding upright feather quill
      ctx.fillStyle = '#fad7bb';
      ctx.fillRect(hand[0] - 1.5, hand[1] - 1.5, 3, 3);

      // Upright Feather Quill (poised waiting)
      ctx.save();
      ctx.translate(hand[0], hand[1]);
      ctx.rotate(-0.55 + Math.sin(t * 3) * 0.05);
      // Nib
      ctx.fillStyle = '#fae584';
      ctx.fillRect(-0.5, 0, 1.2, 4);
      // Shaft
      ctx.strokeStyle = '#cad5ea';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -14);
      ctx.stroke();
      // White/Cyan Feather vanes
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.quadraticCurveTo(4, -10, 0, -16);
      ctx.quadraticCurveTo(-4, -10, 0, -5);
      ctx.fill();
      ctx.restore();
    } else {
      // ══════ STATE 2: USER IS SPEAKING -> HEAD DOWN, WRITING VIGOROUSLY! ══════
      // The scribe leans forward over the parchment, eyes glued to paper, arm moving!
      const headX = 35;
      const headY = 47 + breath * 0.4;

      // Scholar Cap / Hood (Profile angle tilted down)
      ctx.fillStyle = '#0c2118';
      ctx.beginPath();
      ctx.arc(headX, headY - 1, 8, Math.PI * 0.8, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2c7a5c';
      ctx.fillRect(headX - 6, headY - 1, 14, 2);

      // Face tilted downwards (looking at paper)
      ctx.fillStyle = '#fad7bb';
      ctx.beginPath();
      ctx.arc(headX + 2, headY + 3, 5.5, 0, Math.PI * 2);
      ctx.fill();

      // Beard pointing downward
      ctx.fillStyle = '#544c43';
      ctx.beginPath();
      ctx.moveTo(headX, headY + 5);
      ctx.lineTo(headX + 6, headY + 9);
      ctx.lineTo(headX + 2, headY + 9);
      ctx.closePath();
      ctx.fill();

      // Spectacles catching candlelight reflection
      ctx.strokeStyle = '#fae584';
      ctx.lineWidth = 1;
      ctx.strokeRect(headX + 3, headY + 2, 3, 2.5);

      // Eye looking down at writing
      ctx.fillStyle = '#05050c';
      ctx.fillRect(headX + 4.5, headY + 3.5, 1.5, 1.2);

      // Kinetic Writing Arm!
      // Moves back and forth across parchment lines with audio vibration
      const writePhase = (t * 6) % 1;
      const writeJig = (Math.sin(t * 36) > 0 ? 0.8 : -0.8) * this.audioEnergy;
      const penX = 39 + writePhase * 14;
      const penY = 72 + writeJig;

      const shoulder: [number, number] = [36, torsoY + 4];
      const target: [number, number] = [penX, penY];
      const [elbow, hand] = this.reach(shoulder, target, 8, 9, 1);

      // Upper arm
      ctx.strokeStyle = '#143829';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(shoulder[0], shoulder[1]);
      ctx.lineTo(elbow[0], elbow[1]);
      ctx.stroke();

      // Forearm
      ctx.strokeStyle = '#2c7a5c';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(elbow[0], elbow[1]);
      ctx.lineTo(hand[0], hand[1]);
      ctx.stroke();

      // Hand
      ctx.fillStyle = '#fad7bb';
      ctx.fillRect(hand[0] - 1.5, hand[1] - 1.5, 3, 3);

      // Angled Quill scratching across parchment
      ctx.save();
      ctx.translate(hand[0], hand[1]);
      ctx.rotate(-1.2 + Math.sin(t * 24) * 0.1);
      ctx.fillStyle = '#fae584';
      ctx.fillRect(-0.5, 0, 1.2, 4);
      ctx.strokeStyle = '#cad5ea';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -14);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.quadraticCurveTo(4, -9, 0, -15);
      ctx.quadraticCurveTo(-4, -9, 0, -4);
      ctx.fill();
      ctx.restore();

      // Tiny ink drop particles flying from quill when speaking loud
      if (this.audioEnergy > 0.4 && Math.random() < 0.3) {
        ctx.fillStyle = '#05050c';
        ctx.fillRect(penX + Math.random() * 2, penY - 1, 1, 1);
      }
    }

    // ───── PARCHMENT SCROLL ON COUNTER ─────
    // Parchment paper sheet
    ctx.fillStyle = '#fef1cb';
    ctx.fillRect(36, 73, 26, 8);
    ctx.fillStyle = '#fad089';
    ctx.fillRect(36, 73, 26, 1);
    ctx.fillRect(36, 80, 26, 1);
    // Dark ink lines on parchment (accumulate as user speaks)
    ctx.fillStyle = '#2c190f';
    const linesToDraw = Math.min(4, Math.floor(this.inkLinesCount));
    for (let i = 0; i < linesToDraw; i++) {
      ctx.fillRect(39, 75 + i * 1.4, 20, 0.8);
    }
    // Active line being written right now
    if (isWriting) {
      const curLineY = 75 + (linesToDraw % 4) * 1.4;
      const curLineWidth = Math.floor(((t * 6) % 1) * 20);
      ctx.fillRect(39, curLineY, curLineWidth, 0.8);
    }

    // Heavy Brass Inkpot & Candle
    // Inkpot
    ctx.fillStyle = '#1c2138';
    ctx.fillRect(64, 73, 5, 5);
    ctx.fillStyle = '#05050c';
    ctx.fillRect(65, 72, 3, 1); // open ink mouth

    // Candle in brass dish (The main warm light on the scribe's work)
    ctx.fillStyle = '#d9a124';
    ctx.fillRect(20, 75, 7, 2); // brass base
    ctx.fillStyle = '#ece4d8';
    ctx.fillRect(22, 68, 3, 7); // ivory wax pillar
    ctx.fillStyle = '#fad089';
    ctx.fillRect(22, 69, 1, 6); // wax shade
    ctx.fillStyle = '#1a100a';
    ctx.fillRect(23, 66.5, 1, 1.5); // wick
  }

  /**
   * Draw Tavern Patrons at the Counter:
   * 1. Barkeep Garrick (x: 96 to 124, y: 46 to 76)
   * 2. Dwarf Warrior Brogun (x: 136 to 166, y: 48 to 82)
   * 3. Ranger Vesper (x: 182 to 216, y: 44 to 80)
   */
  private drawPatrons(ctx: CanvasRenderingContext2D, t: number) {
    const isSpeaking = this.isSpeaking;

    // ──────────────── 1. BARKEEP GARRICK ────────────────
    const bkX = 110;
    const bkY = 56;
    const bkBreath = Math.sin(t * 2.1 + 1) * 0.7;

    // Barkeep linen shirt & apron
    ctx.fillStyle = '#d1c6b6';
    ctx.fillRect(bkX - 8, bkY + 6 + bkBreath, 16, 14);
    // Brown leather vest
    ctx.fillStyle = '#61371b';
    ctx.fillRect(bkX - 8, bkY + 6 + bkBreath, 4, 14);
    ctx.fillRect(bkX + 4, bkY + 6 + bkBreath, 4, 14);

    if (!isSpeaking) {
      // Barkeep IDLE: Wiping a beer mug with a cloth!
      // Head looking casually forward/right
      ctx.fillStyle = '#fad7bb';
      ctx.beginPath();
      ctx.arc(bkX, bkY + bkBreath, 6.5, 0, Math.PI * 2);
      ctx.fill();
      // Bald head highlight
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bkX - 2, bkY - 5 + bkBreath, 4, 1.2);
      // Thick bushy brown mustache
      ctx.fillStyle = '#61371b';
      ctx.fillRect(bkX - 4, bkY + 2 + bkBreath, 8, 2.5);
      // Eyes looking forward
      ctx.fillStyle = '#05050c';
      ctx.fillRect(bkX - 3, bkY - 1 + bkBreath, 1.5, 1.5);
      ctx.fillRect(bkX + 1.5, bkY - 1 + bkBreath, 1.5, 1.5);

      // Wiping arm motion: circular wipe
      const wipeAngle = t * 4;
      const mugX = bkX - 3 + Math.cos(wipeAngle) * 1.5;
      const mugY = 71 + Math.sin(wipeAngle) * 1.0;

      // Wooden beer mug being wiped
      ctx.fillStyle = '#844c24';
      ctx.fillRect(mugX, mugY - 6, 6, 8);
      ctx.fillStyle = '#ab6630';
      ctx.fillRect(mugX + 1, mugY - 5, 4, 6);
      ctx.fillStyle = '#d9a124'; // brass bands
      ctx.fillRect(mugX, mugY - 5, 6, 1);
      ctx.fillRect(mugX, mugY - 1, 6, 1);

      // White cloth in wiping hand
      ctx.fillStyle = '#ece4d8';
      ctx.fillRect(mugX + 2, mugY - 4, 4, 4);

      // Arms
      ctx.fillStyle = '#fad7bb';
      ctx.fillRect(bkX - 9, bkY + 10, 5, 6);
      ctx.fillRect(bkX + 4, bkY + 10, 5, 6);
    } else {
      // Barkeep LISTENING: Lowers mug, leans on counter with both hands, turns head to scribe/user!
      // Head turned LEFT towards the speaker/scribe!
      ctx.fillStyle = '#fad7bb';
      ctx.beginPath();
      ctx.arc(bkX - 2, bkY + 2, 6.5, 0, Math.PI * 2);
      ctx.fill();
      // Bald top
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bkX - 4, bkY - 3, 3, 1.2);
      // Mustache side profile
      ctx.fillStyle = '#61371b';
      ctx.fillRect(bkX - 7, bkY + 4, 6, 2.5);
      // Wide focused eyes looking at the scribe/speaker
      ctx.fillStyle = '#05050c';
      ctx.fillRect(bkX - 6, bkY + 1, 2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bkX - 5.5, bkY + 1, 0.8, 0.8);

      // Both arms leaning on counter
      ctx.fillStyle = '#fad7bb';
      ctx.fillRect(bkX - 10, 72, 6, 4);
      ctx.fillRect(bkX + 4, 72, 6, 4);

      // Mug resting still on the bar counter
      ctx.fillStyle = '#844c24';
      ctx.fillRect(bkX + 12, 68, 6, 8);
      ctx.fillStyle = '#d9a124';
      ctx.fillRect(bkX + 12, 69, 6, 1);
      ctx.fillRect(bkX + 12, 73, 6, 1);
    }

    // ──────────────── 2. DWARF WARRIOR BROGUN ────────────────
    const dwX = 154;
    const dwY = 56;
    const dwBreath = Math.sin(t * 1.8 + 2) * 0.7;

    // Dwarf stool
    ctx.fillStyle = '#2c190f';
    ctx.fillRect(dwX - 7, 80, 14, 3);
    ctx.fillRect(dwX - 5, 83, 3, 23);
    ctx.fillRect(dwX + 2, 83, 3, 23);

    // Heavy iron pauldron & studded leather armor
    ctx.fillStyle = '#3b476e';
    ctx.fillRect(dwX - 9, dwY + 8 + dwBreath, 18, 14);
    ctx.fillStyle = '#596996';
    ctx.fillRect(dwX - 11, dwY + 6 + dwBreath, 5, 5); // left iron pauldron
    ctx.fillRect(dwX + 6, dwY + 6 + dwBreath, 5, 5); // right iron pauldron

    if (!isSpeaking) {
      // Dwarf IDLE: Holding a foaming flagon, takes periodic swigs!
      const drinkCycle = (t * 0.6) % 3;
      const isDrinking = drinkCycle > 2.0;

      // Iron horned helmet
      ctx.fillStyle = '#596996';
      ctx.beginPath();
      ctx.arc(dwX, dwY - 2 + dwBreath, 7, Math.PI, Math.PI * 2);
      ctx.fill();
      // Rivets
      ctx.fillStyle = '#fae584';
      ctx.fillRect(dwX - 6, dwY - 3 + dwBreath, 12, 2);

      // Magnificent braided red/orange beard!
      ctx.fillStyle = '#ab2d38';
      ctx.beginPath();
      ctx.moveTo(dwX - 7, dwY + 2 + dwBreath);
      ctx.lineTo(dwX + 7, dwY + 2 + dwBreath);
      ctx.lineTo(dwX + 4, dwY + 18 + dwBreath);
      ctx.lineTo(dwX - 4, dwY + 18 + dwBreath);
      ctx.closePath();
      ctx.fill();
      // Golden beard braids
      ctx.fillStyle = '#d9a124';
      ctx.fillRect(dwX - 4, dwY + 12 + dwBreath, 2, 2);
      ctx.fillRect(dwX + 2, dwY + 12 + dwBreath, 2, 2);

      if (isDrinking) {
        // Flagon raised to lips!
        ctx.fillStyle = '#844c24';
        ctx.fillRect(dwX - 2, dwY + dwBreath, 7, 7);
        // Foaming white ale overflow
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(dwX - 3, dwY - 1 + dwBreath, 8, 2);
      } else {
        // Dwarf face looking jovially around
        ctx.fillStyle = '#fad7bb';
        ctx.fillRect(dwX - 4, dwY - 1 + dwBreath, 8, 4);
        ctx.fillStyle = '#05050c';
        ctx.fillRect(dwX - 3, dwY + dwBreath, 1.5, 1.5);
        ctx.fillRect(dwX + 1.5, dwY + dwBreath, 1.5, 1.5);

        // Flagon resting on bar
        ctx.fillStyle = '#844c24';
        ctx.fillRect(dwX - 10, 68, 7, 8);
        ctx.fillStyle = '#ffffff'; // foam
        ctx.fillRect(dwX - 11, 67, 9, 2);
      }
    } else {
      // Dwarf LISTENING: Lowers flagon, leans forward, head turned LEFT nodding attentively!
      const nod = Math.sin(t * 3.5) * 1.0;

      // Helmet tilted toward speaker
      ctx.fillStyle = '#596996';
      ctx.beginPath();
      ctx.arc(dwX - 3, dwY - 1 + nod, 7, Math.PI * 0.9, Math.PI * 2.1);
      ctx.fill();
      ctx.fillStyle = '#fae584';
      ctx.fillRect(dwX - 9, dwY - 2 + nod, 12, 2);

      // Beard leaning forward towards the scribe
      ctx.fillStyle = '#ab2d38';
      ctx.beginPath();
      ctx.moveTo(dwX - 9, dwY + 3 + nod);
      ctx.lineTo(dwX + 4, dwY + 3 + nod);
      ctx.lineTo(dwX - 1, dwY + 18 + nod);
      ctx.lineTo(dwX - 8, dwY + 18 + nod);
      ctx.closePath();
      ctx.fill();

      // Attentive, reverent dwarf eye
      ctx.fillStyle = '#fad7bb';
      ctx.fillRect(dwX - 7, dwY + nod, 5, 3.5);
      ctx.fillStyle = '#05050c';
      ctx.fillRect(dwX - 6.5, dwY + 0.5 + nod, 2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(dwX - 6, dwY + 0.5 + nod, 0.8, 0.8);

      // Flagon set firmly down on counter with hand resting on it
      ctx.fillStyle = '#844c24';
      ctx.fillRect(dwX - 14, 69, 7, 7);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(dwX - 14, 68, 7, 2);
      ctx.fillStyle = '#fad7bb'; // hand over mug
      ctx.fillRect(dwX - 15, 67, 4, 3);
    }

    // ──────────────── 3. RANGER VESPER ────────────────
    const rnX = 196;
    const rnY = 54;
    const rnBreath = Math.sin(t * 1.5 + 3) * 0.6;

    // Dark teal hooded traveler's cloak
    ctx.fillStyle = '#1a2b30';
    ctx.beginPath();
    ctx.moveTo(rnX - 8, 78);
    ctx.lineTo(rnX - 7, rnY + 6 + rnBreath);
    ctx.lineTo(rnX + 7, rnY + 6 + rnBreath);
    ctx.lineTo(rnX + 9, 78);
    ctx.closePath();
    ctx.fill();

    // Deep cowl hood
    ctx.fillStyle = '#141626';
    ctx.beginPath();
    ctx.arc(rnX, rnY + rnBreath, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a444c';
    ctx.strokeRect(rnX - 7, rnY - 6 + rnBreath, 14, 12);

    if (!isSpeaking) {
      // Ranger IDLE: Puffs pipe, glowing cherry ember, periodic smoke rings!
      // Shadowed face with glinting teal eyes
      ctx.fillStyle = '#05050c';
      ctx.fillRect(rnX - 5, rnY - 2 + rnBreath, 10, 5);
      ctx.fillStyle = '#6fd1ab';
      ctx.fillRect(rnX - 3.5, rnY - 1 + rnBreath, 1.5, 1);
      ctx.fillRect(rnX + 1.5, rnY - 1 + rnBreath, 1.5, 1);

      // Long wooden smoking pipe
      ctx.strokeStyle = '#844c24';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(rnX - 1, rnY + 3 + rnBreath);
      ctx.lineTo(rnX - 7, rnY + 7 + rnBreath);
      ctx.stroke();
      // Pipe bowl with orange ember
      ctx.fillStyle = '#442614';
      ctx.fillRect(rnX - 9, rnY + 5 + rnBreath, 3, 4);
      ctx.fillStyle = '#ea7462';
      ctx.fillRect(rnX - 8.5, rnY + 4.5 + rnBreath, 2, 1.5);

      // Periodic smoke wisps rising towards rafters
      const smokeCycle = (t * 0.4) % 1;
      const smokeY = rnY + 3 - smokeCycle * 22;
      const smokeX = rnX - 8 + Math.sin(t * 2) * 3;
      const smokeAlpha = Math.sin(smokeCycle * Math.PI) * 0.45;
      if (smokeAlpha > 0.05) {
        ctx.fillStyle = `rgba(202, 213, 234, ${smokeAlpha})`;
        ctx.beginPath();
        ctx.arc(smokeX, smokeY, 2 + smokeCycle * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Ranger LISTENING: Freezes pipe, lowers hood slightly, emerald eyes keen and listening!
      ctx.fillStyle = '#05050c';
      ctx.fillRect(rnX - 6, rnY - 1, 10, 5);
      // Keen glinting eyes shifted towards the scribe/speaker
      ctx.fillStyle = '#6fd1ab';
      ctx.fillRect(rnX - 5.5, rnY, 2, 1.2);
      ctx.fillRect(rnX - 1, rnY, 2, 1.2);

      // Pipe held motionless in gloved hand
      ctx.strokeStyle = '#844c24';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(rnX - 3, 71);
      ctx.lineTo(rnX - 8, 68);
      ctx.stroke();
      ctx.fillStyle = '#ea7462';
      ctx.fillRect(rnX - 9, 67, 2, 2);
    }
  }

  /**
   * Draw Hanging Ceiling Lantern & Hearth Light Sources
   */
  private drawGlowingLights(ctx: CanvasRenderingContext2D, t: number) {
    // 1. Scribe's Desk Candle Flame (x: 23.5, y: 66)
    const candleFlicker = 0.88 + 0.12 * Math.sin(t * 14 + Math.cos(t * 9));
    const audioBoost = this.isSpeaking ? this.audioEnergy * 0.4 : 0;
    const cHeight = (5 + audioBoost * 4) * candleFlicker;

    // Candle outer halo
    const cGrad = ctx.createRadialGradient(23.5, 65, 0, 23.5, 65, 12);
    cGrad.addColorStop(0, 'rgba(255, 220, 110, 0.45)');
    cGrad.addColorStop(1, 'rgba(255, 180, 50, 0)');
    ctx.fillStyle = cGrad;
    ctx.fillRect(11, 53, 25, 24);

    // Tear-drop flame
    ctx.fillStyle = '#f3aa57';
    ctx.beginPath();
    ctx.moveTo(22, 66);
    ctx.quadraticCurveTo(21.5, 66 - cHeight * 0.5, 23.5, 66 - cHeight);
    ctx.quadraticCurveTo(25.5, 66 - cHeight * 0.5, 25, 66);
    ctx.closePath();
    ctx.fill();

    // Hot inner core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(23.5, 65, 0.9, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Tavern Ceiling Brass Lantern (x: 135, y: 18)
    const lanternFlicker = 0.92 + 0.08 * Math.cos(t * 8);
    // Chain from ceiling
    ctx.strokeStyle = '#1c2138';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(135, 0);
    ctx.lineTo(135, 10);
    ctx.stroke();

    // Lantern brass cap & glass
    ctx.fillStyle = '#d9a124';
    ctx.fillRect(131, 10, 8, 2);
    ctx.fillRect(131, 22, 8, 2);
    ctx.fillStyle = '#1a100a';
    ctx.fillRect(131, 12, 1, 10);
    ctx.fillRect(138, 12, 1, 10);

    // Glowing lantern interior
    ctx.fillStyle = '#fffdd4';
    ctx.fillRect(132, 13, 6, 8);
    ctx.fillStyle = '#f7cb48';
    ctx.fillRect(133, 14, 4, 6);

    const lGrad = ctx.createRadialGradient(135, 17, 0, 135, 17, 24);
    lGrad.addColorStop(0, `rgba(255, 230, 120, ${0.4 * lanternFlicker})`);
    lGrad.addColorStop(1, 'rgba(255, 170, 50, 0)');
    ctx.fillStyle = lGrad;
    ctx.fillRect(110, 0, 50, 42);

    // 3. Hearth Dancing Embers (x: 236, y: 64)
    const hearthFlicker = 0.85 + 0.15 * Math.sin(t * 11);
    const hGrad = ctx.createRadialGradient(238, 64, 0, 238, 64, 28);
    hGrad.addColorStop(0, `rgba(234, 116, 98, ${0.6 * hearthFlicker})`);
    hGrad.addColorStop(0.5, `rgba(214, 69, 69, ${0.35 * hearthFlicker})`);
    hGrad.addColorStop(1, 'rgba(84, 21, 28, 0)');
    ctx.fillStyle = hGrad;
    ctx.fillRect(210, 36, 30, 50);

    // Fire sparks
    for (let i = 0; i < 4; i++) {
      const spPhase = (t * 2 + i * 0.3) % 1;
      const spX = 236 - Math.sin(spPhase * 4 + i) * 8;
      const spY = 74 - spPhase * 22;
      ctx.fillStyle = i % 2 === 0 ? '#fae584' : '#ea7462';
      ctx.fillRect(Math.round(spX), Math.round(spY), 1, 1);
    }
  }

  /**
   * Draw Dynamic Tavern Speech Bubble Comments
   */
  private drawCommentBubble(ctx: CanvasRenderingContext2D) {
    if (!this.activeComment) return;

    const c = this.activeComment;
    const paddingX = 6;
    const paddingY = 4;
    ctx.font = 'bold 8px monospace';
    const textWidth = ctx.measureText(c.text).width;
    const bubbleW = textWidth + paddingX * 2;
    const bubbleH = 14;

    let bx = c.x - bubbleW / 2;
    if (bx < 8) bx = 8;
    if (bx + bubbleW > this.W - 8) bx = this.W - 8 - bubbleW;
    const by = c.y - bubbleH - 6;

    // Bubble Shadow
    ctx.fillStyle = '#05050c';
    ctx.fillRect(bx + 1, by + 1, bubbleW, bubbleH);

    // Bubble Body (Clean parchment yellow)
    ctx.fillStyle = '#fef1cb';
    ctx.fillRect(bx, by, bubbleW, bubbleH);
    ctx.strokeStyle = '#61371b';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bubbleW, bubbleH);

    // Little downward arrow pointing to speaker
    ctx.fillStyle = '#fef1cb';
    ctx.beginPath();
    ctx.moveTo(c.x - 3, by + bubbleH);
    ctx.lineTo(c.x + 3, by + bubbleH);
    ctx.lineTo(c.x, by + bubbleH + 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#61371b';
    ctx.beginPath();
    ctx.moveTo(c.x - 3, by + bubbleH);
    ctx.lineTo(c.x, by + bubbleH + 4);
    ctx.lineTo(c.x + 3, by + bubbleH);
    ctx.stroke();

    // Crisp pixel text
    ctx.fillStyle = '#2c190f';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.text, bx + paddingX, by + bubbleH / 2 + 0.5);
  }

  // ───────── Advance and Render Frame ─────────
  public update(dt: number, state: TavernState) {
    this.time += dt;
    const wasSpeaking = this.isSpeaking;
    this.isSpeaking = state.isSpeaking;
    this.audioEnergy = state.audioEnergy;

    // Ink line progress
    if (this.isSpeaking) {
      this.quillWriteProgress += dt * 0.8;
      this.inkLinesCount = Math.min(4, this.quillWriteProgress);
    }

    // Blink timer
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.isBlinking = !this.isBlinking;
      this.blinkTimer = this.isBlinking ? 0.16 : 2.5 + Math.random() * 2.0;
    }

    // Speech transition triggers
    if (!wasSpeaking && this.isSpeaking) {
      // User just started speaking! Trigger listening reaction & reset comment cooldown
      this.commentCooldown = 1.2;
    }

    // Manage Patron Comments
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
    // Pick patron: 0 (Barkeep), 1 (Dwarf), 2 (Ranger)
    const pIdx = Math.floor(Math.random() * 3);
    let text = forcedText;
    let x = 110;
    let y = 48;

    if (pIdx === 0) {
      x = 110;
      y = 48;
      if (!text) text = this.barkeepComments[Math.floor(Math.random() * this.barkeepComments.length)];
    } else if (pIdx === 1) {
      x = 154;
      y = 48;
      if (!text) text = this.dwarfComments[Math.floor(Math.random() * this.dwarfComments.length)];
    } else {
      x = 196;
      y = 46;
      if (!text) text = this.rangerComments[Math.floor(Math.random() * this.rangerComments.length)];
    }

    this.activeComment = {
      patronIndex: pIdx,
      text: text!,
      x,
      y,
      timer: 3.5,
      duration: 3.5
    };
  }

  /**
   * Main Render Pipeline:
   * 1. Paint smooth background and layers
   * 2. Apply Dynamic Multi-Point Tavern Lighting
   * 3. Apply Rim Lights
   * 4. Draw glowing elements (candle flame, lanterns, embers)
   * 5. Crush to Palette with 4x4 Bayer Dither
   * 6. Draw Crisp Lettering & Dialogue Bubbles post-crush
   */
  public render(): HTMLCanvasElement {
    const t = this.time;
    const sctx = this.sctx;
    sctx.clearRect(0, 0, this.W, this.H);

    // Dynamic point lights:
    // Scribe candle, Ceiling lantern, Hearth fireplace
    const candleFlick = 0.88 + 0.12 * Math.sin(t * 14);
    const audioGlow = this.isSpeaking ? this.audioEnergy * 0.5 : 0;
    const lanternFlick = 0.9 + 0.1 * Math.cos(t * 8);
    const hearthFlick = 0.85 + 0.15 * Math.sin(t * 11);

    const lights: Array<[number, number, number, string, number]> = [
      [23.5, 66, 64, '255, 195, 90', (1.0 + audioGlow) * candleFlick], // Scribe candle
      [135, 20, 85, '255, 185, 80', 0.85 * lanternFlick], // Tavern ceiling lamp
      [236, 64, 75, '240, 110, 50', 0.8 * hearthFlick] // Hearth fire
    ];
    const amb = 'rgb(22, 20, 36)'; // Cozy dark night ambient

    // Layer 1: Background Room & Shelves
    const lRoom = this.drawLayer((ctx) => {
      ctx.drawImage(this.roomBg, 0, 0);
    });
    this.applyLight(lRoom, amb, lights);
    sctx.drawImage(lRoom, 0, 0);
    this.release(lRoom);

    // Layer 2: Characters (Scribe & Patrons)
    const lChars = this.drawLayer((ctx) => {
      this.drawScribe(ctx, t);
      this.drawPatrons(ctx, t);
    });
    this.applyLight(lChars, amb, lights);
    // Apply warm rim light on right edges facing lantern/hearth
    this.applyRim(lChars, -1.2, 0, 135, 20, 60, '255, 210, 120', 0.35);
    sctx.drawImage(lChars, 0, 0);
    this.release(lChars);

    // Layer 3: Bar Counter & Stools (Foreground)
    const lBar = this.drawLayer((ctx) => {
      ctx.drawImage(this.barSurface, 0, 0);
      // Extra details on bar: ale mugs, coin pouch, bar rags
      ctx.fillStyle = '#844c24';
      ctx.fillRect(80, 72, 5, 4); // small flagon
    });
    this.applyLight(lBar, amb, lights);
    this.applyRim(lBar, 0, 1.2, 23.5, 66, 50, '255, 220, 140', 0.45);
    sctx.drawImage(lBar, 0, 0);
    this.release(lBar);

    // Layer 4: Post-light Glowing Lights (Flame, lanterns, sparks)
    this.drawGlowingLights(sctx, t);

    // ───────── CRUSH TO PALETTE ─────────
    const finalCanvas = this.crush();

    // ───────── POST-CRUSH LETTERING & SPEECH BUBBLES ─────────
    // Draw directly onto art context so text remains razor-sharp!
    this.drawCommentBubble(this.actx);

    return finalCanvas;
  }
}
