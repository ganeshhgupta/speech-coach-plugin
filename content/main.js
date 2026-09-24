// main.js — wires the engine together for the current tab. Loaded last by
// manifest.json so window.SC.{activePlatform, VAD, Recorder, overlay,
// loadSettings, buildContextPrompt, buildFinalReviewPrompt, analyzeRecording,
// buildReviewPrompt, injectAndSend} are all already set.
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
  let settings = null;
  let currentQuestion = "";
  let sessionTurns = []; // [{questionText, report}] — built up for the end-of-session review
  // phase: "idle" (armed, no question yet) | "listening" (question shown, VAD
  // armed, waiting for the user to start talking) | "recording" | "analyzing"
  // | "priming" (injecting the ground-rules prompt at session start) |
  // "ending" (injecting the final review prompt). Each transition is gated
  // by phase, not a single busy flag — onSpeechStart and onSpeechEnd need
  // different gates (only fire in "listening" and "recording" respectively),
  // which a single boolean can't express.
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

    settings = await SC.loadSettings();
    active = true;
    phase = "priming";
    currentQuestion = "";
    sessionTurns = [];
    recorder = new SC.Recorder(stream);
    vad = new SC.VAD(stream, { stopSilenceSec: settings.silenceSec });

    SC.overlay.ensureMounted();
    SC.overlay.setState("priming");
    SC.overlay.setTurnCount(0);
    SC.overlay.setManualHandlers(
      () => startRecording("manual"),
      () => stopRecordingAndReview("manual"),
      () => endSession("manual")
    );

    vad.onSpeechStart = () => {
      if (phase !== "listening") return;
      startRecording("vad");
    };
    vad.onSpeechEnd = () => {
      if (phase !== "recording") return;
      stopRecordingAndReview("vad");
    };

    // Set up question-watching before injecting the context prompt, so the
    // AI's first reply (the first interview question, per the prompt's last
    // line) is caught rather than raced.
    stopWatchingMessages = SC.activePlatform.onNewAssistantMessage((questionText) => {
      if (phase !== "idle") return;
      currentQuestion = questionText;
      SC.overlay.setQuestion(questionText);
      SC.overlay.setState("listening");
      phase = "listening";
      vad.start();
    });

    try {
      await SC.injectAndSend(SC.buildContextPrompt(settings));
      phase = "idle";
      SC.overlay.setState("armed");
    } catch (e) {
      SC.overlay.setError(e.message || "Couldn't set up the interview context.");
      phase = "idle";
      SC.overlay.setState("armed");
    }
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
      sessionTurns.push({ questionText: currentQuestion, report });
      SC.overlay.setTurnCount(sessionTurns.length);
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

  // Injects the final aggregate-review prompt (if any answers were given
  // this session), then tears everything down. Triggered either by the
  // overlay's "End Session" button or by deactivating from the popup.
  async function endSession(source) {
    if (!active) return;
    const turns = sessionTurns;
    phase = "ending";
    if (vad) vad.stop();
    if (recorder && recorder.isRecording()) {
      try {
        await recorder.stop();
      } catch (_) {}
    }

    if (turns.length > 0) {
      SC.overlay.setState("ending");
      try {
        await SC.injectAndSend(SC.buildFinalReviewPrompt(turns));
      } catch (e) {
        SC.overlay.setError(e.message || "Couldn't request the session review.");
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    deactivate();
    try {
      chrome.runtime.sendMessage({ type: "sc-self-deactivated" });
    } catch (_) {}
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "sc-activate") {
      activate().then(() => sendResponse({ ok: true }));
      return true;
    }
    if (msg.type === "sc-deactivate") {
      endSession("popup").then(() => sendResponse({ ok: true }));
      return true;
    }
  });
})();
