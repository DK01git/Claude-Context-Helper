"use strict";

let screenshotData = null;

// ── On load ───────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  // Check if user is logged into claude.ai
  const res = await chrome.runtime.sendMessage({
    type: "CHECK_CLAUDE_SESSION",
  });

  if (!res.loggedIn) {
    showLoginPrompt();
  } else {
    showMainUI();
  }

  // ── Button bindings ──
  document.getElementById("btn-open-claude").addEventListener("click", () => {
    chrome.tabs.create({ url: "https://claude.ai" });
  });

  document.getElementById("btn-signout").addEventListener("click", () => {
    chrome.storage.local.clear();
    showLoginPrompt();
  });

  document
    .getElementById("btn-capture")
    .addEventListener("click", captureScreenshot);
  document.getElementById("btn-page").addEventListener("click", capturePage);
  document.getElementById("btn-record").addEventListener("click", toggleRecord);
  document
    .getElementById("btn-discard")
    .addEventListener("click", discardScreenshot);
  document.getElementById("btn-send").addEventListener("click", sendToClaude);

  document.getElementById("btn-win-settings").addEventListener("click", () => {
    // Open a Chrome support page explaining Windows mic privacy settings.
    // We cannot open ms-settings: directly from an extension.
    chrome.tabs.create({
      url: "https://support.microsoft.com/en-us/windows/microphone-privacy-settings-2de44e08-c77a-ca74-db8d-e01b3e19ef2d",
    });
  });

  document.getElementById("btn-ext-settings").addEventListener("click", () => {
    const url = `chrome://settings/content/siteDetails?site=chrome-extension://${chrome.runtime.id}`;
    chrome.tabs.create({ url });
  });
});

// ── Screen switching ──────────────────────────────────────────────────────────
function showLoginPrompt() {
  document.getElementById("login-prompt").style.display = "flex";
  document.getElementById("main-ui").style.display = "none";
  document.getElementById("profile-badge").style.display = "none";
}

function showMainUI() {
  document.getElementById("login-prompt").style.display = "none";
  document.getElementById("main-ui").style.display = "flex";
  document.getElementById("profile-badge").style.display = "flex";

  // Try to show email in header
  chrome.cookies.getAll({ domain: "claude.ai" }, (cookies) => {
    const accountCookie = cookies.find(
      (c) => c.name === "CH-prefers-color-scheme" || c.name.includes("account"),
    );
    // Just show "claude.ai" as the connected account label
    document.getElementById("profile-name").textContent = "claude.ai ✓";
  });
}

function showMicHelp() {
  document.getElementById("mic-help").style.display = "flex";
}

function hideMicHelp() {
  document.getElementById("mic-help").style.display = "none";
}

// ── Screenshot capture ────────────────────────────────────────────────────────
async function captureScreenshot() {
  try {
    setStatus("Capturing screenshot…");
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    screenshotData = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "png",
    });

    const preview = document.getElementById("screenshot-preview");
    preview.src = screenshotData;
    document.getElementById("preview-container").style.display = "flex";
    setStatus("Screenshot ready. Add a message and hit Send.");
  } catch (err) {
    setStatus("Could not capture screenshot: " + err.message, true);
  }
}

function discardScreenshot() {
  screenshotData = null;
  document.getElementById("preview-container").style.display = "none";
  document.getElementById("screenshot-preview").src = "";
  setStatus("");
}

// ── Page text capture ─────────────────────────────────────────────────────────
async function capturePage() {
  setStatus("Capturing page content…");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab) {
    setStatus("No active tab found.", true);
    return;
  }

  // Content scripts are not injected into browser-owned pages
  const url = tab.url || "";
  if (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("data:") ||
    url.includes("chrome.google.com/webstore")
  ) {
    setStatus("Can't read this page — navigate to a regular website first.", true);
    return;
  }

  try {
    // Delegate to the already-injected content.js (GET_PAGE_CONTEXT).
    // It strips scripts, banners, nav, and other noise before returning text.
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_PAGE_CONTEXT",
    });

    const pageText = response?.text || "";
    if (!pageText) {
      setStatus("Page appears empty or could not be read.", true);
      return;
    }

    const input = document.getElementById("user-input");
    input.value = `[Page: ${url}]\n\n${pageText}\n\n---\n${input.value}`;
    setStatus(`Page captured — ${pageText.length.toLocaleString()} chars.`);
  } catch (err) {
    // sendMessage rejects if no content script is listening yet (page just loaded)
    if (err.message?.includes("Could not establish connection")) {
      setStatus("Page not ready — reload the tab then try again.", true);
    } else {
      setStatus("Could not capture page: " + err.message, true);
    }
  }
}

// ── Voice recording — offscreen SpeechRecognition ────────────────────────────
// SpeechRecognition does not work reliably inside extension popup windows
// (Chrome doesn't treat them as focused browsing contexts). We delegate to an
// offscreen document that runs in a real renderer and forwards results here.

let isRecording = false;
let _baseText = "";
let _committed = "";

async function toggleRecord() {
  if (isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  const btn = document.getElementById("btn-record");
  btn.disabled = true;
  setStatus("Requesting microphone access…");

  // The offscreen document is hidden — Chrome won't show a permission dialog
  // for it. We probe getUserMedia here in the popup (a visible window) so
  // Chrome can surface the "Allow microphone?" bubble. Once the user allows,
  // the offscreen doc inherits the extension-level permission.
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    hideMicHelp();
  } catch (err) {
    btn.disabled = false;
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      setStatus("Microphone is blocked — see instructions below.", true);
      showMicHelp();
    } else {
      setStatus("Microphone unavailable: " + err.message, true);
    }
    return;
  }

  _baseText = document.getElementById("user-input").value;
  _committed = "";

  chrome.runtime.onMessage.addListener(onRecognitionEvent);

  try {
    const res = await chrome.runtime.sendMessage({ type: "START_RECORDING" });
    if (res?.error) throw new Error(res.error);
  } catch (err) {
    setStatus("Could not start microphone: " + err.message, true);
    chrome.runtime.onMessage.removeListener(onRecognitionEvent);
  } finally {
    btn.disabled = false;
  }
}

function onRecognitionEvent(msg) {
  const HANDLED = new Set([
    "RECOGNITION_STARTED",
    "RECOGNITION_RESULT",
    "RECOGNITION_ERROR",
    "RECOGNITION_STOPPED",
  ]);
  if (!HANDLED.has(msg.type)) return;

  const input = document.getElementById("user-input");

  if (msg.type === "RECOGNITION_STARTED") {
    isRecording = true;
    const btn = document.getElementById("btn-record");
    btn.textContent = "⏹ Stop";
    btn.classList.add("recording");
    setStatus("Listening… speak now.");
    return;
  }

  if (msg.type === "RECOGNITION_RESULT") {
    if (msg.finalText) _committed += msg.finalText;
    input.value = _baseText
      ? _baseText + " " + _committed.trimEnd()
      : _committed.trimEnd();
    setStatus(msg.interimText ? `Hearing: "${msg.interimText}"` : "Listening…");
    return;
  }

  if (msg.type === "RECOGNITION_ERROR") {
    if (msg.error === "not-allowed" || msg.error === "service-not-allowed") {
      setStatus(
        "Mic blocked. Click here to open Chrome mic settings →",
        true,
        () => chrome.tabs.create({ url: "chrome://settings/content/microphone" }),
      );
      finishRecording();
    } else if (msg.error === "no-speech") {
      setStatus("No speech detected yet — keep going.", true);
    } else if (msg.error === "network") {
      setStatus("Network error — speech recognition requires internet.", true);
      finishRecording();
    } else if (msg.error === "not-supported") {
      setStatus("Speech recognition not supported in this browser.", true);
      finishRecording();
    } else {
      setStatus("Mic error: " + msg.error, true);
      finishRecording();
    }
    return;
  }

  if (msg.type === "RECOGNITION_STOPPED") {
    setStatus("Transcript ready — edit if needed, then Send.");
    finishRecording();
  }
}

function finishRecording() {
  isRecording = false;
  chrome.runtime.onMessage.removeListener(onRecognitionEvent);
  const btn = document.getElementById("btn-record");
  if (btn) {
    btn.textContent = "🎙 Record";
    btn.classList.remove("recording");
  }
}

function stopRecording() {
  chrome.runtime.sendMessage({ type: "STOP_RECORDING" }).catch(() => {});
  // finishRecording() is called when RECOGNITION_STOPPED arrives from offscreen
}

// ── Send to claude.ai ─────────────────────────────────────────────────────────
async function sendToClaude() {
  const text = document.getElementById("user-input").value.trim();

  if (!text && !screenshotData) {
    setStatus("Add a message or capture a screenshot first.", true);
    return;
  }

  const btn = document.getElementById("btn-send");
  btn.textContent = "Opening…";
  btn.disabled = true;
  setStatus("Opening Claude…");

  try {
    await chrome.runtime.sendMessage({
      type: "SEND_TO_CLAUDE",
      text: text,
      screenshot: screenshotData,
    });
    window.close();
  } catch (err) {
    btn.textContent = "Send ➜";
    btn.disabled = false;
    setStatus("Failed to open Claude: " + err.message, true);
  }
}

// ── Status helper ─────────────────────────────────────────────────────────────
function setStatus(msg, isError = false, onClick = null) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = isError ? "error" : "";
  el.onclick = onClick || null;
  el.style.cursor = onClick ? "pointer" : "";
  el.style.textDecoration = onClick ? "underline" : "";
}
