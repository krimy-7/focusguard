// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuth, AuthError, AUTH_KEY, isDefaultTz } from './core.js';

const CFG = { SUPABASE_URL: 'https://ref.supabase.co', SUPABASE_ANON_KEY: 'anon', API_URL: 'https://api.example.com' };
const NOW = 1_800_000_000_000;

/** @param {object} c */
const jwt = (c) => `h.${Buffer.from(JSON.stringify(c)).toString('base64url')}.s`;
const tokens = (n, expSec = NOW / 1000 + 3600) =>
  ({ access_token: jwt({ sub: 'u1', email: 'a@b.co', n }), refresh_token: `r${n}`, expires_at: expSec, expires_in: 3600, token_type: 'bearer' });

/** Map-backed stand-in for chrome.storage.local. */
function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    m,
    get: async (k) => (m.has(k) ? { [k]: m.get(k) } : {}),
    set: async (o) => { for (const [k, v] of Object.entries(o)) m.set(k, v); },
    remove: async (k) => { m.delete(k); },
  };
}

/** Fake fetch: `routes` maps "METHOD path-suffix" → (body) => [status, json] or a thrown error. */
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: String(url), method: init.method || 'GET', headers: init.headers || {}, body });
    const key = Object.keys(routes).find((k) => { const [m, p] = k.split(' '); return (init.method || 'GET') === m && String(url).endsWith(p); });
    if (!key) throw new Error(`no route for ${init.method} ${url}`);
    const [status, json] = await routes[key](body, calls.length);
    return { ok: status >= 200 && status < 300, status, json: async () => json };
  };
  return { fn, calls };
}

function make(routes, store = fakeStorage(), extra = {}) {
  const f = fakeFetch(routes);
  const auth = createAuth({ fetch: /** @type {any} */ (f.fn), storage: store, config: async () => CFG, now: () => NOW, ...extra });
  return { auth, calls: f.calls, store };
}

const session = (n, expiresAt) => ({ accessToken: `a${n}`, refreshToken: `r${n}`, expiresAt, user: { id: 'u1', email: 'a@b.co' } });

test('sendCode posts email + create_user to /auth/v1/otp with the anon apikey', async () => {
  const { auth, calls } = make({ 'POST /auth/v1/otp': () => [200, {}] });
  await auth.sendCode('  a@b.co ');
  assert.equal(calls[0].url, 'https://ref.supabase.co/auth/v1/otp');
  assert.equal(calls[0].headers.apikey, 'anon');
  assert.deepEqual(calls[0].body, { email: 'a@b.co', create_user: true });
});

test('verifyCode stores fg_auth with ms expiry and user from the JWT', async () => {
  const { auth, calls, store } = make({ 'POST /auth/v1/verify': () => [200, tokens(1)] });
  const user = await auth.verifyCode('a@b.co', ' 123456 ');
  assert.deepEqual(calls[0].body, { type: 'email', email: 'a@b.co', token: '123456' });
  assert.deepEqual(user, { id: 'u1', email: 'a@b.co' });
  const s = store.m.get(AUTH_KEY);
  assert.equal(s.refreshToken, 'r1');
  assert.equal(s.expiresAt, NOW + 3600_000);
});

test('verifyCode with a wrong code throws the server message and stores nothing', async () => {
  const { auth, store } = make({ 'POST /auth/v1/verify': () => [403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }] });
  await assert.rejects(auth.verifyCode('a@b.co', '000000'), (e) => e instanceof AuthError && e.status === 403 && /expired/.test(e.message));
  assert.equal(store.m.has(AUTH_KEY), false);
});

test('getAccessToken returns the stored token without network when >60 s remain', async () => {
  const { auth, calls } = make({}, fakeStorage({ [AUTH_KEY]: session(1, NOW + 61_000) }));
  assert.equal(await auth.getAccessToken(), 'a1');
  assert.equal(calls.length, 0);
});

test('getAccessToken refreshes when <60 s remain, once for concurrent callers', async () => {
  const { auth, calls, store } = make(
    { 'POST /auth/v1/token?grant_type=refresh_token': (b) => [200, tokens(2)] },
    fakeStorage({ [AUTH_KEY]: session(1, NOW + 59_000) }));
  const [x, y] = await Promise.all([auth.getAccessToken(), auth.getAccessToken()]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { refresh_token: 'r1' });
  assert.equal(x, y);
  assert.equal(store.m.get(AUTH_KEY).refreshToken, 'r2');
});

test('refresh while offline returns null but keeps the session', async () => {
  const { auth, store } = make(
    { 'POST /auth/v1/token?grant_type=refresh_token': () => { throw new TypeError('Failed to fetch'); } },
    fakeStorage({ [AUTH_KEY]: session(1, NOW - 1) }));
  assert.equal(await auth.getAccessToken(), null);
  assert.equal(store.m.get(AUTH_KEY).refreshToken, 'r1');
  assert.equal(await auth.isSignedIn(), true);
});

test('refresh rejected by the server signs out and notifies', async () => {
  let out = 0;
  const { auth, store } = make(
    { 'POST /auth/v1/token?grant_type=refresh_token': () => [400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' }] },
    fakeStorage({ [AUTH_KEY]: session(1, NOW - 1) }), { onSignedOut: () => { out++; } });
  assert.equal(await auth.getAccessToken(), null);
  assert.equal(store.m.has(AUTH_KEY), false);
  assert.equal(await auth.isSignedIn(), false);
  assert.equal(out, 1);
});

test('refresh rejected because another page already rotated the token uses the newer token', async () => {
  const store = fakeStorage({ [AUTH_KEY]: session(1, NOW - 1) });
  const { auth } = make({ 'POST /auth/v1/token?grant_type=refresh_token': async () => {
    await store.set({ [AUTH_KEY]: session(9, NOW + 3600_000) }); // the service worker won the race
    return [400, { msg: 'Invalid Refresh Token: Already Used' }];
  } }, store);
  assert.equal(await auth.getAccessToken(), 'a9');
  assert.equal(store.m.get(AUTH_KEY).refreshToken, 'r9');
});

test('signOut clears fg_auth even when /logout fails, and sends scope=local with the bearer', async () => {
  const { auth, calls, store } = make(
    { 'POST /auth/v1/logout?scope=local': () => { throw new TypeError('offline'); } },
    fakeStorage({ [AUTH_KEY]: session(1, NOW + 3600_000) }));
  await auth.signOut();
  assert.equal(store.m.has(AUTH_KEY), false);
  assert.equal(calls[0].headers.Authorization, 'Bearer a1');
});

test('signInWithGoogle builds the authorize URL and stores tokens from the fragment', async () => {
  let asked = '';
  const t = tokens(3);
  const { auth, store } = make({}, fakeStorage(), {
    redirectUrl: () => 'https://extid.chromiumapp.org/',
    launchWebAuthFlow: async ({ url }) => { asked = url;
      return `https://extid.chromiumapp.org/#access_token=${t.access_token}&expires_at=${t.expires_at}&expires_in=3600&refresh_token=r3&token_type=bearer`; },
  });
  const user = await auth.signInWithGoogle();
  assert.equal(asked, 'https://ref.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fextid.chromiumapp.org%2F');
  assert.equal(user.id, 'u1');
  assert.equal(store.m.get(AUTH_KEY).refreshToken, 'r3');
});

test('signInWithGoogle surfaces an error fragment and a cancelled flow', async () => {
  const errored = make({}, fakeStorage(), { redirectUrl: () => 'https://x.chromiumapp.org/',
    launchWebAuthFlow: async () => 'https://x.chromiumapp.org/#error=access_denied&error_description=User+denied' });
  await assert.rejects(errored.auth.signInWithGoogle(), /User denied/);
  const cancelled = make({}, fakeStorage(), { redirectUrl: () => 'https://x.chromiumapp.org/', launchWebAuthFlow: async () => undefined });
  await assert.rejects(cancelled.auth.signInWithGoogle(), /cancelled/);
  const closed = make({}, fakeStorage(), { redirectUrl: () => 'https://x.chromiumapp.org/', launchWebAuthFlow: async () => { throw new Error('The user did not approve access.'); } });
  await assert.rejects(closed.auth.signInWithGoogle(), (e) => e instanceof AuthError && /cancelled/.test(e.message));
});

test('apiFetch retries once with a forced refresh on 401', async () => {
  const { auth, calls } = make({
    'GET /api/me': (_b, n) => [n === 1 ? 401 : 200, { user_id: 'u1' }],
    'POST /auth/v1/token?grant_type=refresh_token': () => [200, tokens(2)],
  }, fakeStorage({ [AUTH_KEY]: session(1, NOW + 3600_000) }));
  const res = await auth.apiFetch('/me');
  assert.equal(res.status, 200);
  assert.equal(calls[0].url, 'https://api.example.com/api/me');
  assert.equal(calls[0].headers.Authorization, 'Bearer a1');
  assert.match(calls[2].headers.Authorization, /^Bearer h\./);
});

test('apiFetch signs out after a second 401 and notifies', async () => {
  let out = 0;
  const { auth, store } = make({
    'GET /api/me': () => [401, { detail: 'bad token' }],
    'POST /auth/v1/token?grant_type=refresh_token': () => [200, tokens(2)],
  }, fakeStorage({ [AUTH_KEY]: session(1, NOW + 3600_000) }), { onSignedOut: () => { out++; } });
  assert.equal((await auth.apiFetch('/me')).status, 401);
  assert.equal(store.m.has(AUTH_KEY), false);
  assert.equal(out, 1);
});

test('syncProfileTz patches tz only while the profile still has the default', async () => {
  const run = async (serverTz, localTz) => {
    const { auth, calls } = make({
      'GET /api/me': () => [200, { user_id: 'u1', tz: serverTz, settings: {} }],
      'PATCH /api/me': (b) => [200, { user_id: 'u1', tz: b.tz, settings: {} }],
    }, fakeStorage({ [AUTH_KEY]: session(1, NOW + 3600_000) }), { timeZone: () => localTz });
    await auth.syncProfileTz();
    return calls.filter((c) => c.method === 'PATCH').map((c) => c.body);
  };
  assert.deepEqual(await run('Asia/Kathmandu', 'Asia/Kolkata'), [{ tz: 'Asia/Kolkata' }]);
  assert.deepEqual(await run('Europe/Berlin', 'Asia/Kolkata'), []);
  assert.deepEqual(await run('Asia/Kathmandu', 'Asia/Kathmandu'), []);
  // Chrome reports Nepal as the legacy alias "Asia/Katmandu": same zone as the default, so no needless PATCH.
  assert.deepEqual(await run('Asia/Kathmandu', 'Asia/Katmandu'), []);
  assert.deepEqual(await run('Asia/Katmandu', 'Asia/Kolkata'), [{ tz: 'Asia/Kolkata' }]);
});

test('isDefaultTz recognises the Kathmandu default and its legacy alias only', () => {
  assert.equal(isDefaultTz('Asia/Kathmandu'), true);
  assert.equal(isDefaultTz('Asia/Katmandu'), true);
  assert.equal(isDefaultTz('Asia/Kolkata'), false);
});
