// background.js — service worker: tracks which tabs are "armed" and relays
// activate/deactivate/status messages between the popup and the content
// script. No network calls happen here; all analysis is done in-page.

const armedTabs = new Set();

function setBadge(tabId, armed) {
  chrome.action.setBadgeText({ tabId, text: armed ? "ON" : "" });
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#5b8def" });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "sc-get-state") {
    const tabId = message.tabId;
    sendResponse({ armed: armedTabs.has(tabId) });
    return true;
  }

  if (message.type === "sc-set-state") {
    const tabId = message.tabId;
    if (message.armed) {
      armedTabs.add(tabId);
    } else {
      armedTabs.delete(tabId);
    }
    setBadge(tabId, message.armed);
    chrome.tabs.sendMessage(tabId, { type: message.armed ? "sc-activate" : "sc-deactivate" }).catch(() => {});
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "sc-status-update" && sender.tab) {
    // Forwarded to the popup if it's currently open and listening; the
    // popup queries state directly on open instead, so this is best-effort
    // for a future "live status while popup is open" feature.
    chrome.runtime.sendMessage({ ...message, tabId: sender.tab.id }).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  armedTabs.delete(tabId);
});
