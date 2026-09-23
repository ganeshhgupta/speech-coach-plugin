// vad.js — simple client-side voice-activity detection: RMS energy over a
// sliding window on the extension's own mic stream. Neither Claude.ai nor
// ChatGPT exposes a reliable "AI speaking vs listening" signal (confirmed
// by research before building this), so turn detection is done entirely
// from the user's own mic audio rather than either site's internal state.
//
// Mirrors speech-coach's own pause thresholds (backend/pipeline/linguistics.py):
// PAUSE_THRESHOLD_SEC = 0.4, LONG_PAUSE_THRESHOLD_SEC = 1.2 — reused here as
// the start-speaking debounce (want to be a little faster to react) and
// stop-speaking silence window respectively.
window.SC = window.SC || {};

(function () {
  const START_DEBOUNCE_SEC = 0.3;
  const STOP_SILENCE_SEC = 1.2;
  const ENERGY_THRESHOLD = 0.02; // RMS, roughly-tuned for a typical laptop/phone mic

  class VAD {
    constructor(stream) {
      this.stream = stream;
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 2048;
      const source = this.audioCtx.createMediaStreamSource(stream);
      source.connect(this.analyser);
      this.buf = new Float32Array(this.analyser.fftSize);

      this.speaking = false;
      this.aboveSince = null;
      this.belowSince = null;
      this.rafId = null;
      this.onSpeechStart = null;
      this.onSpeechEnd = null;
    }

    _rms() {
      this.analyser.getFloatTimeDomainData(this.buf);
      let sum = 0;
      for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
      return Math.sqrt(sum / this.buf.length);
    }

    _tick() {
      const now = performance.now() / 1000;
      const energy = this._rms();

      if (energy >= ENERGY_THRESHOLD) {
        this.belowSince = null;
        if (!this.speaking) {
          if (this.aboveSince == null) this.aboveSince = now;
          if (now - this.aboveSince >= START_DEBOUNCE_SEC) {
            this.speaking = true;
            this.aboveSince = null;
            if (this.onSpeechStart) this.onSpeechStart();
          }
        }
      } else {
        this.aboveSince = null;
        if (this.speaking) {
          if (this.belowSince == null) this.belowSince = now;
          if (now - this.belowSince >= STOP_SILENCE_SEC) {
            this.speaking = false;
            this.belowSince = null;
            if (this.onSpeechEnd) this.onSpeechEnd();
          }
        }
      }

      this.rafId = requestAnimationFrame(() => this._tick());
    }

    start() {
      this.speaking = false;
      this.aboveSince = null;
      this.belowSince = null;
      this._tick();
    }

    stop() {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    close() {
      this.stop();
      this.audioCtx.close().catch(() => {});
    }
  }

  window.SC.VAD = VAD;
})();
