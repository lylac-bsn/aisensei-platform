/** Lightweight Web Audio cues for quest transitions (no asset files). */
export class QuestSfx {
  constructor(volume = 0.32) {
    this.volume = volume;
    this.ctx = null;
  }

  async ensureContext() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    return this.ctx;
  }

  _tone(ctx, freq, start, duration, peak = this.volume, type = "sine") {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  /** Ascending chime — single quest cleared (happy celebration). */
  async playQuestComplete() {
    try {
      const ctx = await this.ensureContext();
      const t = ctx.currentTime;
      const vol = Math.min(this.volume * 1.15, 0.45);

      // Bouncy major arpeggio
      [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((freq, i) => {
        this._tone(ctx, freq, t + i * 0.09, 0.24, vol, i % 2 === 0 ? "triangle" : "sine");
      });

      // Sparkle finish
      [1567.98, 2093].forEach((freq, i) => {
        this._tone(ctx, freq, t + 0.52 + i * 0.06, 0.2, vol * 0.8, "sine");
      });
    } catch {
      // ignore autoplay / audio errors
    }
  }

  /** Big victory fanfare — entire lesson cleared! */
  async playLessonComplete() {
    try {
      const ctx = await this.ensureContext();
      const t = ctx.currentTime;
      const vol = Math.min(this.volume * 1.5, 0.55);

      // Rising fanfare arpeggio (C major)
      [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((freq, i) => {
        this._tone(ctx, freq, t + i * 0.11, 0.32, vol, i % 2 === 0 ? "triangle" : "sine");
      });

      // Sparkle hits
      [1567.98, 1760, 2093].forEach((freq, i) => {
        this._tone(ctx, freq, t + 0.62 + i * 0.07, 0.22, vol * 0.75, "sine");
      });

      // Final celebratory chord
      [1046.5, 1318.51, 1567.98, 2093].forEach((freq, i) => {
        this._tone(ctx, freq, t + 0.95 + i * 0.015, 0.75, vol * 0.85, "triangle");
      });
    } catch {
      // ignore autoplay / audio errors
    }
  }

  /** Quick bright ping — next quest loading (plays on handoff disconnect, not reconnect). */
  async playQuestReady() {
    try {
      const ctx = await this.ensureContext();
      const t = ctx.currentTime;
      this._tone(ctx, 880, t, 0.12, this.volume * 0.85);
      this._tone(ctx, 1174.66, t + 0.08, 0.18, this.volume * 0.7);
    } catch {
      // ignore
    }
  }
}
