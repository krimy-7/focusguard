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
  // Active context (source of truth once confirmed)
  contextTitle: null,
  contextId: null,
  contextMode: null,
  contextDomains: [],
  // Activity relationship & distraction state machine
  currentActivity: null, // { domain, title }
  activityRelation: "none", // "active" | "related" | "distraction" | "proposal"
  distractionState: "none", // "none" | "grace" | "first" | "second"
  gracePeriodStartedAt: null,
  gracePeriodDurationMin: 5,
  firstInterventionShown: false,
  secondInterventionShown: false,
  distractionSite: null,
  awaySince: null,
  intervenedLevel: 0,
  beast: null, // { ends_at, blocked_sites: [] }
  // Context detection / grouping
  recentDomains: [],
  lastProposal: null, // { domain, title, mode, ts } — only set for genuine new work areas
  ignoredProposals: [], // [{ domain, ts }]
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
    state.contextMode = active ? active.mode : null;
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

// ---- Context discovery & activity classification --------------------------

// CONTEXT DISCOVERY: only runs when there is NO active context. A context is a
// user-confirmed intention, so we only surface it for genuine work/learning
// areas, never for personal-mode sites (social/streaming/news).
async function maybeDetectContext(domain) {
  if (state.contextTitle) return;
  const recentIgnores = (state.ignoredProposals || []).filter(
    (i) => i.domain === domain && Date.now() - i.ts < 30 * 60 * 1000
  );
  if (recentIgnores.length) return;

  const detected = await post("/api/contexts/detect", {
    signals: { domain, title: state.activeTitle || "" },
    recent_domains: state.recentDomains || [],
  });
  if (!detected || !detected.proposed_title) return;
  if (detected.mode === "personal") return; // don't auto-propose personal browsing

  // Re-surface an existing pending proposal for this domain.
  const pending = state.lastProposal;
  if (pending && pending.domain === domain && Date.now() - pending.ts < 15 * 60 * 1000) {
    await notifyContext(pending);
    return;
  }

  state.lastProposal = {
    domain,
    title: detected.proposed_title,
    proposed_title: detected.proposed_title,
    mode: detected.mode,
    confidence: detected.confidence,
    ts: Date.now(),
  };
  await saveState();
  await notifyContext(state.lastProposal);
}

// ACTIVITY CLASSIFICATION: runs when an active context exists and the current
// tab is NOT part of it. Decides RELATED vs DISTRACTION vs NEW-WORK-AREA.
async function classifyActivity(domain) {
  const detected = await post("/api/contexts/detect", {
    signals: { domain, title: state.activeTitle || "" },
    recent_domains: state.recentDomains || [],
  });
  if (!detected || !detected.proposed_title) return;

  // RELATED — same topic as the active context (e.g. Scholar while "Research"
  // is active): group the tab under the active context, no proposal, no grace.
  // An exact match to the active context is always related. Otherwise the
  // engine's "same topic" signal must also carry decent confidence, because
  // weak/unknown sites (label-less domains) also report suggest_switch=false.
  if (detected.existing_context_id === state.contextId) {
    await groupActiveContext(domain);
    return;
  }
  if (detected.suggest_switch === false && detected.confidence >= 0.55) {
    await groupActiveContext(domain);
    return;
  }

  const mode = detected.mode;

  // LEARNING mode is ambiguous — evaluate it against the active context. A
  // YouTube/Coursera tutorial is plausibly legitimate when the active context
  // is itself learning (research). Don't nag and don't auto-create a context.
  if (mode === "learning") {
    if (state.contextMode === "learning") {
      markRelated(domain);
      return;
    }
    startDistraction(domain);
    return;
  }

  // PERSONAL mode (social/streaming/news/shopping) — likely distraction.
  if (mode === "personal") {
    startDistraction(domain);
    return;
  }

  // WORK mode with a different topic = a legitimate new work area (e.g.
  // Research -> Figma could become "Landing Page Design"). Propose, confirm.
  if (mode === "work" && detected.confidence >= 0.6) {
    await proposeNewContext(domain, detected);
    return;
  }

  // Low-confidence work-mode or anything else: don't nag, treat as distraction.
  startDistraction(domain);
}

// Same-topic tab while a context is active: continue the context without
// creating a new one or starting the watchdog.
async function markRelated(domain) {
  state.currentActivity = { domain, title: state.activeTitle || domain };
  state.activityRelation = "related";
  state.distractionState = "active";
  state.distractionSite = null;
  resetWatchdog();
}

async function groupActiveContext(domain) {
  if (!state.contextId || !domain) return;
  if (state.contextDomains.includes(domain)) {
    markRelated(domain);
    return;
  }
  await post(`/api/contexts/${state.contextId}/group`, {
    kind: "tab",
    label: state.activeTitle || domain,
    domain,
    duration_s: 0,
  });
  state.contextDomains = Array.from(new Set([...(state.contextDomains || []), domain]));
  await saveState();
  markRelated(domain);
}

// POSSIBLE DISTRACTION: unrelated activity. Never creates a context and never
// asks for confirmation. Starts the grace period (once per drift episode).
function startDistraction(domain) {
  state.currentActivity = { domain, title: state.activeTitle || domain };
  state.activityRelation = "distraction";
  state.distractionState = "grace";
  state.distractionSite = domain;
  if (!state.awaySince) {
    state.awaySince = Date.now();
    state.gracePeriodStartedAt = state.awaySince;
    state.gracePeriodDurationMin = GRACE_MIN;
    state.firstInterventionShown = false;
    state.secondInterventionShown = false;
    state.intervenedLevel = 0;
    chrome.alarms.create("focusguard.grace", { delayInMinutes: GRACE_MIN });
  }
  saveState();
}

// LEGITIMATE NEW WORK AREA: propose a new context (the only case that asks the
// user to confirm). Confirming switches the active context; the previous one is
// deactivated on the backend (stored as history). Ignoring keeps the current
// context and treats this tab as a distraction.
async function proposeNewContext(domain, detected) {
  const pending = state.lastProposal;
  if (pending && pending.domain === domain && Date.now() - pending.ts < 15 * 60 * 1000) {
    await notifyContext(pending);
    return;
  }
  state.lastProposal = {
    domain,
    title: detected.proposed_title,
    proposed_title: detected.proposed_title,
    mode: detected.mode,
    confidence: detected.confidence,
    ts: Date.now(),
  };
  state.activityRelation = "proposal";
  await saveState();
  await notifyContext(state.lastProposal);
}

function notifyContext(proposal) {
  return chrome.notifications.create("focusguard-context", {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "New context detected?",
    message: `Looks like you're working on: ${proposal.proposed_title || proposal.title}`,
    buttons: [{ title: "Confirm" }, { title: "Ignore" }],
    priority: 1,
  });
}

async function confirmContext(proposal, customTitle) {
  const title = (customTitle && customTitle.trim()) || proposal.title || proposal.proposed_title;
  const created = await post("/api/contexts", {
    title,
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
  state.contextMode = created.mode || proposal.mode || "work";
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
  state.lastProposal = null;
  state.activityRelation = "active";
  state.currentActivity = { domain: state.activeDomain, title: state.activeTitle || state.activeDomain };
  await saveState();
  // New active context — no drift, no pending interventions.
  resetWatchdog();
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
  if (beast.ends_at) {
    // Backend stores naive UTC (no timezone marker) — treat it as UTC so a
    // non-UTC machine doesn't misread the end time as already past.
    const s = String(beast.ends_at).trim();
    const hasTz = /Z$/i.test(s) || /[+-]\d{2}:?\d{2}$/.test(s);
    const endMs = new Date(hasTz ? s : `${s}Z`).getTime();
    if (!Number.isNaN(endMs) && endMs < now) {
      state.beast = null;
      saveState();
      return false;
    }
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
  state.distractionState = state.contextTitle ? "active" : "none";
  state.gracePeriodStartedAt = null;
  state.firstInterventionShown = false;
  state.secondInterventionShown = false;
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
    // Back on the intended context: drop any stale proposal.
    if (state.lastProposal) {
      state.lastProposal = null;
    }
    markRelated(domain);
    return;
  }

  // Not a context domain — let classifyActivity decide (called from setActiveTab).
}

async function triggerLevel1() {
  const title = state.contextTitle || "your focus";
  const awayMin = Math.max(1, Math.round(((Date.now() - state.awaySince) / 1000) / 60));
  const message = `You've been away from ${title} for ${awayMin} minute${awayMin === 1 ? "" : "s"}.`;
  state.intervenedLevel = 1;
  state.distractionState = "first";
  state.firstInterventionShown = true;
  post("/api/interventions", { level: 1, message, context_id: state.contextId });
  chrome.alarms.create("focusguard.second", { delayInMinutes: SECOND_MIN });
  saveState();
  await notify(1, message);
}

async function triggerLevel2() {
  const title = state.contextTitle || "your focus";
  const message = `${title} is crying in the corner 😭`;
  state.intervenedLevel = 2;
  state.distractionState = "second";
  state.secondInterventionShown = true;
  post("/api/interventions", { level: 2, message, context_id: state.contextId });
  saveState();
  await notify(2, message);
}

function notify(level, message) {
  const buttons =
    level === 1
      ? [{ title: "Back to work" }, { title: "See progress" }, { title: "Extend 5 min" }]
      : [{ title: "Back to work" }, { title: "Take a break" }, { title: "Extend 5 min" }];
  return chrome.notifications.create(`focusguard-${level}`, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: level === 1 ? "Possible distraction" : "Still distracted?",
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

async function seeProgress() {
  if (CONFIG.DASHBOARD_URL) chrome.tabs.create({ url: CONFIG.DASHBOARD_URL });
  post("/api/sync", { platform: "extension", event: "intervention", payload: { detail: "see_progress" } });
  resetWatchdog();
}

async function takeBreak() {
  post("/api/events", { type: "break", detail: "Intervention break", duration_s: 300 });
  post("/api/sync", { platform: "extension", event: "intervention", payload: { detail: "take_break" } });
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
    } else if (state.lastProposal) {
      // Ignored: keep the current context; this tab is a distraction.
      const domain = state.lastProposal.domain;
      state.ignoredProposals = [...(state.ignoredProposals || []), { domain, ts: Date.now() }];
      state.lastProposal = null;
      if (state.activeDomain && !isContextDomain(state.activeDomain)) {
        startDistraction(state.activeDomain);
      } else {
        await saveState();
      }
    }
    return;
  }
  if (buttonIndex === 0) {
    await backToWork();
  } else if (id === "focusguard-1") {
    // Level 1: [Back to work] [See progress] [Extend 5 min]
    if (buttonIndex === 1) {
      await seeProgress();
    } else {
      await extendTimer();
    }
  } else if (id === "focusguard-2") {
    // Level 2: [Back to work] [Take a break] [Extend 5 min]
    if (buttonIndex === 1) {
      await takeBreak();
    } else {
      await extendTimer();
    }
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
  if (state.contextTitle) {
    // Active context exists: decide whether this tab is related (group),
    // a possible distraction (grace), or a legitimate new work area (propose).
    if (!isContextDomain(domain)) await classifyActivity(domain);
  } else {
    // No active context yet: context discovery.
    await maybeDetectContext(domain);
  }
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
  if (msg && msg.type === "CONFIRM_CONTEXT") {
    loadState().then(async () => {
      const proposal = state.lastProposal || { title: msg.title, mode: "work", ts: Date.now() };
      await confirmContext(proposal, msg.title || null);
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg && msg.type === "IGNORE_CONTEXT") {
    loadState().then(async () => {
      if (state.lastProposal) {
        state.ignoredProposals = [...(state.ignoredProposals || []), { domain: state.lastProposal.domain, ts: Date.now() }];
        state.lastProposal = null;
        if (state.activeDomain && !isContextDomain(state.activeDomain)) {
          startDistraction(state.activeDomain);
        } else {
          await saveState();
        }
      }
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg && msg.type === "BACK_TO_WORK") {
    loadState().then(async () => {
      await backToWork();
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg && msg.type === "SEE_PROGRESS") {
    loadState().then(async () => {
      await seeProgress();
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg && msg.type === "TAKE_BREAK") {
    loadState().then(async () => {
      await takeBreak();
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg && msg.type === "EXTEND_TIMER") {
    loadState().then(async () => {
      extendTimer();
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg && msg.type === "RESET") {
    state = { ...DEFAULT_STATE };
    chrome.alarms.clear("focusguard.grace");
    chrome.alarms.clear("focusguard.second");
    syncBackend().then(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
      if (tab) await setActiveTab(tab);
      sendResponse({ ok: true });
    });
    return true;
  }
});
