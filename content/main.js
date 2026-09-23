// main.js — wires the engine together for the current tab. Loaded last by
// manifest.json so window.SC.{activePlatform, VAD, Recorder, overlay,
// analyzeRecording, buildReviewPrompt, injectAndSend} are all already set.
(function () {
  const SC = window.SC;
  if (!SC || !SC.activePlatform) {
    console.error("[speech-coach] no platform adapter loaded on this page.");
    return;
  }

  let active = false;
  let stream = null;
  let vad = null;
  let recorder = null;
  let stopWatchingMessages = null;
  // phase: "idle" (armed, no question yet) | "listening" (question shown, VAD
  // armed, waiting for the user to start talking) | "recording" | "analyzing".
  // Each transition is gated by phase, not a single busy flag — onSpeechStart
  // and onSpeechEnd need different gates (only fire in "listening" and
  // "recording" respectively), which a single boolean can't express.
  let phase = "idle";

  async function activate() {
    if (active) return;
    try {
      // AGC constantly re-adjusts input gain, which makes a fixed VAD energy
      // threshold unreliable; disable it so the mic's raw level is stable.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e) {
      SC.overlay.ensureMounted();
      SC.overlay.setError("Microphone permission denied. Click the extension icon to try again.");
      return;
    }

    active = true;
    phase = "idle";
    recorder = new SC.Recorder(stream);
    vad = new SC.VAD(stream);

    SC.overlay.ensureMounted();
    SC.overlay.setState("armed");
    SC.overlay.setManualHandlers(
      () => startRecording("manual"),
      () => stopRecordingAndReview("manual")
    );

    vad.onSpeechStart = () => {
      if (phase !== "listening") return;
      startRecording("vad");
    };
    vad.onSpeechEnd = () => {
      if (phase !== "recording") return;
      stopRecordingAndReview("vad");
    };

    stopWatchingMessages = SC.activePlatform.onNewAssistantMessage((questionText) => {
      if (phase !== "idle") return;
      SC.overlay.setQuestion(questionText);
      SC.overlay.setState("listening");
      phase = "listening";
      vad.start();
    });
  }

  function deactivate() {
    active = false;
    phase = "idle";
    if (stopWatchingMessages) stopWatchingMessages();
    stopWatchingMessages = null;
    if (vad) vad.close();
    vad = null;
    if (recorder && recorder.isRecording()) recorder.stop();
    recorder = null;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    SC.overlay.remove();
  }

  function startRecording(source) {
    if (!recorder || recorder.isRecording()) return;
    phase = "recording";
    // VAD keeps running through the recording — it's what detects the
    // user going quiet again to auto-stop.
    recorder.start();
    SC.overlay.setState("recording");
  }

  async function stopRecordingAndReview(source) {
    if (!recorder || !recorder.isRecording()) {
      phase = "idle";
      return;
    }
    phase = "analyzing";
    SC.overlay.setState("analyzing");
    try {
      const { blob, ext } = await recorder.stop();
      const report = await SC.analyzeRecording(blob, ext, (stage) => {
        SC.overlay.setState("analyzing", stage);
      });
      SC.overlay.setScore(report);
      const prompt = SC.buildReviewPrompt(report);
      await SC.injectAndSend(prompt);
      SC.overlay.setState("armed");
    } catch (e) {
      SC.overlay.setError(e.message || "Something went wrong analyzing that answer.");
      SC.overlay.setState("armed");
    } finally {
      phase = "idle";
      if (active && vad) vad.start();
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "sc-activate") {
      activate().then(() => sendResponse({ ok: true }));
      return true;
    }
    if (msg.type === "sc-deactivate") {
      deactivate();
      sendResponse({ ok: true });
      return true;
    }
  });
})();
