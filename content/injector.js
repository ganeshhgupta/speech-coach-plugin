// injector.js — turns a speech-coach analysis report into a short prompt
// and hands it to the active platform adapter to type into the chat and
// send. This is the only place that talks back to the page's own chat UI
// for the "review" step — no second model call happens here, the AI
// already in the conversation writes the actual review.
window.SC = window.SC || {};

(function () {
  function buildReviewPrompt(report) {
    const L = report.linguistics;
    const P = report.pauses;
    const Pr = report.prosody;

    const lines = [
      "Here is the vocal delivery analysis of the answer I just gave, from real acoustic measurement (not self-reported):",
    ];

    if (L.word_count < 8 || L.speaking_time_sec < 3.0) {
      lines.push(`- Only ${L.word_count} word(s) over ${L.speaking_time_sec}s — too little speech to measure pace or pitch reliably.`);
    } else {
      lines.push(`- Pace: ${L.wpm} words/min (comfortable range ~110-170)`);
      lines.push(`- Pitch variation (monotone indicator): coefficient of variation ${Pr.pitch_cv ?? "n/a"}`);
    }
    lines.push(`- Filler words: ${L.filler_rate_per_min}/min (${L.filler_count} total)`);
    lines.push(`- Hedge words: ${L.hedge_rate_per_min}/min (${L.hedge_count} total)`);
    lines.push(`- Long pauses (>1.2s): ${P.long_pause_count}, longest ${P.longest_pause_sec}s`);

    if (report.findings && report.findings.length) {
      lines.push("Findings:");
      for (const f of report.findings) {
        lines.push(`  [${f.severity}] ${f.category}: ${f.message}`);
      }
    }

    lines.push("");
    lines.push(
      "Please review my answer above, covering both whether it was correct/complete AND how it came across " +
      "delivery-wise given these real vocal measurements (pace, filler/hedge words, pauses, monotone/pitch variation). " +
      "Then ask the next question."
    );

    return lines.join("\n");
  }

  function injectAndSend(text) {
    if (!window.SC.activePlatform) throw new Error("No platform adapter registered.");
    return window.SC.activePlatform.injectAndSend(text);
  }

  window.SC.buildReviewPrompt = buildReviewPrompt;
  window.SC.injectAndSend = injectAndSend;
})();
