// @ts-check
// Spec §4.4.2: unknown host + AI enabled → ask classify() asynchronously, cache per host|context,
// feed the answer back as a tier_hint input. Never blocks the dispatch queue.

const CACHE_MAX = 500;
/** A null answer (no access yet, bad key/model, no verdict) is retried after this long. */
export const MISS_TTL_MS = 10 * 60_000;

/**
 * @param {{
 *   chrome:any,
 *   classify:(q:{host:string, title:string, contextTitle:string})=>Promise<{tier:string, related:boolean}|null>,
 *   getSettings:()=>Promise<{aiMode:string}>,
 *   dispatch:(input:any)=>Promise<unknown>,
 *   log?:(...a:any[])=>void,
 * }} deps
 */
export function createHints({ chrome, classify, getSettings, dispatch, log = console.warn }) {
  /** @type {Map<string, Promise<void>>} */
  const inflight = new Map();
  /**
   * key → when classify last answered null. ponytail: in memory only (a worker restart retries sooner), grows with distinct misses
   * @type {Map<string, number>}
   */
  const missedAt = new Map();

  /** @param {string} key @param {string} ctxId @param {{host:string, title:string, contextTitle:string}} q @param {number} now */
  async function ask(key, ctxId, q, now) {
    try {
      const r = await classify(q);
      if (!r) return void missedAt.set(key, now);
      const { fg_tier_cache = {} } = await chrome.storage.local.get("fg_tier_cache");
      fg_tier_cache[key] = { tier: r.tier, related: !!r.related };
      const keys = Object.keys(fg_tier_cache);
      for (const k of keys.slice(0, Math.max(0, keys.length - CACHE_MAX))) delete fg_tier_cache[k];
      await chrome.storage.local.set({ fg_tier_cache });
      // C2's tier_hint has no contextId and A stores it for the live context: drop an answer for a context that ended.
      const { fg_engine } = await chrome.storage.local.get("fg_engine");
      if (fg_engine?.ctx?.id === ctxId) await dispatch({ type: "tier_hint", host: q.host, tier: r.tier, related: !!r.related });
    } catch (e) {
      log("classify failed; rules stay in charge", e);
    } finally {
      inflight.delete(key);
    }
  }

  /** After-step hook. @param {{state:any, now:number}} ctx */
  async function afterStep({ state, now }) {
    const cur = state.current;
    const ctx = state.ctx;
    if (!ctx || !cur?.host || cur.tier !== "unknown") return;
    const key = `${cur.host}|${ctx.id}`;
    if (inflight.has(key) || now - (missedAt.get(key) ?? -Infinity) < MISS_TTL_MS) return;
    const { fg_tier_cache = {} } = await chrome.storage.local.get("fg_tier_cache");
    if (key in fg_tier_cache) return;
    if ((await getSettings()).aiMode === "off") return;
    inflight.set(key, ask(key, ctx.id, { host: cur.host, title: cur.title, contextTitle: ctx.title }, now)); // not awaited
  }

  /** Resolves when every in-flight request has settled (tests, shutdown). */
  async function idle() {
    await Promise.all([...inflight.values()]);
  }

  return { afterStep, idle };
}
