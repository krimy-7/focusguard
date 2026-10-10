// @ts-check
// Beast Mode (spec §4.6): opt-in, timed site blocking with declarativeNetRequest dynamic redirect rules.
// "Continue anyway" = a per-tab session allow rule, removed by alarm after 10 minutes.
// The service worker routes alarms named `beast:*` to onBeastAlarm(name).

/** @typedef {{sites:string[], until:number, startedAt:number}} BeastState */

export const BEAST_KEY = 'fg_beast';
export const BYPASS_MS = 10 * 60_000;
export const MAX_SITES = 50;
export const MAX_MINUTES = 8 * 60;
export const END_ALARM = 'beast:end';
const BYPASS_ALARM = 'beast:bypass:';
// Rule id ranges reserved for Beast Mode (no other stream uses DNR).
const BLOCK_ID0 = 9000;
const BYPASS_ID0 = 9500;
/** @param {{id:number}} r */
const isBlock = (r) => r.id >= BLOCK_ID0 && r.id < BLOCK_ID0 + MAX_SITES;
/** @param {{id:number}} r */
const isBypass = (r) => r.id >= BYPASS_ID0 && r.id < BYPASS_ID0 + 1000;

/** "https://www.Reddit.com/r/x, youtube.com\nnot a site" → ["reddit.com", "youtube.com"] @param {string} text */
export function normalizeSites(text) {
  /** @type {string[]} */
  const out = [];
  for (const raw of String(text || '').split(/[\s,]+/)) {
    const host = raw.toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[/?#:].*$/, '').replace(/^www\./, '');
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) && !out.includes(host)) out.push(host);
  }
  return out.slice(0, MAX_SITES);
}

/** Host-permission patterns for these sites (`*.x.com` also matches `x.com`). Explicit schemes, because each
 *  requested pattern must sit inside one declared optional host pattern (https or http). @param {string[]} sites */
export const originsFor = (sites) => sites.flatMap((s) => [`https://*.${s}/*`, `http://*.${s}/*`]);

/** @param {{dnr: any, alarms: any, storage: {get:(k:string)=>Promise<any>, set:(o:object)=>Promise<void>, remove:(k:string)=>Promise<void>}, now: () => number}} d */
export function createBeast(d) {
  /** @param {string[]} sites @param {number} minutes */
  async function start(sites, minutes) {
    if (!sites.length) throw new Error('Add at least one site to block.');
    if (!(Number.isInteger(minutes) && minutes > 0 && minutes <= MAX_MINUTES)) throw new Error('Choose how long Beast Mode should run.');
    const now = d.now();
    const old = await d.dnr.getDynamicRules();
    await d.dnr.updateDynamicRules({
      removeRuleIds: old.filter(isBlock).map((/** @type {any} */ r) => r.id),
      addRules: sites.slice(0, MAX_SITES).map((site, i) => ({
        id: BLOCK_ID0 + i, priority: 1,
        action: { type: 'redirect', redirect: { extensionPath: `/blocked.html?site=${encodeURIComponent(site)}` } },
        condition: { requestDomains: [site], resourceTypes: ['main_frame'] },
      })),
    });
    /** @type {BeastState} */
    const state = { sites: sites.slice(0, MAX_SITES), until: now + minutes * 60_000, startedAt: now };
    await d.alarms.create(END_ALARM, { when: state.until });
    await d.storage.set({ [BEAST_KEY]: state });
    return state;
  }

  async function stop() {
    const [dyn, ses, alarms] = await Promise.all([d.dnr.getDynamicRules(), d.dnr.getSessionRules(), d.alarms.getAll()]);
    await d.dnr.updateDynamicRules({ removeRuleIds: dyn.filter(isBlock).map((/** @type {any} */ r) => r.id) });
    await d.dnr.updateSessionRules({ removeRuleIds: ses.filter(isBypass).map((/** @type {any} */ r) => r.id) });
    await Promise.all(alarms.filter((/** @type {any} */ a) => a.name.startsWith('beast:')).map((/** @type {any} */ a) => d.alarms.clear(a.name)));
    await d.storage.remove(BEAST_KEY);
  }

  /** Active state, or null. Cleans up if the end alarm was missed (sleep, restart). @returns {Promise<BeastState|null>} */
  async function getBeast() {
    const st = (await d.storage.get(BEAST_KEY))[BEAST_KEY] ?? null;
    if (st && st.until <= d.now()) { await stop(); return null; }
    return st;
  }

  /** "Continue anyway": allow `site` in this tab only, for 10 minutes. @param {number} tabId @param {string} site */
  async function allowOnce(tabId, site) {
    const st = await getBeast();
    if (!st || !st.sites.includes(site)) return null; // nothing to bypass
    const used = new Set((await d.dnr.getSessionRules()).map((/** @type {any} */ r) => r.id));
    let id = BYPASS_ID0;
    while (used.has(id)) id++;
    await d.dnr.updateSessionRules({ addRules: [{ id, priority: 2, action: { type: 'allow' },
      condition: { requestDomains: [site], tabIds: [tabId], resourceTypes: ['main_frame'] } }] });
    await d.alarms.create(`${BYPASS_ALARM}${id}`, { when: d.now() + BYPASS_MS });
    return id;
  }

  /** Called by background.js for every alarm whose name starts with "beast:". @param {string} name */
  async function onBeastAlarm(name) {
    if (name === END_ALARM) return stop();
    if (name.startsWith(BYPASS_ALARM)) {
      const id = Number(name.slice(BYPASS_ALARM.length));
      if (Number.isInteger(id)) await d.dnr.updateSessionRules({ removeRuleIds: [id] });
    }
  }

  return { start, stop, getBeast, allowOnce, onBeastAlarm };
}

const beast = createBeast({
  dnr: { getDynamicRules: () => chrome.declarativeNetRequest.getDynamicRules(),
    getSessionRules: () => chrome.declarativeNetRequest.getSessionRules(),
    updateDynamicRules: (/** @type {any} */ o) => chrome.declarativeNetRequest.updateDynamicRules(o),
    updateSessionRules: (/** @type {any} */ o) => chrome.declarativeNetRequest.updateSessionRules(o) },
  alarms: { create: (/** @type {string} */ n, /** @type {any} */ o) => chrome.alarms.create(n, o),
    getAll: () => chrome.alarms.getAll(), clear: (/** @type {string} */ n) => chrome.alarms.clear(n) },
  storage: { get: (k) => chrome.storage.local.get(k), set: (o) => chrome.storage.local.set(o), remove: (k) => chrome.storage.local.remove(k) },
  now: () => Date.now(),
});

export const { start, stop, getBeast, allowOnce, onBeastAlarm } = beast;
