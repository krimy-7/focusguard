// @ts-check
// Final whole-branch review findings (fresh-context reviewer): each test failed before its fix.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../step.js';
import { checkExpect, runTrace, T0 } from './harness.js';

const at = (/** @type {number} */ s) => T0 + s * 1000;
const only = (/** @type {any[]} */ fx) => fx.map((e) => e.type);

// 1 · idle / locked is honoured by every re-evaluation, and does not survive a browser restart
test('a pause that ends while the screen is locked starts no drift and shows no nudge', () => {
  const r = runTrace({ until: 3300, events: ['P', { t: 600, tab: 2, url: 'https://reddit.com' }, { t: 650, cmd: 'pause', until: 2450 }, { t: 700, idle: 'locked' }] });
  checkExpect(r, { nudges: [], phase: 'active', drift: null, idle: true });
});

test('a sleep that ends still locked starts no drift (sleep reset relands)', () => {
  const r = runTrace({ until: 3300, events: ['P', { t: 600, tab: 2, url: 'https://reddit.com' }, { t: 700, idle: 'locked' }, { t: 800, sleep_until: 2000 }] });
  checkExpect(r, { nudges: [], phase: 'active', drift: null });
});

test('a browser start clears a stale idle flag (D never re-sends "active" after a restart)', () => {
  const r = runTrace({ until: 400, events: ['P', { t: 100, idle: 'locked' }, { t: 200, restart: true }] });
  checkExpect(r, { idle: false });
});

// 2 · decisions use the landing the user is on, not the one before a still-dwelling landing
test('returning to context 2 s before the grace deadline is a self-return, not an L1', () => {
  const r = runTrace({ until: 905, events: ['P', { t: 600, tab: 2, url: 'https://reddit.com' }, { t: 898, tab: 1 }] });
  checkExpect(r, { nudges: [], phase: 'active', has: [{ sync: 'recovery', trigger: 'self_returned', awayS: 298 }] });
});

test('"related" applies to the tab the user is on even if it landed 1 s ago', () => {
  const r = runTrace({ until: 1010, events: ['P', { t: 600, tab: 2, url: 'https://reddit.com' }, { t: 950, tab: 3, url: 'https://youtube.com/watch', title: 'v' }, { t: 1000, tab: 2 }, { t: 1001, cmd: 'related' }] });
  checkExpect(r, { 'ctx.relatedHosts': ['reddit.com'], has: [{ group_tab: 2 }], not: [{ group_tab: 3 }] });
});

test('"end" proposes on the tab the user is on even if it landed 2 s ago', () => {
  const r = runTrace({ until: 710, events: ['P', { t: 600, tab: 2, url: 'https://github.com/a/b', title: 'engine' }, { t: 700, tab: 3, url: 'https://github.com/c/d', title: 'other' }, { t: 702, cmd: 'end' }] });
  checkExpect(r, { phase: 'detected', 'proposal.tabId': 3 });
});

// 3 · Back never focuses a tab that has left the context
test('back after the context tab itself navigated to a drift host does not focus that tab', () => {
  const r = runTrace({ until: 910, events: ['P', { t: 600, tab: 1, url: 'https://reddit.com' }, { t: 905, cmd: 'back' }] });
  checkExpect(r, { has: [{ focus_tab: null, t: 905 }], not: [{ focus_tab: 1 }] });
});

test('back after a tab was dragged into the group and out again does not focus it', () => {
  const r = runTrace({ until: 1110, events: ['P', { t: 11, tab_group: [1, 7] }, { t: 600, tab: 2, url: 'https://youtube.com/watch', title: 'v' }, { t: 650, tab_group: [2, 7] }, { t: 700, tab_group: [2, -1] }, { t: 1100, cmd: 'back' }] });
  checkExpect(r, { has: [{ sync: 'recovery', trigger: 'intervention' }], not: [{ focus_tab: 2 }] });
});

// 4 · the "adopt the next group" window expires
test('a group the user makes long after a break resume (reopen_group made none) is not adopted', () => {
  const r = runTrace({ until: 20100, events: ['P', { t: 11, tab_group: [1, 7] }, { t: 600, cmd: 'break' }, { t: 2000, group_removed: 7 }, { t: 4200, cmd: 'resume' },
    { t: 20000, tab_group: [9, 42] }, { t: 20010, tab: 9, url: 'https://reddit.com' }] });
  checkExpect(r, { 'ctx.groupId': null, 'ctx.groupTabIds': [], phase: 'grace' });
});

// 5 · garbage from the shell: a log effect, no state change (Review Focus #3)
test('pause with a non-finite end is ignored, never a permanent pause', () => {
  const r = runTrace({ events: ['P'] });
  for (const until of [NaN, undefined, 'soon']) {
    const out = step(r.state, /** @type {any} */ ({ type: 'cmd', cmd: 'pause', until }), at(20), r.cfg);
    assert.equal(out.state.pausedUntil, null);
    assert.deepEqual(only(out.effects), ['log']);
  }
});

test('a landing with a non-finite or future ts still commits after the dwell; a non-integer tabId is dropped', () => {
  const r = runTrace({ events: ['P'] });
  for (const ts of [NaN, at(5000), Infinity]) {
    let s = step(r.state, { type: 'landing', tabId: 9, host: 'blog.example.org', title: 'x', ts }, at(100), r.cfg).state;
    s = step(s, { type: 'heartbeat', reason: 'dwell' }, at(104), r.cfg).state;
    assert.equal(s.pending, null);
    assert.equal(s.current?.tabId, 9);
  }
  for (const tabId of [NaN, Infinity, 1.5]) {
    const s = step(r.state, { type: 'landing', tabId, host: 'blog.example.org', title: 'x', ts: at(100) }, at(100), r.cfg).state;
    assert.equal(s.pending, null);
  }
});
