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
  resetBtn: document.getElementById("resetBtn"),
  contextActive: document.getElementById("contextActive"),
  contextTitle: document.getElementById("contextTitle"),
  contextStatePill: document.getElementById("contextStatePill"),
  contextMeta: document.getElementById("contextMeta"),
  contextActions: document.getElementById("contextActions"),
  backToWorkBtn: document.getElementById("backToWorkBtn"),
  backToWorkLabel: document.getElementById("backToWorkLabel"),
  interventionExtra: document.getElementById("interventionExtra"),
  seeProgressBtn: document.getElementById("seeProgressBtn"),
  takeBreakBtn: document.getElementById("takeBreakBtn"),
  extendBtn: document.getElementById("extendBtn"),
  contextPropose: document.getElementById("contextPropose"),
  proposeNote: document.getElementById("proposeNote"),
  proposeTitle: document.getElementById("proposeTitle"),
  proposeOkBtn: document.getElementById("proposeOkBtn"),
  proposeCancelBtn: document.getElementById("proposeCancelBtn"),
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

function renderContextCard(active, st) {
  const pending = st && st.lastProposal && st.lastProposal.proposed_title;
  const distraction = st && (st.activityRelation === "distraction" || st.distractionState === "grace" || st.distractionState === "first" || st.distractionState === "second");

  // 1) Pending new-work-area proposal → confirm/cancel form.
  if (pending && !distraction) {
    els.contextActive.hidden = true;
    els.contextPropose.hidden = false;
    els.proposeNote.textContent = `Detected: ${pending}`;
    els.proposeTitle.value = pending;
    els.proposeCancelBtn.hidden = false;
    return;
  }

  // 2) Possible distraction / intervention states.
  if (distraction) {
    els.contextActive.hidden = false;
    els.contextPropose.hidden = true;
    els.contextTitle.textContent = (active && active.title) || st.contextTitle || "—";
    els.contextActions.hidden = true;

    const site = st.distractionSite || (st.currentActivity && st.currentActivity.domain) || "";
    const mode = (active && active.mode) || st.contextMode || "";
    if (st.distractionState === "first" || st.distractionState === "second") {
      els.contextStatePill.textContent = st.distractionState === "first" ? "First intervention" : "Second intervention";
      els.contextStatePill.className = "state-pill drift";
      const title = st.contextTitle || "your focus";
      els.contextMeta.textContent =
        st.distractionState === "first"
          ? `You've been away from ${title}.`
          : `${title} is crying in the corner 😭`;
      els.contextActions.hidden = false;
      els.backToWorkLabel.textContent = "Back to work";
      const isFirst = st.distractionState === "first";
      els.interventionExtra.hidden = false;
      els.seeProgressBtn.hidden = !isFirst;
      els.takeBreakBtn.hidden = isFirst;
      els.extendBtn.hidden = false;
      const send = (type) => () => {
        chrome.runtime.sendMessage({ type }).catch(() => null);
        window.location.reload();
      };
      els.backToWorkBtn.onclick = send("BACK_TO_WORK");
      els.seeProgressBtn.onclick = send("SEE_PROGRESS");
      els.takeBreakBtn.onclick = send("TAKE_BREAK");
      els.extendBtn.onclick = send("EXTEND_TIMER");
    } else {
      els.contextStatePill.textContent = "Possible distraction";
      els.contextStatePill.className = "state-pill drift";
      els.contextMeta.textContent = site ? `You're on ${site}` : "You left your focus";
      els.contextActions.hidden = true;
      // Grace countdown ticker.
      const start = st.gracePeriodStartedAt || st.awaySince;
      const durMs = (st.gracePeriodDurationMin || 5) * 60 * 1000;
      if (start) {
        const remaining = Math.max(0, start + durMs - Date.now());
        els.contextMeta.textContent = `${site ? `You're on ${site}` : "You left your focus"} · grace: ${fmt(Math.round(remaining / 1000))}`;
        if (remaining > 0 && !window.__graceTicker) {
          window.__graceTicker = setInterval(() => {
            const rem = Math.max(0, start + durMs - Date.now());
            els.contextMeta.textContent = `${site ? `You're on ${site}` : "You left your focus"} · grace: ${fmt(Math.round(rem / 1000))}`;
            if (rem <= 0) clearInterval(window.__graceTicker);
          }, 1000);
        }
      }
    }
    if (mode) els.contextMeta.textContent += ` · ${mode}`;
    return;
  }

  // 3) Active context (no distraction).
  if (active || st.contextTitle) {
    els.contextActive.hidden = false;
    els.contextPropose.hidden = true;
    els.contextTitle.textContent = (active && active.title) || st.contextTitle;
    els.contextStatePill.textContent = "Active";
    els.contextStatePill.className = "state-pill";
    const tabCount = (active && active.activities ? active.activities : []).filter((a) => a.kind === "tab").length;
    const mode = (active && active.mode) || st.contextMode || "";
    els.contextMeta.textContent = mode ? `Mode: ${mode}` : "";
    if (tabCount > 0) els.contextMeta.textContent += ` · ${tabCount} related tab${tabCount === 1 ? "" : "s"} grouped`;
    els.contextActions.hidden = true;
    return;
  }

  // 4) No context yet — discovery form (type your own or use detected).
  els.contextActive.hidden = true;
  els.contextPropose.hidden = false;
  els.proposeNote.hidden = true;
  els.proposeTitle.value = "";
  els.proposeCancelBtn.hidden = true;
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

    const st = await chrome.runtime.sendMessage({ type: "GET_STATE" }).catch(() => null);
    const ctxRes = await fetch(`${CONFIG.BASE_URL}/api/contexts`, { signal: AbortSignal.timeout(3000) });
    if (ctxRes.ok) {
      const contexts = await ctxRes.json();
      const active = (Array.isArray(contexts) ? contexts : []).find((c) => c.active) || null;
      renderContextCard(active, st);
    } else {
      renderContextCard(null, st);
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
      const active = res.contextTitle
        ? { title: res.contextTitle, mode: res.contextMode || "", activities: (res.contextDomains || []).map((d) => ({ kind: "tab", domain: d })) }
        : null;
      renderContextCard(active, res);
      if (res.beast && res.beast.active) {
        els.contextMeta.textContent += " · Beast Mode ON";
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

  els.resetBtn.addEventListener("click", async () => {
    if (!confirm("Reset the FocusGuard database? This deletes all data and re-seeds fresh mock data.")) return;
    els.resetBtn.disabled = true;
    els.resetBtn.textContent = "Resetting…";
    try {
      const res = await fetch(`${CONFIG.BASE_URL}/api/dev/reset`, { method: "POST", signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await chrome.runtime.sendMessage({ type: "RESET" }).catch(() => {});
      showToast("Database reset — fresh data loaded");
      setTimeout(() => window.location.reload(), 900);
    } catch {
      showToast("Reset failed — is the backend running?");
      els.resetBtn.disabled = false;
      els.resetBtn.textContent = "Reset data";
    }
  });

  els.proposeOkBtn.addEventListener("click", async () => {
    const title = els.proposeTitle.value.trim();
    if (!title) {
      els.proposeTitle.focus();
      return;
    }
    const res = await chrome.runtime.sendMessage({ type: "CONFIRM_CONTEXT", title }).catch(() => null);
    showToast(res && res.ok ? "Context confirmed!" : "Couldn't confirm — is the backend running?");
    setTimeout(() => window.location.reload(), 700);
  });

  els.proposeCancelBtn.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "IGNORE_CONTEXT" }).catch(() => null);
    showToast("Proposal ignored");
    els.contextPropose.hidden = true;
  });

  const ok = await loadFromBackend();
  if (!ok) {
    els.currentFocus.textContent = "Backend offline — local mode";
    await loadLocalFallback();
  }
})();
