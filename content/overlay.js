// overlay.js — the floating status panel injected into the page. Exposes
// window.SC.overlay with imperative update methods; main.js drives it.
window.SC = window.SC || {};

(function () {
  let root = null;
  let dotEl, statusTextEl, questionEl, startBtn, stopBtn, scoreEl;
  let onManualStart = null;
  let onManualStop = null;

  function ensureMounted() {
    if (root) return;
    root = document.createElement("div");
    root.id = "sc-overlay";
    root.innerHTML = `
      <h2>Speech Coach</h2>
      <div class="sc-status-row">
        <span class="sc-dot" id="sc-dot"></span>
        <span id="sc-status-text">Inactive</span>
      </div>
      <div class="sc-question" id="sc-question" style="display:none;"></div>
      <div class="sc-buttons">
        <button id="sc-start-btn" disabled>Start</button>
        <button id="sc-stop-btn" class="sc-stop" disabled>Stop</button>
      </div>
      <div class="sc-score" id="sc-score"></div>
    `;
    document.documentElement.appendChild(root);

    dotEl = root.querySelector("#sc-dot");
    statusTextEl = root.querySelector("#sc-status-text");
    questionEl = root.querySelector("#sc-question");
    startBtn = root.querySelector("#sc-start-btn");
    stopBtn = root.querySelector("#sc-stop-btn");
    scoreEl = root.querySelector("#sc-score");

    startBtn.addEventListener("click", () => onManualStart && onManualStart());
    stopBtn.addEventListener("click", () => onManualStop && onManualStop());
  }

  function remove() {
    if (root) {
      root.remove();
      root = null;
    }
  }

  // state: "inactive" | "armed" | "listening" | "recording" | "analyzing"
  function setState(state, extra) {
    ensureMounted();
    dotEl.className = "sc-dot";
    startBtn.disabled = true;
    stopBtn.disabled = true;

    if (state === "inactive") {
      statusTextEl.textContent = "Inactive";
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
    }
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

  // report: the plain analysis Report from /api/analyze (linguistics/pauses/
  // prosody/findings — no numeric score, /api/analyze doesn't compute one).
  function setScore(report) {
    ensureMounted();
    if (!report) {
      scoreEl.textContent = "";
      return;
    }
    const L = report.linguistics;
    if (!L || L.word_count < 8 || L.speaking_time_sec < 3.0) {
      scoreEl.textContent = "Last answer too short to measure.";
      return;
    }
    scoreEl.innerHTML = `Last answer: <b>${L.wpm} wpm</b>, ${L.filler_count} filler word(s)`;
  }

  function setError(message) {
    ensureMounted();
    scoreEl.innerHTML = `<span style="color:#e5484d;">${message}</span>`;
  }

  function setManualHandlers(startFn, stopFn) {
    onManualStart = startFn;
    onManualStop = stopFn;
  }

  window.SC.overlay = { ensureMounted, remove, setState, setQuestion, setScore, setError, setManualHandlers };
})();
