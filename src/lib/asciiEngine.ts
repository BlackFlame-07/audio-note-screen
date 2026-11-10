/**
 * 5-State 60FPS HTML5 Canvas ASCII Particle Engine
 * 40 columns x 26 rows = 1,040 particles
 * Single-draw-call 2D canvas architecture with smooth lerp physics
 */

export type AppState = 'IDLE' | 'RECORDING' | 'TRANSCRIBED' | 'PLAYING' | 'SAVING';
export type ThemeMode = 'OBSIDIAN' | 'ARCHIVAL';

export interface Particle {
  id: number;
  col: number;
  row: number;
  baseX: number;
  baseY: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  char: string;
  color: string;
  alpha: number;
  targetAlpha: number;
}

export const COLS = 40;
export const ROWS = 26;
export const TOTAL_PARTICLES = COLS * ROWS; // 1,040 particles

const LUMINANCE_RAMP = " .·:-=+*#%@";
const IDLE_CHARS = ['.', '·', ':', '+', '*'];
const REEL_SPIN_CHARS = ['/', '-', '\\', '|'];

// Transcribed Multi-Line Product Note (28 columns wide x 8 rows tall)
const TRANSCRIBED_NOTE = [
  "┌────────────────────────────┐",
  "│ VOICE NOTE // 01           │",
  "│ SHIP ASCII SYNTH UI        │",
  "│ TARGET 60FPS CANVAS        │",
  "│ ZERO AI SLOP IN PROD       │",
  "│ 390x844 TACTILE HARDWARE   │",
  "│ ANALYSER + FOLEY READY     │",
  "└────────────────────────────┘",
];

// ASCII Cassette Tape (34 columns wide x 12 rows tall)
// Row 3 label has placeholder for custom note tape name
const CASSETTE_TEMPLATE = [
  "┌────────────────────────────────┐",
  "│ [ A-SIDE ]        48kHz / 24b  │",
  "│ ╔════════════════════════════╗ │",
  "│ ║ TAPE:                      ║ │", // Row 3: Name injected here
  "│ ╚════════════════════════════╝ │",
  "│    ( @ )              ( @ )    │", // Row 5: Reels with rotation
  "│     / \                / \     │",
  "│     \ /                \ /     │",
  "│    ---  [===|====|===]  ---    │",
  "│    \                          /    │",
  "│     \________________________/     │",
  "└────────────────────────────────┘",
];

export class AsciiEngine {
  public particles: Particle[] = [];
  public width: number = 360;
  public height = 480;
  public cellW: number = 9;
  public cellH: number = 18;
  public state: AppState = 'IDLE';
  public theme: ThemeMode = 'OBSIDIAN';
  public tapeName: string = 'TAPE_01';
  public isEjecting: boolean = false;
  public ejectProgress: number = 0;
  public playheadCol: number = 0;
  public onEjectComplete?: () => void;

  constructor() {
    this.initParticles();
  }

  public resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cellW = width / COLS;
    this.cellH = height / ROWS;

    // Reposition base particle anchors
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.baseX = p.col * this.cellW + this.cellW / 2;
      p.baseY = p.row * this.cellH + this.cellH / 2;
      if (this.state === 'IDLE' && (p.x === 0 && p.y === 0)) {
        p.x = p.baseX;
        p.y = p.baseY;
      }
    }
  }

  public initParticles() {
    this.particles = [];
    let id = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const baseX = c * this.cellW + this.cellW / 2;
        const baseY = r * this.cellH + this.cellH / 2;
        this.particles.push({
          id: id++,
          col: c,
          row: r,
          baseX,
          baseY,
          x: baseX + (Math.random() - 0.5) * 10,
          y: baseY + (Math.random() - 0.5) * 10,
          targetX: baseX,
          targetY: baseY,
          char: '.',
          color: '#68686E',
          alpha: 0.4,
          targetAlpha: 0.4,
        });
      }
    }
  }

  public setState(nextState: AppState) {
    this.state = nextState;
    this.isEjecting = false;
    this.ejectProgress = 0;
    this.playheadCol = 0;
  }

  public triggerEject(onComplete?: () => void) {
    this.isEjecting = true;
    this.ejectProgress = 0;
    this.onEjectComplete = onComplete;
  }

  /**
   * Main per-frame update loop running at 60fps
   */
  public update(timeMs: number, audioEnergy: number = 0.1, audioBands: number[] = []) {
    const timeSec = timeMs * 0.001;
    const isDark = this.theme === 'OBSIDIAN';
    const primaryColor = isDark ? '#FAFAFA' : '#181816';
    const mutedColor = isDark ? '#68686E' : '#8A8880';
    const accentColor = isDark ? '#D96B27' : '#4E7D63';

    // Center coords in grid units
    const centerCol = (COLS - 1) / 2;
    const centerRow = (ROWS - 1) / 2;

    // Reel spin animation index for cassette tape
    const reelFrame = Math.floor(timeMs * 0.006) % 4;
    const spinChar = REEL_SPIN_CHARS[reelFrame];

    // If ejecting cassette, slide off-screen to the right
    let ejectOffset = 0;
    if (this.isEjecting) {
      this.ejectProgress += 0.045; // Spring velocity ramp
      ejectOffset = Math.pow(this.ejectProgress, 1.8) * (this.width + 120);

      if (ejectOffset > this.width + 80) {
        // Cassette has completely slid out of frame! Reset back to IDLE
        this.isEjecting = false;
        this.setState('IDLE');
        if (this.onEjectComplete) {
          this.onEjectComplete();
        }
      }
    }

    // Advance playhead in PLAYING state
    if (this.state === 'PLAYING') {
      this.playheadCol = (timeSec * 12) % COLS;
    }

    // Calculate Cassette Layout offsets
    const cassetteWidth = 34;
    const cassetteHeight = 12;
    const cassetteStartCol = Math.floor((COLS - cassetteWidth) / 2);
    const cassetteStartRow = Math.floor((ROWS - cassetteHeight) / 2);

    // Calculate Transcribed Note offsets
    const noteWidth = 30;
    const noteHeight = 8;
    const noteStartCol = Math.floor((COLS - noteWidth) / 2);
    const noteStartRow = Math.floor((ROWS - noteHeight) / 2);

    // Clean tape name formatted for the label
    const sanitizedTapeName = (this.tapeName || 'TAPE_01').toUpperCase().padEnd(20, ' ').slice(0, 20);

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      switch (this.state) {
        // ==========================================
        // STATE 1: IDLE (Smooth Sine/Cosine Drift)
        // ==========================================
        case 'IDLE': {
          const driftX = Math.sin(timeSec * 1.5 + p.id * 0.1) * 7 + Math.cos(timeSec * 0.8 + p.row * 0.3) * 4;
          const driftY = Math.cos(timeSec * 1.3 + p.id * 0.08) * 6 + Math.sin(timeSec * 0.9 + p.col * 0.25) * 4;
          p.targetX = p.baseX + driftX;
          p.targetY = p.baseY + driftY;

          // Gentle glyph cycling
          const charIdx = (Math.floor(timeSec * 1.2 + p.id * 0.15)) % IDLE_CHARS.length;
          p.char = IDLE_CHARS[charIdx];
          p.color = mutedColor;
          p.targetAlpha = 0.35 + Math.sin(timeSec * 2 + p.id * 0.05) * 0.15;
          break;
        }

        // ==========================================
        // STATE 2: RECORDING (Monospace Grid + Concentric Waves)
        // ==========================================
        case 'RECORDING': {
          // Snap strictly to grid
          p.targetX = p.baseX;
          p.targetY = p.baseY;

          const dx = p.col - centerCol;
          const dy = (p.row - centerRow) * 1.4; // Correct aspect ratio for circular ripples
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Concentric ripple propagation
          const wavePhase = dist * 0.65 - timeSec * 6.5;
          const primaryWave = Math.sin(wavePhase);
          const vocalSpike = audioEnergy * Math.sin(timeSec * 14 + p.col * 0.5);

          const composite = (primaryWave * 0.6 + vocalSpike * 0.7 + 0.5);
          const clamped = Math.max(0, Math.min(1, composite));

          const charIndex = Math.floor(clamped * (LUMINANCE_RAMP.length - 1));
          p.char = LUMINANCE_RAMP[charIndex] || '.';

          // High peaks flash in laser orange / bright white
          if (charIndex >= 8) {
            p.color = accentColor;
            p.targetAlpha = 1.0;
          } else if (charIndex >= 5) {
            p.color = primaryColor;
            p.targetAlpha = 0.85;
          } else {
            p.color = mutedColor;
            p.targetAlpha = 0.25 + clamped * 0.4;
          }
          break;
        }

        // ==========================================
        // STATE 3: TRANSCRIBED (Monospace Box Note)
        // ==========================================
        case 'TRANSCRIBED': {
          p.targetX = p.baseX;
          p.targetY = p.baseY;

          const relRow = p.row - noteStartRow;
          const relCol = p.col - noteStartCol;

          if (relRow >= 0 && relRow < noteHeight && relCol >= 0 && relCol < noteWidth) {
            const line = TRANSCRIBED_NOTE[relRow];
            p.char = line ? (line[relCol] || ' ') : ' ';
            p.color = primaryColor;
            p.targetAlpha = 1.0;
          } else {
            // Surrounding background cells dim to 0.12 opacity dots
            p.char = '.';
            p.color = mutedColor;
            p.targetAlpha = 0.12;
          }
          break;
        }

        // ==========================================
        // STATE 4: PLAYING (3 Harmonic Sine Waves + Playhead Sweep)
        // ==========================================
        case 'PLAYING': {
          p.targetX = p.baseX;

          // 3 Intertwined Harmonic Sine Waves
          const wave1 = Math.sin(p.col * 0.28 + timeSec * 4.2) * 4.0;
          const wave2 = Math.sin(p.col * 0.52 - timeSec * 5.0) * 2.8;
          const wave3 = Math.cos(p.col * 0.15 + timeSec * 2.5) * 5.2;

          const targetRow1 = centerRow + wave1;
          const targetRow2 = centerRow + wave2;
          const targetRow3 = centerRow + wave3;

          const d1 = Math.abs(p.row - targetRow1);
          const d2 = Math.abs(p.row - targetRow2);
          const d3 = Math.abs(p.row - targetRow3);
          const minWaveDist = Math.min(d1, d2, d3);

          // Is cell near playhead?
          const distToPlayhead = Math.abs(p.col - this.playheadCol);

          if (minWaveDist < 0.75) {
            // Right on top of the wave crest
            p.char = minWaveDist < 0.35 ? '@' : '#';
            p.color = distToPlayhead < 1.5 ? accentColor : primaryColor;
            p.targetAlpha = 1.0;
            p.targetY = p.baseY;
          } else if (minWaveDist < 1.6) {
            p.char = minWaveDist < 1.1 ? '*' : '+';
            p.color = accentColor;
            p.targetAlpha = 0.7;
            p.targetY = p.baseY;
          } else if (distToPlayhead < 0.8) {
            p.char = '|';
            p.color = accentColor;
            p.targetAlpha = 0.95;
            p.targetY = p.baseY;
          } else {
            p.char = '.';
            p.color = mutedColor;
            p.targetAlpha = 0.12;
            p.targetY = p.baseY;
          }
          break;
        }

        // ==========================================
        // STATE 5: SAVING & EJECTING (34x12 Cassette Tape)
        // ==========================================
        case 'SAVING': {
          p.targetY = p.baseY;
          p.targetX = p.baseX + ejectOffset;

          const cRelRow = p.row - cassetteStartRow;
          const cRelCol = p.col - cassetteStartCol;

          if (cRelRow >= 0 && cRelRow < cassetteHeight && cRelCol >= 0 && cRelCol < cassetteWidth) {
            let ch = ' ';

            if (cRelRow === 3) {
              // Custom note title label row
              if (cRelCol >= 0 && cRelCol <= 8) {
                ch = "│ ║ TAPE:"[cRelCol] || ' ';
              } else if (cRelCol >= 9 && cRelCol <= 28) {
                ch = sanitizedTapeName[cRelCol - 9] || ' ';
              } else {
                ch = "║ │"[cRelCol - 29] || ' ';
              }
            } else if (cRelRow === 5) {
              // Reels row with dynamic spin characters
              const templateLine = CASSETTE_TEMPLATE[cRelRow];
              if (cRelCol === 7 || cRelCol === 24) {
                ch = spinChar; // Rotating tape reel teeth!
              } else {
                ch = templateLine ? (templateLine[cRelCol] || ' ') : ' ';
              }
            } else {
              const templateLine = CASSETTE_TEMPLATE[cRelRow];
              ch = templateLine ? (templateLine[cRelCol] || ' ') : ' ';
            }

            p.char = ch;

            // Highlight cassette label & reels in laser orange
            if (cRelRow === 3 && cRelCol >= 9 && cRelCol <= 28) {
              p.color = accentColor;
              p.targetAlpha = 1.0;
            } else if ((cRelRow >= 5 && cRelRow <= 7) && ((cRelCol >= 5 && cRelCol <= 9) || (cRelCol >= 22 && cRelCol <= 26))) {
              p.color = accentColor;
              p.targetAlpha = 0.95;
            } else {
              p.color = primaryColor;
              p.targetAlpha = 0.95;
            }
          } else {
            // Surrounding cells dim
            p.char = '.';
            p.color = mutedColor;
            p.targetAlpha = 0.1;
          }
          break;
        }
      }

      // Smooth Position and Alpha Lerp Interpolation
      p.x += (p.targetX - p.x) * 0.14;
      p.y += (p.targetY - p.y) * 0.14;
      p.alpha += (p.targetAlpha - p.alpha) * 0.15;
    }
  }

  /**
   * Single draw call rendering all particles
   */
  public render(ctx: CanvasRenderingContext2D, isZoomed: boolean = false) {
    ctx.save();

    // Clear canvas
    ctx.clearRect(0, 0, this.width, this.height);

    // Apply 1.45x Macro Zoom if toggled
    if (isZoomed) {
      const zoom = 1.45;
      ctx.translate(this.width / 2, this.height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-this.width / 2, -this.height / 2);
    }

    // Monospace font configuration
    const fontSize = Math.max(9, Math.floor(this.cellW * 1.35));
    ctx.font = `500 ${fontSize}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Group draws or execute fast character draws
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.char === ' ' || p.alpha <= 0.02) continue;

      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
      ctx.fillText(p.char, p.x, p.y);
    }

    // Draw vertical laser playhead line when PLAYING
    if (this.state === 'PLAYING') {
      const playheadX = this.playheadCol * this.cellW + this.cellW / 2;
      const isDark = this.theme === 'OBSIDIAN';
      const accent = isDark ? '#D96B27' : '#4E7D63';

      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(playheadX, 4);
      ctx.lineTo(playheadX, this.height - 4);
      ctx.stroke();

      // Top & Bottom laser pins
      ctx.fillStyle = accent;
      ctx.globalAlpha = 1.0;
      ctx.fillRect(playheadX - 1.5, 2, 3, 3);
      ctx.fillRect(playheadX - 1.5, this.height - 5, 3, 3);
    }

    ctx.restore();
  }
}
