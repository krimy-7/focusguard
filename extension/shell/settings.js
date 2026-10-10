// @ts-check
// Settings (C4). Server settings come from GET /me (cached in fg_settings_cache);
// extension-only settings stay in storage.local (D-15).

const HOUR_MS = 3_600_000;
const DEFAULT_GRACE_S = 300;

/** @typedef {{grace_s:number, quiet_hours:{from:string,to:string}[], aiMode:string, beastUntil:number|null, relatedRules:any[], extraSensitive:string[], tz:string}} Settings */

/**
 * @param {{chrome?:any, fetch?:(url:string, init?:any)=>Promise<any>, getAccessToken?:(o?:{force?:boolean})=>Promise<string|null>, signOut?:()=>Promise<void>, apiUrl?:()=>string, now?:()=>number}} [deps]
 */
export function createSettings(deps = {}) {
  const c = () => deps.chrome ?? globalThis.chrome;
  const now = deps.now ?? Date.now;
  const fetchFn = deps.fetch ?? ((url, init) => fetch(url, init));

  /** @returns {Promise<Settings>} */
  async function getSettings() {
    const got = await c().storage.local.get(["fg_settings_cache", "fg_ai", "fg_beast", "fg_rules", "fg_extra_sensitive"]);
    const profile = got.fg_settings_cache?.profile;
    const s = profile?.settings ?? {};
    return {
      grace_s: s.grace_s ?? DEFAULT_GRACE_S,
      quiet_hours: s.quiet_hours ?? [],
      aiMode: got.fg_ai?.mode ?? "off",
      beastUntil: got.fg_beast?.until ?? null,
      relatedRules: got.fg_rules ?? [],
      extraSensitive: got.fg_extra_sensitive ?? [],
      tz: profile?.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  /**
   * GET /me into fg_settings_cache when older than maxAgeMs, or when forced. Never throws.
   * @param {{force?:boolean, maxAgeMs?:number}} [opts]
   * @returns {Promise<boolean>} true when the cache was refreshed
   */
  async function refreshSettings({ force = false, maxAgeMs = HOUR_MS } = {}) {
    try {
      const { fg_settings_cache } = await c().storage.local.get("fg_settings_cache");
      if (!force && fg_settings_cache && now() - fg_settings_cache.at < maxAgeMs) return false;
      const { getAccessToken, apiUrl } = deps;
      if (!getAccessToken || !apiUrl) return false;
      const token = await getAccessToken();
      if (!token) return false;
      const get = (/** @type {string} */ tok) => fetchFn(`${apiUrl()}/api/me`, { headers: { Authorization: `Bearer ${tok}` } });
      let res = await get(token);
      if (res.status === 401) {
        // spec §6: refresh once, then signed out. The popup shows it on its next get_view (isSignedIn reads fg_auth).
        const fresh = await getAccessToken({ force: true });
        if (!fresh) return false; // the refresh itself failed (offline, GoTrue 429/5xx): not a sign-out
        res = await get(fresh);
        if (res.status === 401) {
          await deps.signOut?.();
          return false;
        }
      }
      if (!res.ok) return false;
      const profile = await res.json();
      const prevUser = fg_settings_cache?.profile?.user_id;
      if (prevUser && prevUser !== profile.user_id) await purgePreviousUser();
      await c().storage.local.set({ fg_settings_cache: { at: now(), profile } });
      return true;
    } catch {
      return false;
    }
  }

  /** Another account signed in on this browser profile: drop what the previous one left locally (spec §1 goal 5). */
  async function purgePreviousUser() {
    const all = await c().storage.local.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith("fg_accum:") || k.startsWith("fg_resume:"));
    // No cmd:'end': it would emit a session_end + snapshot that then uploads under the new account.
    // ponytail: removing fg_engine races a step that is mid-flight in the dispatch queue; account switches are rare
    await c().storage.local.remove([...keys, "fg_rules", "fg_engine"]);
  }

  /** @returns {Promise<string>} */
  async function getDeviceId() {
    const { fg_device_id } = await c().storage.local.get("fg_device_id");
    if (fg_device_id) return fg_device_id;
    const id = crypto.randomUUID(); // ponytail: two first-ever concurrent calls could race; onInstalled calls it first
    await c().storage.local.set({ fg_device_id: id });
    return id;
  }

  return { getSettings, refreshSettings, getDeviceId };
}

/** C4: cache-only read (no network). background.js owns refreshSettings. */
export const getSettings = createSettings().getSettings;
