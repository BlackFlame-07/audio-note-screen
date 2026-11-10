/**
 * 16-Bit Bayer Dithered ASCII Bitmap Sampler (60x80)
 * Optimized for White Background + Black ASCII & Particles
 */

export const BITMAP_COLS = 60;
export const BITMAP_ROWS = 80;

export const HALFTONE_RAMP = " .·:▪■█";
export const RAMP = " .·:-=+*#%@█";

// 4x4 Bayer Matrix for 16-bit ordered cross-hatch dithering
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

// 16-Bit Transcribed Audio Note Template
const TRANSCRIPTION_CARD = [
  "┌──────────────────────────────────────────────────────┐",
  "│ AUDIO NOTE // 00:14.82                48kHz / 24-BIT │",
  "├──────────────────────────────────────────────────────┤",
  "│ TRANSCRIPTION LOG:                                   │",
  "│                                                      │",
  "│ > \"Met with the hardware engineering team today.     │",
  "│    Finalized 16-bit ASCII dither engine for deck.    │",
  "│    Targeting 60fps locked canvas with zero overhead. │",
  "│    Reel servo mechanics & tape tension verified.     │",
  "│    Ready to ship firmware v2.0.\"                     │",
  "│                                                      │",
  "│ [STATUS: BUFFER SAVED TO MEMORY // AWAITING EJECT]   │",
  "└──────────────────────────────────────────────────────┘",
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
   * STATE 3: STOP / TRANSCRIBED (Small Crisp Audio Transcription Note)
   */
  public rasterizeTranscribedNote(cellW = 6.1, cellH = 6.65): AsciiPixelTarget[] {
    const activePixels: AsciiPixelTarget[] = [];
    const startCol = 2;
    const startRow = 24;
    const cardHeight = TRANSCRIPTION_CARD.length;
    const cardWidth = TRANSCRIPTION_CARD[0].length;

    for (let r = 0; r < BITMAP_ROWS; r++) {
      for (let c = 0; c < BITMAP_COLS; c++) {
        const relRow = r - startRow;
        const relCol = c - startCol;

        if (relRow >= 0 && relRow < cardHeight && relCol >= 0 && relCol < cardWidth) {
          const char = TRANSCRIPTION_CARD[relRow][relCol] || ' ';
          if (char !== ' ') {
            const isAccent = relRow === 1 && relCol > 38;
            activePixels.push({
              x: c * cellW + cellW / 2,
              y: r * cellH + cellH / 2,
              char,
              lum: isAccent ? 1.0 : 0.95,
              isAccent,
              col: c,
              row: r,
            });
          }
        } else {
          // Subtle Bayer dither stipple around memo
          const dither = applyBayerDither(0.08, c, r, 0.2);
          if (dither > 0.14) {
            activePixels.push({
              x: c * cellW + cellW / 2,
              y: r * cellH + cellH / 2,
              char: '.',
              lum: 0.12,
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
          ctx.fillStyle = 'rgba(5, 150, 105, 1.0)'; // Emerald CAD Green playhead reflection
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

    const displayTapeName = (tapeName || 'NOTE_01').toUpperCase();
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 5.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayTapeName.slice(0, 10), 30, 31);

    ctx.font = '3px "JetBrains Mono", monospace';
    ctx.fillText('A-SIDE // 48kHz', 30, 35);

    // 3. Center Transparent Window (col: 13..47, row: 38..48)
    ctx.fillStyle = '#181818';
    ctx.fillRect(13, 38, 34, 10);

    ctx.fillStyle = '#553311';
    ctx.fillRect(26, 41, 8, 4);

    // 4. Dual 16-Bit Circular Reel Cutouts
    const leftReel = { x: 20, y: 43 };
    const rightReel = { x: 40, y: 43 };

    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(leftReel.x, leftReel.y, 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(rightReel.x, rightReel.y, 5.5, 0, Math.PI * 2);
    ctx.fill();

    // 5. 6-Tooth Rotating Reel Hub Spokes
    const spokeCount = 6;
    const spokeRadius = 4.8;
    ctx.fillStyle = '#059669';

    [leftReel, rightReel].forEach((reel) => {
      for (let s = 0; s < spokeCount; s++) {
        const angle = spokeAngle + (s * Math.PI * 2) / spokeCount;
        for (let rad = 1.2; rad <= spokeRadius; rad += 1.0) {
          const sc = Math.round(reel.x + Math.cos(angle) * rad);
          const sr = Math.round(reel.y + Math.sin(angle) * rad);
          if (sc >= 0 && sc < BITMAP_COLS && sr >= 0 && sr < BITMAP_ROWS) {
            ctx.fillRect(sc, sr, 1, 1);
          }
        }
      }
    });

    return sampleBitmapToAsciiPixels(ctx);
  }
}
