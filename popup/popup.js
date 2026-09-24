const SUPPORTED_HOSTS = ["claude.ai", "chatgpt.com", "chat.openai.com"];

const statusEl = document.getElementById("status");
const toggleBtn = document.getElementById("toggleBtn");
let currentTabId = null;
let armed = false;

function render() {
  toggleBtn.disabled = false;
  toggleBtn.textContent = armed ? "Deactivate" : "Activate for this tab";
  toggleBtn.classList.toggle("off", armed);
  statusEl.textContent = armed ? "Active — watching for questions." : "Inactive.";
  statusEl.className = `status ${armed ? "on" : "off"}`;
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
    statusEl.className = "status unsupported";
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

document.getElementById("settingsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

init();
