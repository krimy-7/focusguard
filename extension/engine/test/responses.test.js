// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../step.js';
import { checkExpect, runTrace, T0 } from './harness.js';

const inL1 = () => runTrace({ until: 901, events: ['P', { t: 600, tab: 2, url: 'https://reddit.com' }] }); // L1 at 900
const at = (/** @type {number} */ s) => T0 + s * 1000;
const only = (/** @type {any[]} */ fx) => fx.map((e) => e.type);

test('extend with a value outside EXTEND_OPTIONS_S is ignored', () => {
  const r = inL1();
  for (const n of [999, '300', -1, undefined]) {
    const out = step(r.state, /** @type {any} */ ({ type: 'cmd', cmd: 'extend', n }), at(905), r.cfg);
    assert.equal(out.state.phase, 'intervened_l1');
    assert.deepEqual(only(out.effects), ['log']);
  }
});

test('nudge responses with no nudge showing are ignored', () => {
  const r = runTrace({ events: ['P'] });
  for (const cmd of ['back', 'dismiss', 'progress']) {
    const out = step(r.state, /** @type {any} */ ({ type: 'cmd', cmd }), at(20), r.cfg);
    assert.equal(out.state.phase, 'active');
    assert.deepEqual(only(out.effects), ['log']);
  }
  const out = step(r.state, /** @type {any} */ ({ type: 'cmd', cmd: 'self_destruct' }), at(20), r.cfg);
  assert.equal(out.effects[0].msg, 'unknown_cmd');
});

test('a repeated command id is a no-op (double-click on the card)', () => {
  const r = inL1();
  const a = step(r.state, { type: 'cmd', id: 'n1:dismiss', cmd: 'dismiss' }, at(905), r.cfg);
  const b = step(a.state, { type: 'cmd', id: 'n1:dismiss', cmd: 'dismiss' }, at(906), r.cfg);
  assert.equal(a.state.day.ignored, 1);
  assert.equal(b.state, a.state);
});

// Escalation gets quieter, not louder (PRODUCT.md): an explicit dismiss on L1 means "not now", so no L2 follows it.
// Old behaviour: dismiss only hid the card; the `escalate` alarm stayed armed and L2 appeared 5 min later anyway.
test('dismiss on L1 cancels the pending escalation: no L2 afterwards, and the dismiss still counts as ignored', () => {
  const r = inL1();
  assert.equal(r.state.drift?.l2Due, T0 + 1200_000); // L1 at 900 arms L2 for 1200
  const out = step(r.state, { type: 'cmd', cmd: 'dismiss' }, at(905), r.cfg);
  assert.deepEqual(only(out.effects).filter((t) => t !== 'sync'), ['hide_nudge', 'cancel_alarm']);
  assert.ok(out.effects.some((e) => e.type === 'cancel_alarm' && e.kind === 'escalate'));
  assert.equal(out.state.drift?.l2Due, null);
  assert.equal(out.state.day.ignored, 1);
  let s = out.state;
  for (const t of [960, 1020, 1080, 1140]) s = step(s, { type: 'heartbeat', reason: 'tick' }, at(t), r.cfg).state; // no sleep gap
  const stale = step(s, { type: 'alarm', kind: 'escalate', dueAt: at(1200) }, at(1200), r.cfg); // a late delivery of the old alarm
  assert.deepEqual(only(stale.effects), ['log']);
  assert.equal(stale.state.phase, 'intervened_l1');
});

test('after an L1 dismiss the whole replay shows exactly one nudge (not two), and a return still recovers', () => {
  const r = runTrace({ until: 1800, events: ['P', { t: 600, tab: 2, url: 'https://reddit.com' }, { t: 905, cmd: 'dismiss' }, { t: 1500, tab: 1 }] });
  checkExpect(r, { nudges: [[1, 900]], phase: 'active', 'day.ignored': 1, has: [{ cancel_alarm: 'escalate', t: 905 }, { sync: 'recovery', trigger: 'intervention' }], not: [{ show_nudge: 'nudge_l2' }] });
});

// Rewritten for the same reason: it used to dismiss L1 and then force the escalate alarm. L2 is now reached only by leaving L1 open.
test('L2 gets its own interventionId, so a dismiss on the L2 card is not deduped against an L1 response', () => {
  const r = runTrace({ until: 1201, events: ['P', { t: 600, tab: 2, url: 'https://reddit.com' }] }); // L1 at 900, left open; L2 at 1200
  const shown = r.effects.filter((x) => x.e.type === 'show_nudge').map((x) => x.e);
  assert.deepEqual(shown.map((e) => e.level), [1, 2]);
  const [n1, n2] = shown.map((e) => e.interventionId);
  assert.ok(n2 && n2 !== n1);
  assert.ok(r.effects.some((x) => x.e.type === 'sync' && x.e.rec.kind === 'intervention' && x.e.rec.level === 2 && x.e.rec.interventionId === n2));
  assert.equal(r.state.day.ignored, 1); // L1 was left open: that is the one ignore
  const out = step(r.state, { type: 'cmd', id: `${n2}:dismiss`, cmd: 'dismiss' }, at(1205), r.cfg);
  assert.ok(out.effects.some((e) => e.type === 'hide_nudge'));
  assert.ok(out.effects.some((e) => e.type === 'sync' && e.rec.kind === 'response' && e.rec.interventionId === n2));
  assert.equal(out.state.day.ignored, 2); // L1 left open, L2 dismissed
  assert.ok(!out.effects.some((e) => e.type === 'schedule_alarm')); // nothing follows L2
});

test('back records a recovery with trigger intervention (R24)', () => {
  const r = inL1();
  const out = step(r.state, { type: 'cmd', cmd: 'back' }, at(905), r.cfg);
  assert.ok(out.effects.some((e) => e.type === 'sync' && e.rec.kind === 'recovery' && e.rec.trigger === 'intervention'));
});

test('returning during an extended grace is a recovery, not a self-return (an L1 was already shown)', () => {
  const r = runTrace({ events: ['P', { t: 600, tab: 2, url: 'https://reddit.com' }, { t: 920, cmd: 'extend', n: 300 }, { t: 1000, tab: 1 }] });
  checkExpect(r, { phase: 'active', has: [{ sync: 'recovery', trigger: 'intervention' }], not: [{ sync: 'recovery', trigger: 'self_returned' }] });
});

test('unrelate removes the per-context rule and the resource; the host drifts again (R14)', () => {
  const r = runTrace({ events: ['P', { t: 600, tab: 2, url: 'https://youtube.com/watch', title: 'v' }, { t: 700, cmd: 'related' }, { t: 800, cmd: 'unrelate', host: 'www.youtube.com' }] });
  checkExpect(r, { phase: 'grace', 'ctx.relatedHosts': [], 'ctx.resources': ['figma.com'], alarm: { grace: 1160 }, has: [{ schedule_alarm: 'grace', t: 800 }] });
  const none = step(runTrace({ events: [{ t: 0, tab: 1, url: 'https://github.com/a/b' }] }).state, { type: 'cmd', cmd: 'unrelate', host: 'youtube.com' }, at(10), r.cfg);
  assert.deepEqual(only(none.effects), ['log']); // no context: ignored, never throws
});

test('unrelate carries no id: relating and deleting the same host twice in one context works (a fixed id is deduped)', () => {
  const r = runTrace({ events: ['P', { t: 600, tab: 2, url: 'https://youtube.com/watch', title: 'v' }] });
  const cycle = (/** @type {string|undefined} */ id) => {
    let s = r.state;
    /** @type {string[][]} */ const hosts = [];
    for (const k of [1, 2]) {
      s = step(s, { type: 'cmd', id: `n${k}:related`, cmd: 'related' }, at(700 + k * 10), r.cfg).state;
      s = step(s, /** @type {any} */ ({ type: 'cmd', ...(id ? { id } : {}), cmd: 'unrelate', host: 'youtube.com' }), at(705 + k * 10), r.cfg).state;
      hosts.push([...(s.ctx?.relatedHosts ?? [])]);
    }
    return hosts;
  };
  assert.deepEqual(cycle('u'), [[], ['youtube.com']]); // the hazard: the second delete is dropped as a duplicate
  assert.deepEqual(cycle(undefined), [[], []]); // what D sends
});

test('progress on L1 shows progress and keeps the nudge', () => {
  const r = inL1();
  const out = step(r.state, { type: 'cmd', cmd: 'progress' }, at(905), r.cfg);
  assert.equal(out.state.phase, 'intervened_l1');
  assert.deepEqual(out.effects.find((e) => e.type === 'show_progress'), { type: 'show_progress', contextId: r.state.ctx?.id });
});

test('break from L1 hides the card; a blank note is stored as null; resume shows it first', () => {
  const r = runTrace({ until: 2000, events: ['P', { t: 600, tab: 2, url: 'https://reddit.com' }, { t: 905, cmd: 'break', note: '   ' }, { t: 1900, cmd: 'resume' }] });
  checkExpect(r, { phase: 'active', has: [{ hide_nudge: true, t: 905 }, { sync: 'response', response: 'break', t: 905 }, { show_recovery: 'welcome_back', note: null, t: 1900 }, { sync: 'recovery', trigger: 'break_ended', awayS: 0, t: 1900 }] });
});

test('new_task without a title proposes (pre-filled from the seed) and waits for confirm', () => {
  const r = runTrace({ events: ['P', { t: 600, tab: 2, url: 'https://youtube.com/watch', title: 'React hooks tutorial' }, { t: 700, cmd: 'new_task' }] });
  checkExpect(r, { phase: 'detected', ctx: null, proposal: { tabId: 2, host: 'youtube.com', title: 'React hooks tutorial', suggested: { title: 'Learning from videos', mode: 'learning' }, softAt: at(790) } });
});

test('new_task on a blind tab ends the context and stays idle', () => {
  const r = runTrace({ events: ['P', { t: 600, tab: 3, url: 'https://online.chase.com/acct' }, { t: 700, cmd: 'new_task', title: 'Pay bills' }] });
  checkExpect(r, { phase: 'idle', ctx: null, count: { propose_context: 1 } });
});

test('end while a proposal is pending just drops it (no suppression)', () => {
  const r = runTrace({ events: [{ t: 0, tab: 1, url: 'https://github.com/a/b' }, { t: 10, cmd: 'end' }] });
  checkExpect(r, { phase: 'idle', proposal: null, suppressed: [] });
});

test('end proposes on the current tab (popup "New context")', () => {
  const r = runTrace({ events: ['P', { t: 600, tab: 2, url: 'https://github.com/a/b', title: 'engine' }, { t: 700, cmd: 'end' }] });
  checkExpect(r, { phase: 'detected', count: { propose_context: 2 }, has: [{ sync: 'session_end', reason: 'end', t: 700 }, { drop_resume: true, t: 700 }] });
});
