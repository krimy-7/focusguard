// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../step.js';
import { checkExpect, runTrace, T0 } from './harness.js';

const at = (/** @type {number} */ s) => T0 + s * 1000;

test('tab_group: first group after confirm is adopted; members are in context', () => {
  const r = runTrace({ events: ['P', { t: 11, tab_group: [1, 7] }] });
  checkExpect(r, { 'ctx.groupId': 7, 'ctx.groupTabIds': [1] });
});

test('drag a drifting tab into the group during grace → self-return', () => {
  const r = runTrace({ events: ['P', { t: 11, tab_group: [1, 7] }, { t: 600, tab: 2, url: 'https://youtube.com/watch', title: 'v' }, { t: 650, tab_group: [2, 7] }] });
  checkExpect(r, { phase: 'active', 'ctx.groupTabIds': [1, 2], 'ctx.resources': ['figma.com'], has: [{ sync: 'recovery', trigger: 'self_returned', awayS: 50, t: 650 }] });
});

test('drag it back out → reland → a fresh drift', () => {
  const r = runTrace({ events: ['P', { t: 11, tab_group: [1, 7] }, { t: 600, tab: 2, url: 'https://youtube.com/watch', title: 'v' }, { t: 650, tab_group: [2, 7] }, { t: 700, tab_group: [2, -1] }] });
  checkExpect(r, { phase: 'grace', 'ctx.groupTabIds': [1], alarm: { grace: 1060 } });
});

test('another group, or removal of a group that is not ours, changes nothing', () => {
  const r = runTrace({ events: ['P', { t: 11, tab_group: [1, 7] }, { t: 20, tab_group: [5, 9] }, { t: 30, group_removed: 9 }] });
  checkExpect(r, { 'ctx.groupId': 7, 'ctx.groupTabIds': [1] });
});

test('an inferred context (no group_tab) never adopts a group the user made', () => {
  const r = runTrace({ until: 200, events: [{ t: 0, tab: 1, url: 'https://github.com/a/b', title: 'engine' }, { t: 95, tab_group: [5, 9] }, { t: 100, tab: 5, url: 'https://reddit.com' }] });
  checkExpect(r, { 'ctx.confidence': 'inferred', 'ctx.groupId': null, 'ctx.groupTabIds': [], phase: 'grace' });
});

test('browser restart (startup) forgets stale tab/group ids; a later group_tab re-adopts', () => {
  // Tab 1 was in group 7; after restart its id may belong to anything, so reddit in tab 1 drifts.
  const r = runTrace({ events: ['P', { t: 11, tab_group: [1, 7] }, { t: 100, restart: true }, { t: 110, tab: 1, url: 'https://reddit.com' }, { t: 200, cmd: 'related' }, { t: 210, tab_group: [1, 9] }] });
  checkExpect(r, { phase: 'active', 'ctx.groupId': 9, 'ctx.groupTabIds': [1], has: [{ schedule_alarm: 'grace', t: 114 }, { group_tab: 1, t: 200 }] });
});

test('resume after the group was closed adopts the reopened group; a later related reuses it (no second group)', () => {
  const r = runTrace({ events: ['P', { t: 11, tab_group: [1, 7] }, { t: 600, cmd: 'break' }, { t: 2000, group_removed: 7 }, { t: 4200, cmd: 'resume' },
    { t: 4201, tab_group: [3, 11] }, { t: 4202, tab_group: [4, 11] }, { t: 4300, tab: 5, url: 'https://youtube.com/watch', title: 'v' }, { t: 4400, cmd: 'related' }] });
  checkExpect(r, { phase: 'active', 'ctx.groupId': 11, 'ctx.groupTabIds': [3, 4], 'ctx.adoptNextGroup': false, 'ctx.pendingGroupTabId': null, has: [{ reopen_group: true, t: 4200 }, { group_tab: 5, t: 4400 }] });
});

test('tier_hint applies on the next landing only — never retroactively', () => {
  const r = runTrace({ events: ['P', { t: 600, tab: 2, url: 'https://blog.example.org/a' }, { t: 700, tier_hint: { host: 'blog.example.org', tier: 'red', related: false } }] });
  checkExpect(r, { phase: 'active', scheduleCount: { grace: 0 } });
  const r2 = runTrace({ events: ['P', { t: 500, tier_hint: { host: 'blog.example.org', tier: 'red', related: false } }, { t: 600, tab: 2, url: 'https://blog.example.org/a' }] });
  checkExpect(r2, { phase: 'grace', alarm: { grace: 900 } });
});

test('tier_hint related=true makes the host in-context; hints die with the context', () => {
  const r = runTrace({ events: ['P', { t: 500, tier_hint: { host: 'blog.example.org', tier: 'yellow', related: true } }, { t: 600, tab: 2, url: 'https://blog.example.org/a' }] });
  checkExpect(r, { phase: 'active', 'ctx.resources': ['figma.com', 'blog.example.org'] });
  const end = step(r.state, { type: 'cmd', cmd: 'end' }, at(700), r.cfg);
  assert.deepEqual(end.state.hints, {});
});

test('tier_hint with an invalid tier or empty host is ignored', () => {
  const r = runTrace({ events: ['P'] });
  for (const bad of [{ host: 'a.org', tier: 'purple' }, { host: '', tier: 'red' }, { host: 'a.org', tier: 'unknown' }]) {
    const out = step(r.state, /** @type {any} */ ({ type: 'tier_hint', ...bad }), at(20), r.cfg);
    assert.deepEqual(out.state.hints, {});
  }
});
