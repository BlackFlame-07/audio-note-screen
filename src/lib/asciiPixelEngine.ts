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
  startX?: number;
  startY?: number;
  baseRadius?: number;
  scatterX?: number;
  scatterY?: number;
  stagger?: number;
}

export interface ContinuousTransitionPixel {
  p0x: number;
  p0y: number;
  p1x: number;
  p1y: number;
  p2x: number;
  p2y: number;
  p3x: number;
  p3y: number;
  char: string;
  isAccent: boolean;
  radius: number;
  lineIndex: number;
  charIndexInLine: number;
  lineTotalChars: number;
  color?: string;
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
  public isRecordingPaused: boolean = false;
  public isTransformingToStop: boolean = false;
  public stopTransformProgress: number = 0;
  public onTranscribeComplete?: () => void;
  public onPlaybackComplete?: () => void;
  public continuousTransitionPixels: ContinuousTransitionPixel[] = [];

  public isEjecting: boolean = false;
  public ejectVelocity: number = 0;
  public onEjectComplete?: () => void;

  public setRecordingPaused(paused: boolean) {
    this.isRecordingPaused = paused;
  }

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
        this.triggerTranscribeTransition();
      } else if (nextState === 'TRANSCRIBED') {
        this.isTransformingToStop = false;
        this.readingProgressSec = 0;
      } else if (nextState === 'PLAYING') {
        this.readingProgressSec = 0;
      }
    }
  }

  /**
   * Captures the active record mode halftone dots visible on screen at this instant.
   */
  public sampleCurrentRecordingDots(): { x: number; y: number; r: number; dirX: number; dirY: number }[] {
    const dots: { x: number; y: number; r: number; dirX: number; dirY: number }[] = [];
    const t = this.fluidFlowPhase;
    const clampedEnergy = Math.max(0.001, Math.min(1.0, this.currentAudioEnergy));
    const dbfs = 20 * Math.log10(clampedEnergy);
    const pulseStrength = this.isRecordingPaused ? 0.0 : Math.max(0, Math.min(1.0, (dbfs + 42) / 38));
    const swell = this.isRecordingPaused ? 1.0 : (0.76 + pulseStrength * 0.62);
    const pulseFactor = this.isRecordingPaused ? 0.0 : 1.0;

    const blobs = [
      { x: this.width * (0.38 + 0.22 * Math.sin(t * 0.45) + 0.08 * Math.cos(t * 0.90)), y: this.height * (0.24 + 0.12 * Math.cos(t * 0.38) + 0.05 * Math.sin(t * 0.85)), r: (82 + 10 * Math.sin(t * 0.60) * pulseFactor) * swell, power: 1.15 },
      { x: this.width * (0.58 + 0.22 * Math.cos(t * 0.36 + 1.6) + 0.07 * Math.sin(t * 0.92)), y: this.height * (0.64 + 0.14 * Math.sin(t * 0.42 + 0.9) + 0.05 * Math.cos(t * 0.78)), r: (84 + 10 * Math.cos(t * 0.48 + 2.1) * pulseFactor) * swell, power: 1.12 },
      { x: this.width * (0.48 + 0.32 * Math.sin(t * 0.72 + 2.5)), y: this.height * (0.44 + 0.30 * Math.cos(t * 0.65 + 1.8)), r: (36 + 6 * Math.sin(t * 0.85) * pulseFactor) * swell, power: 1.05 },
      { x: this.width * (0.22 + 0.15 * Math.cos(t * 0.80 + 3.8)), y: this.height * (0.52 + 0.20 * Math.sin(t * 0.60 + 2.4)), r: (30 + 5 * Math.cos(t * 1.05) * pulseFactor) * swell, power: 1.02 },
      { x: this.width * (0.88 + 0.08 * Math.sin(t * 0.48 + 1.0)), y: this.height * (0.16 + 0.12 * Math.cos(t * 0.58 + 3.2)), r: (72 + 10 * Math.sin(t * 0.68) * pulseFactor) * swell, power: 1.05 },
      { x: this.width * (0.14 + 0.09 * Math.cos(t * 0.52 + 4.6)), y: this.height * (0.84 + 0.08 * Math.sin(t * 0.44 + 1.4)), r: (75 + 10 * Math.cos(t * 0.56) * pulseFactor) * swell, power: 1.06 },
      { x: this.width * (0.52 + 0.18 * Math.sin(t * 0.58 + 5.2)), y: this.height * (0.88 + 0.07 * Math.cos(t * 0.68 + 4.2)), r: (56 + 8 * Math.sin(t * 0.75) * pulseFactor) * swell, power: 0.98 },
    ];

    const COLS = 50;
    const ROWS = 72;
    const cellW = this.width / COLS;
    const cellH = this.height / ROWS;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cx = c * cellW + cellW / 2;
        const cy = r * cellH + cellH / 2;
        const nx = c / COLS;
        const ny = r / ROWS;

        const turbulence =
          Math.sin(nx * 4.2 + ny * 3.8 + t * 1.1) * 0.09 +
          Math.cos(nx * 5.5 - ny * 5.0 - t * 0.9) * 0.07;

        let potential = 0;
        let closestBlob = blobs[0];
        let closestDistSq = Infinity;

        for (const b of blobs) {
          const dx = cx - b.x;
          const dy = cy - b.y;
          const distSq = (dx * dx + dy * dy) / (b.r * b.r);
          if (distSq < closestDistSq) {
            closestDistSq = distSq;
            closestBlob = b;
          }
          if (distSq < 2.2) {
            potential += b.power * Math.exp(-distSq * 1.80);
          }
        }

        const rawField = potential + turbulence;
        const threshold = 0.35 - pulseStrength * 0.08;
        if (rawField >= threshold) {
          const normField = Math.min(1.0, (rawField - threshold) / (0.85 + pulseStrength * 0.25));
          const maxRadius = Math.min(cellW, cellH) * (0.38 + pulseStrength * 0.12);
          const dotRadius = Math.max(0.65, normField * maxRadius);

          const dirX = (cx - closestBlob.x) / Math.max(1, closestBlob.r);
          const dirY = (cy - closestBlob.y) / Math.max(1, closestBlob.r);

          dots.push({
            x: cx,
            y: cy,
            r: dotRadius,
            dirX: Math.abs(dirX) < 0.01 ? (Math.random() - 0.5) : dirX,
            dirY: Math.abs(dirY) < 0.01 ? (Math.random() - 0.5) : dirY,
          });
        }
      }
    }
    return dots;
  }

  /**
   * Triggers cascading line-by-line transcription transformation:
   * Disperses record mode elements and flocks them sequentially from Line 0 to Line 4 to simulate live AI transcription.
   */
  public triggerTranscribeTransition(onComplete?: () => void) {
    this.isTransformingToStop = true;
    this.stopTransformProgress = 0.0;
    this.readingProgressSec = 0.0;
    this.onTranscribeComplete = onComplete;
    this.continuousTransitionPixels = [];

    // Ensure layout coordinates are ready
    if (!this.isCharLayoutReady) {
      this.layoutMemoChars();
    }

    const nonSpaceChars = this.memoChars.filter(c => c.char !== ' ');
    const totalTargets = nonSpaceChars.length;

    // Sample live record dots from screen
    const liveDots = this.sampleCurrentRecordingDots();
    // Sort dots spatially top-to-bottom so upper dots flock to upper lines
    const sortedDots = [...liveDots].sort((a, b) => (a.y * 1.4 + a.x * 0.3) - (b.y * 1.4 + b.x * 0.3));

    const totalDots = sortedDots.length;
    const stride = totalDots > totalTargets ? totalDots / totalTargets : 1;

    for (let i = 0; i < totalTargets; i++) {
      const dotIdx = Math.min(totalDots - 1, Math.floor(i * stride));
      const dot = sortedDots[dotIdx] || {
        x: this.width * (0.3 + Math.random() * 0.4),
        y: this.height * (0.3 + Math.random() * 0.4),
        r: 2.4,
        dirX: (Math.random() - 0.5) * 1.5,
        dirY: (Math.random() - 0.5) * 1.5,
      };

      const target = nonSpaceChars[i];

      // P0: Exact start position on record halftone grid
      const p0x = dot.x;
      const p0y = dot.y;

      // P3: Exact destination on word character
      const p3x = target.charX;
      const p3y = target.charY;

      // P1: Outward burst apex along dispersion vector
      const angle = Math.atan2(dot.dirY, dot.dirX) + ((i % 5) - 2) * 0.22;
      const burstDist = 42 + (i * 11) % 36;
      const p1x = p0x + Math.cos(angle) * burstDist;
      const p1y = p0y + Math.sin(angle) * burstDist;

      // P2: Aerodynamic inflow control point smoothly curving into line
      const p2x = p1x + (p3x - p1x) * 0.50 + Math.sin(i * 1.3) * 12;
      const p2y = p1y + (p3y - p1y) * 0.74;

      const lineCharsCount = this.memoChars.filter(c => c.lineIndex === target.lineIndex && c.char !== ' ').length;

      this.continuousTransitionPixels.push({
        p0x,
        p0y,
        p1x,
        p1y,
        p2x,
        p2y,
        p3x,
        p3y,
        char: target.char,
        isAccent: target.isAccent,
        radius: dot.r,
        lineIndex: target.lineIndex,
        charIndexInLine: target.charIndexInLine,
        lineTotalChars: Math.max(1, lineCharsCount),
      });
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

  public layoutMemoChars(ctx?: CanvasRenderingContext2D) {
    const startX = 24;
    const charWidth = 10.9;

    for (let lIdx = 0; lIdx < MEMO_LINE_DEFS.length; lIdx++) {
      const lineText = MEMO_LINE_DEFS[lIdx].text;
      const lineChars = this.memoChars.filter(c => c.lineIndex === lIdx);

      for (let i = 0; i < lineChars.length; i++) {
        const c = lineChars[i];
        if (ctx) {
          ctx.save();
          ctx.font = '600 19px "Pixelify Sans", "Silkscreen", "JetBrains Mono", monospace';
          c.charX = startX + ctx.measureText(lineText.substring(0, c.charIndexInLine)).width;
          ctx.restore();
        } else {
          c.charX = startX + c.charIndexInLine * charWidth;
        }
        c.charY = LINE_Y_POSITIONS[lIdx];
      }
    }
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

    // Advance dynamic fluid flow phase with voice-reactive acceleration.
    // When paused: pulsing of blobs stops, but their movements continue along fluid paths at cruising speed (0.80)
    const effectiveEnergy = this.isRecordingPaused ? 0.001 : audioEnergy;
    this.currentAudioEnergy += (effectiveEnergy - this.currentAudioEnergy) * 0.25;
    const clampedAudio = Math.max(0.001, Math.min(1.0, this.currentAudioEnergy));
    const audioDbfs = 20 * Math.log10(clampedAudio);
    const audioPulse = this.isRecordingPaused ? 0.0 : Math.max(0, Math.min(1.0, (audioDbfs + 42) / 38));
    const flowVelocity = 0.80 + (this.isRecordingPaused ? 0.0 : audioPulse * 0.45);
    this.fluidFlowPhase += dt * flowVelocity;

    const isWhite = this.theme === 'WHITE';
    const primaryColor = isWhite ? '#000000' : '#FFFFFF';
    const mutedColor = isWhite ? '#71717A' : '#72727A';
    const accentColor = isWhite ? '#000000' : '#FFFFFF'; // Strict Monochrome: no red

    this.spokeAngle += 0.08;
    this.playheadCol = (Math.sin(timeSec * 2.2) * 0.5 + 0.5) * (BITMAP_COLS - 1);

    // Cascading line-by-line transformation during transcription
    if (this.isTransformingToStop) {
      // 2.8s authentic AI live-transcription simulation cascading line by line
      this.stopTransformProgress += dt / 2.8;
      if (this.stopTransformProgress >= 1.0) {
        this.stopTransformProgress = 1.0;
        this.isTransformingToStop = false;
        this.readingProgressSec = 0;
        if (this.onTranscribeComplete) {
          this.onTranscribeComplete();
        }
      }
    } else if (this.state === 'PLAYING') {
      // Play mode: advances Spotify lyrics reading timeline
      this.readingProgressSec += dt;
      if (this.readingProgressSec > this.totalSpeakingDuration + 1.2) {
        this.readingProgressSec = 0;
        this.setState('TRANSCRIBED');
        if (this.onPlaybackComplete) {
          this.onPlaybackComplete();
        }
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

    // Swarm particles rest in background ready for state transitions (synth wave removed)
    if (this.state === 'RECORDING' || this.state === 'TRANSCRIBED' || this.state === 'PLAYING') {
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
          p.color = '#FFFFFF';
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
    // When paused: zero pulse strength so blobs do NOT pulse
    const pulseStrength = this.isRecordingPaused ? 0.0 : Math.max(0, Math.min(1.0, (dbfs + 42) / 38));
    
    // Use dynamic fluid flow phase for continuous organic evolution
    const t = this.fluidFlowPhase;
    // Decibel swell: 0.76x resting contraction -> 1.38x vocal expansion
    // When paused: steady 1.0 (zero pulsating expansion)
    const swell = this.isRecordingPaused ? 1.0 : (0.76 + pulseStrength * 0.62);
    // Radial pulsing factor: silenced when paused so radii remain steady
    const pulseFactor = this.isRecordingPaused ? 0.0 : 1.0;

    const COLS = 50;
    const ROWS = 72;
    const cellW = this.width / COLS;
    const cellH = this.height / ROWS;

    // Pure rounded, continuously circulating liquid metaballs with high surface tension.
    // Movement coordinates (x, y) continuously traverse fluid paths at all times.
    const blobs = [
      // 1. Primary Upper Sphere
      {
        x: this.width * (0.38 + 0.22 * Math.sin(t * 0.45) + 0.08 * Math.cos(t * 0.90)),
        y: this.height * (0.24 + 0.12 * Math.cos(t * 0.38) + 0.05 * Math.sin(t * 0.85)),
        r: (82 + 10 * Math.sin(t * 0.60) * pulseFactor) * swell,
        power: 1.15 * (0.85 + pulseStrength * 0.35),
        hasCore: true,
      },
      // 2. Primary Lower Sphere
      {
        x: this.width * (0.58 + 0.22 * Math.cos(t * 0.36 + 1.6) + 0.07 * Math.sin(t * 0.92)),
        y: this.height * (0.64 + 0.14 * Math.sin(t * 0.42 + 0.9) + 0.05 * Math.cos(t * 0.78)),
        r: (84 + 10 * Math.cos(t * 0.48 + 2.1) * pulseFactor) * swell,
        power: 1.12 * (0.85 + pulseStrength * 0.35),
        hasCore: true,
      },
      // 3. Fast Orbiting Droplet Sphere
      {
        x: this.width * (0.48 + 0.32 * Math.sin(t * 0.72 + 2.5)),
        y: this.height * (0.44 + 0.30 * Math.cos(t * 0.65 + 1.8)),
        r: (36 + 6 * Math.sin(t * 0.85) * pulseFactor) * swell,
        power: 1.05 * (0.85 + pulseStrength * 0.35),
        hasCore: false,
      },
      // 4. Buoyant Bead Sphere
      {
        x: this.width * (0.22 + 0.15 * Math.cos(t * 0.80 + 3.8)),
        y: this.height * (0.52 + 0.20 * Math.sin(t * 0.60 + 2.4)),
        r: (30 + 5 * Math.cos(t * 1.05) * pulseFactor) * swell,
        power: 1.02 * (0.85 + pulseStrength * 0.35),
        hasCore: false,
      },
      // 5. Dynamic Upper-Right Influx Sphere
      {
        x: this.width * (0.88 + 0.08 * Math.sin(t * 0.48 + 1.0)),
        y: this.height * (0.16 + 0.12 * Math.cos(t * 0.58 + 3.2)),
        r: (72 + 10 * Math.sin(t * 0.68) * pulseFactor) * swell,
        power: 1.05 * (0.85 + pulseStrength * 0.35),
        hasCore: true,
      },
      // 6. Dynamic Bottom-Left Peninsula Sphere
      {
        x: this.width * (0.14 + 0.09 * Math.cos(t * 0.52 + 4.6)),
        y: this.height * (0.84 + 0.08 * Math.sin(t * 0.44 + 1.4)),
        r: (75 + 10 * Math.cos(t * 0.56) * pulseFactor) * swell,
        power: 1.06 * (0.85 + pulseStrength * 0.35),
        hasCore: true,
      },
      // 7. Dynamic Lower Satellite Sphere
      {
        x: this.width * (0.52 + 0.18 * Math.sin(t * 0.58 + 5.2)),
        y: this.height * (0.88 + 0.07 * Math.cos(t * 0.68 + 4.2)),
        r: (56 + 8 * Math.sin(t * 0.75) * pulseFactor) * swell,
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

    // 2. STATE 3 & 4: TRANSCRIBED MEMO & PLAYING SPOTIFY LYRICS KINETICS
    if (this.state === 'TRANSCRIBED' || this.state === 'PLAYING') {
      ctx.save();

      // Check if layout is ready
      if (!this.isCharLayoutReady) {
        this.layoutMemoChars(ctx);
      }

      const progress = this.stopTransformProgress;
      const isTransforming = this.isTransformingToStop;
      const headerAlpha = isTransforming ? Math.max(0, (progress - 0.70) / 0.30) : 1.0;

      // 1. Top Header: "Mon ●" + Date (Strict Monochrome: Black, White, Glowing White)
      if (headerAlpha > 0.01) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        // "Mon" Display
        ctx.font = '700 22px "Pixelify Sans", "Silkscreen", "JetBrains Mono", monospace';
        ctx.fillStyle = isWhite ? '#000000' : '#FFFFFF';
        ctx.globalAlpha = headerAlpha;
        ctx.fillText('Mon', 20, 36);

        // Minimalist White Dot (Strict Monochrome: Zero Red)
        ctx.fillStyle = isWhite ? '#000000' : '#FFFFFF';
        ctx.font = '700 12px monospace';
        if (!isWhite) {
          ctx.shadowColor = 'rgba(255, 255, 255, 0.85)';
          ctx.shadowBlur = 6;
        }
        ctx.fillText('●', 78, 36);
        ctx.shadowBlur = 0;

        // Date right aligned
        ctx.textAlign = 'right';
        ctx.font = '500 10px "JetBrains Mono", monospace';
        ctx.fillStyle = isWhite ? '#71717A' : '#8E8E93';
        ctx.globalAlpha = headerAlpha * 0.85;
        ctx.fillText('December 9', this.width - 20, 32);
        ctx.fillStyle = isWhite ? '#A1A1AA' : '#686872';
        ctx.fillText('2024', this.width - 20, 44);

        // Hairline rule below header
        ctx.strokeStyle = isWhite ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.10)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(20, 58);
        ctx.lineTo(this.width - 20, 58);
        ctx.stroke();
      }

      // 2. Characters Rendering: Cascading Transcription vs Solid Transcribed vs Play Karaoke
      ctx.font = '600 19px "Pixelify Sans", "Silkscreen", "JetBrains Mono", monospace';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';

      if (isTransforming) {
        // CASCADING LINE-BY-LINE TRANSCRIPTION TRANSFORMATION
        // Pixels transform smoothly from the first line to the last line to simulate live transcription.
        const TOTAL_LINES = 5;

        for (let i = 0; i < this.continuousTransitionPixels.length; i++) {
          const tp = this.continuousTransitionPixels[i];

          // Cascading timeline per line (Line 0 through Line 4)
          const lineStartP = (tp.lineIndex / TOTAL_LINES) * 0.62;
          const lineDuration = 0.38;
          const charRipple = (tp.charIndexInLine / tp.lineTotalChars) * 0.05;
          const startP = lineStartP + charRipple;
          const endP = startP + lineDuration;

          let curX: number, curY: number;
          let pixelAlpha = 1.0;
          let glyphAlpha = 0.0;
          let pixelSize = Math.max(2.0, tp.radius * 1.85);

          if (progress < startP) {
            // Waiting to be transcribed: gently hovering in the record dispersion cloud
            const hover = Math.sin(this.currentTimeSec * 3 + i * 0.35) * 2;
            curX = tp.p0x + hover;
            curY = tp.p0y + Math.cos(this.currentTimeSec * 3 + i * 0.35) * 2;
            pixelAlpha = 0.85;
            glyphAlpha = 0.0;
          } else if (progress < endP) {
            // Actively transcribing line: Bezier streamline flight into position
            const effP = (progress - startP) / (endP - startP);
            const t = effP < 0.5 ? 4 * effP * effP * effP : 1 - Math.pow(-2 * effP + 2, 3) / 2;
            const it = 1 - t;

            curX = it * it * it * tp.p0x + 3 * it * it * t * tp.p1x + 3 * it * t * t * tp.p2x + t * t * t * tp.p3x;
            curY = it * it * it * tp.p0y + 3 * it * it * t * tp.p1y + 3 * it * t * t * tp.p2y + t * t * t * tp.p3y;

            if (effP < 0.72) {
              pixelAlpha = 0.95;
              pixelSize = Math.max(1.8, tp.radius * 1.85 * (1.0 - effP * 0.20));
              glyphAlpha = 0.0;
            } else {
              const morphT = (effP - 0.72) / 0.28;
              pixelAlpha = Math.max(0, 1.0 - morphT * 1.4);
              glyphAlpha = Math.min(1.0, morphT * 1.25);
              pixelSize = Math.max(1.0, tp.radius * 1.85 * (1.0 - morphT));
            }
          } else {
            // Line transcription complete: locked in place as solid text
            curX = tp.p3x;
            curY = tp.p3y;
            pixelAlpha = 0.0;
            glyphAlpha = 1.0;
          }

          // 1. Draw glowing hardware pixel (strictly white)
          if (pixelAlpha > 0.01) {
            ctx.fillStyle = isWhite ? '#18181B' : '#FFFFFF';
            ctx.globalAlpha = pixelAlpha;
            ctx.beginPath();
            const corner = pixelSize * 0.34;
            ctx.roundRect(curX - pixelSize / 2, curY - pixelSize / 2, pixelSize, pixelSize, corner);
            ctx.fill();
          }

          // 2. Draw solidified typographic character
          if (glyphAlpha > 0.01 && tp.char) {
            ctx.fillStyle = isWhite ? '#18181B' : '#FFFFFF';
            ctx.globalAlpha = glyphAlpha;
            ctx.fillText(tp.char, curX, curY);
          }
        }
      } else if (this.state === 'TRANSCRIBED') {
        // FINISHED TRANSCRIBED MEMO: ALL WORDS SOLID WHITE AND READABLE (NO DIMMING)
        for (let i = 0; i < this.memoChars.length; i++) {
          const mc = this.memoChars[i];
          if (mc.char === ' ') continue;
          ctx.fillStyle = isWhite ? '#18181B' : '#FFFFFF';
          ctx.globalAlpha = 1.0;
          ctx.shadowBlur = 0;
          ctx.fillText(mc.char, mc.charX, mc.charY);
        }
      } else if (this.state === 'PLAYING') {
        // PLAY MODE ACTIVATED: SPOTIFY LYRICS READING
        // Unspoken words dim to soft grey, spoken words ignite with radiant blooming halation
        const t = this.readingProgressSec;
        for (let i = 0; i < this.memoChars.length; i++) {
          const mc = this.memoChars[i];
          if (mc.char === ' ') continue;

          ctx.save();
          if (t >= mc.tEnd) {
            // Spoken: clean chalk white
            ctx.fillStyle = isWhite ? '#18181B' : '#E4E4E7';
            ctx.globalAlpha = 0.90;
            ctx.shadowBlur = 0;
          } else if (t >= mc.tStart) {
            // Currently being spoken: radiant blooming halation glow
            const progressInChar = (t - mc.tStart) / Math.max(0.001, mc.tEnd - mc.tStart);
            ctx.fillStyle = isWhite ? '#000000' : '#FFFFFF';
            ctx.globalAlpha = 1.0;
            if (!isWhite) {
              ctx.shadowColor = 'rgba(255, 255, 255, 0.90)';
              ctx.shadowBlur = Math.round(14 + Math.sin(progressInChar * Math.PI) * 8);
            }
          } else {
            // Not yet spoken: dim graphite grey
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

    ctx.restore();
  }
}
