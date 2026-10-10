// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../step.js';
import { checkExpect, runTrace, T0 } from './harness.js';

const OFF = Number.MAX_SAFE_INTEGER;
const at = (/** @type {number} */ s) => T0 + s * 1000;

test('pause "off" schedules no alarm, treats landings as blind; resume relands without a welcome back', () => {
  const p = runTrace({ until: 2000, events: ['P'] });
  const past = step(p.state, { type: 'cmd', cmd: 'pause', until: at(1999) }, at(2000), p.cfg);
  assert.equal(past.state.pausedUntil, null); // a pause that already ended is ignored
  let s = step(p.state, { type: 'cmd', cmd: 'pause', until: OFF }, at(2000), p.cfg);
  assert.equal(s.state.pausedUntil, OFF);
  assert.deepEqual(s.effects.filter((e) => e.type === 'schedule_alarm'), []);
  s = step(s.state, { type: 'landing', tabId: 2, host: 'reddit.com', title: '', ts: at(2010) }, at(2010), p.cfg);
  s = step(s.state, { type: 'heartbeat', reason: 'dwell' }, at(2014), p.cfg);
  assert.equal(s.state.phase, 'active');
  s = step(s.state, { type: 'cmd', cmd: 'resume' }, at(2100), p.cfg);
  assert.equal(s.state.phase, 'grace');
  assert.equal(s.state.drift?.anchor, at(2100));
  assert.ok(!s.effects.some((e) => e.type === 'show_recovery'));
});

test('pause with no context suppresses detection until it ends', () => {
  const r = runTrace({ events: [{ t: 0, cmd: 'pause', until: 100 }, { t: 10, tab: 1, url: 'https://github.com/a/b' }, { t: 120, tab: 2, url: 'https://figma.com' }] });
  checkExpect(r, { phase: 'detected', count: { propose_context: 1 }, has: [{ propose_context: true, t: 124 }] });
});

test('an alarm more than STALE_ALARM_S late (no sleep gap) never nudges and restarts grace fresh', () => {
  const r = runTrace({ until: 899, events: ['P', { t: 600, tab: 2, url: 'https://reddit.com' }] });
  let s = step(r.state, { type: 'heartbeat', reason: 'tick' }, at(960), r.cfg).state;
  const out = step(s, { type: 'alarm', kind: 'grace', dueAt: at(900) }, at(1000), r.cfg);
  assert.ok(!out.effects.some((e) => e.type === 'show_nudge'));
  assert.ok(out.effects.some((e) => e.type === 'log' && e.msg === 'stale_alarm'));
  assert.equal(out.state.drift?.deadline, at(1300));
});

test('locked screen mid-L1 hides the card silently; unlock relands', () => {
  const r = runTrace({ until: 1000, events: ['P', { t: 600, tab: 2, url: 'https://reddit.com' }, { t: 950, idle: 'locked' }] });
  checkExpect(r, { phase: 'active', drift: null, idle: true, has: [{ hide_nudge: true, t: 950 }], not: [{ show_recovery: '*' }] });
});

test('browser restart drops an open proposal: a later confirm cannot group the pre-restart tab id', () => {
  const r = runTrace({ events: [{ t: 0, tab: 1, url: 'https://github.com/a/b', title: 'engine' }, { t: 10, restart: true }, { t: 20, cmd: 'confirm' }] });
  checkExpect(r, { phase: 'idle', proposal: null, 'current.tabId': -1, count: { group_tab: 0 } });
});

test('browser restart after a sleep: the sleep-gap reland does not write a pre-restart tab id back for back to focus', () => {
  const r = runTrace({ until: 1410, events: ['P', { t: 600, sleep_until: 1000 }, { t: 1000, restart: true }, { t: 1100, tab: 2, url: 'https://reddit.com' }, { t: 1405, cmd: 'back' }] });
  checkExpect(r, { 'ctx.lastTabId': null, has: [{ log: 'sleep_gap', t: 1000 }, { focus_tab: null, t: 1405 }], not: [{ focus_tab: 1 }] });
});
