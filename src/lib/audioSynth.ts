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

    // 2. Procedural Speech Emulation (Realistic conversational vocal cadence & decibels)
    if (simulateVocalCadence) {
      // Sentence loop: 3.8s total cycle (2.9s spoken speech + 0.9s breath pause)
      const sentencePeriod = 3.8;
      const phaseInSentence = timeSec % sentencePeriod;
      const isSpeaking = phaseInSentence < 2.9;

      let energy = 0.012; // Quiet resting ambient mic floor (-38.4 dBFS)

      if (isSpeaking) {
        // Conversational syllabic envelope: ~3.8 syllables per second
        const syllablePhase = (phaseInSentence * 24.0) % (Math.PI * 2);
        const syllablePulse = Math.pow(Math.max(0, Math.sin(syllablePhase)), 1.8);

        // Word stress curve (sentence rises in middle, falls at period)
        const wordStress = 0.45 + 0.55 * Math.sin((phaseInSentence / 2.9) * Math.PI);

        // Vocal tract formant micro-flutter (11-15 Hz)
        const formantFlutter = 0.85 + 0.15 * Math.sin(timeSec * 82.0);

        // Sub-syllable micro-pause (inter-word gap ~70ms)
        const interWordGate = Math.sin(phaseInSentence * 7.5) > -0.75 ? 1.0 : 0.15;

        // Peak energy ranges between 0.35 (-9 dBFS) and 0.82 (-1.7 dBFS)
        energy = Math.min(0.95, (0.08 + syllablePulse * wordStress * 0.78 * formantFlutter) * interWordGate);
      } else {
        // Inhale / breath pause: subtle room mic noise floor
        energy = 0.012 + Math.sin(timeSec * 8.0) * 0.004;
      }

      // Generate 8-band vocal formant spectrum (vowel energy concentrated in bands 1-4)
      const bands: number[] = [];
      const vowelFormants = [0.35, 0.85, 1.0, 0.65, 0.45, 0.30, 0.18, 0.10];
      for (let i = 0; i < 8; i++) {
        const bandNoise = 0.85 + 0.3 * Math.sin(timeSec * 16.0 + i * 1.7);
        bands.push(Math.min(1.0, Math.max(0.01, energy * vowelFormants[i] * bandNoise)));
      }

      return { energy, bands };
    }

    // Default gentle idle hum
    return {
      energy: 0.05,
      bands: [0.04, 0.06, 0.05, 0.07, 0.04, 0.03, 0.02, 0.01],
    };
  }
}

export const audioSynth = new AudioFoleyEngine();
