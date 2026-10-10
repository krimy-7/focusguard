// @ts-check
// Replay harness (engine notes §6). Simulates the shell: tabs → tabToInput, a 4 s dwell timer per
// landing, a 60 s heartbeat, chrome.alarms (one-shot, late on wake), sleep, and SW restart.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isSensitiveHost, sanitizeTitle } from '../../privacy.js';
import { DEFAULTS, initialState, step } from '../step.js';
import { normalizeHost } from '../tiers.js';

export const seed = JSON.parse(readFileSync(new URL('../domains.json', import.meta.url), 'utf8'));
export const T0 = Date.parse('2026-10-10T09:00:00+05:45');
export const PREFIX = [
  { t: 0, tab: 1, url: 'https://www.figma.com/file/x', title: 'Landing v3 – Figma' },
  { t: 10, cmd: 'confirm' },
];

/** Test-only stand-in for the shell's adapter (stream D owns the real one in extension/shell/). */
export function tabToInput(tab, now) {
  let u = null;
  try { u = new URL(tab.url); } catch { /* blind */ }
  const host = u && /^https?:$/.test(u.protocol) ? normalizeHost(u.hostname) : ''; // R20: the same function D's adapter calls
  if (tab.incognito || !host || isSensitiveHost(host)) return { type: 'landing', tabId: tab.id, host: null, title: '', ts: now };
  return { type: 'landing', tabId: tab.id, host, title: sanitizeTitle(tab.title), ts: now };
}

/** @param {object} over */
export function makeCfg(over = {}) {
  return { ...DEFAULTS, tz: 'Asia/Kathmandu', quietHours: [], beastUntil: null, tables: { seed }, ...over };
}

/**
 * Run one trace. Returns {state, steps, effects, base, cfg}; throws on any invariant violation.
 * @param {{name?:string, until?:number, cfg?:object, events:any[]}} trace
 */
export function runTrace(trace) {
  const { t0, ...over } = /** @type {any} */ (trace.cfg || {});
  const cfg = makeCfg(over);
  const base = t0 ? Date.parse(t0) : T0;
  const T = (/** @type {number} */ t) => base + Math.round(t * 1000);
  const events = trace.events.flatMap((e) => (e === 'P' ? PREFIX : [e]));
  const until = T(trace.until ?? Math.max(...events.map((e) => e.t)) + 5);
  const tabs = new Map();
  /** @type {Record<string, number>} */ let alarms = {};
  /** @type {number[]} */ let dwell = [];
  let nextHb = base + cfg.HEARTBEAT_S * 1000;
  let state = initialState(base);
  /** @type {{t:number, input:any, effects:any[], state:any}[]} */ const steps = [];
  /** @type {{t:number, e:any}[]} */ const effects = [];
  const sensitive = new Set();
  const deadlines = new Map();
  /** @type {number[]} */ const shown = [];
  let k = 0;

  const deliver = (/** @type {any} */ input, /** @type {number} */ now) => {
    const prev = state;
    const out = step(prev, input, now, cfg);
    for (const e of out.effects) {
      if (e.type === 'schedule_alarm') alarms[e.kind] = e.at;
      if (e.type === 'cancel_alarm') delete alarms[e.kind];
      effects.push({ t: (now - base) / 1000, e });
    }
    checkInvariants(prev, out, input, now, cfg, deadlines, shown);
    const dup = step(out.state, input, now, cfg);
    if (!(input.type === 'heartbeat' && input.reason === 'startup')) assert.ok(dup.effects.every((e) => e.type === 'log'), `duplicate ${input.type} at ${now - base}ms had effects`);
    assert.deepEqual({ ...dup.state, rev: 0 }, { ...out.state, rev: 0 }, `duplicate ${input.type} changed state`);
    state = out.state;
    steps.push({ t: (now - base) / 1000, input, effects: out.effects, state });
  };

  const toInput = (/** @type {any} */ e, /** @type {number} */ now, /** @type {number} */ idx) => {
    if ('tab' in e) {
      const tab = { id: e.tab, ...tabs.get(e.tab), ...pick(e, ['url', 'title', 'incognito']) };
      tabs.set(e.tab, tab);
      const input = tabToInput(tab, now);
      if (input.host === null) { sensitive.add(String(tab.url || '').toLowerCase()); if (tab.title) sensitive.add(String(tab.title).toLowerCase()); }
      dwell.push(now + cfg.DWELL_MIN_S * 1000);
      return input;
    }
    if ('cmd' in e) {
      const { t, cmd, ...rest } = e;
      if (cmd === 'pause' && typeof rest.until === 'number') rest.until = T(rest.until);
      return { type: 'cmd', id: `e${idx}`, cmd, ...rest };
    }
    if ('tab_group' in e) return { type: 'tab_group', tabId: e.tab_group[0], groupId: e.tab_group[1] };
    if ('group_removed' in e) return { type: 'tab_group', tabId: null, groupId: e.group_removed, removed: true };
    if ('idle' in e) return { type: 'idle', state: e.idle };
    if ('tier_hint' in e) return { type: 'tier_hint', ...e.tier_hint };
    if ('dup_alarm' in e) return { type: 'alarm', kind: e.dup_alarm.kind, dueAt: T(e.dup_alarm.dueAt) };
    throw new Error(`unknown trace event ${JSON.stringify(e)}`);
  };

  for (;;) {
    const nextEv = k < events.length ? T(events[k].t) : Infinity;
    const nextAlarm = Math.min(Infinity, ...Object.values(alarms));
    const nextDwell = Math.min(Infinity, ...dwell);
    const now = Math.min(nextEv, nextAlarm, nextDwell, nextHb);
    if (now > until) break;
    if (now === nextAlarm) {
      const kind = /** @type {string} */ (Object.keys(alarms).find((x) => alarms[x] === now));
      delete alarms[kind];
      deliver({ type: 'alarm', kind, dueAt: now }, now);
    } else if (now === nextEv) {
      const e = events[k++];
      if ('sleep_until' in e) {
        const wake = T(e.sleep_until);
        dwell = [];
        while (nextHb <= wake) nextHb += cfg.HEARTBEAT_S * 1000;
        for (;;) { // alarms that came due while asleep fire on wake, late, with their original dueAt
          const due = Object.entries(alarms).filter(([, at]) => at <= wake).sort((a, b) => a[1] - b[1])[0];
          if (!due) break;
          delete alarms[due[0]];
          deliver({ type: 'alarm', kind: due[0], dueAt: due[1] }, wake);
        }
      } else if ('restart' in e) {
        state = JSON.parse(JSON.stringify(state));
        alarms = {};
        dwell = [];
        deliver({ type: 'heartbeat', reason: 'startup' }, now);
      } else deliver(toInput(e, now, k - 1), now);
    } else if (now === nextDwell) {
      dwell = dwell.filter((x) => x !== now);
      deliver({ type: 'heartbeat', reason: 'dwell' }, now);
    } else {
      nextHb += cfg.HEARTBEAT_S * 1000;
      deliver({ type: 'heartbeat', reason: 'tick' }, now);
    }
  }
  const blob = JSON.stringify(steps.map((x) => [x.effects, x.state])).toLowerCase();
  for (const str of sensitive) if (str) assert.ok(!blob.includes(str), `sensitive string leaked: ${str}`);
  return { state, steps, effects, base, cfg };
}

/** @param {any} o @param {string[]} keys */
function pick(o, keys) {
  return Object.fromEntries(keys.filter((x) => x in o).map((x) => [x, o[x]]));
}

/** engine notes §6 invariants, checked after every step. */
function checkInvariants(prev, out, input, now, cfg, deadlines, shown) {
  const s = out.state;
  for (const e of out.effects) {
    if (e.type !== 'show_nudge') continue;
    assert.ok(s.drift, 'nudge without a drift');
    if (e.level === 1) assert.ok(now >= s.drift.anchor + s.drift.graceS * 1000, 'L1 before anchor + grace');
    assert.ok(prev.phase !== 'on_break' && s.pausedUntil === null, 'nudge while on break or paused');
    assert.ok(!(cfg.beastUntil !== null && now < cfg.beastUntil), 'nudge in Beast Mode');
    assert.ok(s.current && s.current.host !== null && !s.current.inCtx && s.current.tier !== 'green', 'nudge on a green/blind/in-context tab');
    shown.push(now);
    assert.ok(shown.filter((t) => now - t < 3600_000).length <= cfg.INTERVENTION_MAX_PER_HOUR, 'hourly cap exceeded');
  }
  if (s.drift) {
    const was = deadlines.get(s.drift.id);
    if (was !== undefined && was !== s.drift.deadline) assert.equal(input.cmd, 'extend', 'deadline moved without extend');
    deadlines.set(s.drift.id, s.drift.deadline);
  }
}

/** Assert a trace's `expect` block (format: engine notes §6). */
export function checkExpect(result, expect) {
  const { state, effects, base } = result;
  const sec = (/** @type {number} */ ms) => (ms - base) / 1000;
  const ofType = (/** @type {string} */ type) => effects.filter((x) => x.e.type === type);
  for (const [key, want] of Object.entries(expect)) {
    switch (key) {
      case 'nudges': assert.deepEqual(ofType('show_nudge').map((x) => [x.e.level, x.t]), want, key); break;
      case 'phase': assert.equal(state.phase, want, key); break;
      case 'alarm':
        for (const [kind, at] of Object.entries(want)) {
          const last = ofType('schedule_alarm').filter((x) => x.e.kind === kind).at(-1);
          assert.equal(last && sec(last.e.at), at, `alarm.${kind}`);
        }
        break;
      case 'scheduleCount':
        for (const [kind, n] of Object.entries(want)) assert.equal(ofType('schedule_alarm').filter((x) => x.e.kind === kind).length, n, `scheduleCount.${kind}`);
        break;
      case 'scheduleAt':
        for (const [kind, ats] of Object.entries(want)) assert.deepEqual(ofType('schedule_alarm').filter((x) => x.e.kind === kind).map((x) => sec(x.e.at)), ats, `scheduleAt.${kind}`);
        break;
      case 'count':
        for (const [type, n] of Object.entries(want)) assert.equal(ofType(type).length, n, `count.${type}`);
        break;
      case 'has':
        for (const m of want) assert.ok(effects.some((x) => matches(x, m, sec)), `missing ${JSON.stringify(m)}`);
        break;
      case 'not':
        for (const m of want) assert.ok(!effects.some((x) => matches(x, m, sec)), `unexpected ${JSON.stringify(m)}`);
        break;
      case 'absentStrings': {
        const blob = JSON.stringify(result.steps.map((x) => [x.effects, x.state])).toLowerCase();
        for (const str of want) assert.ok(!blob.includes(str.toLowerCase()), `found "${str}"`);
        break;
      }
      case 'ctx.resources': assert.deepEqual(state.ctx.resources.map((r) => r.host), want, key); break;
      default: assert.deepEqual(key.split('.').reduce((o, p) => o?.[p], state), want, key);
    }
  }
}

/** First key = effect type ("sync" → rec.kind, "log" → msg); extra keys compare fields; "t"/"before" compare emit time. */
function matches({ t, e }, m, sec) {
  const [k, ...rest] = Object.keys(m).filter((x) => x !== 't' && x !== 'before');
  const v = m[k];
  if (k === 'sync') { if (e.type !== 'sync' || e.rec.kind !== v) return false; }
  else if (k === 'log') { if (e.type !== 'log' || e.msg !== v) return false; }
  else {
    if (e.type !== k) return false;
    const primary = { schedule_alarm: e.kind, cancel_alarm: e.kind, focus_tab: e.tabId, group_tab: e.tabId, show_recovery: e.copyKey, show_nudge: e.copyKey }[k];
    if (v !== true && v !== '*' && primary !== v) return false;
  }
  for (const f of rest) {
    const actual = f === 'at' ? sec(e.at) : f === 'note' ? e.vars?.note : k === 'sync' ? e.rec[f] : e[f];
    if (actual !== m[f]) return false;
  }
  if ('t' in m && t !== m.t) return false;
  if ('before' in m && !(t < m.before)) return false;
  return true;
}
