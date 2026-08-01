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

// Local, gitignored overrides (keys etc.) must load BEFORE config.js so the
// merge at the bottom of config.js picks them up. Missing file is fine.
try {
  importScripts("config.local.js");
} catch (e) {}
importScripts("config.js");

const CONFIG = typeof FOCUSGUARD_CONFIG !== "undefined" ? FOCUSGUARD_CONFIG : {};
const STORAGE_KEY = "focusguard_state";

// Raw configured durations (minutes) — may be fractional (e.g. 10/60 for 10s).
// These are used for elapsed-time validation in the alarm handlers, NOT for the
// alarm delay: Chrome enforces a 1-minute alarm minimum, so alarms always fire
// at 1 min and the handlers re-check whether the configured time actually elapsed.
const GRACE_MIN = Number(CONFIG.GRACE_MINUTES) || 5;
const SECOND_MIN = Number(CONFIG.SECOND_MINUTES) || 5;

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
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return (url || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split(/[/?#]/)[0] || null;
  }
}

function normalizeDomain(value) {
  const host = hostnameOf(value);
  return host ? host.replace(/^www\./, "") : null;
}

function domainTopic(value) {
  const host = normalizeDomain(value || "");
  if (!host) return null;
  if (/researchgate|scholar|semanticscholar|arxiv|pubmed|sciencedirect|jstor/.test(host)) return "research";
  if (/github|gitlab|bitbucket|stackoverflow|stackexchange|codesandbox|replit|vscode|react\.dev|expo\.dev|developer\.|mdn|nodejs|npmjs|python\.org/.test(host)) return "code";
  if (/figma|dribbble|behance|canva|framer|photoshop|adobe|fonts\.google/.test(host)) return "design";
  if (/youtube|coursera|udemy|khanacademy|duolingo|medium|dev\.to|wikipedia/.test(host)) return "learning";
  if (/trello|linear|asana|jira|todoist|slack|teams|discord|mail\.google|outlook|proton|calendar|linkedin|upwork|fiverr/.test(host)) return "work";
  if (/reddit|news\.google|cnn|bbc|nytimes|netflix|hulu|primevideo|amazon|flipkart|myntra|ebay|spotify|soundcloud|instagram|facebook|twitter|x\.com|tiktok|pinterest/.test(host)) return "personal";
  return null;
}

function fallbackProposal(domain, title) {
  const topic = domainTopic(domain) || domainTopic(title) || "work";
  const titleMap = {
    research: "Research",
    code: "Programming",
    design: "Design work",
    learning: "Learning",
    work: "Work",
    personal: "Personal browsing",
  };
  const modeMap = {
    research: "learning",
    code: "work",
    design: "work",
    learning: "learning",
    work: "work",
    personal: "personal",
  };
  const proposedTitle = titleMap[topic] || "Active session";
  return {
    proposed_title: proposedTitle,
    mode: modeMap[topic] || "work",
    confidence: 0.62,
    reason: `Based on the current site and recent browsing.`,
    existing_context_id: null,
    suggest_switch: false,
    switch_reason: "",
  };
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

  let detected = null;
  try {
    detected = await post("/api/contexts/detect", {
      signals: { domain, title: state.activeTitle || "" },
      recent_domains: state.recentDomains || [],
    });
  } catch {}

  const proposal = detected && detected.proposed_title ? detected : fallbackProposal(domain, state.activeTitle || "");
  if (!proposal || !proposal.proposed_title) return;
  if (proposal.mode === "personal") return; // don't auto-propose personal browsing

  // Re-surface an existing pending proposal for this domain.
  const pending = state.lastProposal;
  if (pending && pending.domain === domain && Date.now() - pending.ts < 15 * 60 * 1000) {
    await notifyContext(pending);
    return;
  }

  state.lastProposal = {
    domain,
    title: proposal.proposed_title,
    proposed_title: proposal.proposed_title,
    mode: proposal.mode,
    confidence: proposal.confidence || 0.62,
    ts: Date.now(),
  };
  await saveState();
  await notifyContext(state.lastProposal);
}

// ACTIVITY CLASSIFICATION: runs when an active context exists and the current
// tab is NOT part of it. Decides RELATED vs DISTRACTION vs NEW-WORK-AREA.
async function classifyActivity(domain) {
  let detected = null;
  try {
    detected = await post("/api/contexts/detect", {
      signals: { domain, title: state.activeTitle || "" },
      recent_domains: state.recentDomains || [],
    });
  } catch {}
  const proposal = detected && detected.proposed_title ? detected : fallbackProposal(domain, state.activeTitle || "");
  if (!proposal || !proposal.proposed_title) return;

  const currentTopic = domainTopic(domain);
  const activeTopics = (state.contextDomains || []).map(domainTopic).filter(Boolean);
  const sameTopic = Boolean(currentTopic && activeTopics.includes(currentTopic));

  // RELATED — same topic as the active context (e.g. Scholar while "Research"
  // is active): group the tab under the active context, no proposal, no grace.
  if (detected?.existing_context_id === state.contextId || proposal.existing_context_id === state.contextId || sameTopic) {
    await groupActiveContext(domain);
    return;
  }
  if (detected?.suggest_switch === false && detected?.confidence >= 0.55) {
    await groupActiveContext(domain);
    return;
  }

  const mode = proposal.mode;

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
async function startDistraction(domain) {
  state.currentActivity = { domain, title: state.activeTitle || domain };
  state.activityRelation = "distraction";
  state.distractionState = "grace";
  state.distractionSite = domain;
  if (!state.awaySince || state.awaySince <= 0) {
    state.awaySince = Date.now();
    state.gracePeriodStartedAt = Date.now();
    state.gracePeriodDurationMin = GRACE_MIN;
    state.firstInterventionShown = false;
    state.secondInterventionShown = false;
    state.intervenedLevel = 0;
    
    const graceDurationMs = GRACE_MIN * 60 * 1000;
    console.log(`[DISTRACTION] Starting grace period of ${GRACE_MIN} minutes (${graceDurationMs}ms) for ${domain}`);

    // No Chrome alarms — the content script in the active tab times the grace
    // period (sub-minute precision) and messages us when it elapses.
    armWatchdog("grace", graceDurationMs);

    await saveState();
    console.log(`[DISTRACTION] Grace timer armed (${graceDurationMs}ms) and state saved`);
  }
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
  state.distractionState = "none";
  state.awaySince = null;
  state.gracePeriodStartedAt = null;
  await saveState();
  // New active context — no drift, no pending interventions.
  resetWatchdog();
}

// ---- Watchdog ------------------------------------------------------------

// Arm a sub-minute timer in the active tab's content script. The service worker
// cannot use setTimeout reliably (it goes idle), and Chrome alarms have a
// 1-minute floor, so the content script does the precise timing.
async function armWatchdog(label, ms) {
  // Prefer the tab for the current distraction/focus domain over the focused
  // window — the intervention popup is itself a window and would otherwise
  // swallow the message.
  const target = state.distractionSite || state.activeDomain;
  const tabs = await chrome.tabs.query({}).catch(() => []);
  let tab = tabs.find((t) => {
    const h = hostnameOf(t.url);
    return h && (h === target || h.endsWith("." + target) || target.endsWith("." + h));
  });
  if (!tab) {
    tab = tabs.find((t) => t.active) || tabs[0];
  }
  if (!tab || !tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "WATCHDOG_TIMER", label, ms });
  } catch {
    // No content script (chrome:// page, reloaded extension) — timer lost.
  }
}

async function cancelWatchdog(label) {
  const tabs = await chrome.tabs.query({}).catch(() => []);
  for (const tab of tabs) {
    if (!tab || !tab.id) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "WATCHDOG_CANCEL", label });
    } catch {}
  }
}

async function handleWatchdogElapsed(label) {
  await loadState();
  if (label === "grace") {
    if (!(state.awaySince && state.awaySince > 0 && state.distractionState === "grace")) return;
    await triggerLevel1();
  } else if (label === "second") {
    if (!(state.awaySince && state.intervenedLevel === 1 && state.distractionState === "first")) return;
    await triggerLevel2();
  }
}

function isContextDomain(domain) {
  if (!domain) return false;
  const currentTopic = domainTopic(domain);
  if (!state.contextDomains.length) return false;
  return state.contextDomains.some((d) => {
    const activeTopic = domainTopic(d);
    return (
      domain === d ||
      domain.endsWith("." + d) ||
      d.endsWith("." + domain) ||
      (currentTopic && activeTopic && currentTopic === activeTopic)
    );
  });
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
  cancelWatchdog("grace");
  cancelWatchdog("second");
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
  const fallback = `You've been away from ${title} for ${awayMin} minute${awayMin === 1 ? "" : "s"}.`;
  const message = await generateInterventionMessage(1, title, fallback);
  state.intervenedLevel = 1;
  state.distractionState = "first";
  state.firstInterventionShown = true;
  await saveState();
  console.log("[TRIGGER LEVEL 1] State saved, posting intervention...");
  await post("/api/interventions", { level: 1, message, context_id: state.contextId });
  console.log("[TRIGGER LEVEL 1] Intervention posted, scheduling Level 2...");

  // Content-script timer for the second (playful) intervention.
  const secondMs = SECOND_MIN * 60 * 1000;
  armWatchdog("second", secondMs);

  await notify(1, message);
}

async function triggerLevel2() {
  const title = state.contextTitle || "your focus";
  const fallback = `${title} is crying in the corner 😭`;
  const message = await generateInterventionMessage(2, title, fallback);
  state.intervenedLevel = 2;
  state.distractionState = "second";
  state.secondInterventionShown = true;
  await saveState();
  console.log("[TRIGGER LEVEL 2] State saved, posting intervention...");
  await post("/api/interventions", { level: 2, message, context_id: state.contextId });
  console.log("[TRIGGER LEVEL 2] Intervention posted, creating notification...");
  await notify(2, message);
}

// Generate an intervention message via OpenRouter, falling back to the mock
// message when there are no keys, both requests fail, or nothing is returned.
async function generateInterventionMessage(level, contextTitle, fallback) {
  const keys = [(CONFIG.OPENROUTER_KEY_FIRST || "").trim(), (CONFIG.OPENROUTER_KEY_SECOND || "").trim()].filter(Boolean);
  if (!keys.length) return fallback;

  const site = state.distractionSite || state.activeDomain || "another website";
  const isLevel2 = level === 2;
  const prompt = isLevel2
    ? `The user has been away from their "${contextTitle}" focus for a while and ignored a first reminder. Write ONE short playful sentence (max 12 words) nudging them back to "${contextTitle}". No quotes, no hashtags, no markdown.`
    : `The user drifted from their "${contextTitle}" focus to ${site}. Write ONE short gentle sentence (max 12 words) reminding them to return to "${contextTitle}". No quotes, no hashtags, no markdown.`;

  // Try each key in turn (second key covers rate limits / outages).
  for (const key of keys) {
    try {
      const res = await fetch(CONFIG.OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: CONFIG.OPENROUTER_MODEL || "openrouter/free",
          messages: [
            {
              role: "system",
              content: "You are FocusGuard, a friendly focus coach. Reply with exactly one short sentence.",
            },
            { role: "user", content: prompt },
          ],
          max_tokens: 40,
          temperature: isLevel2 ? 0.9 : 0.6,
        }),
      });
      if (!res.ok) continue; // try next key
      const data = await res.json();
      const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || "").trim();
      if (text) return text.replace(/^["']|["']$/g, "");
    } catch {
      // network error — try next key
    }
  }
  return fallback;
}

// Inject a blurred intervention overlay into the distraction tab (5s), rather
// than opening a separate popup window. The content script renders the UI and
// messages back for the action buttons.
async function notify(level, message) {
  const context = state.contextTitle || "your focus";
  const target = state.distractionSite || state.activeDomain;
  const tabs = await chrome.tabs.query({}).catch(() => []);
  const tab = tabs.find((t) => {
    const h = hostnameOf(t.url);
    return h && (h === target || h.endsWith("." + target) || target.endsWith("." + h));
  });
  if (!tab || !tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "SHOW_INTERVENTION", level, message, context });
    console.log(`[NOTIFICATION] Overlay sent to ${target} (Level ${level})`);
  } catch {
    console.error("[NOTIFICATION ERROR] No content script to receive overlay", target);
  }
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
  state.gracePeriodStartedAt = Date.now();
  armWatchdog("grace", (state.gracePeriodDurationMin || GRACE_MIN) * 60 * 1000);
  post("/api/sync", { platform: "extension", event: "intervention", payload: { detail: "extend_timer" } });
  saveState();
}

// ---- Timers / notifications ----------------------------------------------

// The content script in the active tab drives sub-minute watchdog timers
// (no Chrome alarms — they have a 1-minute floor). It messages us on expiry.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "WATCHDOG_ELAPSED") {
    handleWatchdogElapsed(msg.label).then(() => sendResponse({ ok: true }));
    return true;
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
  // Handlers for intervention popup actions (using 'action' field instead of 'type')
  if (msg && msg.action === "BACK_TO_WORK") {
    loadState().then(async () => {
      await backToWork();
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg && msg.action === "SEE_PROGRESS") {
    loadState().then(async () => {
      await seeProgress();
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg && msg.action === "TAKE_BREAK") {
    loadState().then(async () => {
      await takeBreak();
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg && msg.action === "EXTEND_TIMER") {
    loadState().then(async () => {
      extendTimer();
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg && msg.type === "RESET") {
    state = { ...DEFAULT_STATE };
    cancelWatchdog("grace");
    cancelWatchdog("second");
    syncBackend().then(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
      if (tab) await setActiveTab(tab);
      sendResponse({ ok: true });
    });
    return true;
  }
});
