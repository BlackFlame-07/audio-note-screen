/**
 * 16-Bit Pixel Art ASCII Swarm Engine (60 Cols x 80 Rows)
 * - Record mode: Soft fluid 2D Halftone Square Dot Matrix rippling gently with voice intensity
 * - Stop mode: Large Spotify Lyrics UI with active karaoke line illumination & 16-bit ambient dust
 * - Play mode: Multi-harmonic synth wave with side-to-side sweeping player line
 * - Cassette mode: 16-bit pixel art cassette with screws, label, spools & rotating reels
 * - All transformations feature 16-bit Bayer dither transitions
 */

import {
  BitmapSampler,
  AsciiPixelTarget,
  BITMAP_COLS,
  BITMAP_ROWS,
  BAYER_4X4,
  applyBayerDither,
} from './bitmapSampler';

export type AppState = 'IDLE' | 'RECORDING' | 'TRANSCRIBED' | 'PLAYING' | 'SAVING';
export type ThemeMode = 'WHITE' | 'DARK';

export interface PixelParticle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
  baseX: number;
  baseY: number;
  char: string;
  color: string;
  alpha: number;
  targetAlpha: number;
  isAssigned: boolean;
  isAccent: boolean;
  col: number;
  row: number;
}

export interface MemoChar {
  char: string;
  lineIndex: number;
  charIndexInLine: number;
  isAccent: boolean;
  tStart: number; // in seconds from start of speech
  tEnd: number;   // in seconds
  charX: number;  // pixel X coordinate on canvas
  charY: number;  // pixel Y coordinate on canvas
}

export interface MemoLineDef {
  text: string;
  accentRanges: [number, number][]; // [start, end]
}

export const MEMO_LINE_DEFS: MemoLineDef[] = [
  {
    text: "Good morning, Alexey.",
    accentRanges: [[14, 21]], // "Alexey."
  },
  {
    text: "You have 3 meetings,",
    accentRanges: [[9, 20]], // "3 meetings,"
  },
  {
    text: "2 tasks and 1 habit",
    accentRanges: [[0, 7]], // "2 tasks"
  },
  {
    text: "today. You're mostly free",
    accentRanges: [[14, 25]], // "mostly free"
  },
  {
    text: "after 4 pm.",
    accentRanges: [[6, 11]], // "4 pm."
  },
];

export const LINE_Y_POSITIONS = [145, 223, 263, 303, 343];

/**
 * Builds the exact letter-by-letter acoustic speech timeline
 * with genuine conversational punctuation pauses (~160-170 WPM).
 */
export function buildMemoChars(): { chars: MemoChar[]; totalDuration: number; lineStartTimes: number[] } {
  const chars: MemoChar[] = [];
  const lineStartTimes: number[] = [];
  let currentTime = 0;

  for (let lIdx = 0; lIdx < MEMO_LINE_DEFS.length; lIdx++) {
    const lineDef = MEMO_LINE_DEFS[lIdx];
    lineStartTimes.push(currentTime);

    for (let cIdx = 0; cIdx < lineDef.text.length; cIdx++) {
      const char = lineDef.text[cIdx];
      const isAccent = lineDef.accentRanges.some(([start, end]) => cIdx >= start && cIdx < end);

      const tStart = currentTime;
      let duration = 0.046; // Base char duration for brisk conversational speech

      // Punctuation pauses in normal human talking cadence
      if (char === ',') {
        duration += 0.28; // Comma clause breathing pause (280ms)
      } else if (char === '.') {
        if (lIdx === 0) {
          duration += 0.62; // Salutation paragraph pause (620ms)
        } else if (lIdx === 3 && cIdx < 10) {
          duration += 0.42; // Sentence stop pause after "today." (420ms)
        } else {
          duration += 0.45; // Final period pause (450ms)
        }
      } else if (cIdx === lineDef.text.length - 1 && lIdx === 2) {
        duration += 0.16; // Inter-line phrase cadence pause (160ms)
      }

      const tEnd = tStart + duration;
      chars.push({
        char,
        lineIndex: lIdx,
        charIndexInLine: cIdx,
        isAccent,
        tStart,
        tEnd,
        charX: 0,
        charY: LINE_Y_POSITIONS[lIdx],
      });

      currentTime = tEnd;
    }
  }

  return { chars, totalDuration: currentTime, lineStartTimes };
}

export const PARTICLE_COUNT = 4800; // 60 cols x 80 rows full-frame dot matrix
const IDLE_GLYPHS = ['.', '·', ':', '+', '*'];

export class AsciiPixelEngine {
  public particles: PixelParticle[] = [];
  public sampler: BitmapSampler;
  public width: number = 366;
  public height: number = 532;
  public cellW: number = 6.1;
  public cellH: number = 6.65;
  public originX: number = 0;
  public originY: number = 0;

  public state: AppState = 'IDLE';
  public theme: ThemeMode = 'DARK';
  public tapeName: string = 'NOTE_01';
  public spokeAngle: number = 0;
  public playheadCol: number = 0;

  public activeLyricIndex: number = 0;
  public manualLyricIndex: number = -1;
  public readingProgress: number = 0;
  public readingProgressSec: number = 0;
  public memoChars: MemoChar[] = [];
  public totalSpeakingDuration: number = 6.63;
  public holdDuration: number = 1.60;
  public lineStartTimes: number[] = [0.0, 1.87, 3.07, 4.10, 5.67];
  public currentTimeSec: number = 0;
  public currentAudioEnergy: number = 0.1;
  private isCharLayoutReady: boolean = false;
  private lastTimeSec: number = 0;

  public transitionProgress: number = 1.0;
  public prevState: AppState = 'IDLE';

  public isEjecting: boolean = false;
  public ejectVelocity: number = 0;
  public onEjectComplete?: () => void;

  constructor() {
    this.sampler = new BitmapSampler();
    this.initParticlePool();
    const timeline = buildMemoChars();
    this.memoChars = timeline.chars;
    this.totalSpeakingDuration = timeline.totalDuration;
    this.lineStartTimes = timeline.lineStartTimes;
  }

  public resize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.cellW = w / BITMAP_COLS;
    this.cellH = h / BITMAP_ROWS;
    this.originX = 0;
    this.originY = 0;
    this.isCharLayoutReady = false;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const col = i % BITMAP_COLS;
      const row = Math.floor(i / BITMAP_COLS) % BITMAP_ROWS;
      p.baseX = this.originX + col * this.cellW + this.cellW / 2;
      p.baseY = this.originY + row * this.cellH + this.cellH / 2;
      p.col = col;
      p.row = row;
      if (p.x === 0 && p.y === 0) {
        p.x = p.baseX;
        p.y = p.baseY;
      }
    }
  }

  public initParticlePool() {
    this.particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const col = i % BITMAP_COLS;
      const row = Math.floor(i / BITMAP_COLS) % BITMAP_ROWS;
      const baseX = col * this.cellW + this.cellW / 2;
      const baseY = row * this.cellH + this.cellH / 2;

      this.particles.push({
        id: i,
        x: baseX,
        y: baseY,
        vx: 0,
        vy: 0,
        targetX: baseX,
        targetY: baseY,
        baseX,
        baseY,
        char: '.',
        color: '#72727A',
        alpha: 0.25,
        targetAlpha: 0.25,
        isAssigned: false,
        isAccent: false,
        col,
        row,
      });
    }
  }

  public setState(nextState: AppState) {
    if (this.state !== nextState) {
      this.prevState = this.state;
      this.state = nextState;
      this.transitionProgress = 0.0;
      this.isEjecting = false;
      this.ejectVelocity = 0;
      if (nextState === 'TRANSCRIBED') {
        this.readingProgressSec = 0;
      }
    }
  }

  public seekToLine(lineIdx: number) {
    if (lineIdx >= 0 && lineIdx < this.lineStartTimes.length) {
      this.readingProgressSec = this.lineStartTimes[lineIdx];
    }
  }

  public markCharLayoutDirty() {
    this.isCharLayoutReady = false;
  }

  public layoutMemoChars(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.font = '600 19px "Pixelify Sans", "Silkscreen", "JetBrains Mono", monospace';
    const startX = 24;

    for (let lIdx = 0; lIdx < MEMO_LINE_DEFS.length; lIdx++) {
      const lineText = MEMO_LINE_DEFS[lIdx].text;
      const lineChars = this.memoChars.filter(c => c.lineIndex === lIdx);

      for (let i = 0; i < lineChars.length; i++) {
        const c = lineChars[i];
        c.charX = startX + ctx.measureText(lineText.substring(0, c.charIndexInLine)).width;
        c.charY = LINE_Y_POSITIONS[lIdx];
      }
    }
    ctx.restore();
    this.isCharLayoutReady = true;
  }

  public triggerEject(onComplete?: () => void) {
    this.isEjecting = true;
    this.ejectVelocity = 18;
    this.onEjectComplete = onComplete;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.vx = 16 + Math.random() * 8;
      p.vy += (Math.random() - 0.5) * 3;
    }
  }

  /**
   * Main Per-Frame Swarm Physics & Target Calculation (60fps)
   */
  public update(timeMs: number, audioEnergy: number = 0.1) {
    const timeSec = timeMs * 0.001;
    const dt = this.lastTimeSec > 0 ? Math.min(0.1, Math.max(0.001, timeSec - this.lastTimeSec)) : 0.016;
    this.lastTimeSec = timeSec;
    this.currentTimeSec = timeSec;
    this.currentAudioEnergy = audioEnergy;

    const isWhite = this.theme === 'WHITE';
    const primaryColor = isWhite ? '#000000' : '#FFFFFF';
    const mutedColor = isWhite ? '#71717A' : '#72727A';
    const accentColor = isWhite ? '#000000' : '#EF4444';

    this.spokeAngle += 0.08;
    this.playheadCol = (Math.sin(timeSec * 2.2) * 0.5 + 0.5) * (BITMAP_COLS - 1);

    // Letter-by-letter continuous reading progression with natural punctuation pauses
    if (this.state === 'TRANSCRIBED') {
      this.readingProgressSec += dt;
      const totalCycle = this.totalSpeakingDuration + this.holdDuration;
      if (this.readingProgressSec > totalCycle) {
        this.readingProgressSec = 0;
      }
    }

    if (this.transitionProgress < 1.0) {
      this.transitionProgress = Math.min(1.0, this.transitionProgress + 0.085);
    }

    // Handle cassette ejection animation
    if (this.isEjecting) {
      this.ejectVelocity *= 1.04;
      let allOffscreen = true;

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        p.x += this.ejectVelocity;
        p.vx = this.ejectVelocity;
        if (p.x < this.width + 60) {
          allOffscreen = false;
        }
      }

      if (allOffscreen) {
        this.isEjecting = false;
        this.setState('IDLE');
        if (this.onEjectComplete) {
          this.onEjectComplete();
        }
        for (let i = 0; i < this.particles.length; i++) {
          const p = this.particles[i];
          p.x = p.baseX;
          p.y = p.baseY;
          p.vx = 0;
          p.vy = 0;
        }
      }
      return;
    }

    // =========================================================================
    // STATE 2: RECORDING (Halftone Fluid Organic Blob Field)
    // Swarm particles rest in background ready for state transitions
    // =========================================================================
    if (this.state === 'RECORDING') {
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        p.targetX = p.baseX;
        p.targetY = p.baseY;
        p.targetAlpha = 0;
        p.x += (p.targetX - p.x) * 0.15;
        p.y += (p.targetY - p.y) * 0.15;
        p.alpha += (0 - p.alpha) * 0.15;
      }
      return;
    }

    // =========================================================================
    // STATE 4: PLAYING (Full-Width Synth Wave + Sweeping Player Line)
    // =========================================================================
    if (this.state === 'PLAYING') {
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        const c = p.col;
        const r = p.row;

        p.targetX = p.baseX;
        p.targetY = p.baseY;

        const waveY =
          40 +
          Math.sin(c * 0.16 + timeSec * 4.0) * 12 +
          Math.sin(c * 0.34 - timeSec * 2.8) * 6 +
          Math.cos(c * 0.08 + timeSec * 1.6) * 4;

        const dist = Math.abs(r - waveY);
        const isPlayhead = Math.abs(c - this.playheadCol) < 1.2;

        if (dist <= 8) {
          const lum = Math.max(0, 1 - dist / 8.5);
          const dithered = applyBayerDither(lum, c, r, 0.2);

          if (isPlayhead) {
            p.char = '█';
            p.color = '#FFFFFF';
            p.targetAlpha = 1.0;
          } else if (dithered > 0.8) {
            p.char = '█';
            p.color = primaryColor;
            p.targetAlpha = 1.0;
          } else if (dithered > 0.6) {
            p.char = '■';
            p.color = primaryColor;
            p.targetAlpha = 0.95;
          } else if (dithered > 0.42) {
            p.char = '▪';
            p.color = primaryColor;
            p.targetAlpha = 0.85;
          } else if (dithered > 0.26) {
            p.char = '+';
            p.color = isWhite ? '#52525B' : mutedColor;
            p.targetAlpha = 0.65;
          } else if (dithered > 0.12) {
            p.char = ':';
            p.color = isWhite ? '#71717A' : mutedColor;
            p.targetAlpha = 0.45;
          } else {
            p.char = '·';
            p.color = isWhite ? '#A1A1AA' : mutedColor;
            p.targetAlpha = 0.25;
          }
        } else {
          // Subtle stippled background outside the synth wave
          const bgDither = applyBayerDither(0.04, c, r, 0.15);
          if (bgDither > 0.1) {
            p.char = '.';
            p.color = isWhite ? '#D4D4D8' : '#27272A';
            p.targetAlpha = 0.18;
          } else {
            p.char = ' ';
            p.targetAlpha = 0.0;
          }
        }

        p.x += (p.targetX - p.x) * 0.22;
        p.y += (p.targetY - p.y) * 0.22;
        p.alpha += (p.targetAlpha - p.alpha) * 0.2;
      }
      return;
    }

    // =========================================================================
    // STATE 3 (STOP/TRANSCRIBED): Ambient Background ASCII Constellation
    // =========================================================================
    if (this.state === 'TRANSCRIBED') {
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        p.isAssigned = false;
        p.isAccent = false;

        const curlX = Math.sin(timeSec * 0.5 + p.id * 0.1) * 8;
        const curlY = Math.cos(timeSec * 0.4 + p.id * 0.08) * 6;

        p.targetX = p.baseX + curlX;
        p.targetY = p.baseY + curlY;

        const idleIdx = Math.floor(timeSec * 1.2 + p.id * 0.08) % IDLE_GLYPHS.length;
        p.char = IDLE_GLYPHS[idleIdx];
        p.color = isWhite ? '#D4D4D8' : '#272730';
        p.targetAlpha = 0.12 + Math.sin(timeSec * 1.5 + p.id * 0.2) * 0.06;

        p.x += (p.targetX - p.x) * 0.15;
        p.y += (p.targetY - p.y) * 0.15;
        p.alpha += (p.targetAlpha - p.alpha) * 0.15;
      }
      return;
    }

    // =========================================================================
    // STATES 1, 5: Swarm Targets from 16-Bit Sampler (CASSETTE / IDLE)
    // =========================================================================
    let sampledTargets: AsciiPixelTarget[] = [];
    if (this.state === 'SAVING') {
      sampledTargets = this.sampler.rasterizeCassetteTape(this.tapeName, this.spokeAngle);
    }

    const hasTargets = sampledTargets.length > 0;
    const totalSampled = sampledTargets.length;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      const bayerVal = BAYER_4X4[p.row % 4][p.col % 4] / 16;
      const isPixelTransitioned = this.transitionProgress >= bayerVal * 0.85;

      if (hasTargets && i < totalSampled && isPixelTransitioned) {
        const target = sampledTargets[i];
        p.isAssigned = true;
        p.isAccent = target.isAccent;
        p.targetX = target.x;
        p.targetY = target.y;
        p.char = target.char;

        if (target.isAccent) {
          p.color = '#EF4444';
          p.targetAlpha = 1.0;
        } else if (target.lum > 0.8) {
          p.color = primaryColor;
          p.targetAlpha = 1.0;
        } else if (target.lum > 0.3) {
          p.color = isWhite ? '#8E8E93' : '#71717A';
          p.targetAlpha = 0.85;
        } else {
          p.color = isWhite ? '#E4E4E7' : '#27272A';
          p.targetAlpha = 0.15;
        }
      } else {
        // IDLE State: 16-bit Floating Pixel Dust
        p.isAssigned = false;
        p.isAccent = false;

        const curlX =
          Math.sin(timeSec * 0.8 + p.id * 0.15) * 16 +
          Math.cos(timeSec * 0.4 + p.baseY * 0.05) * 10;
        const curlY =
          Math.cos(timeSec * 0.7 + p.id * 0.12) * 14 +
          Math.sin(timeSec * 0.5 + p.baseX * 0.05) * 8;

        p.targetX = p.baseX + curlX;
        p.targetY = p.baseY + curlY;

        const idleIdx = Math.floor(timeSec * 1.5 + p.id * 0.1) % IDLE_GLYPHS.length;
        p.char = IDLE_GLYPHS[idleIdx];
        p.color = isWhite ? '#27272A' : '#484852';
        p.targetAlpha = hasTargets ? 0.03 : 0.22 + Math.sin(timeSec * 2 + p.id) * 0.08;
      }

      // Spring-accelerated flight with 16-bit discrete stepping
      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;

      p.vx = (p.vx + dx * 0.1) * 0.74;
      p.vy = (p.vy + dy * 0.1) * 0.74;

      p.x += p.vx;
      p.y += p.vy;
      p.alpha += (p.targetAlpha - p.alpha) * 0.18;
    }
  }

  /**
   * State 2: RECORDING
   * Halftone Fluid Organic Blob Field (Liquid Halftone Matrix)
   * Derived 1:1 from user reference: multi-harmonic organic metaballs sampled
   * onto a 2D halftone screen with volumetric core underglow, squarcle saturation, and voice reactivity.
   */
  public renderRecordingHalftone(ctx: CanvasRenderingContext2D) {
    // In RECORDING mode, render the signature blue halftone fluid matrix matching the reference brief
    const isWhite = true;
    const voiceAmp = Math.max(0.10, Math.min(0.95, this.currentAudioEnergy));
    const t = this.currentTimeSec * 0.75;

    const COLS = 50;
    const ROWS = 72;
    const cellW = this.width / COLS;
    const cellH = this.height / ROWS;

    // Organic morphing metaball attractors positioned to match reference composition
    const blobs = [
      // Top-left macro cloud
      {
        x: this.width * (0.16 + Math.sin(t * 0.7) * 0.05),
        y: this.height * (0.10 + Math.cos(t * 0.6) * 0.04),
        rx: 130, ry: 105,
        power: 1.1,
        hasWhiteCore: true,
      },
      // Top-center luminous core
      {
        x: this.width * (0.52 + Math.cos(t * 0.8) * 0.06),
        y: this.height * (0.12 + Math.sin(t * 0.7) * 0.04),
        rx: 100, ry: 85,
        power: 1.15,
        hasWhiteCore: true,
      },
      // Center-left standalone droplet
      {
        x: this.width * (0.22 + Math.sin(t * 1.0 + 1.2) * 0.04),
        y: this.height * (0.42 + Math.cos(t * 0.9 + 1.5) * 0.04),
        rx: 46, ry: 46,
        power: 1.05,
        hasWhiteCore: false,
      },
      // Right-center edge cluster
      {
        x: this.width * (0.94 + Math.sin(t * 0.6 + 2.5) * 0.04),
        y: this.height * (0.40 + Math.cos(t * 0.8 + 2.0) * 0.05),
        rx: 85, ry: 95,
        power: 1.0,
        hasWhiteCore: true,
      },
      // Lower-center wide peninsula
      {
        x: this.width * (0.34 + Math.cos(t * 0.5 + 3.1) * 0.06),
        y: this.height * (0.64 + Math.sin(t * 0.7 + 3.0) * 0.05),
        rx: 125, ry: 80,
        power: 1.05,
        hasWhiteCore: true,
      },
      // Bottom-right cluster
      {
        x: this.width * (0.85 + Math.sin(t * 0.7 + 4.2) * 0.05),
        y: this.height * (0.84 + Math.cos(t * 0.6 + 4.0) * 0.05),
        rx: 90, ry: 80,
        power: 1.0,
        hasWhiteCore: true,
      },
      // Bottom-left edge anchor
      {
        x: this.width * (0.08 + Math.cos(t * 0.8 + 5.0) * 0.04),
        y: this.height * (0.88 + Math.sin(t * 0.6 + 5.2) * 0.04),
        rx: 85, ry: 80,
        power: 0.95,
        hasWhiteCore: false,
      },
    ];

    // 1. Volumetric Underglow Layer (soft milky-white core bloom)
    for (const b of blobs) {
      if (!b.hasWhiteCore) continue;
      const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.rx * 0.95);
      if (isWhite) {
        grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
        grad.addColorStop(0.35, 'rgba(235, 245, 255, 0.90)');
        grad.addColorStop(0.70, 'rgba(219, 234, 254, 0.45)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      } else {
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
        grad.addColorStop(0.35, 'rgba(56, 189, 248, 0.25)');
        grad.addColorStop(0.70, 'rgba(59, 130, 246, 0.12)');
        grad.addColorStop(1, 'rgba(10, 10, 12, 0)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.rx * 0.95, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. 2D Halftone Dot Grid Sampling with Harmonic Turbulence & Audio Reactive Swell
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cx = c * cellW + cellW / 2;
        const cy = r * cellH + cellH / 2;
        const nx = c / COLS;
        const ny = r / ROWS;

        // Fluid wave noise & eddy currents
        const turbulence =
          Math.sin(nx * 4.8 + ny * 4.2 + t * 1.1) * 0.12 +
          Math.cos(nx * 6.5 - ny * 5.8 - t * 0.9) * 0.09 +
          Math.sin((nx + ny) * 7.0 + t * 1.5) * 0.05;

        // Sum metaball potentials
        let potential = 0;
        for (const b of blobs) {
          const dx = (cx - b.x) / b.rx;
          const dy = (cy - b.y) / b.ry;
          const distSq = dx * dx + dy * dy;
          if (distSq < 2.2) {
            potential += b.power * Math.exp(-distSq * 1.75);
          }
        }

        // Voice audio reactive swell
        const rawField = (potential + turbulence) * (1.0 + voiceAmp * 0.28);

        // Threshold for clean negative channels
        const threshold = 0.34;
        if (rawField < threshold) continue;

        const normField = Math.min(1.0, (rawField - threshold) / 0.85);

        // Dot size calculation: scales with field, never touching neighbors to preserve halftone grid
        const maxRadius = Math.min(cellW, cellH) * 0.44; // ~2.8px radius
        const dotRadius = Math.max(0.65, normField * maxRadius);

        // Authentic Color Palette from Reference Image
        let dotColor = '#3B82F6';
        let alpha = 1.0;

        if (isWhite) {
          if (normField > 0.82) {
            dotColor = '#93C5FD'; // Light milky sky-blue in core
            alpha = 0.92;
          } else if (normField > 0.60) {
            dotColor = '#60A5FA'; // Vibrant cerulean
            alpha = 0.98;
          } else if (normField > 0.32) {
            dotColor = '#3B82F6'; // Cobalt blue
            alpha = 1.0;
          } else {
            dotColor = '#2563EB'; // Rich shoreline blue
            alpha = 0.95;
          }
        } else {
          if (normField > 0.82) {
            dotColor = '#FFFFFF'; // Radiant white core
            alpha = 1.0;
          } else if (normField > 0.60) {
            dotColor = '#38BDF8'; // Sky cyan
            alpha = 0.96;
          } else if (normField > 0.32) {
            dotColor = '#3B82F6'; // Electric blue
            alpha = 0.92;
          } else {
            dotColor = '#1D4ED8'; // Deep cobalt edge
            alpha = 0.78;
          }
        }

        ctx.fillStyle = dotColor;
        ctx.globalAlpha = alpha;
        ctx.beginPath();

        if (normField > 0.68) {
          // Halftone rounded squarcle under high ink saturation
          const side = dotRadius * 1.95;
          const corner = side * 0.36;
          ctx.roundRect(cx - side / 2, cy - side / 2, side, side, corner);
        } else {
          // Crisp circular halftone dot
          ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1.0;
  }

  /**
   * Single-Pass Canvas 2D Draw Call
   */
  public render(ctx: CanvasRenderingContext2D, isZoomed: boolean = false) {
    ctx.save();
    
    // Canvas Well Background: Pure paper white for RECORDING fluid matrix (matching brief), dark carbon for other states
    const isWhite = this.theme === 'WHITE' || this.state === 'RECORDING';
    ctx.fillStyle = isWhite ? '#FFFFFF' : '#0A0A0C';
    ctx.fillRect(0, 0, this.width, this.height);

    if (isZoomed) {
      const zoom = 1.5;
      ctx.translate(this.width / 2, this.height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-this.width / 2, -this.height / 2);
    }

    // 1. Render Visual Matrix Core
    if (this.state === 'RECORDING') {
      this.renderRecordingHalftone(ctx);
    } else {
      let currentFont = '500 6px "JetBrains Mono", monospace';
      ctx.font = currentFont;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        if (p.char === ' ' || p.alpha <= 0.02) continue;

        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
        ctx.fillText(p.char, p.x, p.y);
      }
    }

    // 2. STATE 3: SPOTIFY LYRICS UI & KARAOKE ILLUMINATION
    if (this.state === 'TRANSCRIBED') {
      ctx.save();
      
      // Top Header: "Mon ●" + Date
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      // "Mon" Display
      ctx.font = '700 22px "Pixelify Sans", "Silkscreen", "JetBrains Mono", monospace';
      ctx.fillStyle = isWhite ? '#000000' : '#FFFFFF';
      ctx.globalAlpha = 1.0;
      ctx.fillText('Mon', 20, 36);

      // Coral Dot
      ctx.fillStyle = '#EF4444';
      ctx.font = '700 12px monospace';
      ctx.fillText('●', 78, 36);

      // Date right aligned
      ctx.textAlign = 'right';
      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.fillStyle = isWhite ? '#71717A' : '#8E8E93';
      ctx.globalAlpha = 0.85;
      ctx.fillText('December 9', this.width - 20, 32);
      ctx.fillStyle = isWhite ? '#A1A1AA' : '#686872';
      ctx.fillText('2024', this.width - 20, 44);

      // Hairline rule below header
      ctx.strokeStyle = isWhite ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(20, 58);
      ctx.lineTo(this.width - 20, 58);
      ctx.stroke();

      // Paragraph Formatted Reading UI: Letter-by-Letter Acoustic Lighting
      if (!this.isCharLayoutReady) {
        this.layoutMemoChars(ctx);
      }

      const t = this.readingProgressSec;
      ctx.font = '600 19px "Pixelify Sans", "Silkscreen", "JetBrains Mono", monospace';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';

      for (let i = 0; i < this.memoChars.length; i++) {
        const mc = this.memoChars[i];
        if (mc.char === ' ') continue;

        ctx.save();
        if (t >= mc.tEnd) {
          // 1. Spoken / Already read: clean, solid, legible chalk white
          ctx.fillStyle = isWhite ? '#18181B' : '#E4E4E7';
          ctx.globalAlpha = mc.isAccent ? 1.0 : 0.85;
          ctx.shadowBlur = 0;
        } else if (t >= mc.tStart) {
          // 2. Currently being spoken / ignited: radiant blooming halation
          const progressInChar = (t - mc.tStart) / Math.max(0.001, mc.tEnd - mc.tStart);
          ctx.fillStyle = isWhite ? '#000000' : '#FFFFFF';
          ctx.globalAlpha = 1.0;
          if (!isWhite) {
            ctx.shadowColor = mc.isAccent
              ? 'rgba(255, 255, 255, 0.85)'
              : 'rgba(255, 255, 255, 0.60)';
            ctx.shadowBlur = Math.round(10 + Math.sin(progressInChar * Math.PI) * 8);
          }
        } else {
          // 3. Not yet spoken: soft graphite grey with gentle pre-warm
          const dtUntilStart = mc.tStart - t;
          if (dtUntilStart < 0.08) {
            const pre = (0.08 - dtUntilStart) / 0.08;
            ctx.globalAlpha = 0.20 + pre * 0.16;
          } else {
            ctx.globalAlpha = 0.20;
          }
          ctx.fillStyle = isWhite ? 'rgba(0, 0, 0, 0.28)' : 'rgba(255, 255, 255, 0.20)';
          ctx.shadowBlur = 0;
        }

        ctx.fillText(mc.char, mc.charX, mc.charY);
        ctx.restore();
      }

      // Footer Stats Row (Without Icons)
      ctx.strokeStyle = isWhite ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(20, 460);
      ctx.lineTo(this.width - 20, 460);
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.textBaseline = 'middle';

      const footerY = 482;
      // 4.7K steps
      ctx.fillStyle = isWhite ? '#000000' : '#FFFFFF';
      ctx.globalAlpha = 0.95;
      ctx.fillText('4.7K', 20, footerY);
      ctx.fillStyle = isWhite ? '#71717A' : '#72727A';
      ctx.globalAlpha = 0.75;
      ctx.fillText(' steps', 50, footerY);

      // 6:37 hours
      ctx.fillStyle = isWhite ? '#000000' : '#FFFFFF';
      ctx.globalAlpha = 0.95;
      ctx.fillText('6:37', 140, footerY);
      ctx.fillStyle = isWhite ? '#71717A' : '#72727A';
      ctx.globalAlpha = 0.75;
      ctx.fillText(' hours', 170, footerY);

      // 36 mins
      ctx.fillStyle = isWhite ? '#000000' : '#FFFFFF';
      ctx.globalAlpha = 0.95;
      ctx.fillText('36', 255, footerY);
      ctx.fillStyle = isWhite ? '#71717A' : '#72727A';
      ctx.globalAlpha = 0.75;
      ctx.fillText(' mins', 273, footerY);

      ctx.restore();
    }

    // 3. 1px Laser Player Line sweeping from side to side in PLAYING state
    if (this.state === 'PLAYING') {
      const px = this.originX + this.playheadCol * this.cellW + this.cellW / 2;
      const playheadColor = isWhite ? '#000000' : '#FFFFFF';

      ctx.strokeStyle = playheadColor;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(px, 6);
      ctx.lineTo(px, this.height - 6);
      ctx.stroke();

      ctx.fillStyle = playheadColor;
      ctx.globalAlpha = 1.0;
      ctx.fillRect(px - 1.5, 3, 3, 3);
      ctx.fillRect(px - 1.5, this.height - 6, 3, 3);
    }

    ctx.restore();
  }
}
