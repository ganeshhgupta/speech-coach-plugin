// platforms/chatgpt.js — ChatGPT (chatgpt.com / chat.openai.com) adapter.
// DOM selectors here are best-effort and WILL break when OpenAI's UI
// changes; this is the only file that should need updating when that
// happens. See README's "known-fragile-selectors" note.
window.SC = window.SC || {};

(function () {
  const SETTLE_DEBOUNCE_MS = 900; // how long an assistant message must stop growing before we treat it as "done"

  const ASSISTANT_MESSAGE_SELECTORS = [
    '[data-message-author-role="assistant"]',
    'div[data-testid^="conversation-turn"] [data-message-author-role="assistant"]',
  ];
  const COMPOSER_SELECTORS = [
    "#prompt-textarea",
    'div[contenteditable="true"]#prompt-textarea',
    'div[contenteditable="true"]',
  ];
  const SEND_BUTTON_SELECTORS = [
    '[data-testid="send-button"]',
    'button[aria-label*="Send"]',
    'button[type="submit"]',
  ];

  function queryFirst(selectors, root = document) {
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function queryAllFirst(selectors, root = document) {
    for (const sel of selectors) {
      const els = root.querySelectorAll(sel);
      if (els.length) return Array.from(els);
    }
    return [];
  }

  function getLatestAssistantMessageEl() {
    const els = queryAllFirst(ASSISTANT_MESSAGE_SELECTORS);
    return els.length ? els[els.length - 1] : null;
  }

  function getLatestAssistantMessage() {
    const el = getLatestAssistantMessageEl();
    return el ? el.innerText.trim() : null;
  }

  function onNewAssistantMessage(callback) {
    let lastSeenText = "";
    let settleTimer = null;

    const observer = new MutationObserver(() => {
      const el = getLatestAssistantMessageEl();
      if (!el) return;
      const text = el.innerText.trim();
      if (!text || text === lastSeenText) return;

      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        const finalEl = getLatestAssistantMessageEl();
        const finalText = finalEl ? finalEl.innerText.trim() : "";
        if (finalText && finalText !== lastSeenText) {
          lastSeenText = finalText;
          callback(finalText);
        }
      }, SETTLE_DEBOUNCE_MS);
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }

  async function injectAndSend(text) {
    const composer = queryFirst(COMPOSER_SELECTORS);
    if (!composer) throw new Error("Could not find ChatGPT's message input — selectors may be out of date.");

    composer.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, text);
    composer.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));

    await new Promise((r) => setTimeout(r, 150));

    const sendBtn = queryFirst(SEND_BUTTON_SELECTORS);
    if (sendBtn && !sendBtn.disabled) {
      sendBtn.click();
    } else {
      composer.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter" })
      );
    }
  }

  window.SC.activePlatform = { getLatestAssistantMessage, onNewAssistantMessage, injectAndSend };
})();
