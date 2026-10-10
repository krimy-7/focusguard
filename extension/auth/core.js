// @ts-check
// Supabase Auth (GoTrue REST) for the extension, with plain fetch: no SDK, no bundler.
// The extension keeps its own session in chrome.storage.local `fg_auth`; it never
// shares tokens with the dashboard (refresh tokens are single-use).
// Pure of chrome.* and CONFIG so node tests can import it; session.js wires it up.

/** @typedef {{accessToken:string, refreshToken:string, expiresAt:number, user:{id:string|null, email:string|null}}} AuthSession */
/** @typedef {{SUPABASE_URL:string, SUPABASE_ANON_KEY:string, API_URL:string}} AuthConfig */
/** @typedef {{get:(k:string)=>Promise<Record<string, any>>, set:(o:Record<string, any>)=>Promise<void>, remove:(k:string)=>Promise<void>}} KV */
/** @typedef {{fetch: typeof fetch, storage: KV, config: () => Promise<AuthConfig>, now: () => number,
 *   launchWebAuthFlow?: (o:{url:string, interactive:boolean}) => Promise<string|undefined>,
 *   redirectUrl?: () => string, timeZone?: () => string, onSignedOut?: () => void}} AuthDeps
 * launchWebAuthFlow may reject (Chrome: 'The user did not approve access.' when the window is closed). */

export const AUTH_KEY = 'fg_auth';
const REFRESH_SKEW_MS = 60_000;
export const DEFAULT_TZ = 'Asia/Kathmandu'; // profiles.tz server default (spec §3.2)
// Chrome reports Nepal as the legacy alias "Asia/Katmandu": the same zone, so never "replace" one with the other.
/** @param {string|undefined|null} tz */
export const isDefaultTz = (tz) => tz === DEFAULT_TZ || tz === 'Asia/Katmandu';

export class AuthError extends Error {
  /** @param {number} status 0 = no HTTP response (cancelled, bad redirect) @param {string} message */
  constructor(status, message) { super(message); this.status = status; }
}

/** Decode a JWT payload without verifying it (the server verifies). @param {string} jwt */
function claims(jwt) {
  try { return JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); }
  catch { return {}; }
}

/** @param {AuthDeps} deps */
export function createAuth(deps) {
  /** @type {Promise<string|null>|null} */
  let inflight = null;

  /** @param {string} path @param {object} body @param {string} [token] */
  async function gotrue(path, body, token) {
    const c = await deps.config();
    /** @type {Record<string,string>} */
    const headers = { 'Content-Type': 'application/json', apikey: c.SUPABASE_ANON_KEY };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await deps.fetch(`${c.SUPABASE_URL}/auth/v1${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new AuthError(res.status, data.msg || data.error_description || data.message || `Sign-in service error (${res.status})`);
    return data;
  }

  /** @returns {Promise<AuthSession|null>} */
  const load = async () => (await deps.storage.get(AUTH_KEY))[AUTH_KEY] ?? null;

  /** Automatic sign-out (the server rejected our tokens): clear the session and tell the shell (R29). */
  async function dropSession() {
    await deps.storage.remove(AUTH_KEY);
    deps.onSignedOut?.();
  }

  /** @param {{access_token:string, refresh_token:string, expires_at?:number|string|null, expires_in?:number|string|null}} t */
  async function save(t) {
    if (!t.access_token || !t.refresh_token) throw new AuthError(0, 'The sign-in service returned no session');
    const c = claims(t.access_token);
    // GoTrue `expires_at` is a UNIX timestamp in seconds; we store epoch ms.
    const expiresAt = t.expires_at ? Number(t.expires_at) * 1000 : deps.now() + Number(t.expires_in || 3600) * 1000;
    /** @type {AuthSession} */
    const s = { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt, user: { id: c.sub ?? null, email: c.email ?? null } };
    await deps.storage.set({ [AUTH_KEY]: s });
    return s;
  }

  /** @param {string} email */
  async function sendCode(email) {
    await gotrue('/otp', { email: email.trim(), create_user: true });
  }

  /** @param {string} email @param {string} code */
  async function verifyCode(email, code) {
    const s = await save(await gotrue('/verify', { type: 'email', email: email.trim(), token: code.trim() }));
    return s.user;
  }

  /** @param {AuthSession} s */
  async function refresh(s) {
    try {
      const next = await save(await gotrue('/token?grant_type=refresh_token', { refresh_token: s.refreshToken }));
      return next.accessToken;
    } catch (e) {
      // Offline, rate-limited or server trouble: keep the session and try again later.
      if (!(e instanceof AuthError) || e.status === 0 || e.status === 429 || e.status >= 500) return null;
      // Another extension page (popup vs service worker) may have rotated the token first.
      const cur = await load();
      if (cur && cur.refreshToken !== s.refreshToken) return cur.accessToken;
      await dropSession();
      return null;
    }
  }

  /** Access token, refreshed when <60 s remain. null = signed out or offline. @param {{force?:boolean}} [o] */
  async function getAccessToken({ force = false } = {}) {
    const s = await load();
    if (!s) return null;
    if (!force && s.expiresAt - deps.now() > REFRESH_SKEW_MS) return s.accessToken;
    inflight ??= refresh(s).finally(() => { inflight = null; });
    return inflight;
  }

  async function isSignedIn() {
    return (await load()) !== null;
  }

  async function signOut() {
    const s = await load();
    await deps.storage.remove(AUTH_KEY); // signed out locally even if the network call fails
    if (s) await gotrue('/logout?scope=local', {}, s.accessToken).catch(() => {});
  }

  /** Google via chrome.identity.launchWebAuthFlow + GoTrue /authorize (implicit flow: tokens in the URL fragment). */
  async function signInWithGoogle() {
    if (!deps.launchWebAuthFlow || !deps.redirectUrl) throw new AuthError(0, 'Google sign-in is unavailable here');
    const c = await deps.config();
    const url = `${c.SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(deps.redirectUrl())}`;
    let back;
    try { back = await deps.launchWebAuthFlow({ url, interactive: true }); }
    catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      // Chrome rejects with 'The user did not approve access.' when the window is closed.
      throw new AuthError(0, /did not approve|cancel/i.test(m) ? 'Google sign-in was cancelled' : m);
    }
    if (!back) throw new AuthError(0, 'Google sign-in was cancelled');
    const u = new URL(back);
    const p = new URLSearchParams(u.hash.slice(1));
    const err = p.get('error_description') || u.searchParams.get('error_description') || p.get('error') || u.searchParams.get('error');
    if (err) throw new AuthError(0, err);
    const s = await save({ access_token: p.get('access_token') || '', refresh_token: p.get('refresh_token') || '',
      expires_at: p.get('expires_at'), expires_in: p.get('expires_in') });
    return s.user;
  }

  /** fetch `${API_URL}/api${path}` with the bearer token; on 401 refresh once and retry; second 401 = signed out.
   *  @param {string} path @param {RequestInit} [init] */
  async function apiFetch(path, init = {}) {
    const c = await deps.config();
    /** @param {boolean} force */
    const go = async (force) => {
      const token = await getAccessToken({ force });
      if (!token) throw new AuthError(401, 'Not signed in');
      return deps.fetch(`${c.API_URL}/api${path}`, { ...init,
        headers: { 'Content-Type': 'application/json', ...(init.headers || {}), Authorization: `Bearer ${token}` } });
    };
    let res = await go(false);
    if (res.status === 401) res = await go(true);
    if (res.status === 401) await dropSession();
    return res;
  }

  /** Spec §3.1: on first sign-in, replace the server's default tz with this browser's zone. Best effort and
   *  idempotent: popup.js retryTz calls it again on later opens while the cached profile tz is still the default. */
  async function syncProfileTz() {
    const tz = deps.timeZone?.();
    const res = await apiFetch('/me');
    if (!res.ok || !tz) return;
    const me = await res.json();
    if (isDefaultTz(me.tz) && !isDefaultTz(tz)) await apiFetch('/me', { method: 'PATCH', body: JSON.stringify({ tz }) });
  }

  return { sendCode, verifyCode, signInWithGoogle, getAccessToken, isSignedIn, signOut, apiFetch, syncProfileTz };
}
