// FocusGuard content script.
// Detects when the current tab is actually visible/interacted with so the
// service worker knows whether the user is present. Sends only the hostname —
// never full URLs or page contents.

(function () {
  function hostnameOf(url) {
    try {
      return new URL(url).hostname || null;
    } catch {
      return null;
    }
  }

  function report(type, detail, durationS) {
    try {
      chrome.runtime.sendMessage(
        {
          type: "LOG_EVENT",
          event: {
            type,
            detail: detail || hostnameOf(window.location.href) || "browser",
            durationS: Math.round(durationS || 0),
          },
        },
        () => void chrome.runtime.lastError,
      );
    } catch {
      // Extension was reloaded — this tab's content script context is stale.
    }
  }

  let hiddenAt = null;

  function onVisibilityChange() {
    const now = Date.now();
    if (document.visibilityState === "hidden") {
      hiddenAt = now;
    } else if (hiddenAt) {
      const seconds = (now - hiddenAt) / 1000;
      hiddenAt = null;
      if (seconds >= 10) {
        report("focus_lost", "Tab hidden", seconds);
      }
    }
  }

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("blur", () => report("interruption", "Focus shifted away"));
})();
