"use strict";

// ── Offscreen document — speech recognition ───────────────────────────────────
const OFFSCREEN_URL = chrome.runtime.getURL("offscreen.html");

async function ensureOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [OFFSCREEN_URL],
  });
  if (contexts.length === 0) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ["USER_MEDIA"],
      justification: "Speech recognition for voice-to-text input",
    });
  }
}

// ── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  // Check whether the user is signed into claude.ai by inspecting its cookies.
  if (msg.type === "CHECK_CLAUDE_SESSION") {
    chrome.cookies.getAll({ domain: "claude.ai" }, (cookies) => {
      const loggedIn = cookies.some(
        (c) =>
          c.name === "sessionKey" ||
          c.name === "__Secure-next-auth.session-token" ||
          c.name.toLowerCase().includes("session"),
      );
      sendResponse({ loggedIn });
    });
    return true;
  }

  // Start speech recognition inside the offscreen document.
  if (msg.type === "START_RECORDING") {
    ensureOffscreenDocument()
      .then(() =>
        chrome.runtime.sendMessage({ target: "offscreen", type: "START_RECOGNITION" }),
      )
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  // Stop speech recognition.
  if (msg.type === "STOP_RECORDING") {
    chrome.runtime.sendMessage({ target: "offscreen", type: "STOP_RECOGNITION" })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  // Open (or focus) claude.ai, then inject text and/or a screenshot into the composer.
  if (msg.type === "SEND_TO_CLAUDE") {
    chrome.tabs.query({ url: "https://claude.ai/*" }, async (claudeTabs) => {
      let tab;
      let isNewTab = false;

      if (claudeTabs.length > 0) {
        tab = claudeTabs[0];
        await chrome.tabs.update(tab.id, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
      } else {
        tab = await chrome.tabs.create({ url: "https://claude.ai/new" });
        isNewTab = true;
        await new Promise((resolve) => {
          chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === tab.id && info.status === "complete") {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          });
        });
      }

      // Give React time to mount the composer on a fresh tab.
      if (isNewTab) {
        await new Promise((r) => setTimeout(r, 1500));
      }

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async (text, screenshotDataUrl) => {
          // Wait for the contenteditable composer to appear.
          const composer = await new Promise((resolve) => {
            const check = () => {
              const el = document.querySelector('div[contenteditable="true"]');
              if (el) { resolve(el); return; }
              setTimeout(check, 200);
            };
            check();
          });

          composer.focus();

          if (text) {
            document.execCommand("insertText", false, text);
          }

          if (screenshotDataUrl) {
            try {
              // Convert data URL → Blob → File, then fire a synthetic paste event.
              // Claude's composer handles paste events the same way as Ctrl+V.
              const res = await fetch(screenshotDataUrl);
              const blob = await res.blob();
              const file = new File([blob], "screenshot.png", { type: "image/png" });
              const dt = new DataTransfer();
              dt.items.add(file);

              composer.dispatchEvent(
                new ClipboardEvent("paste", {
                  clipboardData: dt,
                  bubbles: true,
                  cancelable: true,
                }),
              );
            } catch (err) {
              console.error("[Claude Helper] Screenshot paste failed:", err);
            }
          }
        },
        args: [msg.text || "", msg.screenshot || null],
      });

      sendResponse({ ok: true });
    });
    return true;
  }
});
