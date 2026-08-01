// FocusGuard background service worker — the desktop watchdog.
// Privacy-first: stores only hostnames (never full URLs or page content).
//
// Responsibilities:
//   - observe active tab / domain / focus and log privacy-safe context
//     switches, sessions and focus-loss to the backend
//   - fetch the active context + Beast Mode state from the backend
//   - watchdog: give the user a quiet GRACE_MINUTES after drifting from the
//     active context, then send gentle (level 1) and playful (level 2)
//     interventions with actionable buttons
//   - Beast Mode: redirect blocked domains to a block page

importScripts("config.js");

const CONFIG = typeof FOCUSGUARD_CONFIG !== "undefined" ? FOCUSGUARD_CONFIG : {};
const STORAGE_KEY = "focusguard_state";

const GRACE_MIN = Math.max(1, Number(CONFIG.GRACE_MINUTES) || 5);
const SECOND_MIN = Math.max(1, Number(CONFIG.SECOND_MINUTES) || 5);

const DEFAULT_STATE = {
  activeDomain: null,
  activeTitle: "",
  sessionStart: null,
  focusSecondsToday: 0,
  interruptCountToday: 0,
  dayKey: null,
  // Watchdog
  contextTitle: null,
  contextId: null,
  contextDomains: [],
  awaySince: null,
  intervenedLevel: 0,
  beast: null, // { ends_at, blocked_sites: [] }
  // Context detection / grouping
  recentDomains: [],
  lastProposal: null, // { domain, title, mode, ts }
  ignoredProposals: [],
};

let state = { ...DEFAULT_STATE };

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function loadState() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const saved = stored[STORAGE_KEY] || {};
  const today = dayKey();
  state = { ...DEFAULT_STATE, ...saved, dayKey: today };
  if (saved.dayKey !== today) {
    state.focusSecondsToday = 0;
    state.interruptCountToday = 0;
  }
}

async function saveState() {
  state.dayKey = dayKey();
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

async function api(path, init) {
  try {
    const res = await fetch(`${CONFIG.BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    if (!res.ok) return null;
    if (res.status === 204) return true;
    return await res.json();
  } catch {
    return null;
  }
}

function post(path, body) {
  return api(path, { method: "POST", body: JSON.stringify(body) });
}

// ---- Backend sync --------------------------------------------------------

async function syncBeast() {
  // Refresh Beast Mode state. Only overwrites on a successful response so a
  // temporary backend hiccup never silently disables blocking.
  try {
    const res = await fetch(`${CONFIG.BASE_URL}/api/beast`, {
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) return;
    const beast = await res.json();
    state.beast = beast && beast.active ? beast : null;
    await saveState();
  } catch {}
}

async function syncBackend() {
  const contexts = await api("/api/contexts");
  if (Array.isArray(contexts)) {
    const active = contexts.find((c) => c.active) || null;
    state.contextTitle = active ? active.title : null;
    state.contextId = active ? active.id : null;
    state.contextDomains = active
      ? Array.from(new Set((active.activities || []).map((a) => a.domain).filter(Boolean)))
      : [];
  }
  await syncBeast();
  await saveState();
  await enforceBlocking();
  return state;
}

// ---- Context detection / confirmation / grouping -------------------------

async function maybeDetectContext(domain) {
  // Only propose when there is no active context yet (a new session).
  if (state.contextTitle) return;
  const proposal = state.lastProposal;
  if (proposal && proposal.domain === domain && Date.now() - proposal.ts < 15 * 60 * 1000) return;
  if ((state.ignoredProposals || []).includes(domain)) return;

  const detected = await post("/api/contexts/detect", {
    signals: { domain, title: state.activeTitle || "" },
    recent_domains: state.recentDomains || [],
  });
  if (!detected || !detected.proposed_title) return;
  state.lastProposal = { domain, title: detected.proposed_title, mode: detected.mode, ts: Date.now() };
  await saveState();
  await notifyContext(detected);
}

function notifyContext(proposal) {
  const pct = Math.round((proposal.confidence || 0) * 100);
  return chrome.notifications.create("focusguard-context", {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "New context detected?",
    message: `Looks like you're working on: ${proposal.proposed_title} (${pct}%)`,
    buttons: [{ title: "Confirm" }, { title: "Ignore" }],
    priority: 1,
  });
}

async function confirmContext(proposal) {
  const created = await post("/api/contexts", {
    title: proposal.title,
    mode: proposal.mode || "work",
    source: "extension",
  });
  if (!created) return;
  await api(`/api/contexts/${created.id}`, {
    method: "PATCH",
    body: JSON.stringify({ confirmed: true, active: true }),
  });
  state.contextId = created.id;
  state.contextTitle = created.title;
  state.contextDomains = [];
  if (state.activeDomain) {
    await post(`/api/contexts/${created.id}/group`, {
      kind: "tab",
      label: state.activeTitle || state.activeDomain,
      domain: state.activeDomain,
      duration_s: 0,
    });
    state.contextDomains.push(state.activeDomain);
  }
  await saveState();
}

// ---- Watchdog ------------------------------------------------------------

function isContextDomain(domain) {
  if (!domain || !state.contextDomains.length) return false;
  return state.contextDomains.some((d) => domain === d || domain.endsWith("." + d) || d.endsWith("." + domain));
}

function isBlocked(domain) {
  const beast = state.beast;
  if (!beast || !beast.active || !domain) return false;
  const now = Date.now();
  if (beast.ends_at && new Date(beast.ends_at).getTime() < now) {
    state.beast = null;
    saveState();
    return false;
  }
  return (beast.blocked_sites || []).some((s) => {
    const site = s.trim().toLowerCase();
    return domain === site || domain.endsWith("." + site);
  });
}

async function enforceBlocking() {
  // Re-check the currently active tab so Beast Mode engages immediately,
  // even if the user is already sitting on a blocked site.
  if (!state.beast || !state.beast.active) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  if (!tab || !tab.url) return;
  const domain = hostnameOf(tab.url);
  if (domain && isBlocked(domain)) {
    chrome.tabs.update(tab.id, { url: chrome.runtime.getURL("blocked.html") });
  }
}

function resetWatchdog() {
  chrome.alarms.clear("focusguard.grace");
  chrome.alarms.clear("focusguard.second");
  state.awaySince = null;
  state.intervenedLevel = 0;
  saveState();
}

async function evaluateWatchdog(domain) {
  if (!state.contextTitle || !state.contextDomains.length) {
    resetWatchdog();
    return;
  }

  if (isContextDomain(domain)) {
    if (state.awaySince) {
      post("/api/sync", {
        platform: "extension",
        event: "context_recovery",
        payload: { detail: state.contextTitle, recovery_s: Math.round((Date.now() - state.awaySince) / 1000) },
      });
    }
    resetWatchdog();
    return;
  }

  // Drift away from the intended context.
  if (!state.awaySince) {
    state.awaySince = Date.now();
    chrome.alarms.create("focusguard.grace", { delayInMinutes: GRACE_MIN });
    saveState();
  }
}

async function triggerLevel1() {
  const title = state.contextTitle || "your focus";
  const message = `You were working on ${title}. Still on it? FocusGuard can help you back.`;
  state.intervenedLevel = 1;
  post("/api/interventions", { level: 1, message, context_id: null });
  chrome.alarms.create("focusguard.second", { delayInMinutes: SECOND_MIN });
  saveState();
  await notify(1, message);
}

async function triggerLevel2() {
  const title = state.contextTitle || "your focus";
  const message = `${title} is crying in the corner 😭 Come back when you're ready — no pressure.`;
  state.intervenedLevel = 2;
  post("/api/interventions", { level: 2, message, context_id: null });
  saveState();
  await notify(2, message);
}

function notify(level, message) {
  const buttons =
    level === 1
      ? [{ title: "Back to work" }, { title: "Extend timer" }, { title: "Dismiss" }]
      : [{ title: "Back to work" }, { title: "Take a break" }];
  return chrome.notifications.create(`focusguard-${level}`, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: level === 1 ? "Gentle nudge" : "Second heads-up",
    message,
    buttons,
    priority: 1,
  });
}

async function backToWork() {
  const target = state.contextDomains[0];
  if (target) {
    const tabs = await chrome.tabs.query({});
    const match = tabs.find((t) => {
      const h = hostnameOf(t.url);
      return h && (h === target || h.endsWith("." + target) || target.endsWith("." + h));
    });
    if (match) {
      chrome.tabs.update(match.id, { active: true });
      if (match.windowId) chrome.windows.update(match.windowId, { focused: true });
    }
  }
  post("/api/sync", { platform: "extension", event: "intervention", payload: { detail: "back_to_work" } });
  resetWatchdog();
}

async function extendTimer() {
  state.awaySince = Date.now();
  chrome.alarms.create("focusguard.grace", { delayInMinutes: GRACE_MIN });
  post("/api/sync", { platform: "extension", event: "intervention", payload: { detail: "extend_timer" } });
  saveState();
}

// ---- Alarms / notifications ----------------------------------------------

chrome.alarms.onAlarm.addListener(async (alarm) => {
  await loadState();
  if (alarm.name === "focusguard.grace") {
    if (state.awaySince) await triggerLevel1();
  } else if (alarm.name === "focusguard.second") {
    if (state.awaySince && state.intervenedLevel === 1) await triggerLevel2();
  } else if (alarm.name === "focusguard.sync") {
    await syncBackend();
  }
});

chrome.notifications.onButtonClicked.addListener(async (id, buttonIndex) => {
  await loadState();
  if (id === "focusguard-context") {
    if (buttonIndex === 0 && state.lastProposal) {
      await confirmContext(state.lastProposal);
    } else {
      state.ignoredProposals = [...(state.ignoredProposals || []), state.lastProposal?.domain].filter(Boolean);
      await saveState();
    }
    return;
  }
  if (buttonIndex === 0) {
    await backToWork();
  } else if (buttonIndex === 1) {
    await extendTimer();
  } else {
    post("/api/sync", { platform: "extension", event: "intervention", payload: { detail: "dismiss" } });
    resetWatchdog();
  }
});

chrome.notifications.onClosed.addListener(() => {
  if (state.intervenedLevel === 2) {
    // Level 2 was seen/closed — user is aware. Don't re-nag within this drift.
    resetWatchdog();
  }
});

// ---- Tab / focus tracking ------------------------------------------------

function flushActiveTab() {
  if (!state.activeDomain || !state.sessionStart) return;
  const elapsed = (Date.now() - state.sessionStart) / 1000;
  state.focusSecondsToday += elapsed;

  if (elapsed >= CONFIG.MIN_CONTEXT_SECONDS) {
    post("/api/events", { type: "context_switch", detail: state.activeDomain, duration_s: Math.round(elapsed) });
  }
  if (elapsed >= CONFIG.MIN_SESSION_SECONDS) {
    post("/api/sessions", {
      task_title: (state.activeTitle || state.activeDomain || "Browsing").slice(0, 200),
      app_name: "Chrome",
      url: state.activeDomain || "",
      duration_s: Math.round(elapsed),
    });
  }
  // Auto-group the visited site under the active context (no new context created).
  if (elapsed >= CONFIG.MIN_CONTEXT_SECONDS && state.contextId && state.activeDomain && isContextDomain(state.activeDomain)) {
    post(`/api/contexts/${state.contextId}/group`, {
      kind: "tab",
      label: state.activeTitle || state.activeDomain,
      domain: state.activeDomain,
      duration_s: Math.round(elapsed),
    });
  }

  state.activeDomain = null;
  state.activeTitle = "";
  state.sessionStart = null;
  saveState();
}

async function setActiveTab(tab) {
  if (!tab || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
    flushActiveTab();
    return;
  }
  const domain = hostnameOf(tab.url);
  if (!domain) return;

  await syncBeast();

  if (isBlocked(domain)) {
    chrome.tabs.update(tab.id, { url: chrome.runtime.getURL("blocked.html") });
    return;
  }

  if (domain === state.activeDomain) return;
  flushActiveTab();
  state.activeDomain = domain;
  state.activeTitle = tab.title || domain;
  state.sessionStart = Date.now();
  state.recentDomains = [domain, ...(state.recentDomains || []).filter((d) => d !== domain)].slice(0, 10);
  saveState();

  await evaluateWatchdog(domain);
  if (!state.contextTitle) await maybeDetectContext(domain);
}

async function onActivated(activeInfo) {
  const tab = await chrome.tabs.get(activeInfo.tabId).catch(() => null);
  await setActiveTab(tab);
}

chrome.tabs.onActivated.addListener(onActivated);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) setActiveTab(tab);
});

chrome.tabs.onCreated.addListener((tab) => setActiveTab(tab));

chrome.tabs.onRemoved.addListener(() => flushActiveTab());

let focusLostAt = null;

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    focusLostAt = Date.now();
    flushActiveTab();
  } else if (focusLostAt) {
    const lostSeconds = (Date.now() - focusLostAt) / 1000;
    focusLostAt = null;
    if (lostSeconds >= CONFIG.MIN_CONTEXT_SECONDS) {
      post("/api/events", { type: "focus_lost", detail: "Browser window focus", duration_s: Math.round(lostSeconds) });
    }
  }
});

// ---- Lifecycle -----------------------------------------------------------

chrome.runtime.onStartup.addListener(async () => {
  await loadState();
  await syncBackend();
});
chrome.runtime.onInstalled.addListener(async () => {
  await loadState();
  await syncBackend();
});

// Service workers go idle — use an alarm (not setInterval) for periodic sync.
// 1 minute so Beast Mode / context changes picked up from the phone feel instant.
chrome.alarms.create("focusguard.sync", { periodInMinutes: 1 });

(async function init() {
  await loadState();
  await syncBackend();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  if (tab) await setActiveTab(tab);
})();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "GET_STATE") {
    saveState();
    sendResponse({ ...state });
  }
  if (msg && msg.type === "LOG_EVENT") {
    post("/api/events", { type: msg.event.type, detail: msg.event.detail, duration_s: Math.round(msg.event.durationS || 0) });
    sendResponse({ ok: true });
  }
  if (msg && msg.type === "REFRESH") {
    syncBackend().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg && msg.type === "BEAST_STARTED") {
    syncBackend().then(() => sendResponse({ ok: true }));
    return true;
  }
});
