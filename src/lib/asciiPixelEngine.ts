/**
 * 16-Bit Pixel Art ASCII Swarm Engine (60 Cols x 80 Rows)
 * - Record mode: 4,800-cell 2D Halftone Square Dot Matrix rippling with voice intensity
 * - Stop mode: Small crisp readable transcribed text in 16-bit framed memo
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
  public theme: ThemeMode = 'WHITE';
  public tapeName: string = 'NOTE_01';
  public spokeAngle: number = 0;
  public playheadCol: number = 0;

  public transitionProgress: number = 1.0;
  public prevState: AppState = 'IDLE';

  public isEjecting: boolean = false;
  public ejectVelocity: number = 0;
  public onEjectComplete?: () => void;

  constructor() {
    this.sampler = new BitmapSampler();
    this.initParticlePool();
  }

  public resize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.cellW = w / BITMAP_COLS;
    this.cellH = h / BITMAP_ROWS;
    this.originX = 0;
    this.originY = 0;

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
        color: '#000000',
        alpha: 0.35,
        targetAlpha: 0.35,
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
    }
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
    const isWhite = this.theme === 'WHITE';
    const primaryColor = isWhite ? '#000000' : '#FAFAFA';
    const mutedColor = isWhite ? '#71717A' : '#71717A';
    const accentColor = isWhite ? '#000000' : '#10B981';

    this.spokeAngle += 0.08;
    this.playheadCol = (Math.sin(timeSec * 2.2) * 0.5 + 0.5) * (BITMAP_COLS - 1);

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
    // STATE 2: RECORDING (Uniform 2D Halftone Square Dot Grid rippling with voice)
    // =========================================================================
    if (this.state === 'RECORDING') {
      const voiceAmp = Math.max(0.12, audioEnergy);
      const speed = 4.5 + voiceAmp * 12.0;

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        const c = p.col;
        const r = p.row;

        // Strictly anchored to regular grid
        p.targetX = p.baseX;
        p.targetY = p.baseY;

        // Acoustic fluid ripple calculation
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

        // 16-bit Bayer dither applied to the halftone grid
        const ditheredLum = applyBayerDither(clampedLum, c, r, 0.22);

        // Map to square halftone glyphs: " .·:▪■█"
        if (ditheredLum > 0.88) {
          p.char = '█'; // Full block
          p.color = primaryColor; // Pure black #000000 on white
          p.targetAlpha = 1.0;
        } else if (ditheredLum > 0.72) {
          p.char = '■'; // Large square
          p.color = primaryColor; // Pure black #000000
          p.targetAlpha = 0.95;
        } else if (ditheredLum > 0.54) {
          p.char = '▪'; // Small square
          p.color = primaryColor; // Pure black #000000
          p.targetAlpha = 0.85;
        } else if (ditheredLum > 0.38) {
          p.char = ':'; // Double dot
          p.color = isWhite ? '#3F3F46' : mutedColor;
          p.targetAlpha = 0.7;
        } else if (ditheredLum > 0.22) {
          p.char = '·'; // Center dot
          p.color = isWhite ? '#71717A' : mutedColor;
          p.targetAlpha = 0.5;
        } else if (ditheredLum > 0.10) {
          p.char = '.'; // Micro dot
          p.color = isWhite ? '#A1A1AA' : mutedColor;
          p.targetAlpha = 0.3;
        } else {
          p.char = ' '; // Empty space revealing pure white canvas
          p.targetAlpha = 0.0;
        }

        // Fast spring lerp into grid position
        p.x += (p.targetX - p.x) * 0.25;
        p.y += (p.targetY - p.y) * 0.25;
        p.alpha += (p.targetAlpha - p.alpha) * 0.22;
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
            p.color = '#000000';
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
    // STATES 1, 3, 5: Swarm Targets from 16-Bit Sampler
    // =========================================================================
    let sampledTargets: AsciiPixelTarget[] = [];

    if (this.state === 'TRANSCRIBED') {
      sampledTargets = this.sampler.rasterizeTranscribedNote(this.cellW, this.cellH);
    } else if (this.state === 'SAVING') {
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
          p.color = accentColor;
          p.targetAlpha = 1.0;
        } else if (target.lum > 0.6) {
          p.color = primaryColor;
          p.targetAlpha = 1.0;
        } else {
          p.color = isWhite ? '#71717A' : mutedColor;
          p.targetAlpha = 0.45 + target.lum * 0.45;
        }
      } else {
        // IDLE State OR unassigned surplus: 16-bit Floating Pixel Dust
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
        p.color = isWhite ? '#27272A' : mutedColor;
        p.targetAlpha = hasTargets ? 0.03 : (isWhite ? 0.35 : 0.25) + Math.sin(timeSec * 2 + p.id) * 0.12;
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
   * Single-Pass Canvas 2D Draw Call
   */
  public render(ctx: CanvasRenderingContext2D, isZoomed: boolean = false) {
    ctx.save();
    
    // Pure White background (or Obsidian in dark mode)
    const isWhite = this.theme === 'WHITE';
    ctx.fillStyle = isWhite ? '#FFFFFF' : '#08080A';
    ctx.fillRect(0, 0, this.width, this.height);

    if (isZoomed) {
      const zoom = 1.5;
      ctx.translate(this.width / 2, this.height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-this.width / 2, -this.height / 2);
    }

    ctx.font = '500 6px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.char === ' ' || p.alpha <= 0.02) continue;

      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
      ctx.fillText(p.char, p.x, p.y);
    }

    // 1px Laser Player Line sweeping from side to side in PLAYING state
    if (this.state === 'PLAYING') {
      const px = this.originX + this.playheadCol * this.cellW + this.cellW / 2;
      const playheadColor = isWhite ? '#000000' : '#10B981';

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
