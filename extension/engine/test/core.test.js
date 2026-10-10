// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alarmsFor, initialState, step } from '../step.js';
import { checkExpect, makeCfg, runTrace, T0, tabToInput } from './harness.js';

const cfg = makeCfg();
const at = (/** @type {number} */ s) => T0 + s * 1000;

test('initialState: idle, empty, JSON-safe', () => {
  const s = initialState(T0);
  assert.equal(s.phase, 'idle');
  assert.equal(s.lastSeenAt, T0);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

test('unknown or malformed input: logged, state returned unchanged, never throws', () => {
  const s = initialState(T0);
  for (const bad of [null, undefined, 42, {}, { type: 'nope' }, { type: 'toString' }, { type: '__proto__' }]) {
    const out = step(s, /** @type {any} */ (bad), at(1), cfg);
    assert.equal(out.state, s);
    assert.deepEqual(out.effects.map((e) => e.type), ['log']);
  }
});

test('landing commits only after DWELL_MIN_S; same-tab title updates keep the dwell clock', () => {
  let s = initialState(T0);
  s = step(s, { type: 'landing', tabId: 1, host: 'blog.example.org', title: 'A', ts: at(0) }, at(0), cfg).state;
  s = step(s, { type: 'landing', tabId: 1, host: 'blog.example.org', title: 'A (1)', ts: at(2) }, at(2), cfg).state;
  s = step(s, { type: 'heartbeat', reason: 'dwell' }, at(3.9), cfg).state;
  assert.equal(s.current, null);
  assert.equal(s.pending?.title, 'A (1)');
  s = step(s, { type: 'heartbeat', reason: 'dwell' }, at(4), cfg).state;
  assert.equal(s.pending, null);
  assert.deepEqual(s.current, { tabId: 1, host: 'blog.example.org', title: 'A (1)', tier: 'unknown', inCtx: false, at: at(0) });
});

test('a landing that replaces an undwelled one drops it', () => {
  let s = initialState(T0);
  s = step(s, { type: 'landing', tabId: 1, host: 'reddit.com', title: '', ts: at(0) }, at(0), cfg).state;
  s = step(s, { type: 'landing', tabId: 2, host: 'github.com', title: '', ts: at(1) }, at(1), cfg).state;
  s = step(s, { type: 'heartbeat', reason: 'dwell' }, at(5), cfg).state;
  assert.equal(s.current?.tabId, 2);
});

test('startup heartbeat re-schedules every live alarm; a tick does not', () => {
  const s = { ...initialState(T0), phase: /** @type {const} */ ('grace'),
    drift: { id: 'd', startedAt: at(0), anchor: at(0), deadline: at(300), graceS: 300, tier: /** @type {const} */ ('red'), l1At: null, l2Due: null, extended: false, interventionId: null } };
  assert.deepEqual(alarmsFor(s), { grace: at(300) });
  const startup = step(s, { type: 'heartbeat', reason: 'startup' }, at(10), cfg).effects;
  assert.deepEqual(startup.filter((e) => e.type === 'schedule_alarm'), [{ type: 'schedule_alarm', kind: 'grace', at: at(300) }]);
  const tick = step(s, { type: 'heartbeat', reason: 'tick' }, at(10), cfg).effects;
  assert.deepEqual(tick.filter((e) => e.type === 'schedule_alarm'), []);
});

test('harness tabToInput: sensitive, incognito and non-http tabs are blind', () => {
  assert.deepEqual(tabToInput({ id: 3, url: 'https://online.chase.com/x', title: 'Acct 99999 – Chase' }, 1), { type: 'landing', tabId: 3, host: null, title: '', ts: 1 });
  assert.equal(tabToInput({ id: 4, url: 'https://reddit.com', incognito: true }, 1).host, null);
  assert.equal(tabToInput({ id: 5, url: 'chrome://settings' }, 1).host, null);
  assert.equal(tabToInput({ id: 6, url: 'not a url' }, 1).host, null);
  assert.deepEqual(tabToInput({ id: 7, url: 'https://www.GitHub.com/a', title: 'mail me: a@b.co 123456' }, 1), { type: 'landing', tabId: 7, host: 'github.com', title: 'mail me:', ts: 1 });
});

test('harness: runs a trace, keeps sensitive strings out, and fails loudly on a wrong expectation', () => {
  const trace = { events: [{ t: 0, tab: 1, url: 'https://blog.example.org/a' }, { t: 1, tab: 2, url: 'https://online.chase.com/acct', title: 'Account 1234567 – Chase' }] };
  const r = runTrace(trace);
  checkExpect(r, { absentStrings: ['chase', '1234567'] });
  assert.equal(r.state.current?.host, null);
  assert.throws(() => checkExpect(r, { phase: 'grace' }));
  assert.throws(() => checkExpect(r, { has: [{ show_nudge: '*' }] }));
});
