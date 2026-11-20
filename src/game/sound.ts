class CozySoundFX {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx?.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private playTone(freq: number, endFreq: number, duration: number, type: OscillatorType = 'triangle', gainPeak = 0.06) {
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
}

export const soundFx = new CozySoundFX();
