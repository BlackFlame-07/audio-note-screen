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

export interface SpotifyLyric {
  fullText: string;
  prefix: string;
  highlight: string;
  suffix: string;
}

export const SPOTIFY_LYRICS: SpotifyLyric[] = [
  { fullText: "Good morning, Alexey.", prefix: "Good morning, ", highlight: "Alexey.", suffix: "" },
  { fullText: "You have 3 meetings,", prefix: "You have ", highlight: "3 meetings,", suffix: "" },
  { fullText: "2 tasks and 1 habit", prefix: "", highlight: "2 tasks", suffix: " and 1 habit" },
  { fullText: "today. You're mostly free", prefix: "today. You're ", highlight: "mostly free", suffix: "" },
  { fullText: "after 4 pm.", prefix: "after ", highlight: "4 pm.", suffix: "" },
];

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
      if (nextState !== 'TRANSCRIBED') {
        this.manualLyricIndex = -1;
      }
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
    const primaryColor = isWhite ? '#000000' : '#FFFFFF';
    const mutedColor = isWhite ? '#71717A' : '#72727A';
    const accentColor = isWhite ? '#000000' : '#EF4444';

    this.spokeAngle += 0.08;
    this.playheadCol = (Math.sin(timeSec * 2.2) * 0.5 + 0.5) * (BITMAP_COLS - 1);

    // Spotify Lyric time-synced karaoke progression (advance line every 2.7s)
    if (this.manualLyricIndex < 0) {
      this.activeLyricIndex = Math.floor(timeSec / 2.7) % SPOTIFY_LYRICS.length;
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
    // STATE 2: RECORDING (Softer, Gentle Organic Acoustic Swells)
    // =========================================================================
    if (this.state === 'RECORDING') {
      const voiceAmp = Math.max(0.08, Math.min(0.85, audioEnergy));
      // Calmer, gentler wave progression speed
      const speed = 1.8 + voiceAmp * 3.2;

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        const c = p.col;
        const r = p.row;

        // Strictly anchored to regular grid
        p.targetX = p.baseX;
        p.targetY = p.baseY;

        // Broad, gentle acoustic fluid swells (soft lower spatial frequency)
        const d1 = Math.hypot(c - 30, (r - 40) * 0.82);
        const d2 = Math.hypot(c - 28, (r - 36) * 0.82);
        const w1 = Math.sin(d1 * 0.16 - timeSec * speed);
        const w2 = Math.cos(d2 * 0.22 - timeSec * (speed * 0.8)) * 0.35;
        const gentleSwell = Math.sin(timeSec * 2.4 + c * 0.08) * (voiceAmp * 0.22);

        // Soft radial attenuation
        const halo = Math.exp(-d1 * 0.05) * voiceAmp * 0.42;

        // Soft composite luminance with gradual breathing dynamic
        const composite = w1 * 0.38 + w2 + gentleSwell + halo + 0.26;
        const clampedLum = Math.max(0, Math.min(1, composite));

        // 16-bit Bayer dither applied to the halftone grid
        const ditheredLum = applyBayerDither(clampedLum, c, r, 0.18);

        // Map to square halftone glyphs: " .·:▪■█"
        if (ditheredLum > 0.85) {
          p.char = '█'; // Full block
          p.color = primaryColor;
          p.targetAlpha = 0.95;
        } else if (ditheredLum > 0.68) {
          p.char = '■'; // Large square
          p.color = primaryColor;
          p.targetAlpha = 0.85;
        } else if (ditheredLum > 0.50) {
          p.char = '▪'; // Small square
          p.color = isWhite ? '#333333' : '#D4D4D8';
          p.targetAlpha = 0.72;
        } else if (ditheredLum > 0.34) {
          p.char = ':'; // Double dot
          p.color = isWhite ? '#666666' : '#8A8A94';
          p.targetAlpha = 0.55;
        } else if (ditheredLum > 0.18) {
          p.char = '·'; // Center dot
          p.color = isWhite ? '#999999' : '#55555E';
          p.targetAlpha = 0.38;
        } else if (ditheredLum > 0.08) {
          p.char = '.'; // Micro dot
          p.color = isWhite ? '#BBBBBB' : '#363640';
          p.targetAlpha = 0.22;
        } else {
          p.char = ' '; // Empty space revealing dark canvas well
          p.targetAlpha = 0.0;
        }

        // Fast spring lerp into grid position
        p.x += (p.targetX - p.x) * 0.22;
        p.y += (p.targetY - p.y) * 0.22;
        p.alpha += (p.targetAlpha - p.alpha) * 0.18;
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
   * Single-Pass Canvas 2D Draw Call
   */
  public render(ctx: CanvasRenderingContext2D, isZoomed: boolean = false) {
    ctx.save();
    
    // Deep Matte Carbon Well
    const isWhite = this.theme === 'WHITE';
    ctx.fillStyle = isWhite ? '#FFFFFF' : '#0A0A0C';
    ctx.fillRect(0, 0, this.width, this.height);

    if (isZoomed) {
      const zoom = 1.5;
      ctx.translate(this.width / 2, this.height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-this.width / 2, -this.height / 2);
    }

    // 1. Draw ASCII Particles (Record, Play, Cassette, Idle & Transcribed ambient dust)
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

      // Large Spotify Lyrics Lines
      const startY = 135;
      const lineSpacing = 54;
      const activeIdx = this.manualLyricIndex >= 0 ? this.manualLyricIndex : this.activeLyricIndex;

      for (let idx = 0; idx < SPOTIFY_LYRICS.length; idx++) {
        const lyric = SPOTIFY_LYRICS[idx];
        const y = startY + idx * lineSpacing;
        const isActive = idx === activeIdx;
        const isNear = Math.abs(idx - activeIdx) === 1;

        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        if (isActive) {
          // Spotify Active Line Pill Indicator on left margin
          ctx.fillStyle = isWhite ? '#000000' : '#FFFFFF';
          ctx.globalAlpha = 0.95;
          ctx.fillRect(16, y - 10, 3, 20);

          // Large Bold Active Spotify Typography (20px)
          const lyricFont = '700 20px "Pixelify Sans", "Silkscreen", "JetBrains Mono", monospace';
          ctx.font = lyricFont;
          
          let curX = 28;
          // Prefix (spoken context)
          if (lyric.prefix) {
            ctx.fillStyle = isWhite ? '#52525B' : '#A1A1AA';
            ctx.globalAlpha = 0.85;
            ctx.shadowBlur = 0;
            ctx.fillText(lyric.prefix, curX, y);
            curX += ctx.measureText(lyric.prefix).width;
          }
          // Spoken Highlight (radiant pure white blooming halation)
          if (lyric.highlight) {
            ctx.fillStyle = isWhite ? '#000000' : '#FFFFFF';
            ctx.globalAlpha = 1.0;
            if (!isWhite) {
              ctx.shadowColor = 'rgba(255, 255, 255, 0.55)';
              ctx.shadowBlur = 14;
            }
            ctx.fillText(lyric.highlight, curX, y);
            curX += ctx.measureText(lyric.highlight).width;
          }
          // Suffix (spoken context)
          if (lyric.suffix) {
            ctx.fillStyle = isWhite ? '#52525B' : '#A1A1AA';
            ctx.globalAlpha = 0.85;
            ctx.shadowBlur = 0;
            ctx.fillText(lyric.suffix, curX, y);
          }
        } else {
          // Inactive Spotify Lyric Line (Dimmed graphite)
          ctx.font = '600 16px "Pixelify Sans", "Silkscreen", "JetBrains Mono", monospace';
          ctx.fillStyle = isWhite
            ? 'rgba(0, 0, 0, 0.32)'
            : isNear
            ? 'rgba(255, 255, 255, 0.38)'
            : 'rgba(255, 255, 255, 0.20)';
          ctx.globalAlpha = isNear ? 0.75 : 0.45;
          ctx.shadowBlur = 0;
          ctx.fillText(lyric.fullText, 28, y);
        }
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
