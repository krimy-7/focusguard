// @ts-check
// Pure helpers shared by the popup and onboarding pages (no DOM; `stored` touches chrome.* only when called).
import { endpointFor } from '../ai/providers.js';

/** One value from chrome.storage (local by default). @types/chrome types a literal-key get() as `{}`, so this
 *  returns it loosely typed. @param {string} key @param {{get:(k:string)=>Promise<any>}} [area] @returns {Promise<any>} */
export async function stored(key, area = chrome.storage.local) {
  return (await area.get(key))[key];
}

export const GRACE_OPTIONS_S = [120, 300, 600]; // R2 UI chips (same as the dashboard); C1 allows 120..900
export const PAUSE_OFF = Number.MAX_SAFE_INTEGER;                   // engine: pause "off"
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** @param {'30m'|'tomorrow'|'off'} choice @param {number} now */
export function pauseUntil(choice, now) {
  if (choice === '30m') return now + 30 * 60_000;
  if (choice === 'tomorrow') { const d = new Date(now); d.setHours(24, 0, 0, 0); return d.getTime(); } // next local midnight
  return PAUSE_OFF;
}

/** @param {number} min */
export function fmtMinutes(min) {
  const m = Math.max(0, Math.round(min));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Plain-language phase label for the state pill. @param {string} phase @param {number|null} pausedUntil @param {number} now */
export function phaseLabel(phase, pausedUntil, now) {
  if (pausedUntil && pausedUntil > now) return 'Paused';
  return ({ idle: 'Not tracking', detected: 'Just noticed', active: 'Focused', grace: 'Taking a detour',
    intervened_l1: 'Checking in', escalated_l2: 'Checking in', on_break: 'On a break' })[phase] ?? 'Focused';
}

/** Last ≤3 site names of a resume target (`fg_resume:<ctxId>`), most recent first. Hostnames only.
 *  @param {{lastUrl?:string|null, tabs?:{url:string}[]}|null|undefined} resume */
export function recentSites(resume) {
  if (!resume) return [];
  const urls = [resume.lastUrl, ...(resume.tabs || []).map((t) => t.url).reverse()];
  /** @type {string[]} */
  const out = [];
  for (const u of urls) {
    try {
      const url = new URL(String(u));
      if (!/^https?:$/.test(url.protocol)) continue;
      const h = url.hostname.replace(/^www\./, '');
      if (!out.includes(h)) out.push(h);
    } catch { /* not a URL */ }
    if (out.length === 3) break;
  }
  return out;
}

/** Keep complete, valid rows; at most 3 (C1). @param {{from:string, to:string}[]} rows */
export function validQuietHours(rows) {
  return rows.filter((r) => HHMM.test(r.from) && HHMM.test(r.to) && r.from !== r.to).slice(0, 3);
}

/** Seed domains whose tier is yellow or red (engine notes §3 format). @param {any} seed @returns {string[]} */
export function driftDomains(seed) {
  const out = [];
  for (const [domain, d] of Object.entries(seed?.domains || {})) {
    const tier = /** @type {any} */ (d).tier ?? seed.labels?.[/** @type {any} */ (d).label]?.tier;
    if (tier === 'yellow' || tier === 'red') out.push(domain);
  }
  return out.sort();
}

/** The "What gets sent" line under the AI choice. @param {import('../ai/providers.js').AiOption} opt */
export function aiDisclosure(opt) {
  const what = 'the site name, the cleaned-up page title, your context name and today’s goal titles';
  if (opt.mode === 'nano') return 'Runs on this device with Chrome’s built-in model. Nothing leaves your browser.';
  const url = endpointFor(opt);
  let host = '';
  try { host = url ? new URL(url).host : ''; } catch { /* incomplete */ }
  if (opt.mode === 'local') return host ? `Sent to ${host} on your computer: ${what}.` : 'Enter your local model’s address.';
  if (opt.mode === 'key') return host ? `Sent to ${host}: ${what}. Your key stays in this browser and goes only to that address.` : 'Enter your provider’s address.';
  return 'Nothing is sent. FocusGuard AI uses its built-in site list only.';
}

/** Host-permission pattern for an endpoint URL. Keeps an explicit port (spec §4.1: Ollama gets
 *  `http://localhost:11434/*`, not every localhost port). @param {string} url */
export function hostPattern(url) {
  const u = new URL(url);
  return `${u.protocol}//${u.host}/*`;
}
