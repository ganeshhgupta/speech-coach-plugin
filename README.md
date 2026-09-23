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
1. You start a voice-mode chat on Claude.ai/ChatGPT and tell it (in your
   own words) to interview you on some topic.
2. Click the extension icon → "Activate for this tab". Mic permission
   prompts once.
3. A new AI question appears in the chat → overlay arms voice detection.
4. You start speaking → recording starts automatically.
   You stop speaking (silence) → recording stops automatically.
5. The clip is sent to speech-coach's /api/analyze for scoring.
6. A short "here's how that sounded" prompt is typed into the chat and
   sent for you.
7. The AI's reply reviews both correctness AND delivery. Repeat from 3.
```

No second AI model call happens in the extension itself — the review
text comes from whichever AI you're already talking to, driven by the
injected measurements.

## Install (unpacked, for now)

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this folder.
3. Open Claude.ai or ChatGPT, start a voice-mode conversation, click the
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
