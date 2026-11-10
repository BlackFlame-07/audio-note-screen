/**
 * Web Audio Foley Synth & Mic Analyser Engine
 * - 4ms mechanical micro-clicks for tactile button presses
 * - 120ms cassette eject servo whir using native OscillatorNode
 * - Web Audio API AnalyserNode + Procedural speech simulation fallback
 */

class AudioFoleyEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private frequencyData: Uint8Array | null = null;
  private isMuted: boolean = false;
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

  public toggleMute(force?: boolean): boolean {
    this.isMuted = force !== undefined ? force : !this.isMuted;
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Generates a 4ms crisp mechanical micro-switch click
   */
  public playClick(pitch: number = 1000) {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      // Bandpass transient filter for tactile snap
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(pitch, now);
      filter.Q.setValueAtTime(3.5, now);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(pitch * 1.4, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.004);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.004);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.005);
    } catch (e) {
      console.warn('Audio click playback suppressed', e);
    }
  }

  /**
   * Generates 120ms cassette-eject servo whir & metallic chassis thunk
   */
  public playEjectServo() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const duration = 0.12; // 120ms

      // Servo motor whir
      const motorOsc = this.ctx.createOscillator();
      const motorGain = this.ctx.createGain();
      motorOsc.type = 'sawtooth';
      motorOsc.frequency.setValueAtTime(460, now);
      motorOsc.frequency.exponentialRampToValueAtTime(140, now + duration);

      // Chassis resonance low-pass filter
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1800, now);
      filter.frequency.linearRampToValueAtTime(400, now + duration);

      motorGain.gain.setValueAtTime(0.01, now);
      motorGain.gain.linearRampToValueAtTime(0.28, now + 0.02);
      motorGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      motorOsc.connect(filter);
      filter.connect(motorGain);
      motorGain.connect(this.ctx.destination);

      motorOsc.start(now);
      motorOsc.stop(now + duration + 0.01);

      // Mechanical release latch thunk at 90ms
      const thunkOsc = this.ctx.createOscillator();
      const thunkGain = this.ctx.createGain();
      thunkOsc.type = 'sine';
      thunkOsc.frequency.setValueAtTime(120, now + 0.08);
      thunkOsc.frequency.exponentialRampToValueAtTime(45, now + duration);

      thunkGain.gain.setValueAtTime(0.001, now);
      thunkGain.gain.setValueAtTime(0.4, now + 0.08);
      thunkGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      thunkOsc.connect(thunkGain);
      thunkGain.connect(this.ctx.destination);

      thunkOsc.start(now + 0.08);
      thunkOsc.stop(now + duration + 0.01);
    } catch (e) {
      console.warn('Audio servo playback error', e);
    }
  }

  /**
   * Initializes real microphone feed via navigator.mediaDevices.getUserMedia
   */
  public async enableMicrophone(): Promise<boolean> {
    try {
      this.initContext();
      if (!this.ctx) return false;

      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        this.micSource = this.ctx.createMediaStreamSource(this.micStream);
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 128;
        this.analyser.smoothingTimeConstant = 0.8;
        this.micSource.connect(this.analyser);
        this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
        this.isMicActive = true;
        return true;
      }
      return false;
    } catch (err) {
      console.warn('Microphone access denied or unavailable. Fallback procedural simulation active.', err);
      this.isMicActive = false;
      return false;
    }
  }

  public disableMicrophone() {
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    this.analyser = null;
    this.frequencyData = null;
    this.isMicActive = false;
  }

  /**
   * Retrieves live mic audio energy [0..1] or procedural speech simulation
   */
  public getLiveAudioEnergy(timeSec: number, simulateVocalCadence: boolean = false): {
    energy: number;
    bands: number[];
  } {
    // 1. If real microphone is connected, compute RMS energy & frequency bins
    if (this.isMicActive && this.analyser && this.frequencyData) {
      this.analyser.getByteFrequencyData(this.frequencyData);
      let sum = 0;
      const bands: number[] = [];
      const step = Math.floor(this.frequencyData.length / 8);

      for (let i = 0; i < 8; i++) {
        let bandSum = 0;
        for (let j = 0; j < step; j++) {
          const val = this.frequencyData[i * step + j] || 0;
          bandSum += val;
          sum += val;
        }
        bands.push(bandSum / (step * 255));
      }

      const avg = sum / (this.frequencyData.length * 255);
      return { energy: Math.min(1, avg * 2.2), bands };
    }

    // 2. Procedural Simplex/Harmonic Fallback (Clean screen recording without talking)
    if (simulateVocalCadence) {
      // Simulate speech phrases (bursts of vocal energy separated by breath pauses)
      const phraseCycle = (Math.sin(timeSec * 1.8) + Math.cos(timeSec * 3.4)) * 0.5 + 0.5;
      const breathPause = Math.sin(timeSec * 0.7) > -0.2 ? 1 : 0.08;
      const highFlutter = Math.sin(timeSec * 9.5) * 0.15;
      const vocalSpike = Math.max(0, phraseCycle * breathPause + highFlutter);

      const bands: number[] = [];
      for (let i = 0; i < 8; i++) {
        const bandVal = Math.sin(timeSec * 4 + i * 1.2) * 0.5 + 0.5;
        bands.push(Math.min(1, Math.max(0, vocalSpike * (0.4 + bandVal * 0.6))));
      }

      return { energy: Math.min(1, vocalSpike), bands };
    }

    // Default gentle idle hum
    return {
      energy: 0.05,
      bands: [0.04, 0.06, 0.05, 0.07, 0.04, 0.03, 0.02, 0.01],
    };
  }
}

export const audioSynth = new AudioFoleyEngine();
