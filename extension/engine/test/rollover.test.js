// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey } from '../step.js';
import { checkExpect, runTrace } from './harness.js';

test('dayKey is the local calendar day (UTC+5:45 just after midnight / before 05:45)', () => {
  assert.equal(dayKey(Date.parse('2026-10-10T18:14:59Z'), 'Asia/Kathmandu'), '2026-10-10'); // 23:59:59 local
  assert.equal(dayKey(Date.parse('2026-10-10T18:15:00Z'), 'Asia/Kathmandu'), '2026-10-11'); // 00:00 local, UTC still the 10th
  assert.equal(dayKey(Date.parse('2026-10-10T23:59:00Z'), 'Asia/Kathmandu'), '2026-10-11'); // 05:44 local
  assert.equal(dayKey(Date.parse('2026-10-10T23:59:00Z'), 'UTC'), '2026-10-10');
  assert.equal(dayKey(Date.parse('2026-10-10T23:59:00Z'), 'Not/AZone'), '2026-10-10'); // zone ICU rejects → UTC, never a throw
});

test('sync records carry the local day they belong to', () => {
  const r = runTrace({ until: 125, events: ['P'] });
  const ctxRec = r.effects.find((x) => x.e.type === 'sync' && x.e.rec.kind === 'context')?.e.rec;
  assert.equal(ctxRec.day, '2026-10-10');
  assert.equal(ctxRec.contextId, r.state.ctx?.id); // R24 field name
  const focus = r.effects.filter((x) => x.e.type === 'sync' && x.e.rec.kind === 'focus').map((x) => x.e.rec);
  assert.deepEqual(focus.map((f) => [f.seconds, f.day]), [[50, '2026-10-10'], [60, '2026-10-10']]); // R32 shape: ticks at 60 and 120
  assert.ok(focus.every((f) => !('focusS' in f)));
});

test('sleeping across midnight banks focus only up to the last step before the gap, on the old day', () => {
  const r = runTrace({ until: 32500, cfg: { t0: '2026-10-10T23:50:00+05:45' }, events: ['P', { t: 100, sleep_until: 32400 }] });
  const focus = r.effects.filter((x) => x.e.type === 'sync' && x.e.rec.kind === 'focus').map((x) => x.e.rec);
  assert.equal(focus.reduce((n, f) => n + f.seconds, 0), 50); // confirm at t10 → last tick at t60; not 9 h of sleep
  assert.ok(focus.every((f) => f.day === '2026-10-10'));
  checkExpect(r, { phase: 'idle', ctx: null, 'day.key': '2026-10-11', has: [{ sync: 'session_end', reason: 'day_rollover', day: '2026-10-10' }] });
});

test('rollover during a break ends the context and drops the resume target', () => {
  const r = runTrace({ until: 700, cfg: { t0: '2026-10-10T23:50:00+05:45' }, events: ['P', { t: 100, cmd: 'break', note: 'n' }] });
  checkExpect(r, { phase: 'idle', ctx: null, brk: null, 'day.key': '2026-10-11', has: [{ sync: 'session_end', reason: 'day_rollover', t: 600 }, { drop_resume: true, t: 600 }] });
});
