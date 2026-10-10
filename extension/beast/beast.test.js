// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBeast, normalizeSites, originsFor, BEAST_KEY, BYPASS_MS } from './beast.js';

const NOW = 1_800_000_000_000;

/** In-memory chrome.declarativeNetRequest + chrome.alarms + storage. */
function fakeChrome(clock = { t: NOW }) {
  let dynamic = [], session = [];
  const alarms = new Map();
  const store = new Map();
  const apply = (list, o) => {
    const rm = new Set(o.removeRuleIds || []);
    const next = list.filter((r) => !rm.has(r.id)).concat(o.addRules || []);
    if (new Set(next.map((r) => r.id)).size !== next.length) throw new Error('duplicate rule ID');
    return next;
  };
  const d = {
    dnr: {
      getDynamicRules: async () => dynamic.slice(), getSessionRules: async () => session.slice(),
      updateDynamicRules: async (o) => { dynamic = apply(dynamic, o); },
      updateSessionRules: async (o) => { session = apply(session, o); },
    },
    alarms: { create: async (n, o) => { alarms.set(n, o.when); }, getAll: async () => [...alarms].map(([name, when]) => ({ name, scheduledTime: when })),
      clear: async (n) => alarms.delete(n) },
    storage: { get: async (k) => (store.has(k) ? { [k]: store.get(k) } : {}), set: async (o) => { for (const [k, v] of Object.entries(o)) store.set(k, v); },
      remove: async (k) => { store.delete(k); } },
    now: () => clock.t,
  };
  return { d, clock, alarms, store, rules: () => ({ dynamic, session }) };
}

test('normalizeSites keeps bare hostnames, strips scheme/www/path, dedupes', () => {
  assert.deepEqual(normalizeSites('https://www.Reddit.com/r/x, youtube.com\nyoutube.com  not-a-site  x.com:443/home'), ['reddit.com', 'youtube.com', 'x.com']);
  assert.deepEqual(normalizeSites(''), []);
  assert.deepEqual(originsFor(['reddit.com']), ['https://*.reddit.com/*', 'http://*.reddit.com/*']);
});

test('start adds one main_frame redirect rule per site, the end alarm and fg_beast', async () => {
  const f = fakeChrome();
  const st = await createBeast(f.d).start(['reddit.com', 'x.com'], 50);
  const { dynamic } = f.rules();
  assert.equal(dynamic.length, 2);
  assert.deepEqual(dynamic[0].condition, { requestDomains: ['reddit.com'], resourceTypes: ['main_frame'] });
  assert.deepEqual(dynamic[0].action, { type: 'redirect', redirect: { extensionPath: '/blocked.html?site=reddit.com' } });
  assert.equal(f.alarms.get('beast:end'), NOW + 50 * 60_000);
  assert.deepEqual(f.store.get(BEAST_KEY), st);
  assert.equal(st.until, NOW + 50 * 60_000);
});

test('start requires sites and a real duration (never a default)', async () => {
  const b = createBeast(fakeChrome().d);
  await assert.rejects(b.start([], 30), /at least one site/);
  for (const m of [0, -5, 30.5, NaN, 481]) await assert.rejects(b.start(['reddit.com'], m), /how long/);
});

test('starting again replaces the previous rules instead of colliding', async () => {
  const f = fakeChrome();
  const b = createBeast(f.d);
  await b.start(['reddit.com', 'x.com'], 30);
  await b.start(['youtube.com'], 30);
  assert.deepEqual(f.rules().dynamic.map((r) => r.condition.requestDomains[0]), ['youtube.com']);
});

test('continue anyway adds a tab-scoped allow session rule that outranks the redirect, removed by its alarm', async () => {
  const f = fakeChrome();
  const b = createBeast(f.d);
  await b.start(['reddit.com'], 30);
  const id = await b.allowOnce(42, 'reddit.com');
  const rule = f.rules().session.find((r) => r.id === id);
  assert.deepEqual(rule.condition, { requestDomains: ['reddit.com'], tabIds: [42], resourceTypes: ['main_frame'] });
  assert.equal(rule.action.type, 'allow');
  assert.ok(rule.priority > f.rules().dynamic[0].priority);
  assert.equal(f.alarms.get(`beast:bypass:${id}`), NOW + BYPASS_MS);
  const id2 = await b.allowOnce(43, 'reddit.com');
  assert.notEqual(id2, id);
  await b.onBeastAlarm(`beast:bypass:${id}`);
  assert.deepEqual(f.rules().session.map((r) => r.id), [id2]);
});

test('continue anyway ignores sites that are not blocked', async () => {
  const f = fakeChrome();
  const b = createBeast(f.d);
  assert.equal(await b.allowOnce(1, 'reddit.com'), null); // Beast off
  await b.start(['reddit.com'], 30);
  assert.equal(await b.allowOnce(1, 'evil.example'), null);
  assert.equal(f.rules().session.length, 0);
});

test('the end alarm removes every Beast rule, alarm and fg_beast', async () => {
  const f = fakeChrome();
  const b = createBeast(f.d);
  await b.start(['reddit.com'], 30);
  await b.allowOnce(5, 'reddit.com');
  await f.d.alarms.create('grace', { when: NOW + 1 }); // someone else's alarm survives
  await b.onBeastAlarm('beast:end');
  assert.deepEqual(f.rules(), { dynamic: [], session: [] });
  assert.deepEqual([...f.alarms.keys()], ['grace']);
  assert.equal(f.store.has(BEAST_KEY), false);
});

test('getBeast cleans up when the end alarm was missed (laptop slept through it)', async () => {
  const f = fakeChrome();
  const b = createBeast(f.d);
  await b.start(['reddit.com'], 30);
  assert.ok(await b.getBeast());
  f.clock.t = NOW + 31 * 60_000;
  assert.equal(await b.getBeast(), null);
  assert.deepEqual(f.rules().dynamic, []);
});

test('unknown beast alarm names are ignored', async () => {
  const f = fakeChrome();
  await createBeast(f.d).onBeastAlarm('beast:bypass:abc');
  await createBeast(f.d).onBeastAlarm('beast:whatever');
  assert.deepEqual(f.rules(), { dynamic: [], session: [] });
});
