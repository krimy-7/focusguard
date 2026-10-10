// @ts-check
// Core effect executors: alarms, tab groups, focus/reopen, resume targets, related-site rules.
// Nudge/notification surfaces are passed in as `handlers` (shell/surfaces.js).
import { alarmName, ENGINE_ALARM } from "./adapters.js";

export const MODE_COLOR = { work: "blue", learning: "green", personal: "purple" };
const MAX_RESUME_TABS = 20;
const isWeb = (/** @type {string|undefined} */ url) => /^https?:\/\//.test(url ?? "");

/** @typedef {{prev:any, state:any, now:number}} StepCtx */
/** @typedef {(fx:any, ctx:StepCtx)=>Promise<unknown>|unknown} Handler */

/**
 * @param {{chrome:any, handlers?:Record<string, Handler>, afterStep?:Array<(ctx:StepCtx, effects:any[])=>Promise<void>>, log?:(...a:any[])=>void}} deps
 */
export function createEffects({ chrome, handlers = {}, afterStep = [], log = console.warn }) {
  /** @param {string} kind */
  async function clearKind(kind) {
    for (const a of await chrome.alarms.getAll()) if (a.name.startsWith(`${kind}@`)) await chrome.alarms.clear(a.name);
  }

  /** Drop engine alarms only (never E's beast:* alarms or fg_sync). */
  async function clearEngineAlarms() {
    for (const a of await chrome.alarms.getAll()) if (a.name === "heartbeat" || ENGINE_ALARM.test(a.name)) await chrome.alarms.clear(a.name);
  }

  /**
   * runtime.onInstalled (install / extension update / Chrome update): tab and group ids stay valid, so the engine is
   * NOT stepped (A: `heartbeat startup` only from runtime.onStartup). An update can drop alarms, so rebuild the
   * engine alarms from the persisted state. beast:* and fg_sync are untouched.
   * @param {any} state persisted engine state @param {Record<string, number>} alarms A's `alarmsFor(state)`
   */
  async function rearm(state, alarms) {
    await clearEngineAlarms();
    for (const [kind, at] of Object.entries(alarms)) await chrome.alarms.create(alarmName(kind, at), { when: at });
    if (state?.ctx) await chrome.alarms.create("heartbeat", { periodInMinutes: 1 }); // R22, same as keepHeartbeat
  }

  /** @param {string} contextId */
  async function getResume(contextId) {
    const key = `fg_resume:${contextId}`;
    return (await chrome.storage.local.get(key))[key] ?? null;
  }

  /** @param {number} tabId */
  async function activate(tabId) {
    try {
      const t = await chrome.tabs.update(tabId, { active: true });
      await chrome.windows.update(t.windowId, { focused: true });
      return true;
    } catch {
      return false;
    }
  }

  /** @param {any} fx @param {StepCtx} c */
  async function groupTab(fx, { state }) {
    const ctx = state.ctx?.id === fx.contextId ? state.ctx : null;
    const existing = ctx?.groupId;
    if (existing != null && existing !== -1) {
      try {
        await chrome.tabs.group({ groupId: existing, tabIds: [fx.tabId] });
        return;
      } catch {
        /* group closed, or a saved group Chrome refuses to edit: make a new one */
      }
    }
    const groupId = await chrome.tabs.group({ tabIds: [fx.tabId] });
    await chrome.tabGroups.update(groupId, { title: fx.title, color: MODE_COLOR[/** @type {keyof typeof MODE_COLOR} */ (ctx?.mode)] ?? "blue" });
    // The engine learns groupId from tabs.onUpdated(changeInfo.groupId) → tab_group input.
  }

  /** @param {string} contextId */
  async function reopenGroup(contextId) {
    const r = await getResume(contextId);
    if (!r?.tabs?.length) {
      log("reopen_group: no resume target", contextId);
      return;
    }
    const open = await chrome.tabs.query({});
    /** @type {number[]} */ const ids = [];
    /** @type {number[]} */ const groupable = [];
    let focusId = null;
    for (const t of r.tabs) {
      const hit = open.find((/** @type {any} */ o) => o.url === t.url);
      const id = hit ? hit.id : (await chrome.tabs.create({ url: t.url, active: false })).id;
      ids.push(id);
      if (!hit?.pinned) groupable.push(id); // pinned tabs cannot join groups
      if (t.url === r.lastUrl) focusId = id;
    }
    try {
      const groupId = await chrome.tabs.group({ tabIds: groupable });
      await chrome.tabGroups.update(groupId, { title: r.title, color: r.color });
    } catch (e) {
      log("reopen_group: grouping failed; tabs are open ungrouped", e);
    }
    await activate(focusId ?? ids[0]);
  }

  /** @param {any} fx */
  async function focusTab(fx) {
    if (fx.tabId != null && (await activate(fx.tabId))) return;
    const r = await getResume(fx.contextId);
    if (r?.lastUrl) {
      const match = (await chrome.tabs.query({})).find((/** @type {any} */ t) => t.url === r.lastUrl);
      if (match && (await activate(match.id))) return;
    }
    await reopenGroup(fx.contextId);
  }

  /** @param {any} fx @param {StepCtx} c */
  async function persistResume(fx, { state, now }) {
    const ctx = state.ctx;
    if (!ctx || ctx.id !== fx.contextId) return;
    const hasGroup = ctx.groupId != null && ctx.groupId !== -1;
    const grouped = hasGroup ? await chrome.tabs.query({ groupId: ctx.groupId }).catch(() => []) : [];
    const last = ctx.lastTabId != null ? await chrome.tabs.get(ctx.lastTabId).catch(() => null) : null;
    const list = (grouped.length ? grouped : last ? [last] : []).filter((/** @type {any} */ t) => isWeb(t.url));
    let color = MODE_COLOR[/** @type {keyof typeof MODE_COLOR} */ (ctx.mode)] ?? "blue";
    if (grouped.length) color = (await chrome.tabGroups.get(ctx.groupId).catch(() => null))?.color ?? color;
    // Device-only (spec §1.3): never synced, deleted on drop_resume.
    await chrome.storage.local.set({
      [`fg_resume:${ctx.id}`]: {
        contextId: ctx.id, savedAt: now, windowId: list[0]?.windowId ?? -1, groupId: grouped.length ? ctx.groupId : null,
        title: ctx.title, color, lastTabId: ctx.lastTabId ?? null, lastUrl: isWeb(last?.url) ? last.url : null,
        tabs: list.slice(0, MAX_RESUME_TABS).map((/** @type {any} */ t) => ({ url: t.url, title: t.title ?? "", pinned: !!t.pinned })),
      },
    });
  }

  /**
   * "This is part of {context}" → remember the rule for Settings (fg_rules). Other sync records go to shell/sync.js.
   * @param {any} fx @param {StepCtx} c
   */
  async function rememberRule(fx, { state, now }) {
    if (fx.rec?.kind !== "rule" || !fx.rec.host) return;
    const contextId = fx.rec.contextId ?? state.ctx?.id; // R24: the rule record carries contextId
    if (!contextId) return;
    const { fg_rules = [] } = await chrome.storage.local.get("fg_rules");
    if (fg_rules.some((/** @type {any} */ r) => r.host === fx.rec.host && r.contextId === contextId)) return;
    // R26 shape; the popup deletes by host + contextId.
    await chrome.storage.local.set({ fg_rules: [...fg_rules, { host: fx.rec.host, contextId, contextTitle: state.ctx?.title ?? "", at: now }] });
  }

  /** @param {StepCtx} c */
  async function keepHeartbeat({ state }) {
    const has = await chrome.alarms.get("heartbeat");
    if (state.ctx && !has) await chrome.alarms.create("heartbeat", { periodInMinutes: 1 });
    if (!state.ctx && has) await chrome.alarms.clear("heartbeat");
  }

  /** @type {Record<string, Handler>} */
  const all = {
    schedule_alarm: async (fx) => {
      await clearKind(fx.kind);
      await chrome.alarms.create(alarmName(fx.kind, fx.at), { when: fx.at });
    },
    cancel_alarm: (fx) => clearKind(fx.kind),
    group_tab: groupTab,
    focus_tab: focusTab,
    reopen_group: (fx) => reopenGroup(fx.contextId),
    persist_resume: persistResume,
    drop_resume: (fx) => chrome.storage.local.remove(`fg_resume:${fx.contextId}`),
    sync: rememberRule,
    log: (fx) => {
      if (fx.level === "info") console.info("[engine]", fx.msg, fx.data ?? "");
    },
    ...handlers,
  };

  /**
   * Run effects in order (show_recovery last, so its card lands on the refocused tab),
   * each isolated, then the after-step hooks.
   * @param {any[]} effects @param {StepCtx} ctx
   */
  async function runEffects(effects, ctx) {
    const ordered = [...effects.filter((f) => f.type !== "show_recovery"), ...effects.filter((f) => f.type === "show_recovery")];
    for (const fx of ordered) {
      const h = all[fx.type];
      if (!h) {
        log("unknown effect", fx.type);
        continue;
      }
      try {
        await h(fx, ctx);
      } catch (e) {
        log(`effect ${fx.type} failed`, e);
      }
    }
    for (const hook of [keepHeartbeat, ...afterStep]) {
      try {
        await hook(ctx, effects);
      } catch (e) {
        log("after-step hook failed", e);
      }
    }
  }

  return { runEffects, rearm };
}
