const SUPPORTED_HOSTS = ["claude.ai", "chatgpt.com", "chat.openai.com"];
const STORAGE_KEY = "scSettings";

// --- Activate/deactivate ---

const statusEl = document.getElementById("status");
const statusDotEl = document.getElementById("statusDot");
const toggleBtn = document.getElementById("toggleBtn");
let currentTabId = null;
let armed = false;

function render() {
  toggleBtn.disabled = false;
  toggleBtn.textContent = armed ? "Deactivate" : "Activate for this tab";
  toggleBtn.classList.toggle("off", armed);
  statusEl.textContent = armed ? "Active — watching for questions." : "Inactive.";
  statusDotEl.className = "status-dot" + (armed ? " on" : "");
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    statusEl.textContent = "No active tab.";
    return;
  }
  let host;
  try {
    host = new URL(tab.url).hostname;
  } catch (_) {
    host = "";
  }
  if (!SUPPORTED_HOSTS.includes(host)) {
    statusEl.textContent = "Open Claude.ai or ChatGPT to use this.";
    statusDotEl.className = "status-dot unsupported";
    return;
  }

  currentTabId = tab.id;
  const resp = await chrome.runtime.sendMessage({ type: "sc-get-state", tabId: currentTabId });
  armed = !!(resp && resp.armed);
  render();
}

toggleBtn.addEventListener("click", async () => {
  if (currentTabId == null) return;
  armed = !armed;
  toggleBtn.disabled = true;
  await chrome.runtime.sendMessage({ type: "sc-set-state", tabId: currentTabId, armed });
  render();
});

init();

// --- Settings accordion ---

const settingsToggle = document.getElementById("settingsToggle");
const settingsBody = document.getElementById("settingsBody");
settingsToggle.addEventListener("click", () => {
  const open = settingsBody.classList.toggle("open");
  settingsToggle.classList.toggle("open", open);
});

// --- CV/JD/type settings, incl. client-side PDF/DOCX extraction ---

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdf.worker.min.js");
}

const cvFileEl = document.getElementById("cvFile");
const cvFileStatusEl = document.getElementById("cvFileStatus");
const cvTextEl = document.getElementById("cvText");
const jdTextEl = document.getElementById("jdText");
const silenceSecEl = document.getElementById("silenceSec");
const typeTechnicalEl = document.getElementById("typeTechnical");
const typeCvBasedEl = document.getElementById("typeCvBased");
const typeBehavioralEl = document.getElementById("typeBehavioral");
const saveBtn = document.getElementById("saveBtn");
const saveStatusEl = document.getElementById("saveStatus");

function setCvFileStatus(text, isErr) {
  cvFileStatusEl.textContent = text;
  cvFileStatusEl.className = "field-status" + (isErr ? " err" : text ? " ok" : "");
}

async function extractPdfText(arrayBuffer) {
  const doc = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it) => it.str).join(" "));
  }
  return pages.join("\n\n");
}

async function extractDocxText(arrayBuffer) {
  const result = await window.mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

cvFileEl.addEventListener("change", async () => {
  const file = cvFileEl.files[0];
  if (!file) return;
  const ext = (file.name.split(".").pop() || "").toLowerCase();

  setCvFileStatus("Extracting...", false);
  try {
    let text = "";
    if (ext === "txt") {
      text = await file.text();
    } else if (ext === "pdf") {
      text = await extractPdfText(await file.arrayBuffer());
    } else if (ext === "docx") {
      text = await extractDocxText(await file.arrayBuffer());
    } else {
      setCvFileStatus("Unsupported file type. Use .pdf, .docx, or .txt.", true);
      return;
    }
    text = text.trim();
    if (!text) {
      setCvFileStatus("Extraction produced no text — try pasting it manually.", true);
      return;
    }
    cvTextEl.value = text;
    setCvFileStatus(`Extracted ${text.length} characters from ${file.name}. Review before saving.`, false);
  } catch (e) {
    setCvFileStatus(`Extraction failed: ${e.message || e}. Try pasting the text instead.`, true);
  }
});

function loadSettings() {
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    const s = result[STORAGE_KEY] || {};
    cvTextEl.value = s.cvText || "";
    jdTextEl.value = s.jdText || "";
    silenceSecEl.value = s.silenceSec || 2;
    const types = s.interviewTypes || {};
    typeTechnicalEl.checked = !!types.technical;
    typeCvBasedEl.checked = !!types.cvBased;
    typeBehavioralEl.checked = !!types.behavioral;

    // Open the accordion by default if nothing's configured yet, so it's
    // obvious there's a setup step the first time the popup is opened.
    const hasAnySettings = s.cvText || s.jdText || types.technical || types.cvBased || types.behavioral;
    if (!hasAnySettings) {
      settingsBody.classList.add("open");
      settingsToggle.classList.add("open");
    }
  });
}

saveBtn.addEventListener("click", () => {
  const silenceSec = Math.min(10, Math.max(1, Number(silenceSecEl.value) || 2));
  silenceSecEl.value = silenceSec;

  const settings = {
    cvText: cvTextEl.value.trim(),
    jdText: jdTextEl.value.trim(),
    silenceSec,
    interviewTypes: {
      technical: typeTechnicalEl.checked,
      cvBased: typeCvBasedEl.checked,
      behavioral: typeBehavioralEl.checked,
    },
  };

  chrome.storage.local.set({ [STORAGE_KEY]: settings }, () => {
    saveStatusEl.textContent = "Saved.";
    setTimeout(() => {
      saveStatusEl.textContent = "";
    }, 2500);
  });
});

loadSettings();
