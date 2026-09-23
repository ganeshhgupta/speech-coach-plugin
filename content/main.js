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
  let busy = false; // true while recording or analyzing — ignore new questions until the loop settles

  async function activate() {
    if (active) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      SC.overlay.ensureMounted();
      SC.overlay.setError("Microphone permission denied. Click the extension icon to try again.");
      return;
    }

    active = true;
    recorder = new SC.Recorder(stream);
    vad = new SC.VAD(stream);

    SC.overlay.ensureMounted();
    SC.overlay.setState("armed");
    SC.overlay.setManualHandlers(
      () => startRecording("manual"),
      () => stopRecordingAndReview("manual")
    );

    vad.onSpeechStart = () => {
      if (busy) return;
      startRecording("vad");
    };
    vad.onSpeechEnd = () => {
      if (busy) return;
      stopRecordingAndReview("vad");
    };

    stopWatchingMessages = SC.activePlatform.onNewAssistantMessage((questionText) => {
      if (busy) return;
      SC.overlay.setQuestion(questionText);
      SC.overlay.setState("listening");
      vad.start();
    });
  }

  function deactivate() {
    active = false;
    busy = false;
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
    if (busy || !recorder || recorder.isRecording()) return;
    busy = true;
    if (vad) vad.stop();
    recorder.start();
    SC.overlay.setState("recording");
  }

  async function stopRecordingAndReview(source) {
    if (!recorder || !recorder.isRecording()) {
      busy = false;
      return;
    }
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
      busy = false;
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
