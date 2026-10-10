// @ts-check
// Pure adapters: Chrome objects → engine inputs. No chrome.* here.
import { isSensitiveHost, sanitizeTitle } from "../privacy.js";
import { normalizeHost } from "../engine/tiers.js"; // R20: A owns host normalization

/** @typedef {{id?:number, url?:string, title?:string, incognito?:boolean, active?:boolean, windowId?:number}} TabLike */
/** @typedef {{type:'landing', tabId:number, host:string|null, title:string, ts:number}} LandingInput */

/** Alarms D schedules for the engine: `${kind}@${atMs}`. */
export const ENGINE_ALARM = /^(grace|escalate|soft_confirm|pause_end|heartbeat)@(\d+)$/;

/** @param {string} host @param {string} suffix */
export function hostMatches(host, suffix) {
  return host === suffix || host.endsWith("." + suffix);
}

/**
 * Raw tab → landing. Blind (host:null, title:'') for incognito, non-web pages,
 * sensitive hosts and the user's extra-sensitive list, so the engine never sees them.
 * @param {TabLike|null|undefined} tab
 * @param {{now:number, extraSensitive?:string[]}} opts
 * @returns {LandingInput}
 */
export function tabToInput(tab, { now, extraSensitive = [] }) {
  /** @type {LandingInput} */
  const blind = { type: "landing", tabId: tab?.id ?? -1, host: null, title: "", ts: now };
  if (!tab || tab.incognito || !tab.url) return blind;
  let url;
  try {
    url = new URL(tab.url);
  } catch {
    return blind;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return blind;
  // Normalize BEFORE the privacy checks: "online.chase.com." must not slip past the $-anchored patterns.
  const h = normalizeHost(url.hostname);
  if (!h || isSensitiveHost(h) || extraSensitive.some((s) => hostMatches(h, normalizeHost(String(s))))) return blind;
  return { type: "landing", tabId: tab.id ?? -1, host: h, title: sanitizeTitle(tab.title), ts: now };
}

/** @param {string} kind @param {number} at */
export function alarmName(kind, at) {
  return `${kind}@${at}`;
}

/**
 * chrome.alarms.Alarm → engine input. dueAt comes from the name, not scheduledTime,
 * because Chrome clamps short alarms to 30 s and fires late after sleep.
 * @param {{name:string, scheduledTime:number}} alarm
 */
export function alarmToInput(alarm) {
  if (alarm.name === "heartbeat") return { type: "heartbeat", reason: "tick" };
  const m = ENGINE_ALARM.exec(alarm.name);
  if (!m) return null;
  if (m[1] === "heartbeat") return { type: "heartbeat", reason: "tick" };
  return { type: "alarm", kind: m[1], dueAt: Number(m[2]) };
}

/**
 * Should a tabs.onUpdated event become a landing?
 * @param {{status?:string}} info
 * @param {TabLike} tab
 * @param {{id?:number, focused?:boolean}|null|undefined} win  chrome.windows.getLastFocused()
 */
export function shouldLand(info, tab, win) {
  return !!tab.active && info.status === "complete" && !!win?.focused && win.id === tab.windowId;
}
