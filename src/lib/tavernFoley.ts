/**
 * Tavern Foley & Audio Synthesis Engine
 * Generates procedural audio for:
 * - Feather quill scratching on dry parchment
 * - Cozy tavern fireplace crackle
 * - Wooden tactile button clicks
 * - Heavy wax seal stamp thump
 * - Web Audio microphone level analyzer & Web Speech API integration
 */

export class TavernFoleyEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private isMuted: boolean = false;
  private isFireActive: boolean = true;
  private fireGain: GainNode | null = null;
  private fireNoiseNode: AudioNode | null = null;
  private quillGain: GainNode | null = null;
  private quillOsc: OscillatorNode | null = null;
  private quillNoise: AudioBufferSourceNode | null = null;

  public isMicActive: boolean = false;

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.fireGain && this.ctx) {
      this.fireGain.gain.setValueAtTime(this.isMuted ? 0 : 0.07, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public toggleFireplace(): boolean {
    this.isFireActive = !this.isFireActive;
    if (this.fireGain && this.ctx) {
      this.fireGain.gain.setValueAtTime(this.isFireActive && !this.isMuted ? 0.07 : 0, this.ctx.currentTime);
    }
    return this.isFireActive;
  }

  public getFireActive(): boolean {
    return this.isFireActive;
  }

  /**
   * Starts ambient tavern fireplace crackle in the background
   */
  public startAmbientFire() {
    try {
      this.initContext();
      if (!this.ctx || this.fireGain) return;

      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let lastOut = 0.0;

      // Pink/Brown noise with occasional random crackle spikes
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = output[i];
        if (Math.random() < 0.003) {
          output[i] += (Math.random() * 2 - 1) * 0.8; // crackle pop
        }
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1400;

      this.fireGain = this.ctx.createGain();
      this.fireGain.gain.setValueAtTime(this.isFireActive && !this.isMuted ? 0.06 : 0, this.ctx.currentTime);

      whiteNoise.connect(filter);
      filter.connect(this.fireGain);
      this.fireGain.connect(this.ctx.destination);

      whiteNoise.start();
      this.fireNoiseNode = whiteNoise;
    } catch (e) {
      console.warn('Ambient fire audio not started:', e);
    }
  }

  /**
   * Play quill scratching burst (called intermittently while scribe writes)
   */
  public playQuillScratch() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const duration = 0.04 + Math.random() * 0.05;

      const bufferSize = Math.floor(this.ctx.sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.3;
      }

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2600 + Math.random() * 800, now);
      filter.Q.setValueAtTime(4, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      source.start(now);
    } catch {
      // Audio playback quiet fallback
    }
  }

  /**
   * Tactile wooden tavern button click
   */
  public playWoodClick(pitch: number = 420) {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(pitch, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.04);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.045);
    } catch {
      // fallback
    }
  }

  /**
   * Heavy crimson wax seal stamp "THUMP"
   */
  public playWaxSealStamp() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      
      // Low sub thud
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 0.18);

      gain.gain.setValueAtTime(0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.19);

      // Squish/press texture
      const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.08), this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.2;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, now);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.2, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);

      noise.start(now);
    } catch {
      // fallback
    }
  }

  /**
   * Setup real user microphone capture via getUserMedia
   */
  public async enableMicrophone(): Promise<boolean> {
    try {
      this.initContext();
      if (!this.ctx) return false;

      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 64;
        this.analyser.smoothingTimeConstant = 0.75;

        this.micSource = this.ctx.createMediaStreamSource(this.micStream);
        this.micSource.connect(this.analyser);
        this.isMicActive = true;
        return true;
      }
      return false;
    } catch (err) {
      console.warn('Microphone permission denied or unsupported:', err);
      this.isMicActive = false;
      return false;
    }
  }

  public disableMicrophone() {
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    this.isMicActive = false;
  }

  /**
   * Read live audio energy (0..1) and 8 frequency bands
   */
  public getLiveAudioEnergy(now: number, isSimulated: boolean): { energy: number; bands: number[] } {
    if (this.isMicActive && this.analyser) {
      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      const bandCount = 8;
      const step = Math.floor(dataArray.length / bandCount);
      const bands: number[] = [];

      for (let i = 0; i < bandCount; i++) {
        let bandSum = 0;
        for (let j = 0; j < step; j++) {
          bandSum += dataArray[i * step + j] || 0;
        }
        const avg = bandSum / step / 255;
        bands.push(avg);
        sum += avg;
      }
      const energy = Math.min(1, (sum / bandCount) * 1.8);
      return { energy, bands };
    }

    if (isSimulated) {
      // Natural voice cadence simulation
      const base1 = Math.sin(now * 3.5);
      const base2 = Math.sin(now * 7.2 + 1.2);
      const syll = Math.max(0, base1 * 0.6 + base2 * 0.4);
      const energy = 0.2 + syll * 0.65;
      const bands = Array.from({ length: 8 }, (_, i) => {
        return Math.min(1, Math.max(0.05, energy * (0.6 + Math.sin(now * (4 + i * 1.5)) * 0.4)));
      });
      return { energy, bands };
    }

    // Idle room murmur
    return {
      energy: 0.04 + Math.sin(now * 1.2) * 0.02,
      bands: [0.06, 0.04, 0.03, 0.05, 0.04, 0.03, 0.02, 0.02],
    };
  }
}

export const tavernFoley = new TavernFoleyEngine();
