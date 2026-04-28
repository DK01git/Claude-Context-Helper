'use strict';

const REMOVE_TAGS = [
  'script', 'style', 'noscript', 'svg', 'canvas', 'video', 'audio',
  'iframe', 'nav', 'footer', 'header', 'aside', 'form'
];

const REMOVE_SELECTORS = [
  '[class*="cookie"]', '[class*="banner"]', '[class*="modal"]',
  '[class*="popup"]',  '[class*="toast"]',  '[class*="overlay"]',
  '[id*="cookie"]',    '[id*="modal"]',     '[id*="popup"]',
  '[aria-hidden="true"]'
];

const MAX_CHARS = 10_000;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'GET_PAGE_CONTEXT') return;

  try {
    const clone = document.documentElement.cloneNode(true);

    REMOVE_TAGS.forEach((tag) =>
      clone.querySelectorAll(tag).forEach((el) => el.remove())
    );
    REMOVE_SELECTORS.forEach((sel) => {
      try { clone.querySelectorAll(sel).forEach((el) => el.remove()); }
      catch { /* ignore invalid selectors on some pages */ }
    });

    const raw = clone.innerText || clone.textContent || '';
    const cleaned = raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 1)
      .join('\n')
      .slice(0, MAX_CHARS);

    sendResponse({ text: cleaned });
  } catch {
    sendResponse({ text: '' });
  }

  return true;
});
