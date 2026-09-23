// analysis-client.js — posts a recorded answer to speech-coach's existing,
// unauthenticated /api/analyze endpoint (already CORS-open, no Claude/OpenAI
// API key involved) and returns the parsed report.
window.SC = window.SC || {};

(function () {
  const ANALYZE_URL = "https://speech-coach-rsme.onrender.com/api/analyze";

  // onProgress(stage: string) is optional, called as NDJSON progress events arrive.
  async function analyzeRecording(blob, ext, onProgress) {
    const form = new FormData();
    form.append("file", blob, `answer.${ext}`);
    form.append("diarize", "false");

    const resp = await fetch(ANALYZE_URL, { method: "POST", body: form });
    if (!resp.ok) {
      let detail = "Analysis request failed.";
      try {
        detail = (await resp.json()).detail || detail;
      } catch (_) {}
      throw new Error(detail);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;

        const evt = JSON.parse(line);
        if (evt.stage === "error") {
          throw new Error(evt.message || "Analysis failed.");
        }
        if (evt.stage === "done") {
          return evt.report;
        }
        if (onProgress) onProgress(evt.stage);
      }
    }

    throw new Error("Analysis stream ended without a result.");
  }

  window.SC.analyzeRecording = analyzeRecording;
})();
