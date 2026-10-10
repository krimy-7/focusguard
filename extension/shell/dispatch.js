// @ts-check
// Single promise queue: load fg_engine (storage.local, R33) → step → persist → run effects (engine notes §2).
// A worker killed mid-effects loses at most those effects; the startup heartbeat re-derives alarms.

/** @typedef {{prev:any, state:any, now:number}} StepCtx */

/**
 * Engine cfg for one step. Merge order: engine DEFAULTS < user settings < dev overrides (fg_config_override.ENGINE).
 * @param {Record<string, any>} defaults
 * @param {{grace_s?:number, quiet_hours?:any[], beastUntil?:number|null, tz?:string}} settings
 * @param {{seed?:any, cache?:Record<string, any>, overrides?:Record<string, any>}} [opts]
 */
export function buildCfg(defaults, settings, { seed = null, cache = {}, overrides = {} } = {}) {
  return {
    ...defaults,
    GRACE_DEFAULT_S: settings.grace_s ?? defaults.GRACE_DEFAULT_S,
    tz: settings.tz,
    quietHours: settings.quiet_hours ?? [],
    beastUntil: settings.beastUntil ?? null,
    tables: { seed, cache }, // R21: cache = fg_tier_cache. Related rules are per-context (ctx.relatedHosts, R34), not cfg.
    ...overrides,
  };
}

/**
 * @param {{
 *   step:(prev:any, input:any, now:number, cfg:any)=>{state:any, effects:any[]},
 *   initialState:(now:number)=>any,
 *   chrome:any,
 *   getCfg:()=>Promise<any>,
 *   runEffects:(effects:any[], ctx:StepCtx)=>Promise<void>,
 *   now?:()=>number,
 *   log?:(...a:any[])=>void,
 * }} deps
 */
export function createDispatch({ step, initialState, chrome, getCfg, runEffects, now = Date.now, log = console.error }) {
  /** @type {Promise<any>} */
  let tail = Promise.resolve();

  /** @param {number} t */
  async function loadState(t) {
    const { fg_engine } = await chrome.storage.local.get("fg_engine"); // R33: survives a browser restart
    return fg_engine ?? initialState(t);
  }

  /** @param {any} input */
  async function run(input) {
    const { fg_consent } = await chrome.storage.local.get("fg_consent");
    if (!fg_consent) return null; // nothing is observed before the user clicks Start (spec §4.3)
    const t = now();
    const prev = await loadState(t);
    let result;
    try {
      result = step(prev, input, t, await getCfg());
    } catch (e) {
      log("engine step threw; state unchanged", input?.type, e);
      return null;
    }
    await chrome.storage.local.set({ fg_engine: result.state }); // persist BEFORE effects
    await runEffects(result.effects, { prev, state: result.state, now: t });
    return result;
  }

  /**
   * Serialized: each input sees the state persisted by the previous one. Never rejects.
   * @param {any} input
   * @returns {Promise<{state:any, effects:any[]}|null>}
   */
  function dispatch(input) {
    const p = tail.then(() => run(input)).catch((e) => {
      log("dispatch failed", input?.type, e);
      return null;
    });
    tail = p;
    return p;
  }

  /** Latest persisted state (no consent needed; used by get_view). Must not be awaited from inside an effect. */
  async function getState() {
    await tail;
    return loadState(now());
  }

  return { dispatch, getState };
}
