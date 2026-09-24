// config.js — reads the user's settings (CV/JD text, silence threshold,
// interview-type selection) out of chrome.storage.local. Written by
// options/options.js.
window.SC = window.SC || {};

(function () {
  const STORAGE_KEY = "scSettings";

  const DEFAULT_SETTINGS = {
    cvText: "",
    jdText: "",
    silenceSec: 2,
    interviewTypes: { technical: true, cvBased: false, behavioral: false },
  };

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        const saved = result[STORAGE_KEY] || {};
        resolve({
          ...DEFAULT_SETTINGS,
          ...saved,
          interviewTypes: { ...DEFAULT_SETTINGS.interviewTypes, ...(saved.interviewTypes || {}) },
        });
      });
    });
  }

  window.SC.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  window.SC.loadSettings = loadSettings;
})();
