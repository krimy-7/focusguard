// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inQuietHours, step } from '../step.js';
import { checkExpect, makeCfg, runTrace, T0 } from './harness.js';

test('tab goes blind during grace (bank, chrome://, no focused window): no nudge, suppressed not_drifting', () => {
  const r = runTrace({ until: 901, events: ['P', { t: 600, tab: 2, url: 'https://reddit.com' }, { t: 700, tab: 3, url: 'https://online.chase.com/acct', title: 'Acct' }] });
  checkExpect(r, { nudges: [], phase: 'active', has: [{ sync: 'intervention', suppressed: 'not_drifting', t: 900 }] });
});

test('L1 card payload: copy key, context name, away minutes, actions, extend options', () => {
  const r = runTrace({ until: 901, events: ['P', { t: 600, tab: 2, url: 'https://reddit.com' }] });
  const n = r.effects.find((x) => x.e.type === 'show_nudge')?.e;
  assert.deepEqual({ ...n, interventionId: typeof n.interventionId }, {
    type: 'show_nudge', level: 1, interventionId: 'string', copyKey: 'nudge_l1',
    vars: { context: 'Design work', awayMin: 5 }, actions: ['back', 'related', 'new_task', 'extend', 'break'], extendOptionsS: [120, 300, 600],
  });
  checkExpect(r, { has: [{ persist_resume: true, t: 900 }, { sync: 'intervention', level: 1, tier: 'red', t: 900 }] });
});

test('after 3 ignores the hourly cap drops to 1', () => {
  const r = runTrace({ until: 899, events: ['P', { t: 600, tab: 2, url: 'https://reddit.com' }] });
  const s = { ...r.state, day: { ...r.state.day, ignored: 3 }, nudgeTimes: [T0 + 300_000] };
  const out = step(s, { type: 'alarm', kind: 'grace', dueAt: T0 + 900_000 }, T0 + 900_000, r.cfg);
  assert.equal(out.state.phase, 'active');
  assert.ok(out.effects.some((e) => e.type === 'sync' && e.rec.suppressed === 'hourly_cap'));
});

test('inQuietHours: wraps midnight, end is exclusive, from==to is never, uses cfg.tz', () => {
  const cfg = makeCfg({ tz: 'Asia/Kathmandu', quietHours: [{ from: '22:00', to: '07:00' }] });
  const local = (/** @type {string} */ hhmm) => Date.parse(`2026-10-10T${hhmm}:00+05:45`);
  assert.equal(inQuietHours(local('21:59'), cfg), false);
  assert.equal(inQuietHours(local('22:00'), cfg), true);
  assert.equal(inQuietHours(local('03:00'), cfg), true);
  assert.equal(inQuietHours(local('07:00'), cfg), false);
  assert.equal(inQuietHours(local('12:00'), makeCfg({ tz: 'Asia/Kathmandu', quietHours: [{ from: '12:00', to: '12:00' }] })), false);
  assert.equal(inQuietHours(local('12:30'), makeCfg({ tz: 'Asia/Kathmandu', quietHours: [{ from: '12:00', to: '13:00' }] })), true);
  assert.equal(inQuietHours(local('12:30'), makeCfg({ tz: 'UTC', quietHours: [{ from: '12:00', to: '13:00' }] })), false);
  assert.equal(inQuietHours(local('12:30'), makeCfg({ tz: 'Asia/Kathmandu', quietHours: [] })), false);
});

test('L2 is suppressed (not queued) in quiet hours; nothing fires after', () => {
  // grace ends 21:55 local (L1), escalation due 22:00 falls into quiet hours
  const r = runTrace({ until: 1300, cfg: { quietHours: [{ from: '22:00', to: '07:00' }], t0: '2026-10-10T21:40:00+05:45' },
    events: ['P', { t: 600, tab: 2, url: 'https://reddit.com' }] });
  checkExpect(r, { nudges: [[1, 900]], phase: 'intervened_l1', has: [{ sync: 'intervention', level: 2, suppressed: 'quiet_hours', t: 1200 }] });
});
