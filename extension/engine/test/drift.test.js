// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkExpect, runTrace, T0 } from './harness.js';

test('same-tab title updates during grace do not restart the drift (YouTube/Gmail retitle themselves)', () => {
  const r = runTrace({ events: ['P', { t: 600, tab: 2, url: 'https://reddit.com/r/x', title: 'a' }, { t: 650, tab: 2, title: 'b (1)' }, { t: 700, tab: 2, title: 'c (2)' }] });
  checkExpect(r, { phase: 'grace', scheduleCount: { grace: 1 }, alarm: { grace: 900 } });
  assert.equal(r.effects.filter((x) => x.e.type === 'sync' && x.e.rec.kind === 'drift').length, 1);
  assert.equal(r.state.current?.title, 'c (2)');
});

test('unknown host while active: trusted, no drift, momentum frozen', () => {
  const r = runTrace({ events: ['P', { t: 600, tab: 2, url: 'https://blog.example.org/post' }] });
  checkExpect(r, { phase: 'active', scheduleCount: { grace: 0 }, momentumS: 590, momentumSince: null });
});

test('Beast Mode active: red landing starts no drift', () => {
  const r = runTrace({ cfg: { beastUntil: T0 + 3600_000 }, events: ['P', { t: 600, tab: 2, url: 'https://reddit.com' }] });
  checkExpect(r, { phase: 'active', scheduleCount: { grace: 0 } });
});

test('drift record carries tier and grace, never the destination host', () => {
  const r = runTrace({ events: ['P', { t: 600, tab: 2, url: 'https://reddit.com/r/x' }] });
  const drift = r.effects.find((x) => x.e.type === 'sync' && x.e.rec.kind === 'drift')?.e.rec;
  assert.equal(drift.tier, 'red');
  assert.equal(drift.graceS, 300);
  assert.ok(!JSON.stringify(drift).includes('reddit'));
  assert.match(String(r.state.ctx?.id), /^[A-Za-z0-9_-]{1,64}$/); // R7: B validates PUT /contexts/{id} against this
});

test('a self-return freezes momentum, it does not reset it (engine notes Q2)', () => {
  // 1800 s banked by 1810; 90 s away; 60 s more by 1960 → 31 min (mid) → 210 s. A reset would give 60 s (low) → 300 s.
  const r = runTrace({ events: ['P', { t: 1810, tab: 2, url: 'https://reddit.com' }, { t: 1900, tab: 1 }, { t: 1960, tab: 2 }] });
  checkExpect(r, { phase: 'grace', alarm: { grace: 2170 } });
});
