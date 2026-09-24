// overlay.js — the floating status panel injected into the page. Exposes
// window.SC.overlay with imperative update methods; main.js drives it.
window.SC = window.SC || {};

(function () {
  let root = null;
  let dotEl, statusTextEl, turnCountEl, questionEl, startBtn, stopBtn, endBtn, scoreEl;
  let onManualStart = null;
  let onManualStop = null;
  let onEndSession = null;

  function ensureMounted() {
    if (root) return;
    root = document.createElement("div");
    root.id = "sc-overlay";
    root.innerHTML = `
      <h2>Speech Coach <span id="sc-turn-count" style="float:right;"></span></h2>
      <div class="sc-status-row">
        <span class="sc-dot" id="sc-dot"></span>
        <span id="sc-status-text">Inactive</span>
      </div>
      <div class="sc-question" id="sc-question" style="display:none;"></div>
      <div class="sc-buttons">
        <button id="sc-start-btn" disabled>Start</button>
        <button id="sc-stop-btn" class="sc-stop" disabled>Stop</button>
      </div>
      <div class="sc-buttons">
        <button id="sc-end-btn" class="sc-end">End Session &amp; Get Review</button>
      </div>
      <div class="sc-score" id="sc-score"><div class="sc-empty">No answer analyzed yet.</div></div>
    `;
    document.documentElement.appendChild(root);

    dotEl = root.querySelector("#sc-dot");
    statusTextEl = root.querySelector("#sc-status-text");
    turnCountEl = root.querySelector("#sc-turn-count");
    questionEl = root.querySelector("#sc-question");
    startBtn = root.querySelector("#sc-start-btn");
    stopBtn = root.querySelector("#sc-stop-btn");
    endBtn = root.querySelector("#sc-end-btn");
    scoreEl = root.querySelector("#sc-score");

    startBtn.addEventListener("click", () => onManualStart && onManualStart());
    stopBtn.addEventListener("click", () => onManualStop && onManualStop());
    endBtn.addEventListener("click", () => onEndSession && onEndSession());
  }

  function remove() {
    if (root) {
      root.remove();
      root = null;
    }
  }

  // state: "inactive" | "priming" | "armed" | "listening" | "recording" | "analyzing" | "ending"
  function setState(state, extra) {
    ensureMounted();
    dotEl.className = "sc-dot";
    startBtn.disabled = true;
    stopBtn.disabled = true;

    if (state === "inactive") {
      statusTextEl.textContent = "Inactive";
    } else if (state === "priming") {
      dotEl.classList.add("busy");
      statusTextEl.textContent = "Setting up interview context...";
    } else if (state === "armed") {
      dotEl.classList.add("armed");
      statusTextEl.textContent = "Waiting for a question";
    } else if (state === "listening") {
      dotEl.classList.add("armed");
      statusTextEl.textContent = "Listening for your answer";
      startBtn.disabled = false;
    } else if (state === "recording") {
      dotEl.classList.add("recording");
      statusTextEl.textContent = "Recording your answer";
      stopBtn.disabled = false;
    } else if (state === "analyzing") {
      dotEl.classList.add("busy");
      statusTextEl.textContent = extra || "Analyzing...";
    } else if (state === "ending") {
      dotEl.classList.add("busy");
      statusTextEl.textContent = "Requesting session review...";
    }
  }

  function setTurnCount(n) {
    ensureMounted();
    turnCountEl.textContent = n > 0 ? `${n} turn${n === 1 ? "" : "s"}` : "";
  }

  function setQuestion(text) {
    ensureMounted();
    if (!text) {
      questionEl.style.display = "none";
      return;
    }
    questionEl.style.display = "block";
    questionEl.textContent = text;
  }

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
  }

  function metricRow(label, value, flagged) {
    return `<div class="sc-metric-row${flagged ? " sc-metric-flag" : ""}">
      <span>${esc(label)}</span><span class="sc-metric-val">${esc(value)}</span>
    </div>`;
  }

  // report: the plain analysis Report from /api/analyze (linguistics/pauses/
  // prosody/findings — no numeric score, /api/analyze doesn't compute one).
  // Renders every measured field, not just a one-line summary.
  function setScore(report) {
    ensureMounted();
    if (!report) {
      scoreEl.innerHTML = `<div class="sc-empty">No answer analyzed yet.</div>`;
      return;
    }

    const L = report.linguistics || {};
    const P = report.pauses || {};
    const Pr = report.prosody || {};
    const enoughSpeech = (L.word_count || 0) >= 8 && (L.speaking_time_sec || 0) >= 3.0;

    let html = "";
    html += `<div class="sc-metrics-title">Delivery metrics</div>`;

    if (!enoughSpeech) {
      html += `<div class="sc-empty">Only ${L.word_count ?? 0} word(s) over ${L.speaking_time_sec ?? 0}s — too little speech for pace/pitch metrics.</div>`;
    } else {
      html += metricRow("Pace", `${L.wpm} wpm`, L.wpm < 110 || L.wpm > 170);
      html += metricRow("Pitch variation (CV)", Pr.pitch_cv ?? "n/a");
    }
    html += metricRow("Filler words", `${L.filler_rate_per_min ?? 0}/min (${L.filler_count ?? 0})`, (L.filler_rate_per_min ?? 0) > 3);
    html += metricRow("Hedge words", `${L.hedge_rate_per_min ?? 0}/min (${L.hedge_count ?? 0})`, (L.hedge_rate_per_min ?? 0) > 3);
    html += metricRow("Long pauses (>1.2s)", `${P.long_pause_count ?? 0}`, (P.long_pause_count ?? 0) > 0);
    html += metricRow("Longest pause", `${P.longest_pause_sec ?? 0}s`);
    html += metricRow("Speaking time", `${L.speaking_time_sec ?? 0}s`);
    html += metricRow("Word count", `${L.word_count ?? 0}`);

    if (report.findings && report.findings.length) {
      html += `<div class="sc-findings-title">Findings</div>`;
      for (const f of report.findings) {
        html += `<div class="sc-finding sc-sev-${esc(f.severity)}">
          <span class="sc-finding-cat">[${esc(f.severity)}] ${esc(f.category)}</span><br>${esc(f.message)}
        </div>`;
      }
    }

    scoreEl.innerHTML = html;
  }

  function setError(message) {
    ensureMounted();
    scoreEl.innerHTML = `<span style="color:#e5484d;">${message}</span>`;
  }

  function setManualHandlers(startFn, stopFn, endFn) {
    onManualStart = startFn;
    onManualStop = stopFn;
    onEndSession = endFn;
  }

  window.SC.overlay = {
    ensureMounted, remove, setState, setQuestion, setScore, setError, setManualHandlers, setTurnCount,
  };
})();
