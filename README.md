# Speech Coach Interview Plugin

Chrome extension that turns a normal Claude.ai or ChatGPT voice-mode chat
into an interview-practice session with real acoustic delivery feedback,
without any Claude/OpenAI API key.

It works entirely by automating your own already-logged-in browser tab:
it watches the chat DOM for new questions, records your spoken answer on
your own mic, runs the same acoustic analysis as
[speech-coach](https://github.com/ganeshhgupta/speech-coach) (pace,
filler/hedge words, pauses, pitch variation), and types a short summary of
that analysis back into the chat box so the AI's own next reply becomes a
combined content + delivery review.

## How it works

```text
1. (Optional, recommended) Click the extension icon and expand "Interview
   settings" to fill in your CV (upload a .pdf/.docx or paste text), the
   job description, how many seconds of silence counts as "done answering"
   (N, 1-10), and which question types to include (technical, CV-based,
   behavioral). Saved locally, reused every session.
2. Open a voice-mode chat on Claude.ai/ChatGPT, click the extension icon →
   "Activate for this tab". Mic permission prompts once.
3. The plugin automatically types and sends a "ground rules" prompt: ask
   one question at a time, wait for the delivery-analysis message before
   reviewing, cover the selected question types, use the CV/JD as context.
   The AI's reply to that prompt is your first question.
4. You start speaking → recording starts automatically.
   You go silent for N seconds → recording stops automatically.
5. The clip is sent to speech-coach's /api/analyze for scoring.
6. A short "here's how that sounded" prompt is typed into the chat and
   sent for you. The AI's reply reviews both correctness AND delivery.
   Repeat from 3 for the next question.
7. Click the overlay's "End Session & Get Review" button (or deactivate
   from the popup) → the plugin injects one final prompt asking for an
   overall session review (correctness + recurring delivery patterns +
   recommendations) across every question answered, then shuts down.
```

No second AI model call happens in the extension itself — every review
(per-question and the final session review) comes from whichever AI
you're already talking to, driven by the injected measurements.

## Install (unpacked, for now)

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this folder.
3. (Optional) Click the extension icon → expand "Interview settings" to
   configure your CV/JD/silence-threshold/question types before starting.
4. Open Claude.ai or ChatGPT, start a voice-mode conversation, click the
   extension icon and activate it for that tab.

## Manual override

Automatic start/stop is driven by client-side voice-activity detection
(silence/energy threshold on your mic), not by anything from Claude.ai or
ChatGPT's UI — neither site exposes a documented "AI is speaking vs.
listening" signal. VAD can occasionally miss a turn boundary (background
noise, a long pause mid-answer). The floating overlay always has manual
**Start** / **Stop** buttons as a fallback — use them if automatic
detection doesn't fire.

## Known-fragile: DOM selectors

`content/platforms/claude.js` and `content/platforms/chatgpt.js` read the
assistant's latest message and locate the chat input / send button by
CSS selector, since neither site publishes a stable selector contract.
Each file lists its selectors (with fallbacks) at the top. **If either
site redesigns its chat UI, question detection or prompt injection can
silently stop working on that platform** — only that one file needs
updating; the VAD/recorder/analysis/injector engine underneath is
platform-agnostic and shouldn't need changes.

## Backend

Uses speech-coach's already-deployed, unauthenticated, CORS-open
`POST https://speech-coach-rsme.onrender.com/api/analyze` for acoustic
analysis. No separate backend, no API key, nothing to deploy for this
extension itself.

## Settings storage and CV/JD parsing

Settings (CV text, JD text, silence threshold, question types) live in the
popup's "Interview settings" section (not a separate tab) and are saved to
`chrome.storage.local` — local to your browser profile, never sent
anywhere except embedded in the context prompt typed into the chat you
activate the plugin on. CV `.pdf`/`.docx` upload is parsed client-side in
the popup using vendored copies of
[pdf.js](https://github.com/mozilla/pdf.js) and
[mammoth.js](https://github.com/mwilliamson/mammoth.js) (`vendor/` —
Manifest V3 disallows loading such libraries from a CDN, so they're
bundled locally). Legacy `.doc` isn't supported; paste the text instead.
