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
  seedX?: number;
  seedY?: number;
  scatterX?: number;
  scatterY?: number;
  stagger?: number;
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
  public fluidFlowPhase: number = 0;
  public currentAudioEnergy: number = 0.1;
  private isCharLayoutReady: boolean = false;
  private lastTimeSec: number = 0;

  public transitionProgress: number = 1.0;
  public prevState: AppState = 'IDLE';
  public isTransformingToStop: boolean = false;
  public stopTransformProgress: number = 0;

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
      const prev = this.state;
      this.prevState = this.state;
      this.state = nextState;
      this.transitionProgress = 0.0;
      this.isEjecting = false;
      this.ejectVelocity = 0;

      if (prev === 'RECORDING' && nextState === 'TRANSCRIBED') {
        this.triggerStopTransition();
      } else if (nextState === 'TRANSCRIBED') {
        this.isTransformingToStop = false;
        this.readingProgressSec = 0;
      }
    }
  }

  /**
   * Triggers the dispersion and typographic transformation
   * when transitioning from RECORDING fluid mode to TRANSCRIBED stop mode.
   */
  public triggerStopTransition() {
    this.isTransformingToStop = true;
    this.stopTransformProgress = 0.0;
    this.readingProgressSec = 0.0;

    // Snapshot active rounded fluid blob centers as departure points
    const t = this.fluidFlowPhase;
    const blobCenters = [
      { x: this.width * (0.38 + 0.22 * Math.sin(t * 0.45) + 0.08 * Math.cos(t * 0.90)), y: this.height * (0.24 + 0.12 * Math.cos(t * 0.38)) },
      { x: this.width * (0.58 + 0.22 * Math.cos(t * 0.36 + 1.6)), y: this.height * (0.64 + 0.14 * Math.sin(t * 0.42 + 0.9)) },
      { x: this.width * (0.48 + 0.32 * Math.sin(t * 0.72 + 2.5)), y: this.height * (0.44 + 0.30 * Math.cos(t * 0.65 + 1.8)) },
      { x: this.width * (0.22 + 0.15 * Math.cos(t * 0.80 + 3.8)), y: this.height * (0.52 + 0.20 * Math.sin(t * 0.60 + 2.4)) },
      { x: this.width * (0.88 + 0.08 * Math.sin(t * 0.48 + 1.0)), y: this.height * (0.16 + 0.12 * Math.cos(t * 0.58 + 3.2)) },
    ];

    for (let i = 0; i < this.memoChars.length; i++) {
      const c = this.memoChars[i];
      const blob = blobCenters[i % blobCenters.length];
      const seedAngle = (i * 1.37) % (Math.PI * 2);
      const seedDist = 12 + (i * 7) % 36;
      c.seedX = blob.x + Math.cos(seedAngle) * seedDist;
      c.seedY = blob.y + Math.sin(seedAngle) * seedDist;

      // Disperse outward with explosion momentum
      const scatterAngle = (i * 2.399) % (Math.PI * 2);
      const scatterDist = 45 + (i * 19) % 110;
      c.scatterX = c.seedX + Math.cos(scatterAngle) * scatterDist;
      c.scatterY = c.seedY + Math.sin(scatterAngle) * scatterDist;
      c.stagger = (i % 20) * 0.012;
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

    // Advance dynamic fluid flow phase with voice-reactive acceleration
    const clampedAudio = Math.max(0.001, Math.min(1.0, audioEnergy));
    const audioDbfs = 20 * Math.log10(clampedAudio);
    const audioPulse = Math.max(0, Math.min(1.0, (audioDbfs + 42) / 38));
    const flowVelocity = 0.80 + audioPulse * 0.45;
    this.fluidFlowPhase += dt * flowVelocity;

    const isWhite = this.theme === 'WHITE';
    const primaryColor = isWhite ? '#000000' : '#FFFFFF';
    const mutedColor = isWhite ? '#71717A' : '#72727A';
    const accentColor = isWhite ? '#000000' : '#EF4444';

    this.spokeAngle += 0.08;
    this.playheadCol = (Math.sin(timeSec * 2.2) * 0.5 + 0.5) * (BITMAP_COLS - 1);

    // Transformation from Recording to Stop mode or continuous karaoke reading
    if (this.isTransformingToStop) {
      // 1.1s cinematic dispersion and typographic transformation
      this.stopTransformProgress += dt / 1.1;
      if (this.stopTransformProgress >= 1.0) {
        this.stopTransformProgress = 1.0;
        this.isTransformingToStop = false;
        this.readingProgressSec = 0;
      }
    } else if (this.state === 'TRANSCRIBED') {
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
    // Pure Black & White Halftone Fluid Organic Blob Field
    // Dynamic morphing fluid metaball field with continuous orbital drifting,
    // rotational eccentricity stretching, amoebic surface waves, and decibel-driven resonance.
    const isWhite = this.theme === 'WHITE';
    
    // Decibel calculation: -50 dBFS (ambient room quiet) to 0 dBFS (peak voice)
    const clampedEnergy = Math.max(0.001, Math.min(1.0, this.currentAudioEnergy));
    const dbfs = 20 * Math.log10(clampedEnergy);
    // Voice gate: -42 dBFS baseline silence, -4 dBFS loud speech peak
    const pulseStrength = Math.max(0, Math.min(1.0, (dbfs + 42) / 38));
    
    // Use dynamic fluid flow phase for continuous organic evolution
    const t = this.fluidFlowPhase;
    // Decibel swell: 0.76x resting contraction -> 1.38x vocal expansion
    const swell = 0.76 + pulseStrength * 0.62;

    const COLS = 50;
    const ROWS = 72;
    const cellW = this.width / COLS;
    const cellH = this.height / ROWS;

    // Pure rounded, continuously circulating liquid metaballs with high surface tension
    const blobs = [
      // 1. Primary Upper Sphere
      {
        x: this.width * (0.38 + 0.22 * Math.sin(t * 0.45) + 0.08 * Math.cos(t * 0.90)),
        y: this.height * (0.24 + 0.12 * Math.cos(t * 0.38) + 0.05 * Math.sin(t * 0.85)),
        r: (82 + 10 * Math.sin(t * 0.60)) * swell,
        power: 1.15 * (0.85 + pulseStrength * 0.35),
        hasCore: true,
      },
      // 2. Primary Lower Sphere
      {
        x: this.width * (0.58 + 0.22 * Math.cos(t * 0.36 + 1.6) + 0.07 * Math.sin(t * 0.92)),
        y: this.height * (0.64 + 0.14 * Math.sin(t * 0.42 + 0.9) + 0.05 * Math.cos(t * 0.78)),
        r: (84 + 10 * Math.cos(t * 0.48 + 2.1)) * swell,
        power: 1.12 * (0.85 + pulseStrength * 0.35),
        hasCore: true,
      },
      // 3. Fast Orbiting Droplet Sphere
      {
        x: this.width * (0.48 + 0.32 * Math.sin(t * 0.72 + 2.5)),
        y: this.height * (0.44 + 0.30 * Math.cos(t * 0.65 + 1.8)),
        r: (36 + 6 * Math.sin(t * 0.85)) * swell,
        power: 1.05 * (0.85 + pulseStrength * 0.35),
        hasCore: false,
      },
      // 4. Buoyant Bead Sphere
      {
        x: this.width * (0.22 + 0.15 * Math.cos(t * 0.80 + 3.8)),
        y: this.height * (0.52 + 0.20 * Math.sin(t * 0.60 + 2.4)),
        r: (30 + 5 * Math.cos(t * 1.05)) * swell,
        power: 1.02 * (0.85 + pulseStrength * 0.35),
        hasCore: false,
      },
      // 5. Dynamic Upper-Right Influx Sphere
      {
        x: this.width * (0.88 + 0.08 * Math.sin(t * 0.48 + 1.0)),
        y: this.height * (0.16 + 0.12 * Math.cos(t * 0.58 + 3.2)),
        r: (72 + 10 * Math.sin(t * 0.68)) * swell,
        power: 1.05 * (0.85 + pulseStrength * 0.35),
        hasCore: true,
      },
      // 6. Dynamic Bottom-Left Peninsula Sphere
      {
        x: this.width * (0.14 + 0.09 * Math.cos(t * 0.52 + 4.6)),
        y: this.height * (0.84 + 0.08 * Math.sin(t * 0.44 + 1.4)),
        r: (75 + 10 * Math.cos(t * 0.56)) * swell,
        power: 1.06 * (0.85 + pulseStrength * 0.35),
        hasCore: true,
      },
      // 7. Dynamic Lower Satellite Sphere
      {
        x: this.width * (0.52 + 0.18 * Math.sin(t * 0.58 + 5.2)),
        y: this.height * (0.88 + 0.07 * Math.cos(t * 0.68 + 4.2)),
        r: (56 + 8 * Math.sin(t * 0.75)) * swell,
        power: 0.98 * (0.85 + pulseStrength * 0.35),
        hasCore: false,
      },
    ];

    // 1. Monochromatic Volumetric Core Underglow (pure circular gradient)
    for (const b of blobs) {
      if (!b.hasCore) continue;
      const gradRadius = b.r * 0.90;
      const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, gradRadius);
      const glowIntensity = 0.14 + pulseStrength * 0.30;
      if (isWhite) {
        grad.addColorStop(0, `rgba(0, 0, 0, ${glowIntensity * 0.4})`);
        grad.addColorStop(0.4, `rgba(0, 0, 0, ${glowIntensity * 0.15})`);
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      } else {
        grad.addColorStop(0, `rgba(255, 255, 255, ${glowIntensity})`);
        grad.addColorStop(0.4, `rgba(255, 255, 255, ${glowIntensity * 0.35})`);
        grad.addColorStop(1, 'rgba(10, 10, 12, 0)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, gradRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. 2D Halftone Dot Grid Sampling with Pure Spherical Meniscus Falloff
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cx = c * cellW + cellW / 2;
        const cy = r * cellH + cellH / 2;
        const nx = c / COLS;
        const ny = r / ROWS;

        // Fluid wave noise & eddy currents that dynamically swirl
        const turbulence =
          Math.sin(nx * 4.2 + ny * 3.8 + t * 1.1) * 0.09 +
          Math.cos(nx * 5.5 - ny * 5.0 - t * 0.9) * 0.07;

        // Acoustic voice shockwave ripples radiating through fluid
        const centerDist = Math.hypot(nx - 0.50, ny - 0.45);
        const acousticRipples = Math.sin(centerDist * 16.0 - t * 12.0) * (pulseStrength * 0.15);

        // Sum pure rounded circular potentials (zero polygonal distortion)
        let potential = 0;
        for (const b of blobs) {
          const dx = cx - b.x;
          const dy = cy - b.y;
          const distSq = (dx * dx + dy * dy) / (b.r * b.r);

          if (distSq < 2.2) {
            potential += b.power * Math.exp(-distSq * 1.80);
          }
        }

        const rawField = potential + turbulence + acousticRipples;
        // Dynamic threshold expands when speaking
        const threshold = 0.35 - pulseStrength * 0.08;
        if (rawField < threshold) continue;

        const normField = Math.min(1.0, (rawField - threshold) / (0.85 + pulseStrength * 0.25));

        // Dot size swells with decibels, staying on grid
        const maxRadius = Math.min(cellW, cellH) * (0.38 + pulseStrength * 0.12);
        const dotRadius = Math.max(0.65, normField * maxRadius);

        // PURE BLACK & WHITE HIGH-CONTRAST PALETTE
        let dotColor = '#FFFFFF';
        let alpha = 1.0;

        if (isWhite) {
          // Pure Paper White Canvas: Pitch Black & Charcoal Monochrome Dots
          if (normField > 0.80) {
            dotColor = '#000000';
            alpha = 1.0;
          } else if (normField > 0.55) {
            dotColor = '#18181B';
            alpha = 0.95;
          } else if (normField > 0.30) {
            dotColor = '#3F3F46';
            alpha = 0.88;
          } else {
            dotColor = '#71717A';
            alpha = 0.75;
          }
        } else {
          // Dark Carbon Canvas: Radiant White & Silver Monochrome Dots
          if (normField > 0.80) {
            dotColor = '#FFFFFF';
            alpha = 1.0;
          } else if (normField > 0.55) {
            dotColor = '#F4F4F5';
            alpha = 0.95;
          } else if (normField > 0.30) {
            dotColor = '#D4D4D8';
            alpha = 0.85;
          } else {
            dotColor = '#71717A';
            alpha = 0.65;
          }
        }

        ctx.fillStyle = dotColor;
        ctx.globalAlpha = alpha;
        ctx.beginPath();

        if (normField > 0.65) {
          // Halftone rounded squarcle under ink expansion
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
    
    // Canvas Well Background: Deep obsidian/carbon (#0A0A0C) for DARK, paper white (#FFFFFF) for WHITE
    const isWhite = this.theme === 'WHITE';
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

    // 2. STATE 3: SPOTIFY LYRICS UI & DISPERSE-TRANSFORM KINETICS
    if (this.state === 'TRANSCRIBED') {
      ctx.save();

      // Check if layout is ready
      if (!this.isCharLayoutReady) {
        this.layoutMemoChars(ctx);
      }

      const progress = this.stopTransformProgress;
      const isTransforming = this.isTransformingToStop;
      const headerAlpha = isTransforming ? Math.max(0, (progress - 0.65) / 0.35) : 1.0;

      // 1. Residual halftone dots dissolving in Phase 1
      if (isTransforming && progress < 0.38) {
        const dissolve = 1.0 - progress / 0.38;
        ctx.fillStyle = isWhite ? '#71717A' : '#FFFFFF';
        ctx.globalAlpha = dissolve * 0.30;
        for (let i = 0; i < 60; i++) {
          const gx = (i * 37) % this.width;
          const gy = (i * 59) % this.height;
          ctx.fillRect(gx, gy, 2, 2);
        }
      }

      // 2. Top Header: "Mon ●" + Date (fades in as words assemble)
      if (headerAlpha > 0.01) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        // "Mon" Display
        ctx.font = '700 22px "Pixelify Sans", "Silkscreen", "JetBrains Mono", monospace';
        ctx.fillStyle = isWhite ? '#000000' : '#FFFFFF';
        ctx.globalAlpha = headerAlpha;
        ctx.fillText('Mon', 20, 36);

        // Coral Dot
        ctx.fillStyle = '#EF4444';
        ctx.font = '700 12px monospace';
        ctx.fillText('●', 78, 36);

        // Date right aligned
        ctx.textAlign = 'right';
        ctx.font = '500 10px "JetBrains Mono", monospace';
        ctx.fillStyle = isWhite ? '#71717A' : '#8E8E93';
        ctx.globalAlpha = headerAlpha * 0.85;
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
      }

      // 3. Characters Rendering: Transformation vs Continuous Reading
      ctx.font = '600 19px "Pixelify Sans", "Silkscreen", "JetBrains Mono", monospace';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';

      if (isTransforming) {
        // DISPERSE & TRANSFORM KINETIC CHOREOGRAPHY
        const ASCII_SCRAMBLE = ['·', '+', '■', '░', '*', '▒', '▪', '#'];

        for (let i = 0; i < this.memoChars.length; i++) {
          const mc = this.memoChars[i];
          if (mc.char === ' ') continue;

          const stagger = mc.stagger || 0;
          const effP = Math.max(0, Math.min(1.0, (progress - stagger) / (1.0 - stagger)));

          let curX: number, curY: number, alpha: number, displayChar: string;

          if (effP < 0.32) {
            // Phase 1: Disperse outward from seed blob to scatter
            const p1 = effP / 0.32;
            const ease1 = 1 - Math.pow(1 - p1, 2);
            const seedX = mc.seedX ?? (this.width / 2);
            const seedY = mc.seedY ?? (this.height / 2);
            const scatterX = mc.scatterX ?? mc.charX;
            const scatterY = mc.scatterY ?? mc.charY;
            curX = seedX + (scatterX - seedX) * ease1;
            curY = seedY + (scatterY - seedY) * ease1;
            alpha = 0.5 + p1 * 0.5;
            displayChar = ASCII_SCRAMBLE[(i + Math.floor(progress * 28)) % ASCII_SCRAMBLE.length];
          } else {
            // Phase 2: Converge and transform into word position
            const p2 = (effP - 0.32) / 0.68;
            const ease2 = 1 - Math.pow(1 - p2, 3);
            const scatterX = mc.scatterX ?? mc.charX;
            const scatterY = mc.scatterY ?? mc.charY;
            curX = scatterX + (mc.charX - scatterX) * ease2;
            curY = scatterY + (mc.charY - scatterY) * ease2;
            alpha = 0.75 + p2 * 0.25;

            if (p2 > 0.65) {
              displayChar = mc.char;
            } else {
              displayChar = (p2 > 0.38 && (i % 2 === 0))
                ? mc.char
                : ASCII_SCRAMBLE[(i + Math.floor(progress * 18)) % ASCII_SCRAMBLE.length];
            }
          }

          ctx.fillStyle = isWhite ? '#000000' : (progress > 0.85 ? '#E4E4E7' : '#FFFFFF');
          ctx.globalAlpha = alpha;
          ctx.fillText(displayChar, curX, curY);
        }
      } else {
        // NORMAL LETTER-BY-LETTER KARAOKE READING
        const t = this.readingProgressSec;
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
      }

      // 4. Footer Stats Row (Without Icons - fades in with header)
      if (headerAlpha > 0.01) {
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
        ctx.globalAlpha = headerAlpha * 0.95;
        ctx.fillText('4.7K', 20, footerY);
        ctx.fillStyle = isWhite ? '#71717A' : '#72727A';
        ctx.globalAlpha = headerAlpha * 0.75;
        ctx.fillText(' steps', 50, footerY);

        // 6:37 hours
        ctx.fillStyle = isWhite ? '#000000' : '#FFFFFF';
        ctx.globalAlpha = headerAlpha * 0.95;
        ctx.fillText('6:37', 140, footerY);
        ctx.fillStyle = isWhite ? '#71717A' : '#72727A';
        ctx.globalAlpha = headerAlpha * 0.75;
        ctx.fillText(' hours', 170, footerY);

        // 36 mins
        ctx.fillStyle = isWhite ? '#000000' : '#FFFFFF';
        ctx.globalAlpha = headerAlpha * 0.95;
        ctx.fillText('36', 255, footerY);
        ctx.fillStyle = isWhite ? '#71717A' : '#72727A';
        ctx.globalAlpha = headerAlpha * 0.75;
        ctx.fillText(' mins', 273, footerY);
      }

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
