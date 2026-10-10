// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, step, view } from '../step.js';
import { runTrace, T0 } from './harness.js';

const at = (/** @type {number} */ s) => T0 + s * 1000;

test('view: idle', () => {
  assert.deepEqual(view(initialState(T0), T0), { phase: 'idle', context: null, drift: null, pausedUntil: null, onBreak: null, proposal: null });
});

test('view: proposal while detected', () => {
  const r = runTrace({ events: [{ t: 0, tab: 1, url: 'https://github.com/a/b', title: 'engine' }] });
  assert.deepEqual(view(r.state, at(5)).proposal, { host: 'github.com', title: 'engine', suggested: { title: 'Programming', mode: 'work' } });
});

test('view: active context with in-context minutes (minutes since startedAt)', () => {
  const r = runTrace({ until: 1300, events: ['P'] });
  const v = view(r.state, at(1300));
  assert.equal(v.phase, 'active');
  assert.deepEqual(v.context, { id: r.state.ctx?.id, title: 'Design work', mode: 'work', confidence: 'confirmed', startedAt: at(10), inContextMin: 21 });
  assert.equal(v.drift, null);
});

test('view: inContextMin does not reset after a nudge (R35: never a streak)', () => {
  const r = runTrace({ until: 1000, events: ['P', { t: 600, tab: 2, url: 'https://reddit.com' }] }); // L1 at 900 resets momentum
  assert.equal(r.state.phase, 'intervened_l1');
  assert.equal(view(r.state, at(1000)).context?.inContextMin, 16); // floor((1000 - 10) / 60); momentum would give 0
});

test('view: grace shows deadline and tier, never the destination', () => {
  const r = runTrace({ events: ['P', { t: 600, tab: 2, url: 'https://reddit.com' }] });
  const v = view(r.state, at(605));
  assert.deepEqual(v.drift, { deadline: at(900), tier: 'red' });
  assert.ok(!JSON.stringify(v).includes('reddit'));
});

test('view: break and pause', () => {
  const r = runTrace({ events: ['P', { t: 100, cmd: 'break', note: 'next: footer' }] });
  assert.deepEqual(view(r.state, at(105)).onBreak, { startedAt: at(100), note: 'next: footer' });
  const p = step(runTrace({ events: ['P'] }).state, { type: 'cmd', cmd: 'pause', until: at(2000) }, at(20), r.cfg).state;
  assert.equal(view(p, at(30)).pausedUntil, at(2000));
  assert.equal(view(p, at(2001)).pausedUntil, null); // expired but not yet stepped
});

test('view is JSON-safe and exposes no internals', () => {
  const r = runTrace({ events: ['P', { t: 600, tab: 2, url: 'https://reddit.com' }] });
  const v = view(r.state, at(605));
  assert.deepEqual(JSON.parse(JSON.stringify(v)), v);
  for (const k of ['resources', 'current', 'pending', 'nudgeTimes', 'hints']) assert.ok(!JSON.stringify(v).includes(k), k);
});
