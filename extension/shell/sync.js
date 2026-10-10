// @ts-check
// Spec §4.2/§4.4.3: engine sync records → local per-day accumulator → PUT /contexts/{id} (on change and
// every 10 min, R6) and PUT /daily/{day} (≤ every 5 min, on session end, after midnight). Absolute totals: retries are safe.
import { isSensitiveHost } from "../privacy.js";
import { hostMatches } from "./adapters.js";
import { normalizeHost } from "../engine/tiers.js"; // R20: A owns host normalization

const FIVE_MIN_MS = 5 * 60_000;
const CTX_REFRESH_MS = 10 * 60_000; // R6: the backend hides a context whose last_active_at is >30 min old
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 3_600_000;
const SEEN_MAX = 200;
const ZERO = { focus_s: 0, nudges: 0, self_returns: 0, recoveries: 0, snoozes: 0, breaks: 0, longest_detour_s: 0 };
const STATES = new Set(["detected", "active", "grace", "intervened_l1", "escalated_l2", "on_break"]);
// B's Hostname rule: anything else (IPv6 literal, underscore, label >63) would 422 the whole snapshot.
const HOST_RE = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;
const iso = (/** @type {number} */ ms) => new Date(ms).toISOString();
/** A 4xx that a retry cannot fix. */
const isPermanent = (/** @type {number} */ st) => st >= 400 && st < 500 && st !== 401 && st !== 408 && st !== 429;

/** @typedef {typeof ZERO} Totals */
/** @typedef {{snap:any, sig:string, at:number, sentSig:string|null}} CtxEntry */
/** @typedef {{day:string, totals:Totals, seen:string[], ver:number, sentVer:number, sentAt:number, contexts:Record<string,CtxEntry>, retry:{n:number, at:number}|null}} Accum */

/** "Sent" mark: includes `at`, so a 10-min refresh with an unchanged sig still counts as unsent. @param {CtxEntry} c */
const mark = (c) => `${c.sig}@${c.at}`;

/** JWT `sub` (no verification: only used to avoid uploading under the wrong account). @param {string} token */
function jwtSub(token) {
  try {
    return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).sub ?? null;
  } catch {
    return null;
  }
}

/** @param {number} ms @param {string} tz */
export function dayKey(ms, tz) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
  } catch {
    return iso(ms).slice(0, 10); // invalid tz: UTC rather than crash
  }
}

/** Pure. @param {Totals} t @param {any} rec */
export function applyRecord(t, rec) {
  switch (rec.kind) {
    case "intervention":
      if (!rec.suppressed) t.nudges++;
      break;
    case "response":
      if (rec.response === "extend") t.snoozes++;
      break;
    case "recovery":
      if (rec.trigger === "self_returned") t.self_returns++;
      else t.recoveries++;
      t.longest_detour_s = Math.max(t.longest_detour_s, Math.round(rec.awayS ?? 0));
      break;
    case "break":
      t.breaks++;
      break;
    case "focus": // R32: the engine owns focus time (`seconds`; an older `focusS` field is read as a fallback)
      t.focus_s += Number(rec.seconds ?? rec.focusS ?? 0);
      break;
  }
  return t;
}

/**
 * C1 ContextSnap: hostnames only, never page titles or URLs.
 * @param {any} ctx @param {string} phase @param {string} deviceId @param {number} now @param {boolean} [ended]
 * @param {string[]} [extraSensitive] the user's fg_extra_sensitive list, applied here too: a host collected before the user added it must stop being uploaded
 */
export function snapshot(ctx, phase, deviceId, now, ended = false, extraSensitive = []) {
  return {
    id: ctx.id, device_id: deviceId, title: String(ctx.title).slice(0, 120), mode: ctx.mode,
    state: ended ? "ended" : STATES.has(phase) ? phase : "active",
    confidence: ctx.confidence, started_at: iso(ctx.startedAt), ended_at: ended ? iso(now) : null, last_active_at: iso(now),
    // Hosts B would reject, or that are (now) sensitive, are left out of the upload only; they stay in local state.
    sites: [...new Set((ctx.resources ?? []).map((/** @type {any} */ r) => r.host)
      .filter((/** @type {unknown} */ h) => typeof h === "string" && HOST_RE.test(h))
      .filter((/** @type {string} */ h) => !isSensitiveHost(h) && !extraSensitive.some((s) => hostMatches(h, normalizeHost(String(s))))))].slice(0, 50),
  };
}

/** @param {string} day @returns {Accum} */
const fresh = (day) => ({ day, totals: { ...ZERO }, seen: [], ver: 0, sentVer: 0, sentAt: 0, contexts: {}, retry: null });

/**
 * @param {{chrome:any, fetch?:(url:string, init?:any)=>Promise<any>, getAccessToken:(o?:{force?:boolean})=>Promise<string|null>, signOut?:()=>Promise<void>,
 *   getSettings:()=>Promise<{tz:string, extraSensitive?:string[]}>, getDeviceId:()=>Promise<string>, apiUrl:()=>string, now?:()=>number, log?:(...a:any[])=>void}} deps
 */
export function createSync({ chrome, fetch: fetchFn = (url, init) => fetch(url, init), getAccessToken, signOut = async () => {}, getSettings, getDeviceId, apiUrl, now = Date.now, log = console.warn }) {
  /** @type {Promise<unknown>} */
  let lock = Promise.resolve();
  /** Serialize read-modify-write of fg_accum:* (observe runs in the dispatch queue, flush outside it). @template T @param {()=>Promise<T>} fn @returns {Promise<T>} */
  function locked(fn) {
    const p = lock.then(fn);
    lock = p.catch(() => {});
    return p;
  }
  /** @param {string} key @returns {Promise<Accum|null>} */
  const read = async (key) => (await chrome.storage.local.get(key))[key] ?? null;

  /** After-step hook. @param {{prev:any, state:any, now:number}} ctx @param {any[]} [effects] */
  async function observe({ prev, state, now: t }, effects = []) {
    const recs = effects.filter((f) => f.type === "sync").map((f) => f.rec).filter((r) => r?.id);
    const ended = !!prev?.ctx && prev.ctx.id !== state.ctx?.id;
    const st = await getSettings();
    const today = dayKey(t, st.tz);
    const xs = st.extraSensitive ?? [];
    const did = await getDeviceId();
    // R32: every record lands on its own local day (the engine's rollover records carry the old day).
    /** @type {Map<string, any[]>} */
    const byDay = new Map([[today, []]]);
    for (const rec of recs) {
      const d = rec.day || today; // `||`: the engine's day key starts as ''
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d)?.push(rec);
    }
    /** @type {any[]} */
    const snaps = [];
    // A removed host changes `sig`, so the next heartbeat observe (≤60 s, R22) PUTs a cleaned snapshot over the server copy.
    if (ended) snaps.push(snapshot(prev.ctx, prev.phase, did, t, true, xs));
    if (state.ctx) snaps.push(snapshot(state.ctx, state.phase, did, t, false, xs));
    const ctxDirty = await locked(async () => {
      let dirty = false;
      for (const [day, rs] of byDay) {
        const key = `fg_accum:${day}`;
        const a = (await read(key)) ?? fresh(day);
        let changed = false;
        for (const rec of rs) {
          if (a.seen.includes(rec.id)) continue;
          a.seen = [...a.seen, rec.id].slice(-SEEN_MAX);
          applyRecord(a.totals, rec);
          changed = true;
        }
        if (changed) a.ver++;
        let snapsChanged = false;
        if (day === today) {
          for (const snap of snaps) {
            const sig = JSON.stringify({ ...snap, last_active_at: null });
            const c = a.contexts[snap.id];
            if (c?.sig === sig && t - c.at < CTX_REFRESH_MS) continue;
            // New state, or R6 refresh: store the fresh snap (current last_active_at); the new `at` makes it unsent.
            a.contexts[snap.id] = { snap, sig, at: t, sentSig: c?.sentSig ?? null };
            snapsChanged = true;
          }
        }
        if (changed || snapsChanged) await chrome.storage.local.set({ [key]: a });
        dirty = dirty || snapsChanged;
      }
      return dirty;
    });
    if (ctxDirty) void flush({ force: ended });
  }

  /** @param {{force?:boolean}} opts */
  async function doFlush({ force = false }) {
    let token = await getAccessToken().catch(() => null);
    if (!token) return; // signed out: keep accumulating; sign-in sends settings_changed → flush
    // Per-user isolation (spec §1 goal 5): never upload what another account accumulated on this profile.
    const { fg_settings_cache } = await chrome.storage.local.get("fg_settings_cache");
    const uid = fg_settings_cache?.profile?.user_id;
    const sub = jwtSub(token);
    if (sub && uid && sub !== uid) return void log("sync paused: the token belongs to another account until settings refresh");
    const t = now();
    const today = dayKey(t, (await getSettings()).tz);
    const did = await getDeviceId();
    /** Set when the server rejected a freshly refreshed token: stop this flush, keep every accumulator. */
    let signedOut = false;

    /** One PUT; on 401 force-refresh the token once and retry; still 401 → sign out (spec §6). Network errors throw. @param {string} path @param {unknown} body */
    async function put(path, body) {
      const send = (/** @type {string} */ tok) => fetchFn(`${apiUrl()}/api${path}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }, body: JSON.stringify(body),
      });
      let res = await send(/** @type {string} */ (token));
      if (res.status === 401) {
        const freshToken = await getAccessToken({ force: true }).catch(() => null);
        if (freshToken) { // no fresh token (offline, GoTrue 429/5xx) stays a transient 401 and backs off
          token = freshToken;
          res = await send(freshToken);
          if (res.status === 401) {
            signedOut = true;
            await signOut(); // the popup shows signed-out on its next get_view; sign-in → settings_changed → flush
          }
        }
      }
      return res;
    }

    const all = await chrome.storage.local.get(null);
    for (const [key, a] of /** @type {[string, Accum][]} */ (Object.entries(all))) {
      if (signedOut) break;
      if (!key.startsWith("fg_accum:")) continue;
      if (a.retry && a.retry.at > t && !force) continue;
      let transient = false;
      let waitMs = 0;
      /** Each PUT is isolated. @param {string} path @param {unknown} body @returns {Promise<boolean>} true = done (sent, or permanently rejected and dropped) */
      const attempt = async (path, body) => {
        if (signedOut) return false; // not transient: no backoff, so re-auth uploads at once
        try {
          const res = await put(path, body);
          if (res.ok) return true;
          if (signedOut) return false;
          if (isPermanent(res.status)) {
            log(`sync dropped ${path} -> ${res.status}`); // status only, never the body
            return true;
          }
          waitMs = Math.max(waitMs, Number(res.headers?.get?.("Retry-After") ?? 0) * 1000); // R9: 429 Retry-After
        } catch (e) {
          log("sync upload failed; will retry", e);
        }
        transient = true;
        return false;
      };
      /** @type {Record<string, string>} */
      const sentCtx = {};
      for (const [id, c] of Object.entries(a.contexts)) {
        const m = mark(c);
        if (c.sentSig === m) continue;
        if (await attempt(`/contexts/${encodeURIComponent(id)}`, c.snap)) sentCtx[id] = m;
      }
      const dailyDue = a.ver > a.sentVer && (force || a.day !== today || t - a.sentAt >= FIVE_MIN_MS);
      const dailyDone = dailyDue && (await attempt(`/daily/${a.day}`, { day: a.day, device_id: did, ...a.totals, focus_s: Math.round(a.totals.focus_s) }));
      const at = await locked(async () => {
        const cur = await read(key);
        if (!cur) return null;
        // A snapshot refreshed during this flush has a new mark, so it stays unsent.
        for (const [id, m] of Object.entries(sentCtx)) if (cur.contexts[id]) cur.contexts[id].sentSig = m;
        if (dailyDone) {
          cur.sentVer = a.ver;
          cur.sentAt = t;
        }
        if (transient) {
          const n = (cur.retry?.n ?? 0) + 1;
          cur.retry = { n, at: t + Math.max(waitMs, Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (n - 1))) };
        } else cur.retry = null;
        const clean = cur.ver === cur.sentVer && Object.values(cur.contexts).every((c) => c.sentSig === mark(c));
        if (cur.day !== today && clean) await chrome.storage.local.remove(key);
        else await chrome.storage.local.set({ [key]: cur });
        return cur.retry?.at ?? null;
      });
      if (at) await chrome.alarms.create("fg_sync", { when: at });
    }
  }

  /** @type {Promise<void>|null} */
  let running = null;
  /** @type {{force:boolean}|null} */
  let again = null;
  /** Single flight; a request during a flush runs once more afterwards. @param {{force?:boolean}} [opts] */
  function flush(opts = {}) {
    if (running) {
      again = { force: !!(again?.force || opts.force) };
      return running;
    }
    running = (async () => {
      try {
        await doFlush(opts);
        while (again) {
          const o = again;
          again = null;
          await doFlush(o);
        }
      } finally {
        running = null;
      }
    })();
    return running;
  }

  /** Resolves when no flush is running (tests). */
  const settled = async () => {
    while (running) await running;
  };

  return { observe, flush, settled };
}
