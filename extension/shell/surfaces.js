// @ts-check
// Where the user sees things: in-page card (host access only) → notification fallback; badge.
import { nudgeModel, welcomeModel } from "../nudge/model.js";
import { renderCard, removeCard } from "../nudge/card.js";
import { fill } from "../copy/copy.js";

const ICON = "icons/icon128.png";
/** Notification button index → action. Notifications allow at most 2 buttons. */
export const NUDGE_BUTTONS = ["back", "extend"];
export const PROPOSE_BUTTONS = ["confirm", "cancel"];

/** @typedef {{prev:any, state:any, now:number}} StepCtx */

/** @param {{chrome:any, copy:any, settingsUrl:()=>string, log?:(...a:any[])=>void}} deps */
export function createSurfaces({ chrome, copy, settingsUrl, log = console.warn }) {
  /** Inject the card if we hold host access for the tab's origin. @param {number|null|undefined} tabId @param {any} model */
  async function inject(tabId, model) {
    if (tabId == null) return false;
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    let origin;
    try {
      origin = new URL(tab?.url ?? "").origin;
    } catch {
      return false;
    }
    if (!/^https?:/.test(origin)) return false;
    if (!(await chrome.permissions.contains({ origins: [`${origin}/*`] }))) return false;
    try {
      await chrome.scripting.executeScript({ target: { tabId }, func: renderCard, args: [model] });
      return true;
    } catch (e) {
      log("card injection failed; falling back to a notification", e);
      return false;
    }
  }

  async function hideNudge() {
    const { fg_nudge } = await chrome.storage.session.get("fg_nudge");
    if (!fg_nudge) return;
    await chrome.storage.session.remove("fg_nudge");
    await chrome.notifications.clear(`nudge:${fg_nudge.interventionId}`);
    if (fg_nudge.tabId != null) await chrome.scripting.executeScript({ target: { tabId: fg_nudge.tabId }, func: removeCard }).catch(() => {});
  }

  /** @param {any} fx @param {StepCtx} c */
  async function showNudge(fx, { state }) {
    await hideNudge(); // L2 replaces L1, possibly in another tab
    const { fg_seen_explainer = [] } = await chrome.storage.local.get("fg_seen_explainer");
    const model = nudgeModel(fx, { copy, seenLevels: fg_seen_explainer, settingsUrl: settingsUrl() });
    const tabId = state.current?.tabId ?? null;
    if (await inject(tabId, model)) {
      await chrome.storage.session.set({ fg_nudge: { tabId, interventionId: fx.interventionId } });
    } else {
      await chrome.notifications.create(`nudge:${fx.interventionId}`, {
        type: "basic", iconUrl: ICON, title: copy.notif.title, priority: 1,
        message: [model.message, model.explainer].filter(Boolean).join("\n"),
        buttons: NUDGE_BUTTONS.map((a) => ({ title: copy.notif[a] })),
      });
      await chrome.storage.session.set({ fg_nudge: { tabId: null, interventionId: fx.interventionId } });
    }
    if (!fg_seen_explainer.includes(fx.level)) await chrome.storage.local.set({ fg_seen_explainer: [...fg_seen_explainer, fx.level] });
  }

  /** @param {any} fx @param {StepCtx} c */
  async function showRecovery(fx, { state }) {
    const sites = [...(state.ctx?.resources ?? [])].sort((a, b) => b.lastSeen - a.lastSeen).map((r) => r.host);
    const model = welcomeModel(fx, { copy, sites });
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (await inject(tab?.id, model)) return;
    await chrome.notifications.create("welcome", {
      type: "basic", iconUrl: ICON, title: model.title, message: [model.note, model.message, model.sites].filter(Boolean).join("\n"),
    });
  }

  /** @param {any} fx */
  async function proposeContext(fx) {
    await chrome.action.setBadgeText({ text: "?" });
    await chrome.notifications.create("propose", {
      type: "basic", iconUrl: ICON, priority: 0,
      title: fill(copy.notif.propose, { title: fx.suggested?.title ?? fx.host }),
      message: copy.notif.propose_body,
      buttons: [{ title: copy.notif.yes }, { title: copy.notif.not_now }],
    });
  }

  /** Clear the proposal badge/notification once the proposal is answered or expires. @param {StepCtx} c */
  async function afterStep({ prev, state }) {
    if (prev?.phase === "detected" && state.phase !== "detected") {
      await chrome.action.setBadgeText({ text: "" });
      await chrome.notifications.clear("propose");
    }
  }

  return {
    handlers: {
      show_nudge: showNudge,
      hide_nudge: hideNudge,
      show_recovery: showRecovery,
      show_progress: () => chrome.action.openPopup().catch(() => {}),
      propose_context: proposeContext,
    },
    afterStep,
  };
}
