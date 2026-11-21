const SOUND_MUTED_STORAGE_KEY = 'pixelfield_sound_muted';

type MuteListener = (muted: boolean) => void;

class CozySoundFX {
  private ctx: AudioContext | null = null;
  private _muted = false;
  private listeners = new Set<MuteListener>();

  // Ambient village soundscape state
  private ambientActive = false;
  private ambientGain: GainNode | null = null;
  private breezeSource: AudioBufferSourceNode | null = null;
  private birdTimer: number | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this._muted = window.localStorage.getItem(SOUND_MUTED_STORAGE_KEY) === 'true';
      } catch {
        this._muted = false;
      }
    }
  }

  public get muted(): boolean {
    return this._muted;
  }

  public set muted(value: boolean) {
    this.setMuted(value);
  }

  public getMuted(): boolean {
    return this._muted;
  }

  public setMuted(value: boolean): void {
    const next = Boolean(value);
    if (this._muted === next) return;
    this._muted = next;

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(SOUND_MUTED_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage errors in restricted iframes
      }
    }

    if (next) {
      this.teardownAmbientNodes();
    } else if (this.ambientActive) {
      this.ensureAmbientRunning();
    }

    for (const listener of this.listeners) {
      listener(this._muted);
    }
  }

  public toggleMuted(): boolean {
    this.setMuted(!this._muted);
    if (!this._muted) {
      this.playTone(440, 554.37, 0.1, 'sine', 0.04);
    }
    return this._muted;
  }

  public subscribe(listener: MuteListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private ensureContext(): AudioContext | null {
    if (this._muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx?.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public startAmbient(): void {
    this.ambientActive = true;
    if (!this._muted) {
      this.ensureAmbientRunning();
    }
  }

  public stopAmbient(): void {
    this.ambientActive = false;
    this.teardownAmbientNodes();
  }

  private ensureAmbientRunning(): void {
    if (this._muted || !this.ambientActive || this.breezeSource) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      // Create a gentle 4-second soft filtered breeze loop (pink-ish noise through lowpass)
      const sampleRate = ctx.sampleRate;
      const length = sampleRate * 4;
      const buffer = ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.04;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(420, ctx.currentTime);
      filter.Q.setValueAtTime(0.7, ctx.currentTime);

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      masterGain.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 1.2);

      source.connect(filter);
      filter.connect(masterGain);
      masterGain.connect(ctx.destination);
      source.start();

      this.breezeSource = source;
      this.ambientGain = masterGain;

      // Occasional soft distant birdsong chirp while exploring the village
      const scheduleChirp = () => {
        if (!this.ambientActive || this._muted) return;
        const delayMs = 4500 + Math.random() * 6500;
        this.birdTimer = window.setTimeout(() => {
          if (this.ambientActive && !this._muted && this.ctx?.state === 'running') {
            const baseFreq = 1350 + Math.random() * 450;
            this.playTone(baseFreq, baseFreq * 1.18, 0.09, 'sine', 0.012);
            window.setTimeout(() => {
              if (this.ambientActive && !this._muted) {
                this.playTone(baseFreq * 1.12, baseFreq * 0.95, 0.11, 'sine', 0.01);
              }
            }, 130);
          }
          scheduleChirp();
        }, delayMs);
      };
      scheduleChirp();
    } catch {
      // Gracefully ignore if AudioContext is blocked prior to user gesture
    }
  }

  private teardownAmbientNodes(): void {
    if (this.birdTimer !== null) {
      window.clearTimeout(this.birdTimer);
      this.birdTimer = null;
    }
    if (this.breezeSource) {
      try {
        this.breezeSource.stop();
        this.breezeSource.disconnect();
      } catch {
        // Already stopped
      }
      this.breezeSource = null;
    }
    if (this.ambientGain) {
      try {
        this.ambientGain.disconnect();
      } catch {
        // Already disconnected
      }
      this.ambientGain = null;
    }
  }

  private playTone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType = 'triangle',
    gainPeak = 0.06
  ) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public place() {
    this.playTone(340, 480, 0.09, 'triangle', 0.06);
  }

  public remove() {
    this.playTone(260, 150, 0.09, 'sine', 0.05);
  }

  public error() {
    this.playTone(180, 120, 0.14, 'sawtooth', 0.035);
  }

  public chat() {
    this.playTone(540, 680, 0.07, 'sine', 0.03);
  }

  public startWorld() {
    this.playTone(392, 523.25, 0.18, 'triangle', 0.06);
    setTimeout(() => this.playTone(523.25, 659.25, 0.22, 'triangle', 0.05), 90);
  }

  public clueFound() {
    this.playTone(523.25, 659.25, 0.12, 'triangle', 0.055);
    setTimeout(() => this.playTone(659.25, 783.99, 0.16, 'sine', 0.05), 85);
  }

  public questComplete() {
    this.playTone(523.25, 587.33, 0.12, 'triangle', 0.06);
    setTimeout(() => this.playTone(659.25, 783.99, 0.16, 'triangle', 0.06), 100);
    setTimeout(() => this.playTone(783.99, 1046.5, 0.26, 'sine', 0.055), 210);
  }

  public chestOpen() {
    this.playTone(330, 440, 0.14, 'triangle', 0.06);
    setTimeout(() => this.playTone(440, 659.25, 0.2, 'triangle', 0.06), 110);
    setTimeout(() => this.playTone(659.25, 880, 0.28, 'sine', 0.05), 220);
  }

  public plateClick() {
    this.playTone(293.66, 440, 0.15, 'sine', 0.055);
  }
}

export const soundFx = new CozySoundFX();
