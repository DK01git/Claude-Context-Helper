# Claude Context Helper

A Chrome extension that lets you send screenshots, page content, and voice notes to Claude without leaving your current tab.

---

## What it does

| Feature | Description |
|---|---|
| **Screenshot** | Captures the visible area of the current tab and attaches it to Claude |
| **Page** | Extracts the readable text from the current page (strips ads, nav, banners) and prepends it to your message |
| **Record** | Transcribes your voice in real time using Chrome's built-in speech recognition |
| **Send** | Opens claude.ai (or focuses an existing tab), injects your text, and pastes your screenshot directly into the composer |

The extension reads your active claude.ai session cookie — no separate login or API key required. Your existing Claude plan limits apply automatically.

---

## Installation (Developer Mode)

The extension is loaded directly from source — no Chrome Web Store listing yet.

**Step 1 — Download the source**

Clone or download this repository and note the folder path of `claude-context-extension/`.

**Step 2 — Open Chrome Extensions**

Go to `chrome://extensions` in your browser.

**Step 3 — Enable Developer Mode**

Toggle **Developer mode** on (top-right corner of the page).

**Step 4 — Load the extension**

Click **Load unpacked** and select the `claude-context-extension/` folder.

The Claude Context Helper icon will appear in your Chrome toolbar. Pin it for easy access (click the puzzle-piece icon → pin).

**Step 5 — Sign into Claude**

Open [claude.ai](https://claude.ai) and sign in with your account. The extension detects your session automatically — no extra steps needed.

---

## How to use

1. **Browse to any page** you want to ask Claude about.
2. **Click the extension icon** in the toolbar.
3. Use one or more of the capture buttons:
   - **Capture** — takes a screenshot of the current tab
   - **Page** — pulls the page's readable text into the message box
   - **Record** — starts real-time voice transcription; click **Stop** when done
4. **Type your question** in the text box (optional if you have a capture).
5. **Click Send** — the extension opens claude.ai and injects your content into the composer.

---

## Permissions explained

| Permission | Why it's needed |
|---|---|
| `activeTab` | Capture screenshots and read the current tab's URL |
| `tabs` | Query and focus browser tabs |
| `scripting` | Inject content into claude.ai to send your message |
| `storage` | Persist lightweight state locally |
| `cookies` | Detect your claude.ai session (read-only, `claude.ai` domain only) |
| `offscreen` | Run speech recognition in a background renderer context |

---

## Known limitations

- **Microphone on Windows** — Chrome's mic permission for extensions is managed separately from the regular site settings. If the Record button shows "Mic blocked", go to **Windows Settings → Privacy → Microphone** and ensure "Allow desktop apps to access your microphone" is turned on, then reload the extension.
- **Protected pages** — The Page button cannot read `chrome://` pages, the Chrome Web Store, or browser-controlled new-tab pages.
- **Screenshot paste** — The screenshot is injected via a synthetic paste event. If Claude updates their composer, this may need adjusting.

---

## File structure

```
claude-context-extension/
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── background.js      — service worker: session check, recording orchestration, claude.ai injection
├── content.js         — injected into every page: extracts clean readable text on request
├── manifest.json      — extension manifest (Chrome, MV3)
├── offscreen.html     — hidden renderer page for speech recognition
├── offscreen.js       — runs SpeechRecognition and streams results back to the popup
├── popup.html         — extension popup UI
├── popup.js           — popup logic: captures, recording state, send flow
└── privacy.html       — privacy policy
```

---

## Privacy

- No data is sent to any third-party server.
- Screenshots and page text go directly from your browser to claude.ai — the extension is just the bridge.
- Your claude.ai session cookie is read locally to detect login status and is never transmitted elsewhere.
- Voice transcription runs entirely inside Chrome using Google's built-in speech recognition service.

Full details: [privacy.html](privacy.html)
