// @ts-check
// C3 runtime messages + notification buttons → engine inputs.
import { EXTEND_S } from "../nudge/model.js";
import { NUDGE_BUTTONS, PROPOSE_BUTTONS } from "./surfaces.js";

const CARD_ACTIONS = new Set(["back", "related", "new_task", "extend", "break", "dismiss"]);

/**
 * Card/notification action → engine cmd. id = `${interventionId}:${action}`, so a double click
 * (or card + notification) is a duplicate the engine ignores (it keeps the last 20 ids).
 * @param {{interventionId?:unknown, action?:unknown, n?:unknown, title?:unknown, note?:unknown}} msg
 */
export function nudgeActionToInput({ interventionId, action, n, title, note }) {
  if (typeof interventionId !== "string" || typeof action !== "string" || !CARD_ACTIONS.has(action)) return null;
  /** @type {{type:'cmd', id:string, cmd:string, n?:number, title?:string, note?:string}} */
  const input = { type: "cmd", id: `${interventionId}:${action}`, cmd: action };
  if (action === "extend") input.n = typeof n === "number" ? n : EXTEND_S;
  if (action === "new_task" && title) input.title = String(title).slice(0, 120);
  if (action === "break" && note) input.note = String(note).slice(0, 280);
  return input;
}

/** @param {string} notificationId @param {number} buttonIndex */
export function notificationToInput(notificationId, buttonIndex) {
  if (notificationId === "propose") {
    const cmd = PROPOSE_BUTTONS[buttonIndex];
    return cmd ? { type: "cmd", cmd } : null;
  }
  const m = /^nudge:(.+)$/.exec(notificationId);
  return m ? nudgeActionToInput({ interventionId: m[1], action: NUDGE_BUTTONS[buttonIndex] }) : null;
}

/**
 * @param {{
 *   dispatch:(input:any)=>Promise<{state:any}|null>, getState:()=>Promise<any>, view:(state:any, now:number)=>any, now:()=>number,
 *   refreshSettings:(o:{force?:boolean, maxAgeMs?:number})=>Promise<boolean>, flush:()=>Promise<void>,
 *   isSignedIn:()=>Promise<boolean>, getDeviceId:()=>Promise<string>,
 *   getRules:()=>Promise<{host:string, contextId:string}[]>, extensionId:string,
 * }} deps
 */
export function createMessageHandler(deps) {
  /** R14: hosts in the live context whose fg_rules entry the popup deleted. */
  async function unrelateDeleted() {
    const state = await deps.getState();
    const ctx = state?.ctx;
    if (!ctx) return;
    const rules = await deps.getRules();
    const keep = new Set(rules.filter((r) => r.contextId === ctx.id).map((r) => r.host));
    for (const host of ctx.relatedHosts ?? []) {
      // No id: A's unrelate is idempotent, and a fixed id would be dropped as duplicate_cmd on a repeat delete.
      if (!keep.has(host)) await deps.dispatch({ type: "cmd", cmd: "unrelate", host });
    }
  }

  /** @param {any} msg @param {{id?:string, url?:string, tab?:unknown}|undefined} sender */
  return async function handle(msg, sender) {
    switch (msg?.type) {
      case "cmd": {
        if (sender?.id !== deps.extensionId || sender.tab) return { ok: false, error: "forbidden" }; // R29: extension pages outside tabs only
        const { type: _t, ...rest } = msg;
        const r = await deps.dispatch({ type: "cmd", ...rest });
        return r ? { ok: true, view: deps.view(r.state, deps.now()) } : { ok: false, error: "no_consent" };
      }
      case "get_view": {
        void deps.refreshSettings({ maxAgeMs: 60_000 }); // spec §3.1: refresh on popup open
        const state = await deps.getState();
        return { view: deps.view(state, deps.now()), signedIn: await deps.isSignedIn(), deviceId: await deps.getDeviceId() };
      }
      case "settings_changed":
        await deps.refreshSettings({ force: true });
        await unrelateDeleted();
        void deps.flush(); // e.g. just signed in: upload what accumulated
        return { ok: true };
      case "nudge_action": {
        const input = nudgeActionToInput(msg);
        if (input) await deps.dispatch(input);
        return { ok: true };
      }
      default:
        return { ok: false, error: "unknown_message" };
    }
  };
}
