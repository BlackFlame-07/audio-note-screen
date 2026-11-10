/**
 * 16-Bit Pixel Art ASCII Bitmap Sampler (60 Cols x 80 Rows)
 * - Record: 4,800-cell 2D Halftone Square Dot Grid rippling with voice intensity
 * - Stop: Daily Briefing / Audio Transcription formatted with spoken text in black and others in grey
 * - Play: 16-bit synth wave with side-to-side sweeping player line
 * - Cassette: 16-bit pixel art cassette tape with screws, dynamic label, spools & rotating reels
 * - 4x4 Bayer ordered dither matrix for authentic 16-bit cross-hatch stippling
 */

export const BITMAP_COLS = 60;
export const BITMAP_ROWS = 80;

// High-taste luminance ramp with 16-bit square block terminal glyphs
export const RAMP = " .·:▪■█";

// 4x4 Bayer Dither Matrix (Normalized 0..15)
export const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export interface AsciiPixelTarget {
  x: number;
  y: number;
  char: string;
  lum: number;
  isAccent: boolean;
  col: number;
  row: number;
}

/**
 * Applies 16-bit Bayer ordered dithering to continuous luminance
 */
export function applyBayerDither(lum: number, col: number, row: number, spread = 0.22): number {
  const bayerVal = BAYER_4X4[row % 4][col % 4] / 16 - 0.5;
  const dithered = lum + bayerVal * spread;
  return Math.max(0, Math.min(1, dithered));
}

/**
 * Samples a 60x80 offscreen canvas with 16-bit Bayer dithering
 */
export function sampleBitmapToAsciiPixels(
  offCtx: CanvasRenderingContext2D,
  cols = BITMAP_COLS,
  rows = BITMAP_ROWS,
  cellW = 6.1,
  cellH = 6.65
): AsciiPixelTarget[] {
  const imgData = offCtx.getImageData(0, 0, cols, rows).data;
  const activePixels: AsciiPixelTarget[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = (r * cols + c) * 4;
      const red = imgData[i];
      const green = imgData[i + 1];
      const blue = imgData[i + 2];
      const alpha = imgData[i + 3];

      if (alpha > 20) {
        const rawLum = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
        const ditheredLum = applyBayerDither(rawLum, c, r, 0.25);
        const rampIdx = Math.min(RAMP.length - 1, Math.max(0, Math.floor(ditheredLum * RAMP.length)));

        // Detect Emerald CAD Green accent (#10B981 / #059669)
        const isAccent = green > 120 && red < 120 && blue < 160;

        activePixels.push({
          x: c * cellW + cellW / 2,
          y: r * cellH + cellH / 2,
          char: RAMP[rampIdx] || '.',
          lum: ditheredLum,
          isAccent,
          col: c,
          row: r,
        });
      }
    }
  }
  return activePixels;
}

export interface TextSegment {
  text: string;
  isBlack: boolean;
  isAccent?: boolean;
}

export interface TextLineDef {
  row: number;
  col: number;
  segments: TextSegment[];
}

// Pixel art display for "Mon"
const MON_BITMAP = [
  { row: 10, col: 6, text: "█   █" },
  { row: 11, col: 6, text: "██ ██  ··  ███" },
  { row: 12, col: 6, text: "█ █ █ █  █ █  █" },
  { row: 13, col: 6, text: "█   █ █  █ █  █" },
  { row: 14, col: 6, text: "█   █  ██  █  █" },
];

// Spoken text layout matching user reference:
// - Spoken text / key items: isBlack = true (renders in pure black #000000)
// - Scaffolding, dates & units: isBlack = false (renders in muted grey #8E8E93)
// - Without icons
const STOP_TEXT_LINES: TextLineDef[] = [
  // Date on the right of Mon
  {
    row: 11,
    col: 44,
    segments: [{ text: "December 9", isBlack: false }]
  },
  {
    row: 13,
    col: 50,
    segments: [{ text: "2024", isBlack: false }]
  },

  // Body Lines (Spoken text black, connectors grey, no icons)
  {
    row: 24,
    col: 6,
    segments: [
      { text: "Good morning, ", isBlack: false },
      { text: "Alexey.", isBlack: true }
    ]
  },
  {
    row: 30,
    col: 6,
    segments: [
      { text: "You have ", isBlack: false },
      { text: "3 meetings,", isBlack: true }
    ]
  },
  {
    row: 36,
    col: 6,
    segments: [
      { text: "2 tasks", isBlack: true },
      { text: " and ", isBlack: false },
      { text: "1 habit", isBlack: true }
    ]
  },
  {
    row: 42,
    col: 6,
    segments: [
      { text: "today. You're ", isBlack: false },
      { text: "mostly free", isBlack: true }
    ]
  },
  {
    row: 48,
    col: 6,
    segments: [
      { text: "after ", isBlack: false },
      { text: "4 pm.", isBlack: true }
    ]
  },

  // Footer stats without icons (numbers black, units grey)
  {
    row: 64,
    col: 6,
    segments: [
      { text: "4.7K", isBlack: true },
      { text: " steps    ", isBlack: false },
      { text: "6:37", isBlack: true },
      { text: " hours    ", isBlack: false },
      { text: "36", isBlack: true },
      { text: " mins", isBlack: false }
    ]
  }
];

export class BitmapSampler {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = BITMAP_COLS;
    this.canvas.height = BITMAP_ROWS;
    const context = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('Failed to create offscreen 2d context');
    }
    this.ctx = context;
  }

  /**
   * STATE 2: RECORDING (Halftone Square Dot Grid rippling with voice)
   */
  public rasterizeRecordingWaves(
    timeSec: number,
    audioEnergy: number,
    cellW = 6.1,
    cellH = 6.65
  ): AsciiPixelTarget[] {
    const activePixels: AsciiPixelTarget[] = [];
    const voiceAmp = Math.max(0.12, audioEnergy);
    const speed = 4.5 + voiceAmp * 12.0;

    for (let r = 0; r < BITMAP_ROWS; r++) {
      for (let c = 0; c < BITMAP_COLS; c++) {
        const d1 = Math.hypot(c - 26, (r - 36) * 0.88);
        const d2 = Math.hypot(c - 34, (r - 44) * 0.88);
        const w1 = Math.sin(d1 * 0.36 - timeSec * speed);
        const w2 = Math.sin(d2 * 0.42 - timeSec * (speed * 0.85));
        const w3 = Math.cos(c * 0.14 + r * 0.11 - timeSec * 3.2) * 0.35;
        const voiceBurst = Math.sin(timeSec * 22.0 + c * 0.45) * voiceAmp * 0.45;

        const distCenter = Math.hypot(c - 30, (r - 40) * 0.85);
        const halo = Math.exp(-distCenter * (0.048 / (1 + voiceAmp * 1.6))) * voiceAmp * 0.75;

        const composite = w1 * 0.45 + w2 * 0.32 + w3 + voiceBurst + halo + 0.32;
        const clampedLum = Math.max(0, Math.min(1, composite));
        const ditheredLum = applyBayerDither(clampedLum, c, r, 0.22);

        let char = ' ';
        if (ditheredLum > 0.88) {
          char = '█'; // Full block
        } else if (ditheredLum > 0.72) {
          char = '■'; // Large square
        } else if (ditheredLum > 0.54) {
          char = '▪'; // Small square
        } else if (ditheredLum > 0.38) {
          char = ':'; // Double dot
        } else if (ditheredLum > 0.22) {
          char = '·'; // Center dot
        } else if (ditheredLum > 0.10) {
          char = '.'; // Micro dot
        }

        if (char !== ' ') {
          const isAccent = ditheredLum > 0.92 && voiceAmp > 0.4;
          activePixels.push({
            x: c * cellW + cellW / 2,
            y: r * cellH + cellH / 2,
            char,
            lum: ditheredLum,
            isAccent,
            col: c,
            row: r,
          });
        }
      }
    }

    return activePixels;
  }

  /**
   * STATE 3: STOP / TRANSCRIBED (Daily Briefing / Audio Transcript with Spoken Text in Black and Others in Grey)
   */
  public rasterizeTranscribedNote(cellW = 6.1, cellH = 6.65): AsciiPixelTarget[] {
    const activePixels: AsciiPixelTarget[] = [];
    
    // Construct cell map
    const cellMap: Map<string, { char: string; lum: number; isAccent: boolean }> = new Map();

    // 1. Plot Big "Mon" Bitmap
    for (const line of MON_BITMAP) {
      for (let i = 0; i < line.text.length; i++) {
        const ch = line.text[i];
        if (ch !== ' ') {
          const c = line.col + i;
          const r = line.row;
          cellMap.set(`${c},${r}`, { char: ch, lum: 1.0, isAccent: false });
        }
      }
    }

    // Coral Indicator Dot at (row: 12, col: 23)
    cellMap.set(`23,12`, { char: '●', lum: 1.0, isAccent: true });

    // 2. Plot Text Lines (Date, Body Lines, Footer Stats)
    for (const lineDef of STOP_TEXT_LINES) {
      let currCol = lineDef.col;
      for (const seg of lineDef.segments) {
        for (let i = 0; i < seg.text.length; i++) {
          const ch = seg.text[i];
          if (ch !== ' ') {
            cellMap.set(`${currCol},${lineDef.row}`, {
              char: ch,
              lum: seg.isBlack ? 1.0 : 0.45,
              isAccent: seg.isAccent || false,
            });
          }
          currCol++;
        }
      }
    }

    // 3. Populate 60x80 Grid
    for (let r = 0; r < BITMAP_ROWS; r++) {
      for (let c = 0; c < BITMAP_COLS; c++) {
        const key = `${c},${r}`;
        const entry = cellMap.get(key);

        if (entry) {
          activePixels.push({
            x: c * cellW + cellW / 2,
            y: r * cellH + cellH / 2,
            char: entry.char,
            lum: entry.lum,
            isAccent: entry.isAccent,
            col: c,
            row: r,
          });
        } else {
          // Subtle ambient Bayer dither stipple outside the text
          const dither = applyBayerDither(0.04, c, r, 0.12);
          if (dither > 0.09) {
            activePixels.push({
              x: c * cellW + cellW / 2,
              y: r * cellH + cellH / 2,
              char: '.',
              lum: 0.1,
              isAccent: false,
              col: c,
              row: r,
            });
          }
        }
      }
    }

    return activePixels;
  }

  /**
   * STATE 4: PLAYING (16-Bit Synth Wave + Bouncing Player Line)
   */
  public rasterizeSynthWave(timeSec: number, playheadCol: number): AsciiPixelTarget[] {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, BITMAP_COLS, BITMAP_ROWS);

    for (let c = 0; c < BITMAP_COLS; c++) {
      const waveY =
        40 +
        Math.sin(c * 0.18 + timeSec * 4.5) * 14 +
        Math.sin(c * 0.38 - timeSec * 3.0) * 6 +
        Math.cos(c * 0.1 + timeSec * 1.5) * 4;

      const isPlayhead = Math.abs(c - playheadCol) < 1.4;

      for (let rOffset = -8; rOffset <= 8; rOffset++) {
        const r = Math.round(waveY + rOffset);
        if (r < 0 || r >= BITMAP_ROWS) continue;

        const dist = Math.abs(rOffset);
        const lum = Math.max(0, 255 - dist * 30);

        if (isPlayhead) {
          ctx.fillStyle = 'rgba(5, 150, 105, 1.0)';
        } else {
          ctx.fillStyle = `rgb(${lum}, ${lum}, ${lum})`;
        }
        ctx.fillRect(c, r, 1, 1);
      }
    }

    return sampleBitmapToAsciiPixels(ctx);
  }

  /**
   * STATE 5: CASSETTE (16-Bit Pixel Art Cassette Tape)
   */
  public rasterizeCassetteTape(tapeName: string, spokeAngle: number): AsciiPixelTarget[] {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, BITMAP_COLS, BITMAP_ROWS);

    // 1. Outer cassette shell (col: 5..55, row: 22..58)
    ctx.fillStyle = '#9C9C9C';
    ctx.fillRect(5, 22, 50, 36);

    // 4 Corner Screws (+)
    ctx.fillStyle = '#FFFFFF';
    const screws = [
      { x: 7, y: 24 },
      { x: 52, y: 24 },
      { x: 7, y: 55 },
      { x: 52, y: 55 },
    ];
    screws.forEach((s) => {
      ctx.fillRect(s.x, s.y - 1, 1, 3);
      ctx.fillRect(s.x - 1, s.y, 3, 1);
    });

    // Chamfer bottom corners
    ctx.clearRect(5, 54, 6, 5);
    ctx.clearRect(49, 54, 6, 5);

    // Lower tape-head aperture trapezoid
    ctx.fillStyle = '#3E3E3E';
    ctx.beginPath();
    ctx.moveTo(15, 58);
    ctx.lineTo(19, 49);
    ctx.lineTo(41, 49);
    ctx.lineTo(45, 58);
    ctx.closePath();
    ctx.fill();

    // 2. Top Label Band (col: 8..52, row: 26..36)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(8, 26, 44, 10);

    // Monospace stamped note title on cassette label
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 6px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tapeName || 'TAPE_01', 30, 31);

    // 3. Dual Tape Spool Wells (Left: col 16..24, Right: col 36..44, row 37..45)
    const spools = [
      { cx: 20, cy: 41 },
      { cx: 40, cy: 41 },
    ];

    spools.forEach((spool) => {
      // Spool outer ring
      ctx.fillStyle = '#1A1A1A';
      ctx.beginPath();
      ctx.arc(spool.cx, spool.cy, 5, 0, Math.PI * 2);
      ctx.fill();

      // Rotating teeth / spokes
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      for (let a = 0; a < 3; a++) {
        const rad = spokeAngle + (a * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.moveTo(spool.cx + Math.cos(rad) * 1.5, spool.cy + Math.sin(rad) * 1.5);
        ctx.lineTo(spool.cx + Math.cos(rad) * 4.5, spool.cy + Math.sin(rad) * 4.5);
        ctx.stroke();
      }

      // Spool center hole
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(spool.cx, spool.cy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // 4. Center transparent tape observation window
    ctx.fillStyle = '#222222';
    ctx.fillRect(26, 38, 8, 6);
    ctx.strokeStyle = '#666666';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(26, 38, 8, 6);

    return sampleBitmapToAsciiPixels(ctx);
  }
}
