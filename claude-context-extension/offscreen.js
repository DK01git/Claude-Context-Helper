"use strict";

let recognition = null;
let isRecognizing = false;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== "offscreen") return;
  if (msg.type === "START_RECOGNITION") startRecognition();
  if (msg.type === "STOP_RECOGNITION") stopRecognition();
});

function broadcast(payload) {
  chrome.runtime.sendMessage(payload).catch(() => {});
}

function startRecognition() {
  if (isRecognizing) return;

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    broadcast({ type: "RECOGNITION_ERROR", error: "not-supported" });
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onstart = () => {
    isRecognizing = true;
    broadcast({ type: "RECOGNITION_STARTED" });
  };

  recognition.onresult = (e) => {
    let finalText = "";
    let interimText = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t + " ";
      else interimText = t;
    }
    broadcast({ type: "RECOGNITION_RESULT", finalText, interimText });
  };

  recognition.onerror = (e) => {
    broadcast({ type: "RECOGNITION_ERROR", error: e.error });
    if (e.error !== "no-speech") {
      isRecognizing = false;
    }
  };

  recognition.onend = () => {
    if (isRecognizing) {
      // Auto-restart on silence so continuous recording works
      try { recognition.start(); } catch (_) {}
    } else {
      broadcast({ type: "RECOGNITION_STOPPED" });
    }
  };

  recognition.start();
}

function stopRecognition() {
  isRecognizing = false;
  if (recognition) {
    try { recognition.stop(); } catch (_) {}
    recognition = null;
  }
  broadcast({ type: "RECOGNITION_STOPPED" });
}
