// @ts-check
// FocusGuard service worker. Chrome events → shell/adapters → serialized dispatch
// (engine step → persist → effects). Clean v1 rewrite: no shadow mode, no state migration.
import { step, initialState, view, DEFAULTS, alarmsFor } from "./engine/step.js";
import { getAccessToken, isSignedIn, signOut } from "./auth/session.js";
import { classify } from "./ai/index.js";
import { onBeastAlarm } from "./beast/beast.js";
import { CONFIG, getConfig, loadLocalConfigIntoStorage } from "./config.js";
import { tabToInput, alarmToInput, shouldLand } from "./shell/adapters.js";
import { createDispatch, buildCfg } from "./shell/dispatch.js";
import { createEffects } from "./shell/effects.js";
import { createSurfaces } from "./shell/surfaces.js";
import { createHints } from "./shell/hints.js";
import { createSync } from "./shell/sync.js";
import { createSettings } from "./shell/settings.js";
import { createMessageHandler, notificationToInput } from "./shell/messages.js";

/** Merged config (R11/R28): checked-in defaults until `ready` loads fg_config_override. Every network use awaits `ready` first. */
let cfg = { ...CONFIG, ENGINE: /** @type {Record<string, number>} */ ({}) };
const settings = createSettings({ chrome, getAccessToken, signOut, apiUrl: () => cfg.API_URL });
/** @param {string} path */
const loadJson = (path) => fetch(chrome.runtime.getURL(path)).then((r) => r.json());

// Built once per worker lifetime; every listener awaits it. (No top-level await in service workers.)
const ready = (async () => {
  await loadLocalConfigIntoStorage(); // config.local.json → fg_config_override (dev only; removed when the file is gone)
  cfg = await getConfig();
  const [seed, copy] = await Promise.all([loadJson("engine/domains.json"), loadJson("copy/en.json")]);
  /** @type {(input:any)=>Promise<any>} */
  let dispatchRef = async () => null;
  const sync = createSync({ chrome, getAccessToken, signOut, getSettings: settings.getSettings, getDeviceId: settings.getDeviceId, apiUrl: () => cfg.API_URL });
  const surfaces = createSurfaces({ chrome, copy, settingsUrl: () => `${cfg.DASHBOARD_URL}/settings` });
  // hints dispatch later, outside the current step; never awaited from inside an effect
  const hints = createHints({ chrome, classify, getSettings: settings.getSettings, dispatch: (i) => dispatchRef(i) });
  const effects = createEffects({ chrome, handlers: surfaces.handlers, afterStep: [surfaces.afterStep, sync.observe, hints.afterStep] });
  const getCfg = async () => {
    /** @type {{fg_tier_cache?: Record<string, any>}} */
    const { fg_tier_cache = {} } = await chrome.storage.local.get("fg_tier_cache");
    return buildCfg(DEFAULTS, await settings.getSettings(), { seed, cache: fg_tier_cache, overrides: cfg.ENGINE });
  };
  const { dispatch, getState } = createDispatch({ step, initialState, chrome, getCfg, runEffects: effects.runEffects });
  dispatchRef = dispatch;
  const handle = createMessageHandler({
    dispatch, getState, view, now: Date.now, refreshSettings: settings.refreshSettings, flush: () => sync.flush(),
    isSignedIn, getDeviceId: settings.getDeviceId, extensionId: chrome.runtime.id,
    getRules: async () => /** @type {{host:string, contextId:string}[]} */ ((await chrome.storage.local.get("fg_rules")).fg_rules ?? []),
  });
  return { dispatch, getState, effects, sync, handle };
})();
ready.catch((e) => console.error("FocusGuard failed to start", e));

/** @param {any} input */
const send = (input) => ready.then((r) => r.dispatch(input)).catch((e) => console.error("dispatch", e));

/** @param {any} tab chrome.tabs.Tab or null (no focused window) @param {number} ts event time */
async function land(tab, ts) {
  const r = await ready;
  const { extraSensitive } = await settings.getSettings();
  await r.dispatch(tabToInput(tab, { now: ts, extraSensitive }));
  // R36: commit the pending landing ~0.5 s after the dwell even if no other event comes (the SW stays alive 30 s).
  const dwellS = cfg.ENGINE.DWELL_MIN_S ?? DEFAULTS.DWELL_MIN_S;
  setTimeout(() => void r.dispatch({ type: "heartbeat", reason: "dwell" }), (dwellS + 0.5) * 1000);
}

/** Browser start only (runtime.onStartup): Chrome reassigned tab/group ids; the engine forgets them and re-emits every alarm. */
async function startup() {
  const r = await ready;
  // No await between `ready` and dispatch: a land() still awaiting getSettings() queues behind this step, so the
  // startup step never drops the first real landing as a stale `pending`. No pre-clear: schedule_alarm clears its kind
  // first, and a leftover kind@ms of another kind fires with a dueAt that no longer matches alarmsFor(state), which A ignores.
  await r.dispatch({ type: "heartbeat", reason: "startup" });
}

/** Install / extension update / Chrome update: tab and group ids stay valid, so never step the engine; rebuild its alarms. */
async function rearm() {
  const r = await ready;
  const s = await r.getState();
  await r.effects.rearm(s, alarmsFor(s));
}

chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => {}); // injected card cannot read resume URLs
chrome.idle.setDetectionInterval(DEFAULTS.INACTIVITY_THRESHOLD_S);

chrome.tabs.onActivated.addListener(({ tabId }) => {
  const ts = Date.now();
  chrome.tabs.get(tabId).then((t) => land(t, ts), () => {}).catch(console.error); // closed tabs are ignored
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  const ts = Date.now();
  if ("groupId" in info) void send({ type: "tab_group", tabId, groupId: info.groupId }); // drag in/out, our own grouping
  if (!tab.active || info.status !== "complete") return;
  chrome.windows.getLastFocused().then((w) => (shouldLand(info, tab, w) ? land(tab, ts) : undefined), () => {}).catch(console.error);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void ready.then(async (r) => {
    const s = await r.getState();
    if (s?.ctx?.groupTabIds?.includes(tabId)) await r.dispatch({ type: "tab_group", tabId, groupId: -1 });
  }).catch(console.error);
});

chrome.tabGroups.onRemoved.addListener((group) => void send({ type: "tab_group", tabId: null, groupId: group.id, removed: true }));

chrome.windows.onFocusChanged.addListener((windowId) => {
  const ts = Date.now();
  if (windowId === chrome.windows.WINDOW_ID_NONE) return void land(null, ts).catch(console.error); // browser lost focus → blind
  chrome.tabs.query({ active: true, windowId }).then(([t]) => (t ? land(t, ts) : undefined), () => {}).catch(console.error);
});

chrome.idle.onStateChanged.addListener((state) => void send({ type: "idle", state }));

chrome.alarms.onAlarm.addListener((alarm) => {
  // R13: Beast Mode owns beast:end / beast:bypass:<ruleId>; it does not need the engine, so no `ready`.
  if (alarm.name.startsWith("beast:")) return void onBeastAlarm(alarm.name).catch(console.error);
  if (alarm.name === "fg_sync") return void ready.then((r) => r.sync.flush()).catch(console.error);
  const input = alarmToInput(alarm);
  if (!input) return; // not an engine alarm
  void ready.then(async (r) => {
    await r.dispatch(input);
    if (input.type === "heartbeat") {
      await settings.refreshSettings(); // hourly TTL inside
      void r.sync.flush();
    }
  }).catch(console.error);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  ready.then((r) => r.handle(msg, sender)).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e) }));
  return true; // async response
});

chrome.notifications.onButtonClicked.addListener((id, index) => {
  void chrome.notifications.clear(id);
  const input = notificationToInput(id, index);
  if (input) void send(input);
});

chrome.notifications.onClicked.addListener((id) => {
  void chrome.notifications.clear(id);
  // Refused without a focused window, and on Chrome 120–126 outside policy installs (generally available from 127); the badge still shows.
  chrome.action.openPopup().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => void startup().catch(console.error));

chrome.runtime.onInstalled.addListener(({ reason }) => {
  void (async () => {
    await settings.getDeviceId();
    if (reason === "install") await chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/onboarding.html") });
    await rearm(); // never `heartbeat startup` here (A Task 12 report): it would drop the live group, lastTabId and any proposal
  })().catch(console.error);
});
