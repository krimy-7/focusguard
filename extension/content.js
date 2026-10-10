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

  // Sub-minute watchdog timers. The service worker can only schedule alarms at a
  // 1-minute minimum, so the grace/second popup is timed here (content scripts
  // stay alive while the tab is open). The worker still validates on receipt.
  const timers = {};

  function arm(label, ms) {
    if (timers[label]) clearTimeout(timers[label]);
    timers[label] = setTimeout(() => {
      delete timers[label];
      try {
        chrome.runtime.sendMessage({ type: "WATCHDOG_ELAPSED", label }, () => void chrome.runtime.lastError);
      } catch {
        // Extension reloaded — stale content script context.
      }
    }, ms);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "WATCHDOG_TIMER") {
      arm(msg.label, msg.ms);
      sendResponse({ ok: true });
      return;
    }
    if (msg && msg.type === "WATCHDOG_CANCEL") {
      if (timers[msg.label]) {
        clearTimeout(timers[msg.label]);
        delete timers[msg.label];
      }
      sendResponse({ ok: true });
      return;
    }
    if (msg && msg.type === "SHOW_INTERVENTION") {
      showIntervention(msg.level, msg.message, msg.context);
      sendResponse({ ok: true });
      return;
    }
  });

  // Blurred intervention overlay. Blurs + dims the whole page, shows the
  // message and the level's action buttons, auto-dismisses after 5 seconds.
  function showIntervention(level, message, context) {
    dismissOverlay();

    const overlay = document.createElement("div");
    overlay.id = "focusguard-overlay";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;" +
      "background:rgba(0,0,0,0.55);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";

    const card = document.createElement("div");
    card.style.cssText =
      "background:#fff;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,0.35);max-width:420px;width:90%;" +
      "padding:28px 24px;text-align:center;";

    const emoji = document.createElement("div");
    emoji.style.cssText = "font-size:44px;margin-bottom:10px;";
    emoji.textContent = level === 1 ? "⚠️" : "😭";

    const badge = document.createElement("div");
    badge.style.cssText =
      "display:inline-block;padding:5px 14px;border-radius:999px;font-size:12px;font-weight:600;text-transform:uppercase;" +
      "letter-spacing:0.5px;margin-bottom:12px;color:" + (level === 1 ? "#856404" : "#721c24") + ";" +
      "background:" + (level === 1 ? "#fff3cd" : "#f8d7da") + ";";
    badge.textContent = level === 1 ? "Gentle reminder" : "Playful warning";

    const title = document.createElement("div");
    title.style.cssText = "font-size:20px;font-weight:700;color:#333;margin-bottom:8px;";
    title.textContent = level === 1 ? "Possible distraction" : "Still distracted?";

    const ctx = document.createElement("div");
    ctx.style.cssText = "font-size:13px;color:#888;margin-bottom:14px;";
    ctx.textContent = "Active context: " + (context || "your focus");

    const msg = document.createElement("div");
    msg.style.cssText = "font-size:15px;color:#555;line-height:1.6;margin-bottom:20px;";
    msg.textContent = message;

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;flex-direction:column;gap:10px;";

    function actionBtn(label, primary, actionType) {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText =
        "padding:11px;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;" +
        (primary
          ? "background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;"
          : "background:#f0f0f0;color:#333;");
      b.addEventListener("click", () => {
        try {
          chrome.runtime.sendMessage({ type: actionType }, () => void chrome.runtime.lastError);
        } catch {}
        dismissOverlay();
      });
      return b;
    }

    actions.appendChild(actionBtn("Back to work", true, "BACK_TO_WORK"));
    if (level === 1) {
      actions.appendChild(actionBtn("See progress", false, "SEE_PROGRESS"));
    } else {
      actions.appendChild(actionBtn("Take a break", false, "TAKE_BREAK"));
    }
    actions.appendChild(actionBtn("Extend 5 min", false, "EXTEND_TIMER"));

    card.appendChild(emoji);
    card.appendChild(badge);
    card.appendChild(title);
    card.appendChild(ctx);
    card.appendChild(msg);
    card.appendChild(actions);
    overlay.appendChild(card);
    document.documentElement.appendChild(overlay);

    // Auto-dismiss after 5 seconds.
    overlay.__fgTimeout = setTimeout(dismissOverlay, 5000);
  }

  function dismissOverlay() {
    const existing = document.getElementById("focusguard-overlay");
    if (existing) {
      if (existing.__fgTimeout) clearTimeout(existing.__fgTimeout);
      existing.remove();
    }
  }
})();
