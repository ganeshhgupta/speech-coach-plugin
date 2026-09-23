// recorder.js — MediaRecorder wrapper. Mirrors the mimeType-detection
// pattern from speech-coach/frontend/index.html's pickMimeAndExt().
window.SC = window.SC || {};

(function () {
  const MAX_RECORD_SEC = 300; // safety cap in case VAD never detects silence

  function pickMimeAndExt() {
    const candidates = [
      ["audio/webm;codecs=opus", "webm"],
      ["audio/webm", "webm"],
      ["audio/mp4", "mp4"],
    ];
    for (const [mime, ext] of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(mime)) {
        return { mime, ext };
      }
    }
    return { mime: "", ext: "webm" };
  }

  class Recorder {
    constructor(stream) {
      this.stream = stream;
      this.mediaRecorder = null;
      this.chunks = [];
      this.ext = "webm";
      this.autoStopHandle = null;
      this.stopResolve = null;
    }

    isRecording() {
      return !!this.mediaRecorder && this.mediaRecorder.state === "recording";
    }

    start() {
      if (this.isRecording()) return;
      const { mime, ext } = pickMimeAndExt();
      this.ext = ext;
      this.chunks = [];
      try {
        this.mediaRecorder = mime ? new MediaRecorder(this.stream, { mimeType: mime }) : new MediaRecorder(this.stream);
      } catch (e) {
        this.mediaRecorder = new MediaRecorder(this.stream);
      }
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.chunks.push(e.data);
      };
      this.mediaRecorder.onstop = () => {
        clearTimeout(this.autoStopHandle);
        const blob = new Blob(this.chunks, { type: this.mediaRecorder.mimeType || `audio/${this.ext}` });
        if (this.stopResolve) {
          this.stopResolve({ blob, ext: this.ext });
          this.stopResolve = null;
        }
      };
      this.mediaRecorder.start();
      this.autoStopHandle = setTimeout(() => this.stop(), MAX_RECORD_SEC * 1000);
    }

    stop() {
      return new Promise((resolve) => {
        if (!this.isRecording()) {
          resolve(null);
          return;
        }
        this.stopResolve = resolve;
        this.mediaRecorder.stop();
      });
    }
  }

  window.SC.Recorder = Recorder;
})();
