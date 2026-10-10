// @ts-check
// Central extension config (C4, R11/R28). CONFIG holds the checked-in defaults and is synchronous.
// Dev overrides live in the gitignored extension/config.local.json (copy config.local.example.json);
// background.js copies it into storage.local `fg_config_override` at startup, and getConfig() merges it.
// Service workers forbid dynamic import() and top-level await, hence fetch + storage.

/** @typedef {{API_URL:string, SUPABASE_URL:string, SUPABASE_ANON_KEY:string, DASHBOARD_URL:string}} Config */

/** @type {Readonly<Config>} */
export const CONFIG = Object.freeze({
  API_URL: "http://localhost:8000",
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  DASHBOARD_URL: "http://localhost:8081",
});

/**
 * CONFIG merged with fg_config_override. ENGINE = dev-only engine overrides, e.g. {"GRACE_DEFAULT_S": 60}. Never throws.
 * @param {{get:(k:string)=>Promise<Record<string, any>>}|undefined} [storage]
 * @returns {Promise<Config & {ENGINE: Record<string, number>}>}
 */
export async function getConfig(storage = globalThis.chrome?.storage?.local) {
  try {
    const o = storage ? (await storage.get("fg_config_override")).fg_config_override : null;
    return { ...CONFIG, ...(o || {}), ENGINE: o?.ENGINE || {} };
  } catch {
    return { ...CONFIG, ENGINE: {} };
  }
}

/**
 * Copy config.local.json into fg_config_override; a missing file removes the key so stale overrides clear. Never throws.
 * @param {(url:string)=>Promise<{ok:boolean, json:()=>Promise<any>}>} [fetchFn]
 * @param {(path:string)=>string} [getURL]
 * @param {{set:(o:Record<string, any>)=>Promise<void>, remove:(k:string)=>Promise<void>}} [storage]
 */
export async function loadLocalConfigIntoStorage(
  fetchFn = (u) => fetch(u),
  getURL = (p) => globalThis.chrome.runtime.getURL(p),
  storage = globalThis.chrome?.storage?.local,
) {
  try {
    const res = await fetchFn(getURL("config.local.json"));
    if (res.ok) return void (await storage?.set({ fg_config_override: await res.json() }));
  } catch {
    /* no local config */
  }
  try {
    await storage?.remove("fg_config_override");
  } catch {
    /* storage unavailable: defaults stand */
  }
}
