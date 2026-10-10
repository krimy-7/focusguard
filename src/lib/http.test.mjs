import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, MESSAGES, errorText, makeCaller } from './http.ts';

const reply = (status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function setup({ replies = [], tokens = ['tok'], refreshOk = false, timeoutMs, getToken, refresh, pending } = {}) {
  const seen = [];
  let signedOut = 0;
  let requestsBeforeSignOut = -1;
  const call = makeCaller({
    baseUrl: 'http://api.test/api',
    getToken: getToken ?? (async () => (tokens.length > 1 ? tokens.shift() : tokens[0])),
    refresh: refresh ?? (async () => refreshOk),
    onSignedOut: () => {
      signedOut += 1;
      requestsBeforeSignOut = seen.length;
    },
    pendingDelete: pending,
    fetchImpl: async (url, init) => {
      seen.push({ url, init });
      const r = replies.shift();
      if (r instanceof Error) throw r;
      return typeof r === 'function' ? r(init) : r;
    },
    timeoutMs,
  });
  return { call, seen, signedOut: () => signedOut, requestsBeforeSignOut: () => requestsBeforeSignOut };
}

const offline = () => new ApiError(0, MESSAGES.offline);

/** In-memory stand-in for api.ts's AsyncStorage-backed flag. */
function flag(on) {
  const f = { on, get: async () => f.on, clear: async () => { f.on = false; } };
  return f;
}

const isApiError = (status, re) => (e) => {
  assert.ok(e instanceof ApiError, `not an ApiError: ${e}`);
  assert.equal(e.status, status);
  assert.match(e.message, re);
  return true;
};

test('sends the bearer token and a JSON body, parses the JSON reply', async () => {
  const s = setup({ replies: [reply(201, [{ id: 'g1' }])] });
  const out = await s.call('POST', '/goals', { lines: 'a', day: '2026-10-10' });
  assert.deepEqual(out, [{ id: 'g1' }]);
  assert.equal(s.seen[0].url, 'http://api.test/api/goals');
  assert.equal(s.seen[0].init.method, 'POST');
  assert.equal(s.seen[0].init.headers.Authorization, 'Bearer tok');
  assert.equal(s.seen[0].init.headers['Content-Type'], 'application/json');
  assert.equal(s.seen[0].init.body, JSON.stringify({ lines: 'a', day: '2026-10-10' }));
});

test('GET sends no body and no Content-Type', async () => {
  const s = setup({ replies: [reply(200, { tz: 'UTC' })] });
  await s.call('GET', '/me');
  assert.equal(s.seen[0].init.body, undefined);
  assert.equal(s.seen[0].init.headers['Content-Type'], undefined);
});

test('204 resolves to undefined', async () => {
  const s = setup({ replies: [new Response(null, { status: 204 })] });
  assert.equal(await s.call('DELETE', '/goals/g1'), undefined);
});

test('401 → refresh once → retry with the new token', async () => {
  const s = setup({ tokens: ['tok1', 'tok2'], refreshOk: true, replies: [reply(401, { detail: 'expired' }), reply(200, { tz: 'UTC' })] });
  assert.deepEqual(await s.call('GET', '/me'), { tz: 'UTC' });
  assert.equal(s.seen.length, 2);
  assert.equal(s.seen[1].init.headers.Authorization, 'Bearer tok2');
  assert.equal(s.signedOut(), 0);
});

test('401 and refresh fails → signed out with a plain message, no second request', async () => {
  const s = setup({ replies: [reply(401, { detail: 'expired' })] });
  await assert.rejects(s.call('GET', '/me'), isApiError(401, /sign in again/i));
  assert.equal(s.seen.length, 1);
  assert.equal(s.signedOut(), 1);
});

test('401 twice (refresh succeeded but token still rejected) → signed out', async () => {
  const s = setup({ refreshOk: true, replies: [reply(401, {}), reply(401, {})] });
  await assert.rejects(s.call('GET', '/me'), isApiError(401, /sign in again/i));
  assert.equal(s.seen.length, 2);
  assert.equal(s.signedOut(), 1);
});

test('no session token → signed out without any request', async () => {
  const s = setup({ tokens: [null] });
  await assert.rejects(s.call('GET', '/me'), isApiError(401, /sign in again/i));
  assert.equal(s.seen.length, 0);
  assert.equal(s.signedOut(), 1);
});

test('getToken offline (refresh hit a network error) → status 0, never signs out', async () => {
  const s = setup({ getToken: async () => Promise.reject(offline()) });
  await assert.rejects(s.call('GET', '/me'), isApiError(0, /can't reach/i));
  assert.equal(s.seen.length, 0);
  assert.equal(s.signedOut(), 0);
});

test('401 then refresh offline → status 0, never signs out', async () => {
  const s = setup({ refresh: async () => Promise.reject(offline()), replies: [reply(401, {})] });
  await assert.rejects(s.call('GET', '/me'), isApiError(0, /can't reach/i));
  assert.equal(s.seen.length, 1);
  assert.equal(s.signedOut(), 0);
});

test('pending delete + 401 twice → sends DELETE /me before signing out, clears the flag on 204 (index R9)', async () => {
  const pending = flag(true);
  const s = setup({ refreshOk: true, pending, replies: [reply(401, {}), reply(401, {}), new Response(null, { status: 204 })] });
  await assert.rejects(s.call('GET', '/me'), isApiError(401, /sign in again/i));
  assert.equal(s.seen.length, 3);
  assert.equal(s.seen[2].url, 'http://api.test/api/me');
  assert.equal(s.seen[2].init.method, 'DELETE');
  assert.equal(s.seen[2].init.headers.Authorization, 'Bearer tok');
  assert.equal(s.requestsBeforeSignOut(), 3);
  assert.equal(s.signedOut(), 1);
  assert.equal(pending.on, false);
});

test('pending delete that gets 502 again keeps the flag for next time', async () => {
  const pending = flag(true);
  const s = setup({ refreshOk: true, pending, replies: [reply(401, {}), reply(401, {}), reply(502, {})] });
  await assert.rejects(s.call('GET', '/me'), isApiError(401, /sign in again/i));
  assert.equal(s.seen.length, 3);
  assert.equal(s.signedOut(), 1);
  assert.equal(pending.on, true);
});

test('no pending delete → no DELETE before signing out', async () => {
  const s = setup({ refreshOk: true, pending: flag(false), replies: [reply(401, {}), reply(401, {})] });
  await assert.rejects(s.call('GET', '/me'), isApiError(401, /sign in again/i));
  assert.equal(s.seen.length, 2);
});

test('422 with a FastAPI detail list shows the first message', async () => {
  const s = setup({ replies: [reply(422, { detail: [{ loc: ['body', 'tz'], msg: 'Unknown timezone', type: 'value_error' }] })] });
  await assert.rejects(s.call('PATCH', '/me', { tz: 'Mars/Base' }), isApiError(422, /Unknown timezone/));
});

test('404 says the item is gone', async () => {
  const s = setup({ replies: [reply(404, { detail: 'Not Found' })] });
  await assert.rejects(s.call('PATCH', '/goals/x', { status: 'done' }), isApiError(404, /no longer there/i));
});

test('5xx with a non-JSON body still gives an honest message', async () => {
  const s = setup({ replies: [new Response('Bad gateway', { status: 502 })] });
  await assert.rejects(s.call('GET', '/me'), isApiError(502, /our side \(502\)/));
});

test('429 rejects with a wait message and never signs out (index R9)', async () => {
  const s = setup({ replies: [reply(429, { detail: 'slow down' })] });
  await assert.rejects(s.call('GET', '/me'), isApiError(429, /too many/i));
  assert.equal(s.signedOut(), 0);
});

test('network failure → status 0, offline message', async () => {
  const s = setup({ replies: [new TypeError('Failed to fetch')] });
  await assert.rejects(s.call('GET', '/me'), isApiError(0, /can't reach/i));
});

test('timeout aborts the request → status 0, timeout message', async () => {
  const hang = (init) =>
    new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const s = setup({ replies: [hang], timeoutMs: 20 });
  await assert.rejects(s.call('GET', '/me'), isApiError(0, /too long/i));
});

test('errorText', () => {
  assert.equal(errorText(new ApiError(404, 'gone')), 'gone');
  assert.match(errorText('weird'), /something went wrong/i);
});

test('staleMessage: offline gets the calm banner line, other errors say what happened', async () => {
  const { staleMessage } = await import('./http.ts');
  assert.equal(staleMessage(new ApiError(0, MESSAGES.offline)), 'Offline — showing your last view');
  assert.equal(staleMessage(new ApiError(500, 'Something went wrong on our side (500). Try again in a moment.')), 'Something went wrong on our side (500). Try again in a moment. Showing your last view.');
});
