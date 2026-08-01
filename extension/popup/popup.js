// FocusGuard popup logic.
// Loads stats from the backend (BASE_URL) with a graceful fallback to the
// service worker's local tracking when the backend is unreachable.

const CONFIG = typeof FOCUSGUARD_CONFIG !== "undefined" ? FOCUSGUARD_CONFIG : {};

const els = {
  currentFocus: document.getElementById("currentFocus"),
  focusTime: document.getElementById("focusTime"),
  interrupts: document.getElementById("interrupts"),
  progressFill: document.getElementById("progressFill"),
  elapsedLabel: document.getElementById("elapsedLabel"),
  goalLabel: document.getElementById("goalLabel"),
  pauseBtn: document.getElementById("pauseBtn"),
  insightCard: document.getElementById("insightCard"),
  insightText: document.getElementById("insightText"),
  insightSuggestion: document.getElementById("insightSuggestion"),
  dashboardLink: document.getElementById("dashboardLink"),
  logInterrupt: document.getElementById("logInterrupt"),
  quickBreak: document.getElementById("quickBreak"),
  mascotHint: document.getElementById("mascotHint"),
};

const FOCUS_GOAL_SECONDS = 25 * 60;
let focusSeconds = 0;
let paused = false;
let ticker = null;

function fmt(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function fmtDuration(seconds) {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function render() {
  els.focusTime.textContent = fmtDuration(focusSeconds);
  els.elapsedLabel.textContent = fmt(focusSeconds);
  const pct = Math.min(100, (focusSeconds / FOCUS_GOAL_SECONDS) * 100);
  els.progressFill.style.width = `${pct}%`;
  els.goalLabel.textContent = paused ? "Paused" : `${fmt(FOCUS_GOAL_SECONDS - focusSeconds)} left`;
  els.pauseBtn.style.background = paused ? "var(--secondary-container)" : "var(--primary)";
  els.pauseBtn.querySelector("svg").innerHTML = paused
    ? '<path d="M8 5v14l11-7z" />'
    : '<path d="M6 5h4v14H6zM14 5h4v14h-4z" />';
}

function startTicker() {
  ticker = setInterval(() => {
    if (!paused) {
      focusSeconds += 1;
      render();
    }
  }, 1000);
  render();
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 1600);
}

async function post(path, body) {
  try {
    await fetch(`${CONFIG.BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return true;
  } catch {
    return false;
  }
}

async function loadFromBackend() {
  try {
    const res = await fetch(`${CONFIG.BASE_URL}/api/stats`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const stats = await res.json();
    focusSeconds = stats.focus_time_s || 0;
    els.interrupts.textContent = stats.interrupts ?? 0;
    if (stats.current_focus) {
      els.currentFocus.textContent = stats.current_focus;
    } else {
      els.currentFocus.textContent = "No active focus";
    }
    startTicker();

    const insightRes = await fetch(`${CONFIG.BASE_URL}/api/insights`, { signal: AbortSignal.timeout(5000) });
    if (insightRes.ok) {
      const insight = await insightRes.json();
      if (insight.message) {
        els.insightText.textContent = insight.message;
        els.insightSuggestion.textContent = insight.suggestion ? `Try: ${insight.suggestion}` : "";
        els.insightCard.hidden = false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

async function loadLocalFallback() {
  try {
    const res = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    if (res) {
      focusSeconds = res.focusSecondsToday || 0;
      els.interrupts.textContent = res.interruptCountToday || 0;
      if (res.activeDomain) {
        els.currentFocus.textContent = res.activeTitle || res.activeDomain;
      } else {
        els.currentFocus.textContent = "No active focus";
      }
      if (res.contextTitle) {
        els.statusLine.textContent = `Context: ${res.contextTitle}`;
        els.statusLine.hidden = false;
      }
      if (res.beast && res.beast.active) {
        els.statusLine.textContent += " · Beast Mode ON";
      }
    }
  } catch {
    els.currentFocus.textContent = "No active focus";
  }
  startTicker();
}

(async function init() {
  if (CONFIG.DASHBOARD_URL) {
    els.dashboardLink.href = CONFIG.DASHBOARD_URL;
  }
  els.pauseBtn.addEventListener("click", () => {
    paused = !paused;
    render();
  });

  els.logInterrupt.addEventListener("click", async () => {
    const ok = await post("/api/events", {
      type: "interruption",
      detail: "Logged from popup",
      duration_s: 0,
    });
    els.interrupts.textContent = Number(els.interrupts.textContent || 0) + 1;
    showToast(ok ? "Interruption logged!" : "Saved locally (offline)");
  });

  els.quickBreak.addEventListener("click", async () => {
    const ok = await post("/api/events", {
      type: "break",
      detail: "Quick break",
      duration_s: 300,
    });
    showToast(ok ? "Break logged. Enjoy!" : "Saved locally (offline)");
  });

  const ok = await loadFromBackend();
  if (!ok) {
    els.currentFocus.textContent = "Backend offline — local mode";
    await loadLocalFallback();
  }
})();
